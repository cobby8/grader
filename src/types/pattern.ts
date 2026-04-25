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
  // === Drive 연동 옵션 4 신규 필드 (optional, 기존 데이터 호환) ===
  // 왜 필요한가: Drive 동기화로 자동 생성된 카테고리는 앱 내에서 rename/삭제/하위추가를
  // 하지 못하도록 잠가야 한다. (Drive 폴더가 진실의 원천이므로)
  // 미지정 시 "local"로 간주 — 사용자가 앱 내에서 수동 추가한 카테고리.
  source?: "local" | "drive";
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

  // === Drive 연동 Phase 1 신규 필드 (optional, 기존 데이터 호환) ===
  // 왜 별도 필드인가: svgBySize는 SVG 문자열을 직접 들고 있어 JSON이 비대해진다.
  // Drive 출처 프리셋은 "경로"만 저장하고 실제 내용은 svgCacheStore에서 on-demand 로드한다.
  /** Drive 출처일 때 사이즈별 SVG 파일의 절대 경로 (예: { "XS": "G:\\...\\농구_XS.svg" }) */
  svgPathBySize?: Record<string, string>;
  /** 데이터 출처 구분 (미지정 시 "local"로 간주하여 기존 데이터 호환) */
  svgSource?: "local" | "drive";
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

  // === Drive 연동 Phase 1 신규 필드 (optional) ===
  /** Drive 카테고리 루트로부터의 상대 경로 (예: "농구유니폼/1. 단면 유니폼 상의 패턴") */
  driveFolder?: string;
  /** meta.json의 UUID — 폴더/파일명 바뀌어도 식별 유지용 */
  stableId?: string;
}

// === Drive 연동 Phase 1 신규 타입 ===

/**
 * 앱 설정 (settings.json에 저장)
 *
 * 왜 별도 파일인가: presets.json/categories.json은 "데이터",
 * settings.json은 "앱 환경 설정"으로 역할을 분리해야 이식/백업 정책이 달라진다.
 */
export interface AppSettings {
  /** Drive 루트 절대경로 (예: "G:\\공유 드라이브\\디자인\\00. 2026 커스텀용 패턴 SVG") */
  drivePatternRoot?: string;
  /** Drive 동기화 기능 전체 활성/비활성 스위치 (false면 Drive 관련 UI 숨김) */
  driveSyncEnabled: boolean;

  // === AI→SVG Phase 3 신규 필드 (optional, 기존 데이터 호환) ===
  // 왜 별도 두 필드인가: "켜짐 여부"와 "최초 동의 여부"는 의미가 다르다.
  // - aiAutoConvertEnabled: 사용자가 끌 때마다 false로 토글 (자동 OFF 발동 시도 마찬가지)
  // - aiAutoConvertConsent: 한 번 동의하면 true로 영구 유지 (다시 켤 때 모달 안 뜸)
  /** AI→SVG 자동 백그라운드 변환 활성/비활성 (Phase 3, 기본 false) */
  aiAutoConvertEnabled?: boolean;
  /** AI 자동 변환 첫 ON 시 사용자 동의 완료 여부 (Phase 3, 기본 false). 한 번 true가 되면 유지. */
  aiAutoConvertConsent?: boolean;
}

/**
 * Drive 폴더에 자동 생성되는 meta.json 스키마
 *
 * 왜 필요한가: 폴더명/파일명만으로는 "UUID 식별자"를 표현할 수 없다.
 * 사용자가 폴더를 rename 해도 stableId가 같으면 같은 프리셋으로 인식한다.
 */
export interface DriveMetaJson {
  /** UUID — 이 프리셋의 영속 식별자 */
  stableId: string;
  /** 파일명에서 추출한 원본 패턴명 */
  presetName: string;
  /** 사용자 표시용 별칭 (선택) */
  displayName?: string;
  /** 최초 생성 시각 (ISO) */
  createdAt: string;
  /** 조각 수 (Phase 1은 항상 1) */
  pieceCount: number;
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

/**
 * 등록된 사이즈 목록을 "최소 ~ 최대" 형식 문자열로 변환한다.
 *
 * 왜 필요한가:
 *   패턴 카드에 "5XS, 4XS, 3XS, ..., 5XL" 처럼 모든 사이즈를 나열하면
 *   카드가 길어지고 한눈에 파악하기 어렵다. 범위만 표시하면 훨씬 깔끔하다.
 *
 * 비유:
 *   의류 라벨의 "S-L" 표기 같은 것 — 중간이 빠져도 최소~최대만 보여준다.
 *
 * 규칙:
 *   - 빈 배열 → "" (빈 문자열)
 *   - 1개   → 해당 사이즈 그대로 (예: "L")
 *   - 2개 이상 → SIZE_LIST 순서로 정렬 후 "최소 ~ 최대" (예: "5XS ~ 5XL")
 *   - SIZE_LIST에 없는 사이즈는 뒤로 밀려난다 (idx=99 처리)
 *
 * @param sizes 등록된 사이즈 배열 (순서 무관)
 * @returns 사이즈 범위 문자열
 */
export function getSizeRangeText(sizes: string[]): string {
  if (!sizes.length) return "";
  if (sizes.length === 1) return sizes[0];
  // SIZE_LIST 인덱스 기준으로 정렬 (5XS → 5XL 방향)
  const sorted = sizes.slice().sort((a, b) => {
    const idxA = SIZE_LIST.indexOf(a as SizeName);
    const idxB = SIZE_LIST.indexOf(b as SizeName);
    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
  });
  return `${sorted[0]} ~ ${sorted[sorted.length - 1]}`;
}

/**
 * 파일명에서 사이즈 토큰을 추출한다.
 *
 * 왜 필요한가:
 *   - 기준 AI 파일명은 보통 "농구_V넥_XL.ai" 같은 규칙을 따른다.
 *   - 여기서 "XL"만 쏙 뽑아내면 OrderGenerate의 기준 사이즈 드롭다운 초기값으로 쓸 수 있다.
 *   - 사용자가 매번 드롭다운을 조작할 필요가 줄어든다.
 *
 * 매칭 규칙 (간단 휴리스틱):
 *   1) 확장자 제거
 *   2) 구분자(_ - 공백 .)로 토큰 분해
 *   3) SIZE_LIST에 등록된 사이즈와 대소문자 무시 비교하여
 *      "뒤에서부터 가장 먼저 매칭되는 토큰"을 반환
 *      (마지막 토큰에 사이즈가 붙는 관습을 따르기 위함)
 *   4) 매칭 실패 시 null
 *
 * 예:
 *   "농구_V넥_XL.ai"        → "XL"
 *   "sample-M-v2.ai"         → "M"
 *   "축구 유니폼 2xl.ai"      → "2XL"  (대소문자 무시, 정규화해서 반환)
 *   "prefix_XS_suffix.ai"    → "XS"
 *   "그냥아무이름.ai"         → null
 */
export function extractSizeFromFilename(fileName: string): string | null {
  if (!fileName) return null;
  // 경로가 들어와도 파일명만 추출
  const parts = fileName.replace(/\\/g, "/").split("/");
  const base = parts[parts.length - 1] || fileName;
  // 확장자 제거
  const noExt = base.replace(/\.[^/.]+$/, "");
  // 구분자 토큰화
  const tokens = noExt.split(/[_\-\s.]+/).filter(Boolean);
  // 뒤에서부터 SIZE_LIST 매칭
  for (let i = tokens.length - 1; i >= 0; i--) {
    const upper = tokens[i].toUpperCase();
    const hit = SIZE_LIST.find((s) => s === upper);
    if (hit) return hit;
  }
  return null;
}

/**
 * 기준 아트보드 크기 (mm) — 회사 표준 디자인 PDF 아트보드
 *
 * 패턴 SVG의 아트보드가 이보다 작을 수 있으므로,
 * SVG 업로드 시 이 크기로 viewBox를 보정한다.
 * (패턴 도형의 좌표는 변경하지 않고 아트보드만 확장)
 */
export const STANDARD_ARTBOARD = {
  width: 1580,   // mm
  height: 2000,  // mm
} as const;
