/**
 * useAutoAiConvert.ts
 *
 * AI→SVG Phase 3: 옵트인 자동 백그라운드 변환 정책 레이어 (훅).
 *
 * 왜 이 훅이 필요한가:
 *   Phase 1+2에서 만든 변환 엔진(`aiConvertService`의 previewAiConversion /
 *   convertPostScriptToTmp / convertAiBatch / cleanupTmpFiles)을 사용자 클릭 없이
 *   자동으로 호출하려면 "정책"이 필요하다:
 *     (a) 동시에 여러 번 트리거되지 않도록 단일 뮤텍스
 *     (b) [중지] 버튼으로 안전 종료 (실행 중 파일은 atomic write 보장 위해 끝까지)
 *     (c) 3연속 실패 시 자동 OFF (settings.json에 영속, 메모리 플래그 X)
 *     (d) 페이지 이동해도 변환 계속 진행 (모듈 상태이므로 컴포넌트 unmount와 무관)
 *     (e) PatternManage 배너가 진행률을 실시간 표시하기 위해 구독 가능한 상태
 *   변환 엔진/모달은 단 한 줄도 안 바꾸고 이 훅만 추가한다.
 *
 * 비유:
 *   주방(aiConvertService) = 그대로. 새로 추가하는 건 "예약 시스템" 1개.
 *   - 예약 1건만 받음(뮤텍스), 시작 전 사전 점검(preview),
 *     문제 생기면 3번까지만 재시도(실패 카운터), 손님이 [중지]하면
 *     지금 굽는 빵은 끝까지 굽고 다음 주문은 받지 않음(파일 경계 abort).
 *
 * 상태 공유 방식:
 *   `useAutoUpdateCheck.ts` 패턴 100% 미러 — 모듈 레벨 상태 + 구독자 Set.
 *   PatternManage 배너 / Settings 섹션이 같은 모듈 상태를 구독한다.
 *   StrictMode 2회 실행 가드는 `hasAutoCheckedOnce`와 같은 사용은 없지만,
 *   대신 `isConverting` 뮤텍스가 동일 효과를 낸다.
 *
 * 관련:
 *   - PLAN-AI-TO-SVG.md 13-4 (모듈 상태/외부 API/정책)
 *   - src/hooks/useAutoUpdateCheck.ts (구조 레퍼런스)
 *   - src/services/aiConvertService.ts (변환 엔진 — 무수정)
 *   - src/stores/settingsStore.ts (자동 OFF 영속용)
 */

import { useEffect, useState } from "react";
import {
  cleanupTmpFiles,
  convertAiBatch,
  convertPostScriptToTmp,
  findIllustratorExe,
  previewAiConversion,
} from "../services/aiConvertService";
import { setAiAutoConvertEnabled } from "../stores/settingsStore";

// =====================================================================
// 상태 타입
// =====================================================================

/**
 * 자동 변환 상태 머신.
 *   idle       : 대기 (트리거 가능)
 *   preparing  : preview / Illustrator 감지 등 준비 작업
 *   converting : 실제 변환 진행 중 (current/total로 진행률 표시)
 *   done       : 한 사이클 정상 완료 (배너 모드 C 5초 표시 후 idle 복귀)
 *   error      : 3연속 실패로 자동 OFF 발동 (배너 모드 D 표시)
 *   aborted    : 사용자 [중지] 버튼으로 안전 종료
 */
export type AutoConvertMode =
  | "idle"
  | "preparing"
  | "converting"
  | "done"
  | "error"
  | "aborted";

/**
 * 마지막 사이클 결과 (Settings 섹션 "마지막 변환" 표시용).
 * null이면 아직 한 번도 안 돌았거나 마지막 결과가 의미 없는 상태.
 */
export interface AutoConvertLastResult {
  /** 변환 성공 (PASS) 건수. */
  ok: number;
  /** 건너뜀 (SKIP) 건수 — postscript / existing_svg / unknown 합산. */
  skip: number;
  /** 실패 (FAIL) 건수. */
  fail: number;
  /** 사이클 종료 시각 (ISO). */
  finishedAt: string;
}

export interface AutoConvertState {
  mode: AutoConvertMode;
  /** 진행 중 인덱스 (1-based, 사용자 표시용). converting 시에만 의미 있음. */
  current: number;
  /** 변환 대상 총 개수 (preview 후 결정). */
  total: number;
  /** 마지막으로 끝난 사이클 결과 (없으면 null). */
  lastResult: AutoConvertLastResult | null;
  /** 연속 실패 카운터. 3 도달 시 자동 OFF 발동. */
  failCountConsecutive: number;
  /** 마지막 에러 메시지 (mode='error' 시 표시용). */
  lastError: string | null;
}

// =====================================================================
// 모듈 레벨 상태 (싱글톤) — 페이지 이동에도 유지
// =====================================================================

let state: AutoConvertState = {
  mode: "idle",
  current: 0,
  total: 0,
  lastResult: null,
  failCountConsecutive: 0,
  lastError: null,
};

const listeners = new Set<(s: AutoConvertState) => void>();

/** 내부: 상태 변경 + 구독자 전체 알림 (얕은 복사로 React 리렌더 트리거) */
function setState(next: AutoConvertState): void {
  state = next;
  listeners.forEach((l) => l(next));
}

/**
 * 단일 뮤텍스 — 동시에 두 번 변환이 도는 것을 차단.
 *
 * 왜 별도 변수인가: state.mode만으로 판정하면 "preparing 진입 직후 mode 갱신
 * 사이의 race"가 이론적으로 가능. boolean 변수를 함수 시작 즉시 true로 두면
 * 동기 코드 진입 단계에서 안전하게 막힌다.
 */
let isConverting = false;

/**
 * AbortController — [중지] 버튼이 발동시키는 신호.
 *
 * 파일 1개 변환이 끝날 때마다 `signal.aborted` 검사.
 * 실행 중인 파일은 atomic write 보장을 위해 끝까지 완주 (즉시 kill 거부).
 * scheduleAutoConvert 시작 시 새로 생성하여 이전 사이클 신호와 분리.
 */
let aborter: AbortController | null = null;

// =====================================================================
// 외부 API
// =====================================================================

/**
 * 자동 변환 시작 (외부 트리거 — PatternManage가 호출).
 *
 * 정책:
 *   1) 이미 변환 중이면 즉시 무시 (뮤텍스)
 *   2) preview 결과 PDF 호환만 자동 처리. PostScript는 Illustrator 설치 시에만 합류.
 *   3) 파일 경계마다 abort 신호 검사 — aborted 시 즉시 종료 후 mode='aborted'
 *   4) 사이클 결과:
 *      - fail === 0 → failCountConsecutive 리셋, mode='done'
 *      - fail >= 1  → failCountConsecutive++, 3 도달 시 setAiAutoConvertEnabled(false) + mode='error'
 *
 * @param files 미변환 AI 파일 절대 경로 배열 (PatternManage가 driveSync 결과로 전달)
 */
export async function scheduleAutoConvert(files: string[]): Promise<void> {
  // ─── 0) 단일 뮤텍스: 진입 즉시 차단 ────────────────────────────────
  if (isConverting) {
    console.log("[auto-convert] 이미 변환 중 — 트리거 무시");
    return;
  }
  if (files.length === 0) {
    // 빈 배열도 조용히 무시 (배너 자체가 안 뜰 거라 정상 케이스)
    return;
  }

  isConverting = true;
  aborter = new AbortController();
  const signal = aborter.signal;

  // 새 사이클 시작 — preparing 상태 게시
  setState({
    ...state,
    mode: "preparing",
    current: 0,
    total: files.length,
    lastError: null,
  });

  // .tmp.ai 정리는 finally에서 — 함수 스코프 변수로 들고 있어야 함
  let tmpPaths: string[] = [];

  try {
    // ─── 1) preview: 파일 분류 ───────────────────────────────────────
    // 헤더 첫 10바이트 검사로 PDF 호환 / PostScript / unknown 분류
    const previewResp = await previewAiConversion(files);
    if (!previewResp.success || !previewResp.data) {
      throw new Error(previewResp.error || "preview 단계 실패");
    }

    // abort 신호 — preview 직후 빠른 탈출 가능
    if (signal.aborted) {
      finalizeAborted();
      return;
    }

    // PDF 호환 파일과 PostScript 파일을 별도 배열로 분리
    const pdfTargets = previewResp.data.entries
      .filter((e) => e.kind === "pdf_compatible")
      .map((e) => e.file);
    const psTargets = previewResp.data.entries
      .filter((e) => e.kind === "postscript")
      .map((e) => e.file);

    // ─── 2) Illustrator 미설치 분기 (Q6) ─────────────────────────────
    // - 설치되어 있으면 PS 파일도 .tmp.ai로 변환해 PDF 배치에 합류
    // - 미설치면 PS는 다음 사이클에 사용자가 수동 모달로 처리하도록 SKIP
    let mergedTargets = [...pdfTargets];

    if (psTargets.length > 0) {
      const illustratorPath = await findIllustratorExe();
      if (illustratorPath) {
        // PostScript → .tmp.ai 변환 (Phase 2 흐름 그대로)
        // ⚠️ 안전망: 정상 흐름에서 convertPostScriptToTmp는 자체 try/catch로 throw하지 않음.
        //   그러나 findIllustratorExe / scripts_path invoke 단계 실패 등 throw 가능성은 존재.
        //   throw 시 외부 catch가 mode='error' + 카운터 처리하도록 위임 (선택 D 정책).
        //   .tmp.ai 부분 잔재 cleanup은 best effort (현 finally의 tmpPaths 기반).
        //   더 강한 보장은 v1.0.2에서 검토.
        let psResults;
        try {
          psResults = await convertPostScriptToTmp(psTargets);
        } catch (psErr) {
          console.error("[auto-convert] PostScript 변환 단계 throw:", psErr);
          throw psErr;
        }
        // 성공한 .tmp.ai만 합본
        const tmpOk = psResults.filter((r) => r.tmpPath).map((r) => r.tmpPath!);
        tmpPaths = tmpOk;
        mergedTargets.push(...tmpOk);
        // PostScript 변환 실패는 콘솔만 — 자동 흐름이라 사용자 차단 X
        const psFailed = psResults.filter((r) => r.error);
        if (psFailed.length > 0) {
          console.warn(
            "[auto-convert] PostScript 변환 일부 실패:",
            psFailed.length,
            psFailed.map((r) => r.error)
          );
        }
      } else {
        // Illustrator 없음 — PS는 다음 사이클로 미루고 PDF만 진행
        console.log(
          "[auto-convert] Illustrator 미설치 — PostScript",
          psTargets.length,
          "개 SKIP (다음 사이클 수동 처리)"
        );
      }
    }

    // 변환 대상이 0개 (모두 unknown 또는 PS인데 Illustrator 없음)면 done으로 종료
    if (mergedTargets.length === 0) {
      setState({
        ...state,
        mode: "done",
        current: 0,
        total: 0,
        lastResult: {
          ok: 0,
          skip: previewResp.data.entries.length,
          fail: 0,
          finishedAt: new Date().toISOString(),
        },
        // 실패 0이므로 카운터 리셋
        failCountConsecutive: 0,
      });
      return;
    }

    // abort 신호 — 변환 시작 직전 마지막 게이트
    if (signal.aborted) {
      finalizeAborted();
      return;
    }

    // ─── 3) 실제 변환: convertAiBatch (PDF + .tmp.ai 합본) ───────────
    // converting 상태 게시 — total은 합본 길이 기준
    setState({
      ...state,
      mode: "converting",
      current: 1,
      total: mergedTargets.length,
    });

    // 자동 흐름은 overwrite=false 고정 (안전 우선, 기존 SVG 있으면 SKIP)
    // convertAiBatch는 한 번에 전체 배치를 처리 — Python 측이 파일별 진행 콜백을 주지 않음
    // 따라서 current/total은 "시작=1, 완료=total"의 양 끝점만 표현
    const batchResp = await convertAiBatch(mergedTargets, false);

    if (!batchResp.success || !batchResp.data) {
      throw new Error(batchResp.error || "convertAiBatch 단계 실패");
    }

    const {
      converted,
      skipped_postscript: skipPs,
      skipped_existing: skipEx,
      skipped_unknown: skipUn = 0,
      failed,
      results: batchResults,
    } = batchResp.data;

    const totalSkip = skipPs + skipEx + skipUn;

    // ─── 4) 실패 카운터 갱신 + 자동 OFF 분기 ─────────────────────────
    // 정책: failed >= 1이면 카운터++, === 3이면 자동 OFF + mode='error'
    //       failed === 0이면 카운터 리셋
    let nextFailCount: number;
    let nextMode: AutoConvertMode;
    let nextError: string | null;

    if (failed >= 1) {
      // 부분 실패 시 사용자에게 "어떤 파일이 왜 실패했는지" 노출하기 위해
      // results 배열에서 첫 FAIL 항목을 찾아 짧은 요약 메시지로 가공.
      // (모드 C 배너에서 보이도록 — 디버깅 시 콘솔 로그 분석을 줄여줌)
      const firstFailure = batchResults.find((r) => r.status === "FAIL");
      const failureSummary = firstFailure
        ? `${firstFailure.file.split(/[\\/]/).pop() ?? firstFailure.file}: ${firstFailure.error ?? "알 수 없는 오류"}`
        : null;

      nextFailCount = state.failCountConsecutive + 1;
      if (nextFailCount >= 3) {
        // 3연속 실패 → 자동 OFF 영속 (settings.json에 false 저장)
        // 비유: 자동 결제 3번 연속 실패하면 카드 정지하는 것처럼 안전 차단
        try {
          await setAiAutoConvertEnabled(false);
        } catch (e) {
          // 영속 실패해도 메모리 모드는 error로 전환 — 다음 트리거 차단됨
          console.error("[auto-convert] 자동 OFF 영속 실패:", e);
        }
        nextMode = "error";
        nextError = failureSummary
          ? `자동 변환이 ${nextFailCount}회 연속 실패하여 꺼졌습니다. (마지막 실패: ${failureSummary})`
          : `자동 변환이 ${nextFailCount}회 연속 실패하여 꺼졌습니다.`;
      } else {
        // 아직 3회 미만이지만 이번 사이클 실패 — done으로 표시(부분 성공) + 카운터만 누적
        // 부분 실패 사유는 lastError에 담아 모드 C 배너에서도 사용자가 인지 가능
        nextMode = "done";
        nextError = failureSummary;
      }
    } else {
      // 모두 성공 → 카운터 리셋
      nextFailCount = 0;
      nextMode = "done";
      nextError = null;
    }

    setState({
      mode: nextMode,
      current: mergedTargets.length,
      total: mergedTargets.length,
      lastResult: {
        ok: converted,
        skip: totalSkip,
        fail: failed,
        finishedAt: new Date().toISOString(),
      },
      failCountConsecutive: nextFailCount,
      lastError: nextError,
    });
  } catch (e) {
    // ─── 5) 예외 처리: preview/batch 자체가 throw한 경우 ─────────────
    // 이 경로는 대부분 Rust invoke 실패나 JSON.parse 실패 (네트워크/권한 등)
    // 사용자 트리거가 아닌 자동 흐름이므로 console.error + mode='error'로만 처리
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[auto-convert] 사이클 실패:", e);

    // 예외도 실패 카운터에 포함 — 매번 throw나면 자동 OFF로 가야 함
    const nextFailCount = state.failCountConsecutive + 1;
    if (nextFailCount >= 3) {
      try {
        await setAiAutoConvertEnabled(false);
      } catch (saveErr) {
        console.error("[auto-convert] 자동 OFF 영속 실패:", saveErr);
      }
      setState({
        ...state,
        mode: "error",
        failCountConsecutive: nextFailCount,
        lastError: `자동 변환이 ${nextFailCount}회 연속 실패하여 꺼졌습니다. (마지막 에러: ${msg})`,
      });
    } else {
      setState({
        ...state,
        mode: "error",
        failCountConsecutive: nextFailCount,
        lastError: msg,
      });
    }
  } finally {
    // ─── 6) 정리: .tmp.ai 삭제 + 뮤텍스 해제 ─────────────────────────
    // .tmp.ai 정리는 best effort — 실패해도 사용자 작업에 영향 없음
    if (tmpPaths.length > 0) {
      try {
        await cleanupTmpFiles(tmpPaths);
      } catch (cleanupErr) {
        console.warn("[auto-convert] .tmp.ai 정리 실패 (무시):", cleanupErr);
      }
    }
    // 뮤텍스 해제 — 다음 트리거 가능
    isConverting = false;
    aborter = null;
  }
}

/**
 * 사용자가 [중지] 버튼을 누르면 호출.
 *
 * 즉시 kill하지 않는 이유:
 *   convertAiBatch는 Python 프로세스 단위 호출이라 한 번 시작하면 전체 배치가
 *   끝나야 결과를 받을 수 있다. 중간에 강제 종료하면 atomic write 중인 파일이
 *   손상될 위험이 있어 "다음 파일 시작 전에만" 검사하는 정책으로 안전 우선.
 *
 * 현재 구현은 convertAiBatch 단위 abort라 Phase 3 단계 1에선 사실상 preview/PS
 * 변환 직후 게이트에서만 동작. 추후 파일별 progress 콜백이 추가되면 진짜 파일
 * 경계 abort가 가능해진다.
 */
export function abortAutoConvert(): void {
  if (!aborter) {
    return;
  }
  console.log("[auto-convert] [중지] 신호 수신");
  aborter.abort();
}

/**
 * 외부에서 모듈 상태 직접 읽기 (테스트/디버깅용).
 * 일반 컴포넌트는 useAutoAiConvert 훅을 써야 리렌더된다.
 */
export function getAutoConvertState(): AutoConvertState {
  return state;
}

/**
 * 모듈 상태 리셋 — done/error/aborted에서 idle로 되돌릴 때 사용.
 *
 * 호출 시점:
 *   - 배너 모드 C(완료) 5초 타이머 만료 시 PatternManage가 호출
 *   - Settings 토글 OFF→ON 재진입 시 lastError 초기화 위해
 *
 * ⚠️ failCountConsecutive는 의도적으로 리셋하지 않음 — 자동 OFF 후 사용자가 다시 ON 했을 때
 *    이전 사이클 카운터 영향 차단을 위해 별도 호출자가 명시적으로 리셋해야 함
 *    (현재 호출자 없음 = 유지 정책).
 */
export function resetAutoConvertState(): void {
  setState({
    ...state,
    mode: "idle",
    current: 0,
    total: 0,
    lastError: null,
    // failCountConsecutive와 lastResult는 의도적으로 유지 — 사용자가 명시적으로
    // 토글을 끄고 다시 켜는 경우에도 "마지막 결과"는 참조 가능해야 함
  });
}

// =====================================================================
// 내부 헬퍼
// =====================================================================

/**
 * abort 신호로 종료된 경우 상태 게시 + tmp 정리는 finally에 위임.
 */
function finalizeAborted(): void {
  setState({
    ...state,
    mode: "aborted",
    current: 0,
    total: 0,
    // 실패가 아니라 사용자 의도이므로 failCountConsecutive 변경 X
  });
}

// =====================================================================
// React 훅 — 컴포넌트가 모듈 상태를 구독
// =====================================================================

/**
 * 자동 변환 모듈 상태를 구독하는 훅.
 *
 * @returns 현재 AutoConvertState (모듈 상태가 갱신되면 자동 리렌더)
 *
 * 사용 예:
 *   const auto = useAutoAiConvert();
 *   if (auto.mode === 'converting') return <Banner mode="B" current={auto.current} total={auto.total} />;
 */
export function useAutoAiConvert(): AutoConvertState {
  const [snapshot, setSnapshot] = useState<AutoConvertState>(state);

  useEffect(() => {
    // 구독 등록 — 모듈 상태가 바뀌면 setSnapshot 호출됨
    listeners.add(setSnapshot);
    return () => {
      listeners.delete(setSnapshot);
    };
  }, []);

  return snapshot;
}
