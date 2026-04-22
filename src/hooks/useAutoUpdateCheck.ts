/**
 * useAutoUpdateCheck.ts
 *
 * 왜 이 훅이 필요한가:
 *   1) "앱 켤 때마다 새 버전 있는지 확인" — 로그인 흐름 없는 이 앱에선 App 마운트 = 앱 시작.
 *   2) 자동 체크 결과를 **App(팝업 표시)**와 **Settings 페이지(수동 체크 섹션)**가
 *      공유해야 한다. 두 군데서 각자 check()를 호출하면 중복 요청이 나고,
 *      "나중에"로 닫은 상태가 동기화되지 않는다.
 *
 * 상태 공유 방식:
 *   기존 프로젝트에 Zustand/Redux/Context 없음. 가장 얇은 방법으로
 *   "모듈 레벨 상태 + 구독자 패턴"을 구현한다.
 *   (svgCacheStore.ts와 유사한 스타일 — Map 대신 단일 객체 + listener Set)
 *
 * 비유:
 *   - 모듈 상태 = 사내 공지게시판 1장
 *   - 구독자 = 게시판에 귀 댄 사람들 (컴포넌트)
 *   - setUpdateState() = 게시판 새로 붙임 → 귀 댄 모두에게 알림
 *
 * 자동 체크 중복 방지:
 *   React 18+ StrictMode 개발 모드에선 useEffect가 2번 실행된다.
 *   `hasCheckedOnce` 플래그로 실제 check()는 1번만 호출한다.
 */

import { useEffect, useState } from "react";
import { checkForUpdate, type UpdateCheckResult } from "../services/updaterService";

// =====================================================================
// 상태 타입
// =====================================================================

/**
 * 업데이트 상태 머신.
 *   idle      : 앱 켜진 직후 (아직 체크 전)
 *   checking  : check() 요청 중
 *   available : 새 버전 발견 (UpdateModal이 이 상태일 때 열림)
 *   up-to-date: 최신 — 모달은 안 뜨고 Settings 섹션에만 표시
 *   error     : 체크 실패 (네트워크 등) — 자동 체크에선 조용히 묻지만 수동 체크에선 표시
 *   dismissed : 사용자가 "나중에" 눌러 닫음 — 같은 세션에선 재알림 X
 */
export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "up-to-date"
  | "error"
  | "dismissed";

export interface UpdateState {
  status: UpdateStatus;
  /** kind==='available'일 때만 채워짐 */
  result: UpdateCheckResult | null;
  /** 마지막으로 체크 성공/실패한 시각 (ISO) — Settings 섹션의 "마지막 확인" 표시용 */
  lastCheckedAt: string | null;
}

// =====================================================================
// 모듈 레벨 상태 (싱글톤)
// =====================================================================

let state: UpdateState = {
  status: "idle",
  result: null,
  lastCheckedAt: null,
};

const listeners = new Set<(s: UpdateState) => void>();

/** 내부: 상태 변경 + 구독자 전체 알림 */
function setState(next: UpdateState): void {
  state = next;
  listeners.forEach((l) => l(next));
}

/** 앱 기동 시 1회만 자동 체크가 일어나도록 플래그 관리 */
let hasAutoCheckedOnce = false;

// =====================================================================
// 외부 API (UpdateSection의 수동 체크 버튼이 사용)
// =====================================================================

/**
 * 즉시 체크 실행. 자동/수동 공용.
 * - 이미 checking 중이면 중복 실행 안 함 (멱등)
 */
export async function runCheckNow(): Promise<void> {
  if (state.status === "checking") return;

  setState({ ...state, status: "checking" });

  const result = await checkForUpdate();
  const now = new Date().toISOString();

  if (result.kind === "available") {
    setState({ status: "available", result, lastCheckedAt: now });
  } else if (result.kind === "up-to-date") {
    setState({ status: "up-to-date", result, lastCheckedAt: now });
  } else {
    setState({ status: "error", result, lastCheckedAt: now });
  }
}

/**
 * 사용자가 모달에서 "나중에" 눌렀을 때 호출.
 * 같은 세션에서 재알림을 막는다 (새로 앱 켤 때는 다시 나옴 — 원칙).
 */
export function dismissUpdate(): void {
  setState({ ...state, status: "dismissed" });
}

/**
 * 현재 상태 읽기 (훅 바깥에서 쓸 일 거의 없음. 테스트용).
 */
export function getUpdateState(): UpdateState {
  return state;
}

// =====================================================================
// React 훅
// =====================================================================

/**
 * App과 Settings가 공유하는 훅.
 *
 * @param autoCheck  true면 마운트 시 1회 자동 체크. App.tsx에서만 true.
 *                   Settings의 UpdateSection은 false로 구독만 한다.
 */
export function useAutoUpdateCheck(autoCheck: boolean = false): UpdateState {
  const [snapshot, setSnapshot] = useState<UpdateState>(state);

  useEffect(() => {
    // 1) 구독 등록 → 다른 곳에서 상태 바꾸면 여기도 리렌더
    listeners.add(setSnapshot);

    // 2) 자동 체크 (App.tsx 전용). StrictMode 2회 실행 방지.
    if (autoCheck && !hasAutoCheckedOnce) {
      hasAutoCheckedOnce = true;
      runCheckNow().catch((err) => {
        // runCheckNow 내부에서 이미 처리하지만, 방어적으로 한 번 더 차단
        console.warn("[useAutoUpdateCheck] 자동 체크 중 예외:", err);
      });
    }

    return () => {
      listeners.delete(setSnapshot);
    };
  }, [autoCheck]);

  return snapshot;
}
