/**
 * 디자인 파일 관련 타입 정의
 *
 * "디자인 파일"이란 기준 사이즈로 그려진 PDF 형식의 유니폼 디자인을 의미한다.
 * 디자이너가 M 사이즈 등을 기준으로 작업한 CMYK PDF를 앱에 등록하고,
 * 이후 이 파일을 토대로 다른 사이즈로 자동 그레이딩하여 PDF를 생성한다.
 */

/** 색상 공간 종류 */
export type ColorSpace = "CMYK" | "RGB" | "Mixed" | "Unknown";

/** Python 엔진에서 반환하는 PDF 정보 (get_pdf_info) */
export interface PdfInfoResult {
  success: boolean;
  page_count: number;
  page_width_mm: number;
  page_height_mm: number;
  file_size: number;
  color_spaces: string[];
  color_space: ColorSpace;
  has_cmyk: boolean;
  has_rgb: boolean;
  error?: string;
}

/** Python 엔진에서 반환하는 CMYK 검증 결과 (verify_cmyk) */
export interface CmykVerifyResult {
  success: boolean;
  is_cmyk: boolean;
  has_rgb: boolean;
  color_space: ColorSpace;
  message: string;
  error?: string;
}

/** Python 엔진에서 반환하는 미리보기 생성 결과 (generate_preview) */
export interface PreviewResult {
  success: boolean;
  preview_path: string;
  width: number;
  height: number;
  error?: string;
}

/** 디자인 파일 메타데이터 (JSON으로 저장됨) */
export interface DesignFile {
  id: string;
  name: string;              // 파일명 (확장자 포함)
  originalPath: string;      // 사용자가 선택한 원본 경로
  storedPath: string;        // 앱 데이터 디렉토리에 복사된 절대 경로
  previewPath: string;       // 미리보기 PNG 파일 절대 경로
  pageCount: number;         // 페이지 수
  pageWidth: number;         // 페이지 가로 (mm)
  pageHeight: number;        // 페이지 세로 (mm)
  colorSpace: ColorSpace;    // 색상 공간
  cmykVerified: boolean;     // CMYK 확인 통과 여부 (is_cmyk)
  cmykMessage: string;       // CMYK 검증 메시지
  fileSize: number;          // 파일 크기 (bytes)
  createdAt: string;         // ISO 날짜 문자열
  updatedAt: string;         // ISO 날짜 문자열
}
