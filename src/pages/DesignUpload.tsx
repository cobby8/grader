/**
 * DesignUpload 페이지
 *
 * 2단계 워크플로우: PDF 형식의 기준 사이즈 디자인 파일을 등록/관리한다.
 *
 * 주요 기능:
 *   - 디자인 파일 목록 표시 (카드 그리드)
 *   - 새 PDF 업로드 (Tauri 파일 다이얼로그)
 *   - Python 엔진 호출로 PDF 정보/CMYK 검증/미리보기 생성
 *   - 디자인 삭제
 *
 * Python 엔진 연동:
 *   프론트엔드 → invoke("run_python", { command, args }) → Rust → Python subprocess
 *   Python이 stdout에 출력한 JSON을 받아서 파싱한다.
 */

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import type {
  DesignFile,
  PdfInfoResult,
  CmykVerifyResult,
  PreviewResult,
  AnalyzeColorResult,
  ColorAnalysis,
} from "../types/design";
import {
  loadDesigns,
  saveDesigns,
  copyPdfToAppData,
  getDesignPreviewPath,
  deleteDesignFiles,
  generateDesignId,
} from "../stores/designStore";

/**
 * 파일 크기를 사람이 읽기 쉬운 형식으로 변환한다.
 * 예: 1536 → "1.5 KB", 2048000 → "2.0 MB"
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 색상 공간에 따른 배지 스타일 클래스명을 반환한다.
 */
function getColorSpaceBadge(colorSpace: string): string {
  switch (colorSpace) {
    case "CMYK":
      return "design-badge design-badge--cmyk";
    case "RGB":
      return "design-badge design-badge--rgb";
    case "Mixed":
      return "design-badge design-badge--mixed";
    case "Grayscale":
      return "design-badge design-badge--gray";
    default:
      return "design-badge design-badge--unknown";
  }
}

/**
 * Python의 snake_case 결과를 TypeScript의 camelCase 타입으로 변환한다.
 * 이 프로젝트의 Python ↔ TS 경계에서는 단순 수동 매핑을 사용한다 (의존성 최소화).
 */
function toColorAnalysis(raw: AnalyzeColorResult): ColorAnalysis {
  return {
    overall: raw.overall,
    pages: raw.pages.map((p) => ({
      pageNum: p.page_num,
      vectorCmyk: p.vector_cmyk,
      vectorRgb: p.vector_rgb,
      vectorGray: p.vector_gray,
      imageCount: p.image_count,
      imageColorSpaces: p.image_color_spaces,
      hasIccProfile: p.has_icc_profile,
    })),
    warnings: raw.warnings,
    hasVectorCmyk: raw.has_vector_cmyk,
    hasVectorRgb: raw.has_vector_rgb,
    hasImageCmyk: raw.has_image_cmyk,
    hasImageRgb: raw.has_image_rgb,
    hasIccProfile: raw.has_icc_profile,
    totalRgbImages: raw.total_rgb_images,
    totalCmykImages: raw.total_cmyk_images,
  };
}

function DesignUpload() {
  // 디자인 파일 목록 상태
  const [designs, setDesigns] = useState<DesignFile[]>([]);
  // 업로드/처리 중 상태 (로딩 표시용)
  const [uploading, setUploading] = useState(false);
  // 업로드 진행 단계 메시지
  const [progressMessage, setProgressMessage] = useState("");
  // 에러 메시지
  const [errorMessage, setErrorMessage] = useState("");
  // 미리보기 이미지 data URL 캐시 (designId → base64 data URL)
  const [previewCache, setPreviewCache] = useState<Record<string, string>>({});

  // 초기 로드: 저장된 디자인 목록 불러오기
  useEffect(() => {
    loadDesigns().then((list) => {
      setDesigns(list);
      // 각 디자인의 미리보기 이미지를 data URL로 읽어서 캐시
      list.forEach((design) => {
        loadPreviewImage(design);
      });
    });
  }, []);

  /**
   * 미리보기 PNG를 바이너리로 읽어서 data URL로 변환해 캐시에 저장한다.
   * Tauri에서는 asset://프로토콜 대신 data URL 방식이 권한 문제없이 안전하다.
   */
  async function loadPreviewImage(design: DesignFile) {
    try {
      // 절대 경로에서 바이너리 읽기 (baseDir 미지정)
      const bytes = await readFile(design.previewPath);
      // Uint8Array → base64 변환
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.slice(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      const base64 = btoa(binary);
      const dataUrl = `data:image/png;base64,${base64}`;
      setPreviewCache((prev) => ({ ...prev, [design.id]: dataUrl }));
    } catch (err) {
      console.error(`미리보기 로드 실패 (${design.id}):`, err);
    }
  }

  /**
   * Python 엔진을 호출하고 JSON 결과를 파싱하는 헬퍼 함수.
   * 에러가 발생하거나 success=false이면 예외를 던진다.
   */
  async function callPython<T extends { success: boolean; error?: string }>(
    command: string,
    args: string[]
  ): Promise<T> {
    // Rust run_python 커맨드 호출
    const raw = await invoke<string>("run_python", { command, args });
    // 빈 문자열 방어
    if (!raw || !raw.trim()) {
      throw new Error("Python 엔진이 빈 응답을 반환했습니다.");
    }
    const result = JSON.parse(raw.trim()) as T;
    if (!result.success) {
      throw new Error(result.error || "Python 처리 실패");
    }
    return result;
  }

  /**
   * 새 디자인 PDF 업로드 핸들러.
   * 1) 파일 다이얼로그 → 2) 앱 데이터에 복사 → 3) PDF 정보 추출
   * → 4) CMYK 검증 → 5) 미리보기 생성 → 6) 메타데이터 저장
   */
  async function handleUpload() {
    setErrorMessage("");

    try {
      // 1) Tauri 파일 다이얼로그로 PDF 선택
      const selected = await open({
        multiple: false,
        filters: [{ name: "PDF 파일", extensions: ["pdf"] }],
      });

      if (!selected || typeof selected !== "string") {
        return; // 취소됨
      }

      setUploading(true);
      setProgressMessage("파일을 복사하는 중...");

      // 원본 파일명 추출 (경로 구분자는 \ 또는 / 모두 대응)
      const fileName = selected.split(/[\\/]/).pop() || "design.pdf";

      // 2) 새 디자인 ID 생성 + 앱 데이터로 PDF 복사
      const designId = generateDesignId();
      const storedPath = await copyPdfToAppData(selected, designId);

      // 3) Python 엔진: PDF 정보 추출
      setProgressMessage("PDF 정보를 분석하는 중...");
      const info = await callPython<PdfInfoResult>("get_pdf_info", [storedPath]);

      // 4) Python 엔진: CMYK 검증 (기본 - 기존 호환)
      setProgressMessage("색상 공간을 검증하는 중...");
      const cmyk = await callPython<CmykVerifyResult>("verify_cmyk", [storedPath]);

      // 4-b) Python 엔진: 색상 공간 상세 분석 (5단계 신규)
      // 실패해도 치명적이지 않으므로 try/catch로 보호하고 계속 진행한다.
      // 이유: analyze_color는 부가 정보이므로 CMYK 검증보다 실패 내성이 높아야 함.
      setProgressMessage("색상 공간을 상세 분석하는 중...");
      let colorAnalysis: ColorAnalysis | undefined = undefined;
      try {
        const analyzed = await callPython<AnalyzeColorResult>("analyze_color", [
          storedPath,
        ]);
        colorAnalysis = toColorAnalysis(analyzed);
      } catch (err) {
        console.warn("색상 상세 분석 실패 (계속 진행):", err);
      }

      // 5) Python 엔진: 미리보기 이미지 생성
      setProgressMessage("미리보기 이미지를 생성하는 중...");
      const previewPath = await getDesignPreviewPath(designId);
      const preview = await callPython<PreviewResult>("generate_preview", [
        storedPath,
        previewPath,
        "150",
      ]);

      // 6) 메타데이터 객체 생성
      // colorAnalysis가 있으면 overall 값으로 colorSpace를 덮어써서
      // 더 정확한 판정을 사용한다 (벡터 CMYK 감지 포함).
      const now = new Date().toISOString();
      const finalColorSpace = colorAnalysis?.overall ?? info.color_space;
      const newDesign: DesignFile = {
        id: designId,
        name: fileName,
        originalPath: selected,
        storedPath: storedPath,
        previewPath: preview.preview_path,
        pageCount: info.page_count,
        pageWidth: info.page_width_mm,
        pageHeight: info.page_height_mm,
        colorSpace: finalColorSpace,
        cmykVerified: cmyk.is_cmyk,
        cmykMessage: cmyk.message,
        fileSize: info.file_size,
        createdAt: now,
        updatedAt: now,
        colorAnalysis,
      };

      // 7) 목록에 추가 후 저장
      const updated = [...designs, newDesign];
      setDesigns(updated);
      await saveDesigns(updated);

      // 8) 미리보기 이미지 로드
      await loadPreviewImage(newDesign);

      setProgressMessage("");
    } catch (err) {
      console.error("디자인 업로드 실패:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다."
      );
      setProgressMessage("");
    } finally {
      setUploading(false);
    }
  }

  /**
   * 디자인 파일 삭제 핸들러.
   * 물리 파일(PDF/PNG)과 메타데이터 모두 제거한다.
   */
  async function handleDelete(design: DesignFile) {
    // 사용자에게 확인
    const confirmed = window.confirm(
      `"${design.name}" 디자인을 정말 삭제하시겠습니까?`
    );
    if (!confirmed) return;

    try {
      // 물리 파일 삭제
      await deleteDesignFiles(design);

      // 메타데이터 목록에서 제거 후 저장
      const updated = designs.filter((d) => d.id !== design.id);
      setDesigns(updated);
      await saveDesigns(updated);

      // 미리보기 캐시에서도 제거
      setPreviewCache((prev) => {
        const copy = { ...prev };
        delete copy[design.id];
        return copy;
      });
    } catch (err) {
      console.error("디자인 삭제 실패:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "삭제 중 오류가 발생했습니다."
      );
    }
  }

  return (
    <div className="page">
      <h1 className="page__title">디자인 등록</h1>
      <p className="page__description">
        PDF 형식의 기준 사이즈 디자인 파일을 등록합니다. CMYK 색상이 유지된 PDF
        파일을 업로드해 주세요.
      </p>

      {/* 상단 액션 바: 업로드 버튼 + 진행 메시지 */}
      <div className="preset-actions">
        <button
          className="btn btn--primary"
          onClick={handleUpload}
          disabled={uploading}
        >
          {uploading ? "업로드 중..." : "새 디자인 업로드"}
        </button>
        {progressMessage && (
          <span className="design-progress">{progressMessage}</span>
        )}
      </div>

      {/* 에러 메시지 표시 */}
      {errorMessage && (
        <div className="design-error">
          <strong>오류:</strong> {errorMessage}
          <button
            className="design-error__close"
            onClick={() => setErrorMessage("")}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
      )}

      {/* 디자인 파일 목록 */}
      {designs.length === 0 ? (
        <div className="page__placeholder">
          <div className="page__placeholder-icon">🎨</div>
          <p className="page__placeholder-text">
            아직 등록된 디자인이 없습니다.
          </p>
          <p className="preset-empty__hint">
            "새 디자인 업로드" 버튼을 눌러 PDF 파일을 추가하세요.
          </p>
        </div>
      ) : (
        <div className="design-grid">
          {designs.map((design) => (
            <div key={design.id} className="design-card">
              {/* 미리보기 영역 */}
              <div className="design-card__preview">
                {previewCache[design.id] ? (
                  <img
                    src={previewCache[design.id]}
                    alt={`${design.name} 미리보기`}
                    className="design-card__preview-img"
                  />
                ) : (
                  <div className="design-card__preview-loading">
                    미리보기 로드 중...
                  </div>
                )}
              </div>

              {/* 본문 정보 */}
              <div className="design-card__body">
                <div className="design-card__name" title={design.name}>
                  {design.name}
                </div>

                <div className="design-card__meta">
                  <span className={getColorSpaceBadge(design.colorSpace)}>
                    {design.colorSpace}
                  </span>
                  <span className="design-card__stat">
                    {design.pageWidth} × {design.pageHeight}mm
                  </span>
                  <span className="design-card__stat">
                    {formatFileSize(design.fileSize)}
                  </span>
                </div>

                {/* 5단계 신규: 색상 상세 배지 (colorAnalysis가 있을 때만) */}
                {design.colorAnalysis && (
                  <div className="design-card__color-detail">
                    {design.colorAnalysis.hasVectorCmyk && (
                      <span
                        className="design-badge design-badge--small design-badge--vector-cmyk"
                        title="벡터 CMYK 색상이 사용됨"
                      >
                        V-CMYK
                      </span>
                    )}
                    {design.colorAnalysis.hasVectorRgb && (
                      <span
                        className="design-badge design-badge--small design-badge--vector-rgb"
                        title="벡터 RGB 색상이 사용됨 - 인쇄 주의"
                      >
                        V-RGB
                      </span>
                    )}
                    {design.colorAnalysis.totalCmykImages > 0 && (
                      <span
                        className="design-badge design-badge--small design-badge--img-cmyk"
                        title={`CMYK 이미지 ${design.colorAnalysis.totalCmykImages}개`}
                      >
                        IMG-CMYK ×{design.colorAnalysis.totalCmykImages}
                      </span>
                    )}
                    {design.colorAnalysis.totalRgbImages > 0 && (
                      <span
                        className="design-badge design-badge--small design-badge--img-rgb"
                        title={`RGB 이미지 ${design.colorAnalysis.totalRgbImages}개 - 인쇄 주의`}
                      >
                        IMG-RGB ×{design.colorAnalysis.totalRgbImages}
                      </span>
                    )}
                    {design.colorAnalysis.hasIccProfile && (
                      <span
                        className="design-badge design-badge--small design-badge--icc"
                        title="ICC 프로파일 포함"
                      >
                        ICC
                      </span>
                    )}
                  </div>
                )}

                {/* CMYK 검증 메시지 */}
                <div
                  className={`design-card__cmyk-msg ${
                    design.cmykVerified
                      ? "design-card__cmyk-msg--ok"
                      : "design-card__cmyk-msg--warn"
                  }`}
                >
                  {design.cmykVerified ? "✓" : "⚠"} {design.cmykMessage}
                </div>

                {/* 5단계 신규: 경고 메시지 (colorAnalysis.warnings) */}
                {design.colorAnalysis && design.colorAnalysis.warnings.length > 0 && (
                  <ul className="design-card__warnings">
                    {design.colorAnalysis.warnings.map((w, i) => (
                      <li key={i} className="design-card__warning-item">
                        {w}
                      </li>
                    ))}
                  </ul>
                )}

                <div className="design-card__date">
                  등록일: {new Date(design.createdAt).toLocaleDateString("ko-KR")}
                </div>
              </div>

              {/* 액션 버튼 */}
              <div className="design-card__actions">
                <button
                  className="btn btn--small btn--danger"
                  onClick={() => handleDelete(design)}
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default DesignUpload;
