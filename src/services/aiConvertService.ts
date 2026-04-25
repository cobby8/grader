/**
 * src/services/aiConvertService.ts
 *
 * AI→SVG 변환 서비스 (Phase 1-C, 2026-04-25)
 *
 * 왜 이 파일이 필요한가:
 *   Tauri Rust 커맨드(ai_convert_preview / ai_convert_batch)는
 *   Python(ai_converter.py)이 stdout에 찍은 JSON 문자열을 그대로 돌려준다.
 *   UI 컴포넌트(AiConvertModal)가 매번 `JSON.parse()` + 타입 캐스팅을
 *   직접 하면 버그가 생기기 쉽고 일관성이 깨진다. 이 서비스 레이어는
 *     1) Python 응답 JSON을 TypeScript 타입으로 매핑
 *     2) `[ai-convert]` 프리픽스 한 줄 로그 전담
 *     3) invoke 실패/JSON.parse 실패 시 명확한 throw
 *   를 담당하여 컴포넌트가 순수 UI 로직에 집중하게 한다.
 *
 * 비유:
 *   Rust 커맨드 = 주방 창구(Python에게 주문만 전달).
 *   이 서비스 = 손님 테이블의 메뉴 매니저(주문/답 통역).
 *
 * 컨벤션:
 *   - svgStandardizeService.ts와 완전히 동일한 패턴 (함수 export, 클래스 X)
 *   - Python `{ success, data, error }` 형식 그대로 노출 (discriminated union 안 씀)
 *     → 일관성 우선. 사용자가 명시적으로 트리거한 액션이라 조용한 실패 금지.
 *
 * 호출 측:
 *   - src/components/AiConvertModal.tsx (Phase 1-E에서 추가 예정)
 *
 * 관련:
 *   - PLAN-AI-TO-SVG.md 섹션 6-4
 *   - src/services/svgStandardizeService.ts (동일 패턴 레퍼런스)
 *   - python-engine/ai_converter.py (실제 변환 로직)
 *   - src-tauri/src/lib.rs L461/L480 (Rust 커맨드)
 */

import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// 타입 정의 — Python JSON과 1:1 매핑 (ai_converter.py 실제 출력 기반)
// ============================================================================

/**
 * AI 파일 분류 결과 (헤더 첫 10바이트로 판정).
 *
 * - `pdf_compatible`: `%PDF-` 헤더 → PyMuPDF 변환 가능 (Phase 1 처리 대상)
 * - `postscript`: `%!PS-Adobe` 헤더 → Phase 2(Illustrator COM) 대상, 현재는 SKIP
 * - `unknown`: 어느 쪽도 아님 (손상 파일 또는 알 수 없는 형식)
 */
export type AiKind = "pdf_compatible" | "postscript" | "unknown";

/**
 * preview 단계 항목 (시뮬레이션, 파일 미수정).
 */
export interface AiPreviewEntry {
  /** 대상 AI 파일 절대 경로. */
  file: string;
  /** 헤더 분류 결과. */
  kind: AiKind;
  /** 같은 폴더에 같은 이름의 SVG가 이미 있는지 (있으면 batch 시 기본 SKIP). */
  existing_svg: boolean;
}

/**
 * preview API 반환 형식 (Python JSON 그대로).
 */
export interface AiPreviewResult {
  /** Python이 래핑한 성공 플래그. */
  success: boolean;
  /** success=true일 때만 존재. */
  data?: {
    entries: AiPreviewEntry[];
    summary: {
      pdf_compatible: number;
      postscript: number;
      unknown: number;
      /** overwrite=False인데 기존 SVG 있어서 skip될 예정인 건수. */
      existing_svg_conflict: number;
    };
  };
  /** success=false일 때만 존재. */
  error?: string;
}

/**
 * batch 단계 항목별 처리 상태.
 *
 * - PASS: 변환 성공 (svg_path에 결과 경로)
 * - SKIP: 처리 안 함 (postscript / existing_svg / unknown 등 reason 참조)
 * - FAIL: 변환 시도 중 에러 (error 참조)
 */
export type AiBatchStatus = "PASS" | "SKIP" | "FAIL";

/**
 * batch 단계 항목 결과.
 */
export interface AiBatchResultEntry {
  /** 대상 AI 파일 절대 경로. */
  file: string;
  /** 처리 상태. */
  status: AiBatchStatus;
  /** PASS 시 생성된 SVG 절대 경로. */
  svg_path?: string;
  /** SKIP 시 사유 ("postscript" | "existing_svg" | "unknown"). */
  reason?: string;
  /** FAIL 시 에러 메시지. */
  error?: string;
  /** 변환 중 발생한 비치명 경고 메시지. */
  warnings?: string[];
}

/**
 * batch API 반환 형식 (Python JSON 그대로).
 *
 * Python(ai_converter.py L408~410)이 반환하는 카운트 필드 4종을 모두 포함.
 * `skipped_unknown`은 PLAN 의사코드엔 없지만 Phase 1-A 실제 구현에 있어서 추가.
 */
export interface AiBatchResult {
  /** Python이 래핑한 성공 플래그. */
  success: boolean;
  /** success=true일 때만 존재. */
  data?: {
    /** 처리 시도된 총 파일 수. */
    total: number;
    /** 변환 성공 건수. */
    converted: number;
    /** PostScript라서 건너뛴 건수 (Phase 2 대상). */
    skipped_postscript: number;
    /** 기존 SVG 있어서 건너뛴 건수 (overwrite=false일 때). */
    skipped_existing: number;
    /** 알 수 없는 헤더라서 건너뛴 건수 (Phase 1-A 실제 반환 필드). */
    skipped_unknown?: number;
    /** 변환 시도 중 실패한 건수. */
    failed: number;
    /** 항목별 상세 결과. */
    results: AiBatchResultEntry[];
    /** 변환기 버전 (Python CONVERTER_VERSION). */
    version: string;
  };
  /** success=false일 때만 존재. */
  error?: string;
}

// ============================================================================
// invoke 래퍼 함수
// ============================================================================

/**
 * AI 파일 목록의 헤더를 분석하여 변환 가능 여부를 미리 확인 (시뮬레이션).
 *
 * 실제 파일은 건드리지 않고, 헤더 첫 10바이트만 읽어
 *   - PDF 호환(%PDF-) → 변환 가능
 *   - PostScript(%!PS-Adobe) → Phase 2 대상 (현재는 SKIP 예정)
 *   - 그 외 → unknown (SKIP)
 * 로 분류해 사용자에게 미리 알려준다.
 *
 * @param files 절대 경로 배열. ";"로 join하여 Rust로 전달 (Python CLI 관례 일관성).
 *              빈 배열이면 entries=[], summary={0,0,0,0} 반환.
 * @returns Python `{ success, data, error }` 형식 그대로
 *
 * 에러 처리:
 *   - invoke 자체 실패(Rust panic 등) → throw (사용자 명시 액션이라 조용한 실패 금지)
 *   - JSON.parse 실패 → throw (Python stdout 오염 시)
 *   - Python 측 로직 에러 → `{ success: false, error: "..." }` 정상 반환 (throw 안 함)
 */
export async function previewAiConversion(
  files: string[]
): Promise<AiPreviewResult> {
  // Rust 측은 단일 문자열 인자를 받아 Python에게 그대로 전달한다.
  // ";"로 join하는 규칙은 svg_normalize_batch와 동일 (Python CLI 관례).
  const filesStr = files.join(";");
  console.log("[ai-convert] previewAiConversion 호출:", { count: files.length });

  try {
    // invoke<string> — Rust 커맨드는 Python stdout JSON 문자열을 그대로 반환
    const raw = await invoke<string>("ai_convert_preview", { files: filesStr });
    // Python이 단일 라인 JSON을 보장하므로 JSON.parse 한 번으로 끝
    const parsed = JSON.parse(raw) as AiPreviewResult;
    console.log(
      "[ai-convert] preview 응답:",
      parsed.success ? "success" : `error: ${parsed.error}`
    );
    return parsed;
  } catch (e) {
    // invoke 실패 또는 JSON.parse 실패 — 둘 다 사용자에게 에러로 드러내야 함
    console.error("[ai-convert] preview 실패:", e);
    throw e;
  }
}

/**
 * AI 파일 일괄 변환 실행 (PDF 호환만 처리).
 *
 * PostScript / unknown / 기존 SVG가 있는 경우는 SKIP으로 분류되며,
 * 배치 도중 한 파일 실패 시에도 다음 파일로 계속 진행 (FAIL 기록만).
 *
 * @param files 절대 경로 배열. ";"로 join.
 * @param overwrite true면 기존 SVG가 있어도 덮어쓰기(.bak 자동 백업).
 *                  false면 기존 SVG 있는 파일은 SKIP.
 * @returns Python `{ success, data, error }` 형식 그대로
 *
 * 에러 처리: previewAiConversion과 동일 (사용자 명시 액션 → 조용한 실패 금지).
 */
export async function convertAiBatch(
  files: string[],
  overwrite: boolean
): Promise<AiBatchResult> {
  // ";" 구분자 join — preview와 동일 규칙 (Rust 측에서 다시 분할)
  const filesStr = files.join(";");
  console.log("[ai-convert] convertAiBatch 호출:", {
    count: files.length,
    overwrite,
  });

  try {
    // 인자명 `files` / `overwrite`는 Rust 커맨드 시그니처와 정확히 매칭
    // (Tauri 2.x: Rust snake_case ↔ TS camelCase 자동 변환, 여기는 둘 다 짧아서 동일)
    const raw = await invoke<string>("ai_convert_batch", {
      files: filesStr,
      overwrite,
    });
    const parsed = JSON.parse(raw) as AiBatchResult;
    if (parsed.success && parsed.data) {
      // 성공 시 카운트 요약을 한 줄로 출력 (디버깅 시 한 눈에 파악)
      console.log(
        "[ai-convert] batch 결과:",
        `total=${parsed.data.total} converted=${parsed.data.converted} ` +
          `skipped_ps=${parsed.data.skipped_postscript} ` +
          `skipped_existing=${parsed.data.skipped_existing} ` +
          `skipped_unknown=${parsed.data.skipped_unknown ?? 0} ` +
          `failed=${parsed.data.failed}`
      );
    } else {
      console.warn("[ai-convert] batch 에러:", parsed.error);
    }
    return parsed;
  } catch (e) {
    console.error("[ai-convert] batch 실패:", e);
    throw e;
  }
}
