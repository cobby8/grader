/**
 * updaterService.ts
 *
 * 왜 이 파일이 필요한가:
 *   Tauri Updater 플러그인(`@tauri-apps/plugin-updater`)과
 *   Process 플러그인(`@tauri-apps/plugin-process`)은 저수준 API다.
 *   컴포넌트가 직접 호출하면 try/catch와 진행 이벤트 분기 로직이
 *   여기저기 중복된다. 이 서비스 레이어는
 *     1) 비즈니스 규칙(네트워크 오류는 조용히 실패 — 앱 동작 방해 금지)
 *     2) 진행 이벤트를 단순 콜백(받은바이트, 총바이트)으로 변환
 *     3) 설치 완료 후 relaunch() 호출
 *   을 전담해서 컴포넌트가 순수 UI에 집중하게 한다.
 *
 * 비유:
 *   Tauri 저수준 API = 복잡한 계기판. 이 서비스 = 운전자가 쓰는 핸들.
 *
 * 기존 services/ 컨벤션과의 일관성:
 *   - driveSync.ts, svgResolver.ts와 동일한 "함수 export" 스타일 (클래스 X)
 *   - 문서 주석은 상단 블록 주석 + JSDoc
 */

import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getVersion } from "@tauri-apps/api/app";

/** 업데이트 체크 결과. null이면 최신 상태이거나 네트워크 오류. */
export type UpdateCheckResult =
  | { kind: "available"; update: Update }
  | { kind: "up-to-date" }
  | { kind: "error"; message: string };

/**
 * 업데이트가 있는지 확인.
 *
 * 네트워크 오류, GitHub 접근 실패 등은 throw하지 않고 `{ kind: 'error' }`로 반환한다.
 * 이유: 앱 시작 시 호출되는데, 사내망에서 GitHub가 막혀 있으면 매번 실패한다.
 * 그 상황에서 예외를 던지면 React error boundary가 터져 앱 자체가 안 켜진다.
 *
 * @returns 새 버전이 있으면 kind: 'available' + Update 객체
 *          최신이면 kind: 'up-to-date'
 *          오류 시 kind: 'error' + 메시지 (UI는 "확인 실패" 표시만 하고 무시)
 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  try {
    const update = await check();
    // Tauri v2 @tauri-apps/plugin-updater: 최신이면 null 반환
    if (update) {
      return { kind: "available", update };
    }
    return { kind: "up-to-date" };
  } catch (err) {
    // 의도적으로 console.warn만. 사용자 경험 방해 금지 (자동 체크 시)
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[updater] 업데이트 체크 실패:", message);
    return { kind: "error", message };
  }
}

/** 다운로드 진행 콜백 — UI가 진행률 바 그리는 데 쓴다. */
export type ProgressCallback = (received: number, total: number | undefined) => void;

/**
 * 업데이트 다운로드 + 설치 + 재시작까지 한 번에 수행.
 *
 * Tauri Updater 이벤트는 세 종류:
 *   - 'Started'  : 다운로드 시작. event.data.contentLength에 총 용량 (nullable)
 *   - 'Progress' : 청크 수신. event.data.chunkLength만큼 증가
 *   - 'Finished' : 다운로드 완료 (설치는 그 다음에 동기적으로 진행됨)
 *
 * 이 함수는 진행 이벤트를 (received, total) 페어로 단순화한다.
 *
 * @param update      checkForUpdate()가 돌려준 Update 객체
 * @param onProgress  0~total 범위로 진행률을 알려주는 콜백
 * @throws 다운로드/설치 실패 시 예외 전파 (UI에서 표시해야 함 — 조용히 실패하면 안 됨)
 */
export async function downloadAndInstall(
  update: Update,
  onProgress: ProgressCallback
): Promise<void> {
  let received = 0;
  let total: number | undefined = undefined;

  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      // contentLength가 있을 때만 세팅 (없으면 UI는 "용량 미상" 표시)
      total = event.data.contentLength ?? undefined;
      received = 0;
      onProgress(received, total);
    } else if (event.event === "Progress") {
      received += event.data.chunkLength;
      onProgress(received, total);
    } else if (event.event === "Finished") {
      // 전부 받은 시점. total이 불명확했어도 received로 채워줌
      onProgress(total ?? received, total);
    }
  });

  // 설치가 완료되면 앱 재시작 (process 플러그인, allow-restart 권한 필요)
  await relaunch();
}

/**
 * 현재 실행 중인 앱 버전을 조회.
 * tauri.conf.json의 version 필드와 동기화되므로 package.json 읽는 것보다 정확.
 */
export async function getCurrentVersion(): Promise<string> {
  return await getVersion();
}
