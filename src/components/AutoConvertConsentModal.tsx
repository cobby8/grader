/**
 * src/components/AutoConvertConsentModal.tsx
 *
 * AI→SVG Phase 3: 자동 변환 첫 ON 시 1회 동의 모달.
 *
 * 왜 이 컴포넌트가 필요한가:
 *   "자동 변환을 켜는 순간부터 G드라이브 폴더에 SVG 파일이 자동으로 생성된다"는
 *   사실을 사용자(바이브 코더)가 명시적으로 인지하고 동의해야 한다. 토글만 두고
 *   설명 없이 켜지게 하면 "내가 안 만든 파일이 왜 생기지?" 같은 혼란이 발생한다.
 *   이 모달은 첫 ON 시 한 번만 뜨고, 동의하면 settings.json의
 *   `aiAutoConvertConsent: true`로 영구 기록되어 다음에 토글 OFF→ON 해도 재표시되지 않는다.
 *
 * 비유:
 *   앱 설치 직후 한 번 묻는 "이용 약관 동의" 모달. 한 번만 묻는다.
 *
 * 호출 측:
 *   - src/pages/Settings.tsx의 "AI 자동 변환" 섹션
 *     (단계 2 / 3-D에서 통합 예정 — 단계 1에서는 컴포넌트만 작성)
 *
 * Props 흐름:
 *   isOpen=true로 마운트 → [동의하고 켜기] → onConsent() 호출
 *                       → [취소] / ESC / 백드롭 → onCancel() 호출
 *   호출 측은 onConsent에서 setAiAutoConvertConsent(true) + setAiAutoConvertEnabled(true)를 함께 처리.
 *
 * 디자인:
 *   - AiConvertModal.tsx의 BEM 패턴 차용 (`autoconvert-consent-modal__*`)
 *   - 하드코딩 색상 0건 — App.css에서 var(--color-*) 변수로만 처리
 *   - Material Symbols Outlined 아이콘 사용 (cloud_sync, check, close)
 *
 * CSS:
 *   `.autoconvert-consent-modal__*` BEM은 단계 2 (3-F)에서 App.css에 추가 예정.
 *   본 단계에서는 컴포넌트 마크업만 완성하고 스타일은 미리 클래스명으로만 잡아둠.
 *
 * 관련:
 *   - PLAN-AI-TO-SVG.md 13-3 (신규 파일 목록), 13-4 (정책)
 *   - src/components/AiConvertModal.tsx (BEM 구조 레퍼런스)
 *   - src/components/UpdateModal.tsx (백드롭/카드/푸터 패턴 레퍼런스)
 *   - src/stores/settingsStore.ts (setAiAutoConvertConsent / setAiAutoConvertEnabled)
 */

import { useEffect } from "react";

// ============================================================================
// Props
// ============================================================================

export interface AutoConvertConsentModalProps {
  /** 열림 상태. false면 렌더 자체 안 함 (마운트 비용 절약). */
  isOpen: boolean;
  /** 사용자가 [동의하고 켜기]를 누르면 호출 — 호출 측에서 영속 처리. */
  onConsent: () => void;
  /** 사용자가 [취소] / ESC / 백드롭 클릭 시 호출 — 토글은 ON 안 됨. */
  onCancel: () => void;
}

// ============================================================================
// 컴포넌트
// ============================================================================

/**
 * AI 자동 변환 첫 ON 시 1회만 표시되는 동의 모달.
 *
 * 안전장치:
 *   - ESC 키 → onCancel (사용자 의도 즉시 반영)
 *   - 백드롭 클릭 → onCancel (실수 방지를 위해 본 문서에서는 허용 — 동의 모달은
 *                              파괴적 작업이 아니라 "켤지 말지" 결정만 하므로 안전)
 *   - 본문/카드 클릭 → 이벤트 버블링 차단해 onCancel 미호출
 */
export default function AutoConvertConsentModal({
  isOpen,
  onConsent,
  onCancel,
}: AutoConvertConsentModalProps) {
  // ESC 키 처리 — 모달이 열린 동안만 등록
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onCancel]);

  // 닫혀있으면 DOM 자체를 안 만든다 — 마운트/언마운트 비용 절약
  if (!isOpen) return null;

  // 백드롭 클릭 → onCancel
  // (카드 내부 클릭은 stopPropagation으로 버블링 차단)
  const handleBackdropClick = () => {
    onCancel();
  };

  return (
    <div
      className="autoconvert-consent-modal__backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="autoconvert-consent-modal-title"
      onClick={handleBackdropClick}
    >
      <div
        className="autoconvert-consent-modal__card"
        // 카드 내부 클릭은 백드롭으로 전파되지 않도록 차단
        onClick={(e) => e.stopPropagation()}
      >
        {/* ===== 헤더 — Material Symbols 아이콘 + 제목 ===== */}
        <header className="autoconvert-consent-modal__header">
          <span
            className="material-symbols-outlined autoconvert-consent-modal__icon"
            aria-hidden="true"
          >
            cloud_sync
          </span>
          <h2
            id="autoconvert-consent-modal-title"
            className="autoconvert-consent-modal__title"
          >
            AI 자동 변환을 켜시겠습니까?
          </h2>
        </header>

        {/* ===== 본문 — 안내 + 불릿 4개 ===== */}
        <section className="autoconvert-consent-modal__body">
          <p className="autoconvert-consent-modal__description">
            자동 변환을 켜면 G드라이브 동기화 시 SVG가 없는 AI 파일을
            <strong>자동으로 변환하여 같은 폴더에 저장</strong>합니다.
            사용자가 매번 수동으로 변환 버튼을 누르지 않아도 됩니다.
          </p>

          <ul className="autoconvert-consent-modal__bullet-list">
            <li className="autoconvert-consent-modal__bullet">
              <span
                className="material-symbols-outlined autoconvert-consent-modal__bullet-icon"
                aria-hidden="true"
              >
                check
              </span>
              <span>
                G드라이브 동일 폴더에 <code>XL.svg</code> 형태로 저장됩니다.
              </span>
            </li>
            <li className="autoconvert-consent-modal__bullet">
              <span
                className="material-symbols-outlined autoconvert-consent-modal__bullet-icon"
                aria-hidden="true"
              >
                check
              </span>
              <span>
                같은 이름의 SVG가 이미 있으면 <strong>건너뜁니다</strong>{" "}
                (덮어쓰지 않음).
              </span>
            </li>
            <li className="autoconvert-consent-modal__bullet">
              <span
                className="material-symbols-outlined autoconvert-consent-modal__bullet-icon"
                aria-hidden="true"
              >
                check
              </span>
              <span>
                백그라운드에서 조용히 진행되며, 진행 상태는 패턴 관리 페이지의
                상단 배너에 표시됩니다.
              </span>
            </li>
            <li className="autoconvert-consent-modal__bullet">
              <span
                className="material-symbols-outlined autoconvert-consent-modal__bullet-icon"
                aria-hidden="true"
              >
                check
              </span>
              <span>
                Settings 페이지에서 언제든 끌 수 있고, 3회 연속 실패하면
                자동으로 꺼집니다.
              </span>
            </li>
          </ul>
        </section>

        {/* ===== 푸터 — 버튼 2개 ===== */}
        <footer className="autoconvert-consent-modal__footer">
          <button
            type="button"
            className="autoconvert-consent-modal__btn autoconvert-consent-modal__btn--cancel"
            onClick={onCancel}
          >
            <span
              className="material-symbols-outlined"
              aria-hidden="true"
            >
              close
            </span>
            취소
          </button>
          <button
            type="button"
            className="autoconvert-consent-modal__btn autoconvert-consent-modal__btn--primary"
            onClick={onConsent}
          >
            <span
              className="material-symbols-outlined"
              aria-hidden="true"
            >
              check
            </span>
            동의하고 켜기
          </button>
        </footer>
      </div>
    </div>
  );
}
