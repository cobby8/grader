/**
 * SvgStandardizeModal.tsx
 *
 * 왜 이 컴포넌트가 필요한가:
 *   디자이너가 G드라이브에 새 사이즈 SVG를 올릴 때마다 개발자가 CLI를 열어
 *   `python main.py normalize_batch ...` 를 직접 실행해야 했다.
 *   이 모달은 그 작업을 "카드 ⋮ 메뉴 → [SVG 표준화] → 미리보기 → 실행" 의
 *   3 클릭으로 축약한다.
 *
 * 비유:
 *   git commit 전에 `git diff` 로 한 번 확인하는 것과 똑같다.
 *   - [미리보기] = git diff (실제 반영 X, 계산만)
 *   - [실행]    = git commit (실제 파일 수정 + .bak 백업)
 *
 * Phase 머신 (6상태):
 *   idle ─────▶ previewing ─▶ preview-done ─▶ executing ─▶ done
 *    │                 │             │             │          (각 단계 실패 시)
 *    │                 └──▶ error ◀──┴─────────────┘
 *    ▼ (에러 발생 경로는 모두 error로 수렴)
 *
 * 안전장치 (UpdateModal과 같은 원칙):
 *   - executing / previewing 중 ESC와 백드롭 클릭 차단 (실수로 중간 종료 방지)
 *   - 기준 사이즈 변경하면 미리보기 상태 초기화 (구 결과로 실행 방지)
 *   - 기본값 "백업 ON" 고정, 체크 해제 시 작은 경고 문구
 *
 * CSS: 프로젝트 컨벤션(BEM + var(--color-*)) 따라 App.css에 `.svg-standardize-modal__*` 추가.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  normalizeBatch,
  previewNormalize,
  resolveBaseFile,
  type BatchResult,
  type PreviewResult,
  type ResolvedBaseFile,
} from "../services/svgStandardizeService";

// ============================================================================
// Props & 내부 타입
// ============================================================================

export interface SvgStandardizeModalProps {
  /** 모달 타이틀에 표시할 프리셋명 (예: "양면유니폼 U넥 스탠다드") */
  presetName: string;
  /** 대상 폴더 절대 경로 (이미 절대 경로로 합성되어 전달됨) */
  driveFolder: string;
  /**
   * 패턴의 사이즈별 SVG 절대 경로 맵.
   * 양면 상의가 아닌 경우(fallback 경로)에 XL→2XL→L→M→S 순서로 참조된다.
   * 예: { "XL": "C:/.../양면유니폼_..._XL.svg", "L": "C:/.../..._L.svg" }
   */
  svgPathBySize: Record<string, string>;
  /**
   * Drive 루트 절대 경로 (settingsStore의 `drivePatternRoot`).
   * 양면 상의일 때 글로벌 기준 파일(U넥 스탠다드 XL) 경로 합성에 사용.
   */
  drivePatternRoot: string;
  /** 모달 닫기 콜백 (ESC/닫기 버튼 클릭 시 호출). executing/previewing 중엔 무시됨. */
  onClose: () => void;
  /** 실행 완료 시 호출 — PatternManage 측에서 Drive 재스캔 트리거용. */
  onComplete?: () => void;
}

/**
 * 6상태 Phase 머신.
 * discriminated union으로 표현해서 각 상태에서 필요한 데이터를 컴파일 타임에 강제한다.
 * (예: done 상태에는 BatchResult가 반드시 존재)
 */
type Phase =
  | { kind: "idle" }
  | { kind: "previewing" }
  | { kind: "preview-done"; data: PreviewResult }
  | { kind: "executing" }
  | { kind: "done"; data: BatchResult }
  | { kind: "error"; message: string };

// ============================================================================
// 헬퍼 함수
// ============================================================================

/**
 * 파일 절대 경로에서 파일명만 추출 (UI 표시용).
 * 경로 구분자가 \ 또는 / 섞일 수 있으니 둘 다 고려.
 */
function fileName(fullPath: string): string {
  const idx = Math.max(fullPath.lastIndexOf("\\"), fullPath.lastIndexOf("/"));
  return idx >= 0 ? fullPath.slice(idx + 1) : fullPath;
}

// ============================================================================
// 컴포넌트
// ============================================================================

function SvgStandardizeModal({
  presetName,
  driveFolder,
  svgPathBySize,
  drivePatternRoot,
  onClose,
  onComplete,
}: SvgStandardizeModalProps) {
  // === Phase 머신 ===
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  // === 폼 상태 ===
  // 백업 생략 체크박스 (기본 false = 백업 ON)
  const [noBackup, setNoBackup] = useState<boolean>(false);

  // === 기준 파일 자동 결정 (보완 수정 [2026-04-22]) ===
  // 왜 useMemo: driveFolder/svgPathBySize/drivePatternRoot 가 거의 변하지 않으므로
  // 렌더마다 재계산할 필요 없음. 양면 상의 → 글로벌 U넥 스탠다드 XL, 그 외 → XL/2XL/L/M/S fallback.
  const resolvedBase: ResolvedBaseFile | null = useMemo(
    () => resolveBaseFile(driveFolder, svgPathBySize, drivePatternRoot),
    [driveFolder, svgPathBySize, drivePatternRoot]
  );
  // Python에 넘길 절대 경로 (null이면 실행 불가)
  const baseFile = resolvedBase?.absPath ?? "";

  // === 닫기 가능 여부 — 실행/미리보기 중엔 모달 잠금 ===
  const isLocked =
    phase.kind === "previewing" || phase.kind === "executing";

  const handleClose = useCallback(() => {
    if (isLocked) return;  // 잠금 상태면 무시
    onClose();
  }, [isLocked, onClose]);

  // === ESC 키로 닫기 (잠금 시 무시) ===
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  // === 백드롭 클릭 닫기 (잠금 시 무시) ===
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) handleClose();
    },
    [handleClose]
  );

  // (보완 수정 [2026-04-22]) 기준 사이즈 드롭다운을 제거했으므로 변경 핸들러도 삭제됨.

  // === [미리보기] 버튼 핸들러 ===
  const handlePreview = useCallback(async () => {
    setPhase({ kind: "previewing" });
    try {
      const result = await previewNormalize(driveFolder, baseFile);
      if (!result.success) {
        // [v1.0.5] fallback 어휘 통일 (errors.md 2026-04-27).
        //   Python 응답에 error 필드가 빠진 경우 어디를 봐야 하는지 즉시 알 수 있게 명시.
        setPhase({
          kind: "error",
          message: result.error ?? "(SVG 표준화 응답에 error 필드 없음 — svg_normalizer.py 출력 확인)",
        });
        return;
      }
      setPhase({ kind: "preview-done", data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[SvgStandardizeModal] preview 실패:", msg);
      setPhase({ kind: "error", message: msg });
    }
  }, [driveFolder, baseFile]);

  // === [실행] 버튼 핸들러 ===
  const handleExecute = useCallback(async () => {
    setPhase({ kind: "executing" });
    try {
      const result = await normalizeBatch(driveFolder, baseFile, noBackup);
      // Python은 fail_count > 0 이면 success=false를 반환.
      // 단, 부분 성공(일부 PASS + 일부 FAIL) 케이스도 결과를 사용자에게 보여줘야 하므로
      // data가 있으면 done 상태로 전환하고, 없으면 error.
      if (!result.data) {
        setPhase({
          kind: "error",
          message: result.error ?? "변환 실패 (데이터 없음)",
        });
        return;
      }
      setPhase({ kind: "done", data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[SvgStandardizeModal] batch 실패:", msg);
      setPhase({ kind: "error", message: msg });
    }
  }, [driveFolder, baseFile, noBackup]);

  // === [뒤로] 버튼 — preview-done → idle ===
  const handleBack = useCallback(() => {
    setPhase({ kind: "idle" });
  }, []);

  // === [다시 시도] 버튼 — error → idle ===
  const handleRetry = useCallback(() => {
    setPhase({ kind: "idle" });
  }, []);

  // === [닫기] 버튼 (done 상태) — 완료 콜백 후 모달 닫기 ===
  const handleDoneClose = useCallback(() => {
    if (phase.kind === "done" && phase.data.data && phase.data.data.pass_count > 0) {
      // 실제 파일이 변환된 경우에만 재스캔 트리거 (스킵만 발생한 경우는 의미 없음)
      onComplete?.();
    }
    onClose();
  }, [phase, onClose, onComplete]);

  // ==========================================================================
  // 렌더
  // ==========================================================================

  return (
    <div
      className="svg-standardize-modal__backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="svg-standardize-modal-title"
      onClick={handleBackdropClick}
    >
      <div className="svg-standardize-modal__card">
        {/* ===== 헤더 ===== */}
        <header className="svg-standardize-modal__header">
          <h2
            id="svg-standardize-modal-title"
            className="svg-standardize-modal__title"
          >
            📐 SVG 표준화
          </h2>
          <div className="svg-standardize-modal__subtitle">{presetName}</div>
        </header>

        {/* ===== 상단 경고 배너 (항상 표시) ===== */}
        <div className="svg-standardize-modal__warning">
          ⚠️ 이 작업은 G드라이브의 원본 SVG 파일을 직접 수정합니다.
          {" "}
          <strong>.bak 백업</strong>이 자동 생성되므로 실행 전 [미리보기]로
          변경 내용을 확인하세요.
        </div>

        {/* ===== 본문 — Phase 별로 내용 분기 ===== */}
        <section className="svg-standardize-modal__body">
          {/* [idle] 대상 폴더 + 자동 결정된 기준 파일 안내 + 백업 옵션
              (보완 수정 [2026-04-22]: 기준 사이즈 드롭다운 제거, 자동 결정 결과를 읽기 전용 안내로 표시)
          */}
          {phase.kind === "idle" && (
            <div className="svg-standardize-modal__section">
              <div className="svg-standardize-modal__field">
                <label className="svg-standardize-modal__label">대상 폴더</label>
                <div className="svg-standardize-modal__path">{driveFolder}</div>
              </div>

              {/* 자동 결정된 기준 파일 안내 (resolvedBase가 null이면 에러 카드) */}
              <div className="svg-standardize-modal__field">
                <label className="svg-standardize-modal__label">
                  📐 기준 파일
                </label>
                {resolvedBase ? (
                  <>
                    <div className="svg-standardize-modal__path">
                      {resolvedBase.displayName}
                    </div>
                    <div className="svg-standardize-modal__hint">
                      {resolvedBase.kind === "global"
                        ? "양면 유니폼 상의는 모든 프리셋이 동일한 글로벌 기준 파일(U넥 스탠다드 XL)을 사용합니다. 수동 선택 불가."
                        : "폴더 내부에서 XL → 2XL → L → M → S 순으로 자동 선택됩니다."}
                    </div>
                  </>
                ) : (
                  <div className="svg-standardize-modal__error-box">
                    <div className="svg-standardize-modal__error-title">
                      기준 파일을 찾을 수 없습니다
                    </div>
                    <div className="svg-standardize-modal__error-message">
                      이 폴더에는 XL/2XL/L/M/S 어느 사이즈도 등록되어 있지 않습니다.
                      Drive 루트 설정(Settings)을 확인하거나 기준이 될 SVG 파일을
                      폴더에 먼저 배치하세요.
                    </div>
                  </div>
                )}
              </div>

              <div className="svg-standardize-modal__field">
                <label className="svg-standardize-modal__checkbox-label">
                  <input
                    type="checkbox"
                    checked={noBackup}
                    onChange={(e) => setNoBackup(e.target.checked)}
                  />
                  백업(.bak) 생략
                </label>
                {noBackup && (
                  <div className="svg-standardize-modal__hint svg-standardize-modal__hint--caution">
                    ⚠️ 원본 복구가 필요할 수 있어요. 권장: 체크 해제 유지
                  </div>
                )}
              </div>
            </div>
          )}

          {/* [previewing / executing] 로딩 */}
          {(phase.kind === "previewing" || phase.kind === "executing") && (
            <div className="svg-standardize-modal__loading">
              <div className="svg-standardize-modal__spinner" aria-hidden="true" />
              <div className="svg-standardize-modal__loading-text">
                {phase.kind === "previewing"
                  ? "시뮬레이션 중입니다..."
                  : "변환 중입니다... (파일 수정됨)"}
              </div>
            </div>
          )}

          {/* [preview-done] 시뮬레이션 결과 목록 */}
          {phase.kind === "preview-done" && (
            <div className="svg-standardize-modal__section">
              <div className="svg-standardize-modal__section-title">
                변환 시뮬레이션 결과 ({phase.data.data?.previews?.length ?? 0}개 파일)
              </div>
              <ul className="svg-standardize-modal__file-list">
                {(phase.data.data?.previews ?? []).map((prev) => (
                  <li
                    key={prev.file}
                    className={
                      "svg-standardize-modal__file-item" +
                      (prev.status === "FAIL"
                        ? " svg-standardize-modal__file-item--fail"
                        : "")
                    }
                  >
                    <span className="svg-standardize-modal__file-icon">
                      {prev.status === "OK" ? "✓" : "✗"}
                    </span>
                    <span className="svg-standardize-modal__file-name">
                      {fileName(prev.file)}
                    </span>
                    {prev.status === "OK" && (
                      <span className="svg-standardize-modal__file-meta">
                        큰{prev.big_width}mm · 작은{prev.small_width}mm · 간격
                        {prev.gap_between_patterns}mm
                      </span>
                    )}
                    {prev.status === "FAIL" && prev.error && (
                      <span className="svg-standardize-modal__file-error">
                        {prev.error}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* [done] 결과 요약 */}
          {phase.kind === "done" && phase.data.data && (
            <div className="svg-standardize-modal__section">
              {/* 요약 카드 3개 병렬 */}
              <div className="svg-standardize-modal__summary">
                <div className="svg-standardize-modal__summary-card svg-standardize-modal__summary-card--pass">
                  <div className="svg-standardize-modal__summary-value">
                    {phase.data.data.pass_count}
                  </div>
                  <div className="svg-standardize-modal__summary-label">성공</div>
                </div>
                <div
                  className={
                    "svg-standardize-modal__summary-card" +
                    (phase.data.data.fail_count > 0
                      ? " svg-standardize-modal__summary-card--fail"
                      : "")
                  }
                >
                  <div className="svg-standardize-modal__summary-value">
                    {phase.data.data.fail_count}
                  </div>
                  <div className="svg-standardize-modal__summary-label">실패</div>
                </div>
                <div className="svg-standardize-modal__summary-card svg-standardize-modal__summary-card--skip">
                  <div className="svg-standardize-modal__summary-value">
                    {phase.data.data.skipped_count}
                  </div>
                  <div className="svg-standardize-modal__summary-label">건너뜀</div>
                </div>
              </div>
              {/* 상세 결과 목록 */}
              <div className="svg-standardize-modal__section-title">
                상세 결과
              </div>
              <ul className="svg-standardize-modal__file-list">
                {phase.data.data.results.map((item) => (
                  <li
                    key={item.file}
                    className={
                      "svg-standardize-modal__file-item" +
                      (item.status === "FAIL"
                        ? " svg-standardize-modal__file-item--fail"
                        : item.status === "SKIP"
                        ? " svg-standardize-modal__file-item--skip"
                        : "")
                    }
                  >
                    <span className="svg-standardize-modal__file-icon">
                      {item.status === "PASS"
                        ? "✓"
                        : item.status === "SKIP"
                        ? "⊘"
                        : "✗"}
                    </span>
                    <span className="svg-standardize-modal__file-name">
                      {fileName(item.file)}
                    </span>
                    <span className="svg-standardize-modal__file-meta">
                      {item.status}
                      {item.reason && ` — ${item.reason}`}
                      {item.error && ` — ${item.error}`}
                    </span>
                  </li>
                ))}
              </ul>
              {/* 버전 표기 (바이브 코더에게 "무엇이 적용됐는지" 투명하게) */}
              <div className="svg-standardize-modal__version-note">
                표준화 엔진 버전: {phase.data.data.version}
              </div>
            </div>
          )}

          {/* [error] 에러 메시지 */}
          {phase.kind === "error" && (
            <div className="svg-standardize-modal__error-box">
              <div className="svg-standardize-modal__error-title">
                작업 실패
              </div>
              <div className="svg-standardize-modal__error-message">
                {phase.message}
              </div>
              <div className="svg-standardize-modal__error-hint">
                Python 엔진이 없으면 <code>setup-python.bat</code>을 먼저 실행하세요.
                권한 오류라면 G드라이브 파일이 다른 프로그램(Illustrator 등)에서
                열려 있지 않은지 확인하세요.
              </div>
            </div>
          )}
        </section>

        {/* ===== 푸터 (Phase별 버튼 분기) ===== */}
        <footer className="svg-standardize-modal__footer">
          {phase.kind === "idle" && (
            <>
              <button
                type="button"
                className="btn btn--small"
                onClick={handleClose}
              >
                취소
              </button>
              <button
                type="button"
                className="btn btn--small btn--primary"
                onClick={handlePreview}
                disabled={!resolvedBase}  // 기준 파일 자동 결정 실패 시 실행 불가
                title={
                  !resolvedBase
                    ? "기준 파일을 찾을 수 없어 실행할 수 없습니다"
                    : undefined
                }
              >
                미리보기
              </button>
            </>
          )}

          {(phase.kind === "previewing" || phase.kind === "executing") && (
            <button
              type="button"
              className="btn btn--small"
              disabled
              title="진행 중에는 닫을 수 없습니다"
            >
              {phase.kind === "previewing" ? "시뮬레이션 중..." : "변환 중..."}
            </button>
          )}

          {phase.kind === "preview-done" && (
            <>
              <button
                type="button"
                className="btn btn--small"
                onClick={handleBack}
              >
                ← 뒤로
              </button>
              <button
                type="button"
                className="btn btn--small btn--primary"
                onClick={handleExecute}
              >
                ▶ 실행
              </button>
            </>
          )}

          {phase.kind === "done" && (
            <button
              type="button"
              className="btn btn--small btn--primary"
              onClick={handleDoneClose}
            >
              닫기
            </button>
          )}

          {phase.kind === "error" && (
            <>
              <button
                type="button"
                className="btn btn--small"
                onClick={handleClose}
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

export default SvgStandardizeModal;
