/**
 * 패턴 프리셋 관련 타입 정의
 *
 * "패턴"이란 옷을 구성하는 조각(앞판, 뒷판, 소매 등)을 의미한다.
 * 의류 종류(반팔 티셔츠, 긴팔 져지 등)별로 서로 다른 패턴 조각 세트를 가지며,
 * 이를 "프리셋"으로 저장해 반복 사용한다.
 *
 * 카테고리는 프리셋을 폴더처럼 계층적으로 분류하는 기능이다.
 * 예: 농구 > 상의 > 농구유니폼 U넥 스탠다드 암홀X
 */

/** 카테고리 (폴더 트리의 한 노드) */
export interface PatternCategory {
  id: string;
  name: string;            // "농구", "상의" 등 카테고리 이름
  parentId: string | null; // null이면 최상위(루트) 카테고리
  order: number;           // 같은 레벨 내에서의 정렬 순서
}

/** 하나의 패턴 조각 (예: 앞판, 뒷판, 왼쪽소매) */
export interface PatternPiece {
  id: string;
  name: string;        // "앞판", "뒷판", "왼쪽소매" 등
  svgPath: string;     // 원본 SVG 파일 경로 (참고용)
  svgData: string;     // SVG 원본 데이터 (문자열로 저장, 대표 미리보기용)
  svgBySize?: {        // 사이즈별 SVG 데이터 (폴더 업로드 시 자동 생성, 선택적)
    [size: string]: string;  // 예: { "L": "<svg...>", "XL": "<svg...>" }
  };
}

/** 사이즈별 개별 조각의 치수 */
export interface PieceDimension {
  pieceId: string;     // PatternPiece.id 를 참조
  width: number;       // mm 단위 가로 길이
  height: number;      // mm 단위 세로 길이
}

/** 사이즈 하나에 대한 전체 조각 치수 정보 */
export interface SizeSpec {
  size: string;        // "5XS", "4XS", ... "M", ... "4XL", "5XL"
  pieces: PieceDimension[];
}

/** 패턴 프리셋 (의류 종류 하나를 나타냄) */
export interface PatternPreset {
  id: string;
  name: string;        // "반팔 티셔츠", "긴팔 져지" 등
  pieces: PatternPiece[];  // 이 의류를 구성하는 조각 목록
  sizes: SizeSpec[];       // 사이즈별 치수 데이터
  categoryId?: string;     // 소속 카테고리 ID (없으면 "미분류")
  createdAt: string;       // ISO 날짜 문자열
  updatedAt: string;       // ISO 날짜 문자열
}

/**
 * 사이즈 목록 상수 (5XS ~ 5XL, 총 13단계)
 * 승화전사 유니폼 업계 표준 사이즈 체계
 */
export const SIZE_LIST = [
  "5XS", "4XS", "3XS", "2XS", "XS",
  "S", "M",
  "L", "XL", "2XL", "3XL", "4XL", "5XL",
] as const;

/** SIZE_LIST의 유니온 타입 */
export type SizeName = (typeof SIZE_LIST)[number];
