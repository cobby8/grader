/**
 * 엑셀 주문서 파싱 관련 타입 정의
 *
 * Python order_parser.py의 반환값과 매핑된다.
 * 엑셀에서 추출한 사이즈/수량 정보를 프론트에서 표시하고,
 * SizeSelect 페이지의 체크박스를 자동 선택하는 데 사용한다.
 */

/** 주문서에서 추출된 개별 사이즈 정보 */
export interface OrderSize {
  size: string;       // "S", "M", "L", "2XL" 등
  quantity: number;   // 해당 사이즈 주문 수량 (0이면 수량 미감지)
}

/** 엑셀 감지 형식 */
export type OrderFormat = "horizontal" | "vertical" | "table" | "unknown";

/** Python parse_order 명령 응답 (snake_case → camelCase 변환 전) */
export interface OrderParseRawResult {
  success: boolean;
  sizes: OrderSize[];           // 이미 { size, quantity } 형태
  total_quantity: number;
  source_sheet: string;
  detected_format: OrderFormat;
  error?: string;
}

/** 프론트에서 사용하는 camelCase 형태 */
export interface OrderParseResult {
  success: boolean;
  sizes: OrderSize[];
  totalQuantity: number;
  sourceSheet: string;
  detectedFormat: OrderFormat;
  error?: string;
}

/** Python 응답(snake_case)을 프론트용(camelCase)으로 변환 */
export function toOrderParseResult(raw: OrderParseRawResult): OrderParseResult {
  return {
    success: raw.success,
    sizes: raw.sizes,
    totalQuantity: raw.total_quantity,
    sourceSheet: raw.source_sheet,
    detectedFormat: raw.detected_format,
    error: raw.error,
  };
}
