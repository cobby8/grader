/**
 * src/services/aiConvertService.ts
 *
 * AI→SVG 변환 서비스 (Phase 1-C, 2026-04-25)
 *
 * 왜 이 파일이 필요한가:
 *   Tauri Rust 커맨드(ai_convert_preview / ai_convert_batch)는
 *   Python(ai_converter.py)이 stdout에 찍은 JSON 문자열을 그대로 돌려준다.
 *   UI 컴포넌트(AiConvertModal)가 매번 `JSON.parse()` + 타입 캐스팅을
 *   직접 하면 버그가 생기기 쉽고 일관성이 깨진다. 이 서비스 레이어는
 *     1) Python 응답 JSON을 TypeScript 타입으로 매핑
 *     2) `[ai-convert]` 프리픽스 한 줄 로그 전담
 *     3) invoke 실패/JSON.parse 실패 시 명확한 throw
 *   를 담당하여 컴포넌트가 순수 UI 로직에 집중하게 한다.
 *
 * 비유:
 *   Rust 커맨드 = 주방 창구(Python에게 주문만 전달).
 *   이 서비스 = 손님 테이블의 메뉴 매니저(주문/답 통역).
 *
 * 컨벤션:
 *   - svgStandardizeService.ts와 완전히 동일한 패턴 (함수 export, 클래스 X)
 *   - Python `{ success, data, error }` 형식 그대로 노출 (discriminated union 안 씀)
 *     → 일관성 우선. 사용자가 명시적으로 트리거한 액션이라 조용한 실패 금지.
 *
 * 호출 측:
 *   - src/components/AiConvertModal.tsx (Phase 1-E에서 추가 예정)
 *
 * 관련:
 *   - PLAN-AI-TO-SVG.md 섹션 6-4
 *   - src/services/svgStandardizeService.ts (동일 패턴 레퍼런스)
 *   - python-engine/ai_converter.py (실제 변환 로직)
 *   - src-tauri/src/lib.rs L461/L480 (Rust 커맨드)
 */

import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// 타입 정의 — Python JSON과 1:1 매핑 (ai_converter.py 실제 출력 기반)
// ============================================================================

/**
 * AI 파일 분류 결과 (헤더 첫 10바이트로 판정).
 *
 * - `pdf_compatible`: `%PDF-` 헤더 → PyMuPDF 변환 가능 (Phase 1 처리 대상)
 * - `postscript`: `%!PS-Adobe` 헤더 → Phase 2(Illustrator COM) 대상, 현재는 SKIP
 * - `unknown`: 어느 쪽도 아님 (손상 파일 또는 알 수 없는 형식)
 */
export type AiKind = "pdf_compatible" | "postscript" | "unknown";

/**
 * preview 단계 항목 (시뮬레이션, 파일 미수정).
 */
export interface AiPreviewEntry {
  /** 대상 AI 파일 절대 경로. */
  file: string;
  /** 헤더 분류 결과. */
  kind: AiKind;
  /** 같은 폴더에 같은 이름의 SVG가 이미 있는지 (있으면 batch 시 기본 SKIP). */
  existing_svg: boolean;
}

/**
 * preview API 반환 형식 (Python JSON 그대로).
 */
export interface AiPreviewResult {
  /** Python이 래핑한 성공 플래그. */
  success: boolean;
  /** success=true일 때만 존재. */
  data?: {
    entries: AiPreviewEntry[];
    summary: {
      pdf_compatible: number;
      postscript: number;
      unknown: number;
      /** overwrite=False인데 기존 SVG 있어서 skip될 예정인 건수. */
      existing_svg_conflict: number;
    };
  };
  /** success=false일 때만 존재. */
  error?: string;
}

/**
 * batch 단계 항목별 처리 상태.
 *
 * - PASS: 변환 성공 (svg_path에 결과 경로)
 * - SKIP: 처리 안 함 (postscript / existing_svg / unknown 등 reason 참조)
 * - FAIL: 변환 시도 중 에러 (error 참조)
 */
export type AiBatchStatus = "PASS" | "SKIP" | "FAIL";

/**
 * batch 단계 항목 결과.
 */
export interface AiBatchResultEntry {
  /** 대상 AI 파일 절대 경로. */
  file: string;
  /** 처리 상태. */
  status: AiBatchStatus;
  /** PASS 시 생성된 SVG 절대 경로. */
  svg_path?: string;
  /** SKIP 시 사유 ("postscript" | "existing_svg" | "unknown"). */
  reason?: string;
  /** FAIL 시 에러 메시지. */
  error?: string;
  /** 변환 중 발생한 비치명 경고 메시지. */
  warnings?: string[];
}

/**
 * batch API 반환 형식 (Python JSON 그대로).
 *
 * Python(ai_converter.py L408~410)이 반환하는 카운트 필드 4종을 모두 포함.
 * `skipped_unknown`은 PLAN 의사코드엔 없지만 Phase 1-A 실제 구현에 있어서 추가.
 */
export interface AiBatchResult {
  /** Python이 래핑한 성공 플래그. */
  success: boolean;
  /** success=true일 때만 존재. */
  data?: {
    /** 처리 시도된 총 파일 수. */
    total: number;
    /** 변환 성공 건수. */
    converted: number;
    /** PostScript라서 건너뛴 건수 (Phase 2 대상). */
    skipped_postscript: number;
    /** 기존 SVG 있어서 건너뛴 건수 (overwrite=false일 때). */
    skipped_existing: number;
    /** 알 수 없는 헤더라서 건너뛴 건수 (Phase 1-A 실제 반환 필드). */
    skipped_unknown?: number;
    /** 변환 시도 중 실패한 건수. */
    failed: number;
    /** 항목별 상세 결과. */
    results: AiBatchResultEntry[];
    /** 변환기 버전 (Python CONVERTER_VERSION). */
    version: string;
  };
  /** success=false일 때만 존재. */
  error?: string;
}

// ============================================================================
// 공통 헬퍼: invoke + JSON.parse 묶음
// ============================================================================

/**
 * Rust invoke + JSON.parse를 묶은 헬퍼.
 *
 * 왜 헬퍼로 묶나: 두 함수(previewAiConversion / convertAiBatch)가 완전히
 * 동일한 보일러플레이트("invoke → 문자열 받음 → JSON.parse → 타입 캐스팅")를
 * 가지기 때문. svgStandardizeService.ts의 `invokeAndParse<T>` 패턴을 그대로 미러.
 *
 * Rust `Result<String, String>`에서 받은 stdout JSON 문자열을 파싱.
 * stdout에 경고/로그가 섞이면 JSON.parse가 실패 → 원본 응답 첫 500자를 로그
 * (디버깅 보강 — 기존 `console.error("...", e)`만으로는 원인 추적이 어려웠음).
 *
 * @throws JSON 파싱 실패 / Rust invoke 실패 시 원본 메시지를 담은 Error
 */
async function invokeAndParse<T>(
  command: string,
  params: Record<string, unknown>
): Promise<T> {
  // 1) Rust 커맨드 호출 — 반환은 Python stdout JSON 문자열 그대로
  const raw = await invoke<string>(command, params);
  // 2) JSON 파싱 — stdout에 경고/로그가 섞이면 여기서 실패
  try {
    return JSON.parse(raw) as T;
  } catch (parseErr) {
    const msg =
      parseErr instanceof Error ? parseErr.message : String(parseErr);
    console.error(
      `[ai-convert] JSON parse 실패 (${command}):`,
      msg,
      "\n원본 응답:",
      raw.slice(0, 500) // 긴 응답은 500자만 미리 보여줌 (디버깅용)
    );
    throw new Error(`Python 응답 JSON 파싱 실패: ${msg}`);
  }
}

// ============================================================================
// invoke 래퍼 함수
// ============================================================================

/**
 * AI 파일 목록의 헤더를 분석하여 변환 가능 여부를 미리 확인 (시뮬레이션).
 *
 * 실제 파일은 건드리지 않고, 헤더 첫 10바이트만 읽어
 *   - PDF 호환(%PDF-) → 변환 가능
 *   - PostScript(%!PS-Adobe) → Phase 2 대상 (현재는 SKIP 예정)
 *   - 그 외 → unknown (SKIP)
 * 로 분류해 사용자에게 미리 알려준다.
 *
 * @param files 절대 경로 배열. ";"로 join하여 Rust로 전달 (Python CLI 관례 일관성).
 *              빈 배열이면 entries=[], summary={0,0,0,0} 반환.
 * @returns Python `{ success, data, error }` 형식 그대로
 *
 * 에러 처리:
 *   - invoke 자체 실패(Rust panic 등) → invokeAndParse가 그대로 throw
 *   - JSON.parse 실패 → invokeAndParse가 raw 첫 500자 로그 후 throw
 *   - Python 측 로직 에러 → `{ success: false, error: "..." }` 정상 반환 (throw 안 함)
 */
export async function previewAiConversion(
  files: string[]
): Promise<AiPreviewResult> {
  // Rust 측은 단일 문자열 인자를 받아 Python에게 그대로 전달한다.
  // ";"로 join하는 규칙은 svg_normalize_batch와 동일 (Python CLI 관례).
  const filesStr = files.join(";");
  console.log("[ai-convert] previewAiConversion 호출:", { count: files.length });

  // invoke + JSON.parse는 헬퍼에 위임 — 외부 try/catch 제거
  // (헬퍼가 throw하면 호출자가 자연스럽게 받음, 함수 시그니처는 그대로 Promise<AiPreviewResult>)
  const parsed = await invokeAndParse<AiPreviewResult>("ai_convert_preview", {
    files: filesStr,
  });
  console.log(
    "[ai-convert] preview 응답:",
    parsed.success ? "success" : `error: ${parsed.error}`
  );
  return parsed;
}

/**
 * AI 파일 일괄 변환 실행 (PDF 호환만 처리).
 *
 * PostScript / unknown / 기존 SVG가 있는 경우는 SKIP으로 분류되며,
 * 배치 도중 한 파일 실패 시에도 다음 파일로 계속 진행 (FAIL 기록만).
 *
 * @param files 절대 경로 배열. ";"로 join.
 * @param overwrite true면 기존 SVG가 있어도 덮어쓰기(.bak 자동 백업).
 *                  false면 기존 SVG 있는 파일은 SKIP.
 * @returns Python `{ success, data, error }` 형식 그대로
 *
 * 에러 처리: previewAiConversion과 동일 (헬퍼가 throw 일임).
 */
export async function convertAiBatch(
  files: string[],
  overwrite: boolean
): Promise<AiBatchResult> {
  // ";" 구분자 join — preview와 동일 규칙 (Rust 측에서 다시 분할)
  const filesStr = files.join(";");
  console.log("[ai-convert] convertAiBatch 호출:", {
    count: files.length,
    overwrite,
  });

  // 인자명 `files` / `overwrite`는 Rust 커맨드 시그니처와 정확히 매칭
  // (Tauri 2.x: Rust snake_case ↔ TS camelCase 자동 변환, 여기는 둘 다 짧아서 동일)
  const parsed = await invokeAndParse<AiBatchResult>("ai_convert_batch", {
    files: filesStr,
    overwrite,
  });
  if (parsed.success && parsed.data) {
    // 성공 시 카운트 요약을 한 줄로 출력 (디버깅 시 한 눈에 파악)
    console.log(
      "[ai-convert] batch 결과:",
      `total=${parsed.data.total} converted=${parsed.data.converted} ` +
        `skipped_ps=${parsed.data.skipped_postscript} ` +
        `skipped_existing=${parsed.data.skipped_existing} ` +
        `skipped_unknown=${parsed.data.skipped_unknown ?? 0} ` +
        `failed=${parsed.data.failed}`
    );
  } else {
    console.warn("[ai-convert] batch 에러:", parsed.error);
  }
  return parsed;
}

// ============================================================================
// Phase 2-C: PostScript AI → .tmp.ai (Illustrator 경유) 헬퍼
// ============================================================================
//
// 왜 추가하나:
//   PyMuPDF는 PDF 호환 AI만 처리할 수 있다. PostScript 헤더(`%!PS-Adobe`)인
//   AI 파일은 Illustrator로 한 번 "PDF 호환 모드(ACROBAT5)"로 재저장해야
//   PyMuPDF가 읽을 수 있다. 이 작업을 ExtendScript(`ai_to_pdf.jsx`)가 담당하고,
//   본 헬퍼들은 그 JSX를 파일별로 호출 → .tmp.ai 생성 → 작업 후 정리한다.
//
// 흐름 (AiConvertModal에서 사용):
//   1) findIllustratorExe()           — 미설치면 체크박스 자체를 disable
//   2) convertPostScriptToTmp(psList) — 성공한 항목들의 .tmp.ai 경로 수집
//   3) convertAiBatch(pdf+tmp 합본)   — 일반 변환 한 번으로 처리
//   4) cleanupTmpFiles(tmpList)       — finally에서 .tmp.ai 일괄 삭제
//
// 비유:
//   PostScript AI = 외국어 책. PyMuPDF는 영어밖에 못 읽음.
//   Illustrator = 번역사. 임시로 영어판(.tmp.ai)을 만들어주고, 다 읽고 나면 폐기.

/**
 * Adobe Illustrator 설치 여부 확인.
 *
 * Rust `find_illustrator_exe` 커맨드가 미설치 시 throw하기 때문에
 * 여기서 try/catch로 감싸 throw를 흡수하고 null로 반환한다.
 * UI는 null이면 "체크박스 disable + 안내" 처리로 안전하게 분기.
 *
 * @returns 설치된 경우 illustrator.exe 절대 경로, 미설치/탐지 실패 시 null
 */
export async function findIllustratorExe(): Promise<string | null> {
  try {
    const path = await invoke<string>("find_illustrator_exe");
    return path || null;
  } catch (e) {
    console.warn("[ai-convert] Illustrator 미설치 감지:", e);
    return null;
  }
}

/**
 * PostScript 변환 결과 — 항목별 성공/실패 표시.
 *
 * 한 파일 실패해도 나머지 진행이라 배열 전체는 항상 입력 길이와 동일.
 * `tmpPath`가 있으면 성공, `error`가 있으면 실패 (둘 다 있는 경우는 없음).
 */
export interface PostScriptConvertResult {
  /** 원본 PostScript AI 절대 경로. */
  input: string;
  /** 성공 시 생성된 .tmp.ai 절대 경로 (PDF 호환). */
  tmpPath?: string;
  /** 실패 시 원인 메시지 (Illustrator 미설치 / JSX 실행 실패 등). */
  error?: string;
}

/**
 * PostScript AI 파일들을 PDF 호환 모드로 일괄 재저장 (.tmp.ai 생성).
 *
 * 내부 동작 (파일 1개당 한 번씩 JSX 호출):
 *   1) ai_to_pdf_input.json 작성 (input_path / output_path)
 *   2) run_illustrator_script로 ai_to_pdf.jsx 실행 (timeout 120초)
 *   3) ai_to_pdf_result.json 파싱 → 성공/실패 분기
 *   4) 모든 파일 처리 후 input.json / result.json 정리 (best effort)
 *
 * 한 파일에서 throw가 나도 catch로 흡수해 다음 파일로 진행 → 부분 성공 가능.
 * Illustrator 미설치 시점에서 모든 파일에 동일한 에러를 채워 즉시 반환.
 *
 * @param psFiles PostScript AI 절대 경로 배열
 * @returns 입력 길이와 동일한 결과 배열 (각 항목은 tmpPath 또는 error 보유)
 */
export async function convertPostScriptToTmp(
  psFiles: string[]
): Promise<PostScriptConvertResult[]> {
  console.log("[ai-convert] PostScript 변환 시작:", { count: psFiles.length });

  // 1) Illustrator 위치 확인 — 없으면 모든 파일 실패 처리하고 즉시 반환
  const aiExePath = await findIllustratorExe();
  if (!aiExePath) {
    return psFiles.map((input) => ({
      input,
      error: "Adobe Illustrator가 설치되지 않았거나 찾을 수 없습니다.",
    }));
  }

  // 2) JSX 스크립트 + 입출력 JSON 경로 (모두 같은 폴더에 위치)
  //    Rust 측 get_illustrator_scripts_path가 절대 경로를 돌려준다.
  const scriptsDir = await invoke<string>("get_illustrator_scripts_path");
  const jsxPath = `${scriptsDir}\\ai_to_pdf.jsx`;
  const inputJsonPath = `${scriptsDir}\\ai_to_pdf_input.json`;
  const resultJsonPath = `${scriptsDir}\\ai_to_pdf_result.json`;

  const results: PostScriptConvertResult[] = [];

  // 3) 파일별 순차 처리 (Illustrator는 동시 실행 불가 — 강제 순차)
  for (const psFile of psFiles) {
    // .ai → .tmp.ai 치환 (대소문자 무관, 마지막 확장자만)
    // 예: "G:/.../XL.ai" → "G:/.../XL.tmp.ai"
    const tmpPath = psFile.replace(/\.ai$/i, ".tmp.ai");

    try {
      // 3-1) ai_to_pdf_input.json 작성
      //      ExtendScript는 슬래시 경로를 선호 → 백슬래시를 슬래시로 통일
      await invoke("write_file_absolute", {
        path: inputJsonPath,
        content: JSON.stringify({
          input_path: psFile.replace(/\\/g, "/"),
          output_path: tmpPath.replace(/\\/g, "/"),
        }),
      });

      // 3-2) JSX 실행 + result.json 폴링 (Rust가 timeout까지 대기)
      //      PostScript 변환은 큰 파일일 수 있어 120초로 여유
      const resultRaw = await invoke<string>("run_illustrator_script", {
        illustratorExe: aiExePath,
        scriptPath: jsxPath,
        resultJsonPath: resultJsonPath,
        timeoutSecs: 120,
      });

      // 3-3) result.json 파싱 → success 분기
      const result = JSON.parse(resultRaw) as {
        success: boolean;
        output_path?: string;
        error?: string;
      };

      if (result.success && result.output_path) {
        results.push({ input: psFile, tmpPath: result.output_path });
      } else {
        results.push({
          input: psFile,
          error: result.error || "JSX 실행 실패 (원인 불명)",
        });
      }
    } catch (e) {
      // invoke 자체 실패 / timeout / JSON.parse 실패 → 항목별 에러 기록 후 계속
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[ai-convert] PostScript 변환 실패: ${psFile}`, e);
      results.push({ input: psFile, error: msg });
    }
  }

  // 4) 임시 input/result.json 정리 — 다음 실행에서 잔재로 인한 오해 방지
  //    실패해도 무시 (cleanup이라 silent)
  try {
    await invoke("remove_file_absolute", { path: inputJsonPath });
  } catch {}
  try {
    await invoke("remove_file_absolute", { path: resultJsonPath });
  } catch {}

  console.log("[ai-convert] PostScript 변환 완료:", {
    total: psFiles.length,
    success: results.filter((r) => r.tmpPath).length,
    failed: results.filter((r) => r.error).length,
  });

  return results;
}

/**
 * .tmp.ai 임시 파일들을 일괄 삭제 (best effort).
 *
 * 변환 성공/실패와 무관하게 finally에서 호출되어 임시 파일이 G드라이브에
 * 남지 않도록 한다. 한 파일 삭제 실패해도 나머지 계속 진행 — 결과는 무시.
 *
 * @param tmpPaths 삭제할 .tmp.ai 절대 경로 배열
 */
export async function cleanupTmpFiles(tmpPaths: string[]): Promise<void> {
  console.log("[ai-convert] .tmp.ai 정리:", { count: tmpPaths.length });
  for (const tmpPath of tmpPaths) {
    try {
      await invoke("remove_file_absolute", { path: tmpPath });
    } catch (e) {
      // cleanup 실패는 사용자 작업에 영향이 없으니 warn만
      console.warn(`[ai-convert] .tmp.ai 삭제 실패 (무시): ${tmpPath}`, e);
    }
  }
}
