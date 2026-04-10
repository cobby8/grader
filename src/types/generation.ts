/**
 * 파일 생성(그레이딩) 관련 타입 정의
 *
 * 4단계 워크플로우에서 사용된다:
 *   - SizeSelect 페이지: 사용자가 프리셋/디자인/기준사이즈/타겟사이즈를 선택
 *   - FileGenerate 페이지: 위 선택을 바탕으로 Python 엔진 호출하여 PDF 생성
 *
 * 페이지 간 데이터 전달은 generationStore(sessionStorage 기반)를 이용한다.
 */

/** 사용자가 SizeSelect 페이지에서 구성한 생성 요청 정보 */
export interface GenerationRequest {
  presetId: string;           // 선택된 패턴 프리셋 ID
  designFileId: string;       // 선택된 디자인 파일 ID
  baseSize: string;           // 디자인이 기준으로 삼은 사이즈 (예: "L")
  selectedSizes: string[];    // 생성할 타겟 사이즈 목록 (예: ["M","L","XL"])
}

/** 생성 작업 중 한 사이즈의 진행 상태 */
export type GenerationStatus =
  | "pending"     // 대기중
  | "processing"  // 처리중
  | "success"     // 완료
  | "error";      // 실패

/** 한 사이즈의 생성 결과 */
export interface GenerationResult {
  size: string;                // 타겟 사이즈 (예: "XL")
  status: GenerationStatus;
  outputPath?: string;         // 생성된 PDF 절대 경로 (성공 시)
  errorMessage?: string;       // 에러 메시지 (실패 시)
  scaleX?: number;             // 적용된 가로 스케일
  scaleY?: number;             // 적용된 세로 스케일
  outputWidthMm?: number;      // 출력 가로 mm
  outputHeightMm?: number;     // 출력 세로 mm
}

/** Python calc_scale 명령 응답 */
export interface CalcScaleResult {
  success: boolean;
  base_size: string;
  target_size: string;
  scale_x: number;
  scale_y: number;
  base_avg_width: number;
  base_avg_height: number;
  target_avg_width: number;
  target_avg_height: number;
  error?: string;
}

/** Python generate_graded 명령 응답 */
export interface GenerateGradedResult {
  success: boolean;
  output_path: string;
  source_width_mm: number;
  source_height_mm: number;
  output_width_mm: number;
  output_height_mm: number;
  page_count: number;
  scale_x: number;
  scale_y: number;
  error?: string;
}
