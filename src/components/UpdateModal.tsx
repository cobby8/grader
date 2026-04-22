/**
 * UpdateModal.tsx
 *
 * 왜 이 컴포넌트가 필요한가:
 *   자동 체크에서 새 버전이 발견되면 사용자에게 **명확한 선택지**를 보여줘야 한다.
 *   단순 alert()로 처리하면
 *     - 릴리스 노트 같은 긴 본문을 보여줄 수 없고
 *     - 다운로드 진행률을 실시간으로 못 보여주며
 *     - "나중에" 버튼과 스타일 통일성이 떨어진다.
 *
 * 비유:
 *   카톡 업데이트 팝업 — "새 버전 있음" + 릴리스 노트 + [업데이트/나중에]
 *
 * UX 원칙 (PLAN 사용자 확정 조건 D4, D5):
 *   - **선택형**: 강제 업데이트 없음. "나중에" 버튼 항상 제공.
 *   - **다운로드 중엔 닫기 차단**: ESC도 막는다 (실수 방지).
 *   - **에러 시 재시도 가능**: 네트워크 실패 상황 복구.
 *   - **완료 직전 안내**: "앱이 재시작됩니다" — 사용자가 놀라지 않게.
 *
 * CSS: 프로젝트 컨벤션(BEM + --color-* 변수) 따라 App.css에 `.update-modal__*` 추가.
 */

import { useEffect, useState, useCallback } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { downloadAndInstall } from "../services/updaterService";
import { dismissUpdate } from "../hooks/useAutoUpdateCheck";

interface UpdateModalProps {
  update: Update;
  /** 모달 닫기 요청 (나중에 / ESC). 다운로드 중엔 무시된다. */
  onDismiss?: () => void;
}

/**
 * 바이트 → 사람이 읽기 쉬운 단위. Settings의 formatBytes와 동일 로직.
 * 중복을 피하려면 공용 유틸로 뺄 수도 있지만, 지금은 2곳 뿐이라 로컬 함수로 둠.
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  return `${(bytes / Math.pow(1024, idx)).toFixed(2)} ${units[idx]}`;
}

/**
 * 진행률(0~1). total이 없으면 null 반환 → UI가 "용량 미상" 표시.
 */
function calcRatio(received: number, total: number | undefined): number | null {
  if (!total || total <= 0) return null;
  return Math.min(1, received / total);
}

// 내부 상태 머신. "다운 전 / 진행 중 / 완료 직전(재시작 대기) / 에러"
type Phase = "idle" | "downloading" | "finishing" | "error";

function UpdateModal({ update, onDismiss }: UpdateModalProps) {
  // === 현재 단계 ===
  const [phase, setPhase] = useState<Phase>("idle");

  // === 다운로드 진행 ===
  const [received, setReceived] = useState(0);
  const [total, setTotal] = useState<number | undefined>(undefined);

  // === 에러 메시지 ===
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // === 닫기 버튼 / ESC 핸들러 ===
  // 다운로드 중에는 닫지 못하게 차단한다 (setup.exe 중간에 끊기면 안 됨)
  const handleDismiss = useCallback(() => {
    if (phase === "downloading" || phase === "finishing") return;
    dismissUpdate(); // 모듈 상태 전체에 알림 → App에서 모달이 사라짐
    onDismiss?.();
  }, [phase, onDismiss]);

  // ESC로 닫기 (바이브 코더 친화 — 키보드 유저도 편하게)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleDismiss]);

  // === "지금 업데이트" 버튼 핸들러 ===
  const handleInstall = useCallback(async () => {
    setPhase("downloading");
    setErrorMsg(null);
    setReceived(0);
    setTotal(undefined);

    try {
      await downloadAndInstall(update, (r, t) => {
        setReceived(r);
        setTotal(t);
        // 받은 용량이 총량과 같아지면 "곧 재시작" 단계로 전환
        if (t !== undefined && r >= t) {
          setPhase("finishing");
        }
      });
      // relaunch가 동작하면 여기 도달 전에 앱이 재시작된다.
      // 혹시 relaunch 호출이 막혀 여기까지 오면 사용자가 수동 재시작하도록 안내.
      setPhase("finishing");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[UpdateModal] 업데이트 실패:", message);
      setErrorMsg(message);
      setPhase("error");
    }
  }, [update]);

  // === 재시도 버튼 ===
  const handleRetry = useCallback(() => {
    setPhase("idle");
    setErrorMsg(null);
  }, []);

  // === 백드롭 클릭 — 다운 중 아닐 때만 닫힘 ===
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // 실제 카드 내부 클릭은 무시 (닫히는 것 방지)
      if (e.target === e.currentTarget) handleDismiss();
    },
    [handleDismiss]
  );

  // === 진행률 계산 ===
  const ratio = calcRatio(received, total);
  const percentText = ratio === null ? "..." : `${Math.floor(ratio * 100)}%`;

  return (
    <div
      className="update-modal__backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-modal-title"
      onClick={handleBackdropClick}
    >
      <div className="update-modal__card">
        {/* === 헤더 === */}
        <header className="update-modal__header">
          <h2 id="update-modal-title" className="update-modal__title">
            새 버전 <code className="update-modal__version">v{update.version}</code> 준비됨
          </h2>
          {update.date && (
            <span className="update-modal__date">배포일: {update.date.split(" ")[0]}</span>
          )}
        </header>

        {/* === 릴리스 노트 (body) === */}
        {update.body && (
          <section className="update-modal__body">
            {/* pre-wrap로 개행 유지. GitHub releases body가 마크다운이어도
                일단은 원문 텍스트 그대로 보여줌 (렌더링은 후속 개선) */}
            <pre className="update-modal__notes">{update.body}</pre>
          </section>
        )}

        {/* === Phase별 푸터 === */}
        <footer className="update-modal__footer">
          {phase === "idle" && (
            <>
              <button
                type="button"
                className="btn btn--small"
                onClick={handleDismiss}
              >
                나중에
              </button>
              <button
                type="button"
                className="btn btn--small btn--primary"
                onClick={handleInstall}
              >
                지금 업데이트
              </button>
            </>
          )}

          {phase === "downloading" && (
            <div className="update-modal__progress">
              <div
                className="update-modal__progress-bar"
                role="progressbar"
                aria-valuenow={ratio === null ? undefined : Math.floor(ratio * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="update-modal__progress-fill"
                  // 용량 모를 땐 50%로 고정 (불확정 상태 시각화 대신 단순 처리)
                  style={{ width: ratio === null ? "50%" : `${ratio * 100}%` }}
                />
              </div>
              <div className="update-modal__progress-label">
                다운로드 중 {percentText}
                {total !== undefined && (
                  <>
                    {" "}
                    <span className="update-modal__progress-size">
                      ({formatBytes(received)} / {formatBytes(total)})
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {phase === "finishing" && (
            <div className="update-modal__finishing">
              설치 완료. 잠시 후 앱이 자동으로 재시작됩니다...
            </div>
          )}

          {phase === "error" && (
            <>
              <div className="update-modal__error">
                업데이트 실패: {errorMsg}
              </div>
              <button
                type="button"
                className="btn btn--small"
                onClick={handleDismiss}
              >
                닫기
              </button>
              <button
                type="button"
                className="btn btn--small btn--primary"
                onClick={handleRetry}
              >
                다시 시도
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

export default UpdateModal;
