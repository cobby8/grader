/**
 * src/components/AiConvertModal.tsx
 *
 * AI→SVG 변환 모달 (Phase 1-E, 2026-04-25)
 *
 * 왜 이 컴포넌트가 필요한가:
 *   디자이너가 G드라이브에 .ai 파일만 올려놓고 .svg를 안 뽑아두면
 *   PatternManage에서 패턴이 인식되지 않는다. 이 모달은 미변환 .ai 파일을
 *   PyMuPDF로 자동 변환해주는 사용자 친화 UI다.
 *
 * 비유:
 *   세탁소 모달 — 옷(AI)을 맡기면 깨끗한 옷(SVG)으로 돌려준다.
 *   - [헤더 분석] = 옷 종류 점검 (PDF계 / PostScript계 / 알 수 없음)
 *   - [실행]      = 실제 세탁 (PyMuPDF 변환 + .bak 백업)
 *
 * Phase 머신 (6상태):
 *   idle ─▶ previewing ─▶ preview-done ─▶ converting ─▶ done
 *    │            │              │              │         (각 단계 실패 시)
 *    │            └────▶ error ◀─┴──────────────┘
 *    ▼ (에러 발생 경로는 모두 error로 수렴)
 *
 * 안전장치:
 *   - converting 중 ESC + 백드롭 클릭 차단 (실수 종료 방지)
 *   - 옵션 "덮어쓰기" 기본 꺼짐 (안전 우선) — 켜야만 .bak 백업 후 덮어쓰기
 *   - 부분 성공 시에도 결과 반드시 보여줌 (data 있으면 done 상태)
 *
 * CSS: 프로젝트 컨벤션(BEM + var(--color-*)) 따라 App.css에 `.ai-convert-modal__*` 추가.
 *
 * 관련:
 *   - PLAN-AI-TO-SVG.md 섹션 6-5
 *   - src/components/SvgStandardizeModal.tsx (560줄, 동일 패턴 레퍼런스)
 *   - src/components/UpdateModal.tsx (BEM 구조 참고)
 *   - src/services/aiConvertService.ts (invoke 게이트웨이)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  convertAiBatch,
  previewAiConversion,
  type AiBatchResult,
  type AiBatchResultEntry,
  type AiKind,
  type AiPreviewEntry,
  type AiPreviewResult,
} from "../services/aiConvertService";

// ============================================================================
// Props & 내부 타입
// ============================================================================

export interface AiConvertModalProps {
  /** 미변환 AI 파일 절대 경로 배열 (PatternManage 배너에서 전달). */
  files: string[];
  /** 모달 닫기 콜백 (ESC/닫기 클릭 시). converting 중에는 무시됨. */
  onClose: () => void;
  /** 변환 성공 시 호출 — PatternManage가 runAutoSync를 다시 트리거. */
  onComplete: () => void;
}

/**
 * 6상태 Phase 머신.
 * discriminated union으로 표현해서 각 상태에서 필요한 데이터를 컴파일 타임에 강제한다.
 * (예: preview-done 상태에는 AiPreviewResult가 반드시 존재)
 */
type Phase =
  | { kind: "idle" }
  | { kind: "previewing" }
  | { kind: "preview-done"; data: AiPreviewResult }
  | { kind: "converting" }
  | { kind: "done"; data: AiBatchResult }
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

/**
 * AI 분류 → 사람이 읽을 수 있는 한글 라벨.
 * 사용자(바이브 코더)가 "pdf_compatible"보다는 "PDF 호환"을 더 잘 이해함.
 */
function kindLabel(kind: AiKind): string {
  if (kind === "pdf_compatible") return "PDF 호환";
  if (kind === "postscript") return "PostScript";
  return "알 수 없음";
}

/**
 * 실제 변환 예정 개수 계산 — preview-done 단계의 [실행] 버튼에 표시.
 *
 * 규칙:
 *   - PDF 호환만 변환 가능 (PostScript/unknown은 어차피 SKIP)
 *   - overwrite=false면 기존 SVG 있는 파일도 SKIP
 *   - overwrite=true면 기존 SVG 있어도 .bak 백업 후 변환
 */
function countConvertable(
  entries: AiPreviewEntry[],
  overwrite: boolean
): number {
  return entries.filter(
    (e) => e.kind === "pdf_compatible" && (overwrite || !e.existing_svg)
  ).length;
}

// ============================================================================
// 컴포넌트
// ============================================================================

function AiConvertModal({ files, onClose, onComplete }: AiConvertModalProps) {
  // === Phase 머신 ===
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  // === 폼 상태 ===
  // 옵션 "기존 SVG 덮어쓰기" — 기본 false (안전 우선)
  // 켜면 Python이 .bak 자동 백업 후 덮어쓰기 진행
  const [overwrite, setOverwrite] = useState<boolean>(false);

  // === 닫기 가능 여부 — 변환 중엔 모달 잠금 ===
  // converting 단계에서만 잠금 (previewing은 빠르게 끝나서 굳이 잠금 안 함)
  const isLocked = phase.kind === "converting";

  // === 닫기 핸들러 (잠금 시 무시) ===
  const handleClose = useCallback(() => {
    if (isLocked) return;
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
      // e.target === e.currentTarget: 백드롭 자체를 클릭한 경우만 (카드 내부 클릭은 무시)
      if (e.target === e.currentTarget) handleClose();
    },
    [handleClose]
  );

  // === [헤더 분석] 버튼 핸들러 ===
  // 실제 파일은 건드리지 않고 헤더 첫 10바이트만 읽어 분류
  const handlePreview = useCallback(async () => {
    setPhase({ kind: "previewing" });
    try {
      const result = await previewAiConversion(files);
      if (!result.success) {
        setPhase({
          kind: "error",
          message: result.error ?? "헤더 분석 실패 (Python success=false)",
        });
        return;
      }
      setPhase({ kind: "preview-done", data: result });
    } catch (err) {
      // invoke / JSON.parse 실패 — 사용자 명시 액션이라 조용히 넘기지 않음
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[AiConvertModal] preview 실패:", msg);
      setPhase({ kind: "error", message: msg });
    }
  }, [files]);

  // === [실행] 버튼 핸들러 ===
  // 실제 PyMuPDF 변환 — PDF 호환만 처리, PostScript/unknown/기존 SVG는 SKIP
  const handleExecute = useCallback(async () => {
    setPhase({ kind: "converting" });
    try {
      const result = await convertAiBatch(files, overwrite);
      // Python이 fail이라도 부분 성공 결과를 보여줘야 함
      // data가 있으면 done, 없으면 error로 분기
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
      console.error("[AiConvertModal] batch 실패:", msg);
      setPhase({ kind: "error", message: msg });
    }
  }, [files, overwrite]);

  // === [← 뒤로] 버튼 — preview-done → idle ===
  const handleBack = useCallback(() => {
    setPhase({ kind: "idle" });
  }, []);

  // === [다시 시도] 버튼 — error → idle ===
  const handleRetry = useCallback(() => {
    setPhase({ kind: "idle" });
  }, []);

  // === [닫기] 버튼 (done 상태) — 완료 콜백 후 모달 닫기 ===
  // 변환된 파일이 1개라도 있으면 onComplete()로 PatternManage가 재스캔 트리거
  const handleDoneClose = useCallback(() => {
    if (phase.kind === "done" && phase.data.data && phase.data.data.converted > 0) {
      onComplete();
    } else {
      onClose();
    }
  }, [phase, onClose, onComplete]);

  // === preview-done 상태에서만 의미 있는 파생값 ===
  // useMemo로 entries/summary 변경 시에만 재계산 (overwrite 토글 시 즉시 반영)
  const previewEntries = useMemo<AiPreviewEntry[]>(() => {
    return phase.kind === "preview-done"
      ? phase.data.data?.entries ?? []
      : [];
  }, [phase]);

  const convertableCount = useMemo(
    () => countConvertable(previewEntries, overwrite),
    [previewEntries, overwrite]
  );

  // ==========================================================================
  // 렌더
  // ==========================================================================

  return (
    <div
      className="ai-convert-modal__backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-convert-modal-title"
      onClick={handleBackdropClick}
    >
      <div className="ai-convert-modal__card">
        {/* ===== 헤더 ===== */}
        <header className="ai-convert-modal__header">
          <h2 id="ai-convert-modal-title" className="ai-convert-modal__title">
            🪄 AI → SVG 자동 변환
          </h2>
          <div className="ai-convert-modal__subtitle">
            대상 파일 {files.length}개
          </div>
        </header>

        {/* ===== 상단 안내 배너 (항상 표시) ===== */}
        <div className="ai-convert-modal__warning">
          ⚠️ 이 작업은 G드라이브에 새로운 SVG 파일을 생성합니다.
          {" "}
          <strong>Phase 1</strong>은 PDF 호환 AI만 처리하며,
          {" "}
          <strong>PostScript AI</strong>는 Phase 2에서 지원 예정입니다.
        </div>

        {/* ===== 본문 — Phase별 분기 ===== */}
        <section className="ai-convert-modal__body">
          {/* [idle] 파일 목록 + 옵션 */}
          {phase.kind === "idle" && (
            <div className="ai-convert-modal__section">
              <div className="ai-convert-modal__section-title">
                대상 파일 ({files.length}개)
              </div>
              {/* 파일 목록 — basename만 표시 (절대경로는 너무 길음) */}
              <ul className="ai-convert-modal__file-list">
                {files.map((f) => (
                  <li key={f} className="ai-convert-modal__file-row">
                    <span className="ai-convert-modal__file-icon">📄</span>
                    <span className="ai-convert-modal__file-name">
                      {fileName(f)}
                    </span>
                  </li>
                ))}
              </ul>

              {/* 옵션: 덮어쓰기 (기본 꺼짐) */}
              <div className="ai-convert-modal__field">
                <label className="ai-convert-modal__checkbox-label">
                  <input
                    type="checkbox"
                    checked={overwrite}
                    onChange={(e) => setOverwrite(e.target.checked)}
                  />
                  기존 SVG가 있으면 덮어쓰기 (.bak 자동 백업)
                </label>
                {overwrite && (
                  <div className="ai-convert-modal__hint ai-convert-modal__hint--caution">
                    ⚠️ 기존 SVG 파일이 .bak로 백업된 후 덮어쓰여집니다.
                  </div>
                )}
                {!overwrite && (
                  <div className="ai-convert-modal__hint">
                    체크 안 하면 기존 SVG가 있는 파일은 변환 건너뜁니다 (안전).
                  </div>
                )}
              </div>
            </div>
          )}

          {/* [previewing] 헤더 분석 중 로딩 */}
          {phase.kind === "previewing" && (
            <div className="ai-convert-modal__loading">
              <div
                className="ai-convert-modal__spinner"
                aria-hidden="true"
              />
              <div className="ai-convert-modal__loading-text">
                헤더 분석 중...
              </div>
            </div>
          )}

          {/* [converting] 변환 중 로딩 */}
          {phase.kind === "converting" && (
            <div className="ai-convert-modal__loading">
              <div
                className="ai-convert-modal__spinner"
                aria-hidden="true"
              />
              <div className="ai-convert-modal__loading-text">
                변환 중입니다... (총 {files.length}개 처리)
              </div>
              <div className="ai-convert-modal__loading-hint">
                중간에 닫지 마세요. 처리 시간은 파일 크기에 따라 다릅니다.
              </div>
              {/* 진행바 — Python이 실시간 progress 콜백 미제공 → 무한 애니메이션 */}
              <div className="ai-convert-modal__progress">
                <div className="ai-convert-modal__progress-bar">
                  <div className="ai-convert-modal__progress-fill ai-convert-modal__progress-fill--indeterminate" />
                </div>
              </div>
            </div>
          )}

          {/* [preview-done] 분류 요약 + 파일별 테이블 */}
          {phase.kind === "preview-done" && phase.data.data && (
            <div className="ai-convert-modal__section">
              {/* 분류 요약 카드 3개 (PDF 호환 / PostScript / 알 수 없음) */}
              <div className="ai-convert-modal__summary">
                <div className="ai-convert-modal__summary-card ai-convert-modal__summary-card--pdf">
                  <div className="ai-convert-modal__summary-card-value">
                    {phase.data.data.summary.pdf_compatible}
                  </div>
                  <div className="ai-convert-modal__summary-card-label">
                    PDF 호환
                  </div>
                </div>
                <div className="ai-convert-modal__summary-card ai-convert-modal__summary-card--ps">
                  <div className="ai-convert-modal__summary-card-value">
                    {phase.data.data.summary.postscript}
                  </div>
                  <div className="ai-convert-modal__summary-card-label">
                    PostScript (건너뜀)
                  </div>
                </div>
                <div className="ai-convert-modal__summary-card ai-convert-modal__summary-card--unknown">
                  <div className="ai-convert-modal__summary-card-value">
                    {phase.data.data.summary.unknown}
                  </div>
                  <div className="ai-convert-modal__summary-card-label">
                    알 수 없음
                  </div>
                </div>
              </div>

              {/* 기존 SVG 충돌 안내 (있을 때만) */}
              {phase.data.data.summary.existing_svg_conflict > 0 && (
                <div className="ai-convert-modal__hint ai-convert-modal__hint--caution">
                  ⚠️ 기존 SVG 충돌 {phase.data.data.summary.existing_svg_conflict}개 —
                  {overwrite
                    ? " .bak 백업 후 덮어쓰기 예정"
                    : " 변환 건너뜁니다 (옵션 켜면 덮어쓰기 가능)"}
                </div>
              )}

              {/* 파일별 상세 테이블 */}
              <div className="ai-convert-modal__section-title">
                파일별 분류 ({previewEntries.length}개)
              </div>
              <ul className="ai-convert-modal__file-list">
                {previewEntries.map((entry) => {
                  // 행별 modifier 결정 — postscript는 회색, 충돌은 노랑
                  const rowModClass =
                    entry.kind === "postscript"
                      ? " ai-convert-modal__file-row--postscript"
                      : entry.kind === "unknown"
                      ? " ai-convert-modal__file-row--unknown"
                      : entry.existing_svg && !overwrite
                      ? " ai-convert-modal__file-row--conflict"
                      : "";
                  return (
                    <li
                      key={entry.file}
                      className={"ai-convert-modal__file-row" + rowModClass}
                    >
                      <span className="ai-convert-modal__file-name">
                        {fileName(entry.file)}
                      </span>
                      <span className="ai-convert-modal__file-meta">
                        {kindLabel(entry.kind)}
                      </span>
                      {/* 충돌 뱃지 — 기존 SVG 있고 덮어쓰기 꺼져있을 때만 */}
                      {entry.existing_svg && (
                        <span
                          className={
                            "ai-convert-modal__result-badge " +
                            (overwrite
                              ? "ai-convert-modal__result-badge--overwrite"
                              : "ai-convert-modal__result-badge--skip")
                          }
                        >
                          {overwrite ? ".bak 백업 후 덮어쓰기" : "건너뜀"}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* [done] 결과 요약 + 상세 아코디언 */}
          {phase.kind === "done" && phase.data.data && (
            <div className="ai-convert-modal__section">
              {/* 결과 요약 카드 4개 (변환 / PostScript skip / 기존 SVG skip / 실패) */}
              <div className="ai-convert-modal__summary">
                <div className="ai-convert-modal__summary-card ai-convert-modal__summary-card--pass">
                  <div className="ai-convert-modal__summary-card-value">
                    {phase.data.data.converted}
                  </div>
                  <div className="ai-convert-modal__summary-card-label">변환</div>
                </div>
                <div className="ai-convert-modal__summary-card ai-convert-modal__summary-card--ps">
                  <div className="ai-convert-modal__summary-card-value">
                    {phase.data.data.skipped_postscript}
                  </div>
                  <div className="ai-convert-modal__summary-card-label">
                    PostScript
                  </div>
                </div>
                <div className="ai-convert-modal__summary-card ai-convert-modal__summary-card--ps">
                  <div className="ai-convert-modal__summary-card-value">
                    {phase.data.data.skipped_existing}
                  </div>
                  <div className="ai-convert-modal__summary-card-label">
                    기존 SVG
                  </div>
                </div>
                <div
                  className={
                    "ai-convert-modal__summary-card" +
                    (phase.data.data.failed > 0
                      ? " ai-convert-modal__summary-card--fail"
                      : "")
                  }
                >
                  <div className="ai-convert-modal__summary-card-value">
                    {phase.data.data.failed}
                  </div>
                  <div className="ai-convert-modal__summary-card-label">실패</div>
                </div>
              </div>

              {/* 상세 결과 (아코디언 대신 단순 list — UpdateModal/svg-standardize와 톤 일관) */}
              <div className="ai-convert-modal__section-title">상세 결과</div>
              <ul className="ai-convert-modal__file-list">
                {phase.data.data.results.map((item: AiBatchResultEntry) => {
                  // status별 modifier 결정
                  const rowModClass =
                    item.status === "FAIL"
                      ? " ai-convert-modal__file-row--fail"
                      : item.status === "SKIP"
                      ? " ai-convert-modal__file-row--skip"
                      : "";
                  // 뱃지 색상
                  const badgeMod =
                    item.status === "PASS"
                      ? "ai-convert-modal__result-badge--pass"
                      : item.status === "SKIP"
                      ? "ai-convert-modal__result-badge--skip"
                      : "ai-convert-modal__result-badge--fail";
                  return (
                    <li
                      key={item.file}
                      className={"ai-convert-modal__file-row" + rowModClass}
                    >
                      <span className="ai-convert-modal__file-icon">
                        {item.status === "PASS"
                          ? "✓"
                          : item.status === "SKIP"
                          ? "⊘"
                          : "✗"}
                      </span>
                      <span className="ai-convert-modal__file-name">
                        {fileName(item.file)}
                      </span>
                      <span
                        className={
                          "ai-convert-modal__result-badge " + badgeMod
                        }
                      >
                        {item.status}
                      </span>
                      {/* PostScript skip 항목엔 Phase 2 안내 뱃지 추가 */}
                      {item.status === "SKIP" && item.reason === "postscript" && (
                        <span className="ai-convert-modal__result-badge ai-convert-modal__result-badge--phase2">
                          Phase 2 지원 예정
                        </span>
                      )}
                      {/* skip/fail 사유 표시 */}
                      {item.reason && (
                        <span className="ai-convert-modal__file-meta">
                          {item.reason}
                        </span>
                      )}
                      {item.error && (
                        <span className="ai-convert-modal__file-error">
                          {item.error}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* 변환기 버전 표기 (디버깅 시 한 눈에 파악) */}
              <div className="ai-convert-modal__version-note">
                변환기 버전: {phase.data.data.version}
              </div>
            </div>
          )}

          {/* [error] 에러 메시지 + 힌트 */}
          {phase.kind === "error" && (
            <div className="ai-convert-modal__error-box">
              <div className="ai-convert-modal__error-title">작업 실패</div>
              <div className="ai-convert-modal__error-message">
                {phase.message}
              </div>
              <div className="ai-convert-modal__error-hint">
                Python 엔진이 없으면 <code>setup-python.bat</code>을 먼저 실행하세요.
                권한 오류라면 G드라이브 폴더에 쓰기 권한이 있는지,
                AI/SVG 파일이 다른 프로그램(Illustrator 등)에서 열려 있지 않은지
                확인하세요.
              </div>
            </div>
          )}
        </section>

        {/* ===== 푸터 (Phase별 버튼 분기) ===== */}
        <footer className="ai-convert-modal__footer">
          {/* idle: [취소] [헤더 분석] */}
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
                disabled={files.length === 0}
                title={
                  files.length === 0
                    ? "변환할 AI 파일이 없습니다"
                    : undefined
                }
              >
                헤더 분석
              </button>
            </>
          )}

          {/* previewing: 비활성 안내만 */}
          {phase.kind === "previewing" && (
            <button
              type="button"
              className="btn btn--small"
              disabled
              title="진행 중입니다"
            >
              분석 중...
            </button>
          )}

          {/* converting: 모든 버튼 비활성 (실수 종료 방지) */}
          {phase.kind === "converting" && (
            <button
              type="button"
              className="btn btn--small"
              disabled
              title="변환 중에는 닫을 수 없습니다"
              style={{ cursor: "not-allowed" }}
            >
              변환 중...
            </button>
          )}

          {/* preview-done: [← 뒤로] [취소] [실행 (N개 변환)] */}
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
                className="btn btn--small"
                onClick={handleClose}
              >
                취소
              </button>
              <button
                type="button"
                className="btn btn--small btn--primary"
                onClick={handleExecute}
                disabled={convertableCount === 0}
                title={
                  convertableCount === 0
                    ? "변환 가능한 파일이 없습니다"
                    : undefined
                }
              >
                ▶ 실행 ({convertableCount}개 변환)
              </button>
            </>
          )}

          {/* done: [닫기] (성공 시 onComplete → 재스캔) */}
          {phase.kind === "done" && (
            <button
              type="button"
              className="btn btn--small btn--primary"
              onClick={handleDoneClose}
            >
              닫기
            </button>
          )}

          {/* error: [닫기] [다시 시도] */}
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

export default AiConvertModal;
