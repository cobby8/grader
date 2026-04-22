/**
 * UpdateSection.tsx
 *
 * 왜 이 컴포넌트가 필요한가:
 *   자동 팝업을 "나중에"로 닫은 뒤에도 사용자가 **다시 열 수 있어야** 한다.
 *   별도 라우트(/update)를 만들기보다 Settings 페이지 안에
 *   "버전 정보" 섹션으로 배치 — PLAN D5 결정 사항.
 *
 * 비유:
 *   - 자동 팝업 = 엘리베이터 문 앞의 안내방송
 *   - 이 섹션  = 1층 로비 게시판. 언제든 가서 확인 가능
 *
 * 표시 내용:
 *   - 현재 앱 버전 (Tauri getVersion API로 조회 — package.json보다 정확)
 *   - 마지막 체크 시각 (훅에서 공유받음)
 *   - 현재 체크 상태 (최신/새 버전/에러)
 *   - [지금 확인] 버튼 (수동 체크)
 *   - 새 버전 발견 시 [업데이트 받기] 버튼 (UpdateModal 재노출 유도)
 */

import { useEffect, useState, useCallback } from "react";
import { useAutoUpdateCheck, runCheckNow } from "../hooks/useAutoUpdateCheck";
import { getCurrentVersion } from "../services/updaterService";

/**
 * ISO 타임스탬프 → "2026-04-22 14:30" 형식.
 * 초까지 보여주는 것보다 "언제쯤" 체크했는지만 알면 충분.
 */
function formatTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
}

function UpdateSection() {
  // === 자동 체크 훅 (여기서는 autoCheck=false — App에서 이미 호출) ===
  // 훅이 구독만 해서 다른 곳(App)에서 상태 바뀌면 여기도 자동 갱신된다.
  const updateState = useAutoUpdateCheck(false);

  // === 현재 앱 버전 ===
  const [currentVersion, setCurrentVersion] = useState<string>("—");

  useEffect(() => {
    getCurrentVersion()
      .then(setCurrentVersion)
      .catch((err) => {
        console.warn("[UpdateSection] 버전 조회 실패:", err);
      });
  }, []);

  // === "지금 확인" 버튼 ===
  const handleCheck = useCallback(() => {
    // runCheckNow는 내부적으로 중복 호출 방지(checking 중이면 skip)
    runCheckNow();
  }, []);

  // === 상태 문구 매핑 ===
  // 사용자에게 보일 메시지. 기술 용어 대신 평이한 한국어.
  let statusText = "";
  let statusClass = "";
  switch (updateState.status) {
    case "idle":
      statusText = "아직 확인하지 않았습니다.";
      statusClass = "";
      break;
    case "checking":
      statusText = "확인 중...";
      statusClass = "settings-status settings-status--checking";
      break;
    case "available":
      statusText = updateState.result && updateState.result.kind === "available"
        ? `새 버전 v${updateState.result.update.version} 사용 가능`
        : "새 버전 사용 가능";
      statusClass = "settings-status settings-status--valid";
      break;
    case "up-to-date":
      statusText = "최신 버전입니다.";
      statusClass = "settings-status settings-status--valid";
      break;
    case "dismissed":
      // "나중에"로 닫힌 상태 — 이전 체크에서 새 버전이 있었을 가능성
      statusText = "업데이트 알림을 닫았습니다. 다시 확인하려면 아래 버튼을 누르세요.";
      statusClass = "";
      break;
    case "error":
      statusText = "업데이트 서버에 연결할 수 없습니다. 네트워크를 확인하세요.";
      statusClass = "settings-status settings-status--invalid";
      break;
  }

  // === "업데이트 받기" 버튼 표시 조건 ===
  // available 상태면서 result가 실제로 들어있을 때만.
  // dismissed 상태일 때도 버튼을 보여주고 싶으면 runCheckNow()로 다시 available로 바뀌게 해야 함.
  const showInstallButton =
    updateState.status === "available" &&
    updateState.result !== null &&
    updateState.result.kind === "available";

  const checking = updateState.status === "checking";

  return (
    <section className="settings-section">
      <h2 className="settings-section__title">버전 정보</h2>
      <p className="settings-section__description">
        현재 설치된 grader 버전과 업데이트 상태입니다. 앱이 켜질 때마다 자동으로
        최신 버전을 확인합니다.
      </p>

      {/* === 현재 버전 === */}
      <div className="settings-row">
        <label className="settings-row__label">현재 버전</label>
        <div className="settings-row__value">
          <code className="settings-path">v{currentVersion}</code>
        </div>
      </div>

      {/* === 마지막 체크 시각 === */}
      <div className="settings-row">
        <label className="settings-row__label">마지막 확인</label>
        <div className="settings-row__value">
          {formatTime(updateState.lastCheckedAt)}
        </div>
      </div>

      {/* === 현재 상태 === */}
      <div className="settings-row">
        <label className="settings-row__label">상태</label>
        <div className="settings-row__value">
          {statusClass ? (
            <div className={statusClass}>{statusText}</div>
          ) : (
            <span className="settings-row__placeholder">{statusText}</span>
          )}
        </div>
      </div>

      {/* === 액션 버튼 === */}
      <div className="settings-row">
        <label className="settings-row__label">작업</label>
        <div className="settings-row__value">
          <div className="settings-path-pick">
            <button
              type="button"
              className="btn btn--small"
              onClick={handleCheck}
              disabled={checking}
            >
              {checking ? "확인 중..." : "지금 확인"}
            </button>
            {showInstallButton && (
              <button
                type="button"
                className="btn btn--small btn--primary"
                onClick={() => {
                  // 상태를 다시 'available'로 되돌려 App의 UpdateModal이 뜨게 한다.
                  // 이미 available이면 재호출만으로 충분 — 모달이 App 쪽에서 자동 렌더됨.
                  // dismissed 상태에서 오려면 runCheckNow()로 서버에서 다시 확인한 뒤 available로 바뀌면 됨.
                  runCheckNow();
                }}
              >
                업데이트 받기
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default UpdateSection;
