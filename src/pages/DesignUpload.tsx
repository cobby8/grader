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

import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { getCurrentWebview } from "@tauri-apps/api/webview";
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
  // 드래그앤드롭 오버 상태 (시각 피드백용)
  const [isDragOver, setIsDragOver] = useState(false);
  // 드롭 존 ref (레이아웃 참조용)
  const dropZoneRef = useRef<HTMLDivElement>(null);
  // 로드 성공 여부: false이면 저장을 차단하여 데이터 유실 방지
  const [isLoadSuccess, setIsLoadSuccess] = useState(false);
  // 로드 에러 메시지 (사용자에게 표시)
  const [loadError, setLoadError] = useState<string | null>(null);

  // 초기 로드: 저장된 디자인 목록 불러오기
  useEffect(() => {
    loadDesigns().then((result) => {
      if (result.success) {
        setDesigns(result.data);
        setIsLoadSuccess(true);
        // 각 디자인의 미리보기 이미지를 data URL로 읽어서 캐시
        result.data.forEach((design) => {
          loadPreviewImage(design);
        });
      } else {
        setLoadError(result.error || "디자인 데이터를 불러오는데 실패했습니다.");
        setIsLoadSuccess(false);
      }
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

  // === Tauri 드래그앤드롭 이벤트 리스닝 ===
  // PatternManage.tsx와 동일한 패턴으로 Tauri 네이티브 드래그앤드롭을 사용한다.
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupDragDrop = async () => {
      try {
        unlisten = await getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type === "over") {
            setIsDragOver(true);
          } else if (event.payload.type === "leave") {
            setIsDragOver(false);
          } else if (event.payload.type === "drop") {
            setIsDragOver(false);
            const paths: string[] = event.payload.paths;
            if (paths.length > 0) {
              // PDF 파일만 필터링하여 처리
              handleDrop(paths);
            }
          }
        });
      } catch (err) {
        console.warn("드래그앤드롭 이벤트 등록 실패 (무시):", err);
      }
    };

    setupDragDrop();

    // 클린업: 컴포넌트 언마운트 시 이벤트 해제
    return () => {
      if (unlisten) unlisten();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designs]);

  /**
   * 단일 PDF 파일을 처리하는 핵심 함수.
   * 기존 handleUpload에서 파일 처리 로직만 추출하여 재사용 가능하게 만들었다.
   * 1) 앱 데이터에 복사 → 2) PDF 정보 추출 → 3) CMYK 검증
   * → 4) 색상 상세 분석 → 5) 미리보기 생성 → 6) 메타데이터 반환
   */
  async function processDesignFile(filePath: string): Promise<DesignFile> {
    // 원본 파일명 추출 (경로 구분자는 \ 또는 / 모두 대응)
    const fileName = filePath.split(/[\\/]/).pop() || "design.pdf";

    // 1) 새 디자인 ID 생성 + 앱 데이터로 PDF 복사
    const designId = generateDesignId();
    const storedPath = await copyPdfToAppData(filePath, designId);

    // 2) Python 엔진: PDF 정보 추출
    const info = await callPython<PdfInfoResult>("get_pdf_info", [storedPath]);

    // 3) Python 엔진: CMYK 검증 (기본 - 기존 호환)
    const cmyk = await callPython<CmykVerifyResult>("verify_cmyk", [storedPath]);

    // 4) Python 엔진: 색상 공간 상세 분석
    // 실패해도 치명적이지 않으므로 try/catch로 보호하고 계속 진행한다.
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
    return {
      id: designId,
      name: fileName,
      originalPath: filePath,
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
  }

  /**
   * 여러 PDF 파일을 순차적으로 처리하고 디자인 목록에 추가한다.
   * 하나가 실패해도 나머지를 계속 처리하며, 실패 파일명을 에러 메시지에 모아서 표시한다.
   */
  async function processMultipleFiles(filePaths: string[]) {
    // 로드 실패 상태에서는 저장 차단
    if (!isLoadSuccess) {
      setErrorMessage("데이터 로드에 실패한 상태에서는 업로드할 수 없습니다. 앱을 재시작해주세요.");
      return;
    }
    setErrorMessage("");
    setUploading(true);

    const total = filePaths.length;
    const failedFiles: string[] = [];
    // 현재 designs 상태의 최신값을 로컬 변수로 추적 (순차 처리 중 setState 반영 지연 때문)
    let currentDesigns = [...designs];

    for (let i = 0; i < total; i++) {
      const filePath = filePaths[i];
      const fileName = filePath.split(/[\\/]/).pop() || "unknown.pdf";

      // 진행 상황 표시: "2/5 파일 처리 중... (design.pdf)"
      setProgressMessage(
        `${i + 1}/${total} 파일 처리 중... (${fileName})`
      );

      try {
        const newDesign = await processDesignFile(filePath);

        // 목록에 추가 + 저장
        currentDesigns = [...currentDesigns, newDesign];
        setDesigns(currentDesigns);
        await saveDesigns(currentDesigns);

        // 미리보기 이미지 로드
        await loadPreviewImage(newDesign);
      } catch (err) {
        console.error(`디자인 업로드 실패 (${fileName}):`, err);
        failedFiles.push(fileName);
      }
    }

    setProgressMessage("");
    setUploading(false);

    // 실패한 파일이 있으면 에러 메시지 표시
    if (failedFiles.length > 0) {
      setErrorMessage(
        `다음 파일의 처리에 실패했습니다: ${failedFiles.join(", ")}`
      );
    }
  }

  /**
   * 파일 다이얼로그를 열어 PDF를 선택하고 업로드하는 핸들러.
   * 다중 선택을 지원하여 여러 PDF를 한 번에 등록할 수 있다.
   */
  async function handleUploadClick() {
    setErrorMessage("");

    try {
      // Tauri 파일 다이얼로그 — 다중 선택 지원
      const selected = await open({
        multiple: true,
        filters: [{ name: "PDF 파일", extensions: ["pdf"] }],
      });

      // 취소 또는 빈 결과 처리
      if (!selected) return;

      // open({ multiple: true })는 string[] 반환, 단일 선택 시에도 배열
      const paths = Array.isArray(selected) ? selected : [selected];
      if (paths.length === 0) return;

      await processMultipleFiles(paths);
    } catch (err) {
      console.error("파일 다이얼로그 오류:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다."
      );
    }
  }

  /**
   * 드래그앤드롭으로 들어온 파일 경로에서 PDF만 필터링하여 처리한다.
   * PDF가 아닌 파일은 무시하고, PDF가 하나도 없으면 경고 메시지를 표시한다.
   */
  async function handleDrop(paths: string[]) {
    // .pdf 확장자만 필터링 (대소문자 무시)
    const pdfPaths = paths.filter((p) => p.toLowerCase().endsWith(".pdf"));

    if (pdfPaths.length === 0) {
      setErrorMessage("PDF 파일만 업로드할 수 있습니다. PDF 파일을 드래그해 주세요.");
      return;
    }

    // PDF가 아닌 파일이 섞여 있으면 알림
    if (pdfPaths.length < paths.length) {
      const skipped = paths.length - pdfPaths.length;
      console.warn(`PDF가 아닌 파일 ${skipped}개를 건너뛰었습니다.`);
    }

    await processMultipleFiles(pdfPaths);
  }

  /**
   * 디자인 파일 삭제 핸들러.
   * 물리 파일(PDF/PNG)과 메타데이터 모두 제거한다.
   */
  async function handleDelete(design: DesignFile) {
    // 로드 실패 상태에서는 저장 차단
    if (!isLoadSuccess) {
      setErrorMessage("데이터 로드에 실패한 상태에서는 삭제할 수 없습니다. 앱을 재시작해주세요.");
      return;
    }
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

      {/* 로드 실패 시 경고 배너 */}
      {loadError && (
        <div className="load-error">
          데이터 로드 실패: {loadError}
          <br />앱을 재시작해주세요. 이 상태에서는 저장이 비활성화됩니다.
        </div>
      )}

      {/* 진행 메시지 (다중 업로드 시 "2/5 파일 처리 중..." 형식) */}
      {progressMessage && (
        <div className="design-progress">{progressMessage}</div>
      )}

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
        /* 디자인이 없을 때: 큰 드래그앤드롭 존을 플레이스홀더로 표시 */
        <div
          ref={dropZoneRef}
          className={`drop-zone drop-zone--large ${isDragOver ? "drop-zone--active" : ""}`}
        >
          <div className="drop-zone__icon">&#127912;</div>
          <p className="drop-zone__text">
            PDF 파일을 여기에 드래그하세요
          </p>
          <p className="drop-zone__hint">
            또는 아래 버튼으로 파일을 선택할 수 있습니다
          </p>
          <div className="drop-zone__buttons">
            <button
              className="btn btn--primary btn--small"
              onClick={handleUploadClick}
              disabled={uploading}
            >
              파일 선택
            </button>
          </div>
        </div>
      ) : (
        <>
        {/* 디자인이 있을 때: 카드 목록 위에 작은 드롭 존 유지 */}
        <div
          ref={dropZoneRef}
          className={`drop-zone drop-zone--compact ${isDragOver ? "drop-zone--active" : ""}`}
        >
          <span className="drop-zone__compact-text">
            PDF 파일을 드래그하거나
          </span>
          <button
            className="btn btn--primary btn--small"
            onClick={handleUploadClick}
            disabled={uploading}
          >
            파일 선택
          </button>
        </div>

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
        </>
      )}
    </div>
  );
}

export default DesignUpload;
