/**
 * svgStandardizeService.ts
 *
 * 왜 이 파일이 필요한가:
 *   Tauri Rust 커맨드(svg_preview_normalize / svg_normalize_batch)는
 *   Python이 stdout에 찍은 JSON 문자열을 그대로 돌려준다.
 *   UI 컴포넌트가 매번 `JSON.parse()` + 에러 분기 + 타입 캐스팅을
 *   반복하면 버그가 생기기 쉽다. 이 서비스 레이어는
 *     1) Python 응답 JSON을 TypeScript 타입으로 매핑
 *     2) invoke 실패/JSON.parse 실패를 명시적 예외로 변환
 *     3) 한 줄 로그(`[svg-standardize]` 프리픽스) 를 전담해서
 *   컴포넌트가 순수 UI 로직에 집중하게 만든다.
 *
 * 비유:
 *   Rust 커맨드 = 주방 창구(Python에게 주문만 전달).
 *   이 서비스 = 손님 테이블의 메뉴 매니저(주문/답 통역).
 *
 * 컨벤션:
 *   - updaterService.ts / driveSync.ts와 같은 "함수 export" 스타일 (클래스 X).
 *   - 상위(컴포넌트)는 try/catch로 에러를 받고, 여기서는 **조용한 실패 금지**
 *     (사용자가 명시적으로 실행한 액션이므로 에러는 명확히 드러내야 함).
 *
 * Python 응답 구조(svg_normalizer.py 확인 결과):
 *   preview_normalize → { success, data: { previews: [...] } } | { success: false, error }
 *   normalize_batch   → { success, data: { folder, total_count, pass_count, fail_count,
 *                                          skipped_count, results: [...], version } }
 *                     | { success: false, error }
 *   프론트에서는 Rust invoke가 위 JSON 문자열을 그대로 전달.
 */

import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// 글로벌 기준 파일 상수 + 자동 결정 로직 (보완 수정 [2026-04-22])
// ============================================================================

/**
 * 글로벌 기준 SVG 파일 (양면 유니폼 상의 전용) — Drive 루트 기준 상대 경로.
 *
 * 왜 고정인가:
 *   양면 유니폼 상의는 모든 패턴 그룹(U넥/V넥/라운드넥 등 양면 계열)이 반드시
 *   동일한 아트보드 크기·좌표를 기준으로 표준화되어야 한다. 사용자가 모달에서
 *   사이즈 드롭다운으로 매번 골라주면 (1) 프리셋마다 다른 값이 고정될 수 있고,
 *   (2) 실수로 2XL 등 다른 크기를 선택하면 전체 폴더가 다른 기준으로 변환되어
 *   검증/매칭 로직이 깨진다. UX 단순화 + 일관성 보장을 위해 고정한다.
 *
 * 경로 정책:
 *   - 여기엔 상대 경로만 저장 (Drive 루트는 settingsStore의 `drivePatternRoot`
 *     값과 결합해 런타임에 절대 경로로 합성).
 *   - Windows 구분자 `\\`로 저장 — JS 문자열에서 단일 `\`는 이스케이프 시작이므로
 *     두 번 써서 실제 한 글자 `\`를 표현.
 *   - Python 측은 `os.path`가 `\`/`/` 양쪽을 모두 처리하므로 안전.
 */
const GLOBAL_DOUBLE_SIDED_BASE_FILE_RELATIVE =
  "0. 농구유니폼 확정 정리본\\2. 양면 유니폼상의 패턴\\U넥\\U넥 양면유니폼 스탠다드\\양면유니폼_U넥_스탠다드_XL.svg";

/**
 * 주어진 `driveFolder` 경로가 "양면 유니폼 상의" 카테고리에 속하는지 판별.
 *
 * 판별 기준: 경로 문자열에 한국어 키워드 "양면 유니폼상의"(공백 1개) 포함 여부.
 * — G드라이브의 실제 폴더명 `2. 양면 유니폼상의 패턴`과 정확히 일치해야 한다.
 * — "양면 유니폼 상의"(공백 2개)가 아니므로 사용자 입력 오타 주의.
 */
export function isDoubleSidedTopPattern(driveFolder: string): boolean {
  return driveFolder.includes("양면 유니폼상의");
}

/**
 * 자동 결정된 기준 파일 정보.
 *
 * - kind="global": 프로젝트 공통 기준 (양면 상의). `displayName`에 "(글로벌)" 표기.
 * - kind="local":  해당 폴더 내부에서 결정 (단면 등). `displayName`에 "(자체)" 표기.
 */
export interface ResolvedBaseFile {
  /** 절대 경로 (Python에 그대로 전달) */
  absPath: string;
  /** 기준 종류 */
  kind: "global" | "local";
  /** UI 표시용 사람이 읽기 쉬운 이름 */
  displayName: string;
}

/**
 * 주어진 패턴의 기준 SVG 파일 절대 경로를 자동 결정한다.
 *
 * 로직:
 *   1) `driveFolder`가 "양면 유니폼상의" 카테고리면
 *      → Drive 루트 + 글로벌 상대 경로 결합한 절대 경로 반환 (kind: "global")
 *   2) 그 외 (단면 등) → `svgPathBySize`에서 XL → 2XL → L → M → S 순서 fallback
 *      (해당 폴더 내부의 SVG만 사용, kind: "local")
 *   3) 위 두 경우 모두 실패 → null (호출자가 에러 UI 표시)
 *
 * 왜 XL > 2XL > L > M > S 순서인가:
 *   XL이 "중간보다 약간 큰" 사이즈로 패턴 path 구조가 가장 안정적이고,
 *   대부분의 프리셋이 XL 또는 2XL을 기본 사이즈로 가지고 있기 때문이다.
 */
export function resolveBaseFile(
  driveFolder: string,
  svgPathBySize: Record<string, string>,
  drivePatternRoot: string
): ResolvedBaseFile | null {
  // [1] 양면 상의 → 글로벌 기준
  if (isDoubleSidedTopPattern(driveFolder)) {
    // Drive 루트의 trailing slash 여부를 정리 (\\ 또는 / 모두 대응)
    const root = drivePatternRoot.replace(/[\\/]$/, "");
    // 구분자는 루트 쪽 스타일 따라감 (\\ 우선)
    const sep = root.includes("\\") ? "\\" : "/";
    // 상대 경로의 \\는 저장된 그대로 — Python이 `\`도 처리 가능
    const absPath = `${root}${sep}${GLOBAL_DOUBLE_SIDED_BASE_FILE_RELATIVE}`;
    return {
      absPath,
      kind: "global",
      displayName: "양면유니폼_U넥_스탠다드_XL (글로벌)",
    };
  }

  // [2] 그 외 → 자체 폴더 내 fallback
  const priorityOrder = ["XL", "2XL", "L", "M", "S"];
  for (const size of priorityOrder) {
    const p = svgPathBySize[size];
    if (p) {
      return {
        absPath: p,
        kind: "local",
        displayName: `${size} (자체 폴더)`,
      };
    }
  }

  // [3] 모두 실패
  return null;
}

// ============================================================================
// 타입 정의 — Python JSON과 1:1 매핑 (svg_normalizer.py 실제 출력 기반)
// ============================================================================

/** 미리보기 1건 — 변환 후 예상 좌표/크기와 충돌 검증 결과. */
export interface PreviewEntry {
  /** 대상 SVG 절대 경로. */
  file: string;
  /** "OK" = 시뮬레이션 성공, "FAIL" = 추출/계산 실패. */
  status: "OK" | "FAIL";
  /** 큰 패턴 폭(mm). OK일 때만 존재. */
  big_width?: number;
  /** 작은 패턴 폭(mm). OK일 때만 존재. */
  small_width?: number;
  /** 큰 패턴 X 범위 [min, max]. OK일 때만 존재. */
  big_x_range?: [number, number];
  /** 작은 패턴 X 범위 [min, max]. OK일 때만 존재. */
  small_x_range?: [number, number];
  /** 작은 패턴 Y 보정 오프셋(mm). 사이즈마다 다름. OK일 때만 존재. */
  small_y_align_offset?: number;
  /** 큰/작은 패턴 사이 X 간격(mm). OK일 때만 존재. */
  gap_between_patterns?: number;
  /** viewBox 안에 모두 들어왔는가? */
  viewbox_ok?: boolean;
  /** 큰/작은 패턴이 X축으로 충돌하지 않는가? */
  no_x_collision?: boolean;
  /** FAIL 시 에러 메시지. */
  error?: string;
}

/** preview_normalize 전체 응답. */
export interface PreviewResult {
  /** Python이 래핑한 성공 플래그. data 블록이 있어도 false면 error 참조. */
  success: boolean;
  /** success=true일 때만 존재. */
  data?: {
    previews: PreviewEntry[];
  };
  /** success=false일 때만 존재. */
  error?: string;
}

/** 배치 변환 1건의 결과. */
export interface BatchResultEntry {
  /** 대상 SVG 절대 경로. */
  file: string;
  /** PASS = 변환 성공, FAIL = 변환 실패, SKIP = 기준 파일이라 건너뜀. */
  status: "PASS" | "FAIL" | "SKIP";
  /** SKIP 사유. */
  reason?: string;
  /** FAIL 사유. */
  error?: string;
  /** PASS 시 변환 상세(backup_path, big_width, checks 등). Python 원형 그대로. */
  data?: Record<string, unknown>;
}

/** normalize_batch 전체 응답. */
export interface BatchResult {
  /** Python이 래핑한 성공 플래그 (내부적으로 fail_count==0 기준). */
  success: boolean;
  /** success=true일 때만 존재. */
  data?: {
    folder: string;
    total_count: number;
    pass_count: number;
    fail_count: number;
    skipped_count: number;
    results: BatchResultEntry[];
    version: string;
  };
  /** success=false일 때만 존재. */
  error?: string;
}

// ============================================================================
// invoke 래퍼
// ============================================================================

/**
 * Rust invoke 호출 + Python JSON 문자열 파싱 공통부.
 *
 * 왜 private 헬퍼인가: 두 함수가 완전히 동일한 보일러플레이트
 * ("invoke → 문자열 받음 → JSON.parse → 타입 캐스팅")를 가지기 때문에
 * 중복을 한 곳으로 모아둔다.
 *
 * @throws JSON 파싱 실패 / Rust invoke 실패 시 원본 메시지를 담은 Error
 */
async function invokeAndParse<T>(
  command: string,
  params: Record<string, unknown>
): Promise<T> {
  // 1) Rust 커맨드 호출 — 반환은 Python stdout JSON 문자열 그대로
  const raw = await invoke<string>(command, params);
  // 2) JSON 파싱 — stdout에 경고/로그가 섞이면 여기서 실패
  try {
    return JSON.parse(raw) as T;
  } catch (parseErr) {
    const msg =
      parseErr instanceof Error ? parseErr.message : String(parseErr);
    console.error(
      `[svg-standardize] JSON parse 실패 (${command}):`,
      msg,
      "\n원본 응답:",
      raw.slice(0, 500)  // 긴 응답은 500자만 미리 보여줌 (디버깅용)
    );
    throw new Error(`Python 응답 JSON 파싱 실패: ${msg}`);
  }
}

/**
 * 변환 시뮬레이션 (파일 미수정).
 *
 * 폴더 안의 SVG를 모두 수집해서 "변환하면 어떻게 될지" 미리 계산한다.
 * 실제 파일은 건드리지 않으므로 [실행] 전 항상 한 번 호출해 사용자에게 보여준다.
 *
 * @param folder   대상 폴더 절대 경로 (또는 ';' 구분 SVG 파일 목록)
 * @param baseFile 기준 SVG 절대 경로 (예: XL 사이즈 — 이 파일은 자동 제외됨)
 * @throws invoke 실패, JSON.parse 실패 시 Error
 */
export async function previewNormalize(
  folder: string,
  baseFile: string
): Promise<PreviewResult> {
  console.info(
    `[svg-standardize] preview 시작 folder=${folder} baseFile=${baseFile}`
  );
  // Tauri 2.x는 Rust snake_case → TS camelCase 자동 변환. folder/baseFile 그대로 사용.
  const result = await invokeAndParse<PreviewResult>("svg_preview_normalize", {
    folder,
    baseFile,
  });
  console.info(
    `[svg-standardize] preview 완료 success=${result.success} previews=${
      result.data?.previews?.length ?? 0
    }`
  );
  return result;
}

/**
 * 폴더 일괄 변환 (파일 수정 + 자동 .bak 백업).
 *
 * @param folder   대상 폴더 절대 경로
 * @param baseFile 기준 SVG 절대 경로 (이 파일은 건너뜀)
 * @param noBackup true면 .bak 백업 생성을 생략 (기본 false = 백업 ON)
 * @throws invoke 실패, JSON.parse 실패 시 Error
 */
export async function normalizeBatch(
  folder: string,
  baseFile: string,
  noBackup: boolean = false
): Promise<BatchResult> {
  console.info(
    `[svg-standardize] batch 시작 folder=${folder} baseFile=${baseFile} noBackup=${noBackup}`
  );
  // invoke 인자명은 Rust 정의(folder/base_file/no_backup)에 Tauri의 camelCase 변환이 적용된 형태
  const result = await invokeAndParse<BatchResult>("svg_normalize_batch", {
    folder,
    baseFile,
    noBackup,
  });
  console.info(
    `[svg-standardize] batch 완료 success=${result.success} pass=${
      result.data?.pass_count ?? 0
    } fail=${result.data?.fail_count ?? 0} skip=${
      result.data?.skipped_count ?? 0
    }`
  );
  return result;
}
