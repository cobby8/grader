/**
 * sessionStore — WorkSession 저장소 (sessionStorage 기반)
 *
 * 왜 Zustand가 아닌 함수형 API인가:
 *   - 다른 store들(presetStore, designStore 등)도 순수 함수 형태로 AppData를 읽고 쓴다.
 *   - 세션은 전역 상태 공유가 필요 없고, 페이지 진입/이탈 시마다 직접 load/save만 하면 충분하다.
 *   - Zustand를 걸면 리렌더 연쇄가 생기는데, 세션은 업데이트 빈도가 낮아 불필요한 오버헤드.
 *
 * 왜 try/catch로 전부 감싸는가:
 *   - sessionStorage는 SSR 환경이나 프라이빗 모드에서 던질 수 있다.
 *   - 세션이 없거나 깨진 경우에도 앱이 멈추면 안 된다. 그래서 null/void로 조용히 실패.
 */
import type { WorkSession } from "../types/session";

// sessionStorage 키. 다른 앱/페이지와 충돌 방지를 위해 "grader." 네임스페이스.
const STORAGE_KEY = "grader.session";

/**
 * 세션을 불러온다. 없거나 파싱 실패 시 null.
 */
export function loadWorkSession(): WorkSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WorkSession;
  } catch (err) {
    console.error("세션 로드 실패:", err);
    return null;
  }
}

/**
 * 세션 전체를 덮어 저장한다.
 * 최초 생성 시 사용. 부분 갱신은 updateWorkSession 사용.
 */
export function saveWorkSession(s: WorkSession): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch (err) {
    console.error("세션 저장 실패:", err);
  }
}

/**
 * 기존 세션의 일부만 갱신한다.
 * 세션이 없으면 경고 후 무시 (실수 방지).
 */
export function updateWorkSession(patch: Partial<WorkSession>): void {
  const cur = loadWorkSession();
  if (!cur) {
    console.warn("업데이트할 세션이 없습니다. saveWorkSession으로 먼저 생성하세요.");
    return;
  }
  saveWorkSession({ ...cur, ...patch });
}

/**
 * 세션 종료/리셋. 작업 완료 후 또는 새 작업 시작 시 호출.
 */
export function clearWorkSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error("세션 삭제 실패:", err);
  }
}
