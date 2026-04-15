/**
 * 카테고리 저장소 (categoryStore)
 *
 * 패턴 프리셋을 폴더처럼 분류하는 카테고리 데이터를 관리한다.
 * presetStore와 동일한 패턴으로 AppData에 JSON 파일로 저장/로드한다.
 *
 * 저장 위치: {앱 데이터 폴더}/categories.json
 */

import {
  readTextFile,
  writeTextFile,
  exists,
  mkdir,
  BaseDirectory,
} from "@tauri-apps/plugin-fs";
import type { PatternCategory } from "../types/pattern";
import type { LoadResult } from "./presetStore";

/** JSON 파일명 */
const CATEGORIES_FILE = "categories.json";
/** 백업 파일명 */
const CATEGORIES_BACKUP_FILE = "categories.backup.json";

/**
 * 저장된 카테고리 목록을 파일에서 읽어온다.
 * - 파일이 없으면 success: true + 빈 배열 (카테고리 없이도 동작 가능)
 * - 읽기/파싱 에러면 success: false
 */
export async function loadCategories(): Promise<LoadResult<PatternCategory>> {
  try {
    const fileExists = await exists(CATEGORIES_FILE, {
      baseDir: BaseDirectory.AppData,
    });

    if (!fileExists) {
      return { success: true, data: [] };
    }

    const raw = await readTextFile(CATEGORIES_FILE, {
      baseDir: BaseDirectory.AppData,
    });

    const parsed = JSON.parse(raw) as PatternCategory[];
    return { success: true, data: parsed };
  } catch (err) {
    console.error("카테고리 로드 실패:", err);
    return { success: false, data: [], error: String(err) };
  }
}

/**
 * 카테고리 목록을 JSON 파일로 저장한다.
 * 안전장치: 빈 배열 덮어쓰기 차단 + 저장 전 백업
 */
export async function saveCategories(categories: PatternCategory[]): Promise<void> {
  // 안전장치 1: 빈 배열 저장 시 기존 파일이 있으면 차단
  if (categories.length === 0) {
    try {
      const hasFile = await exists(CATEGORIES_FILE, { baseDir: BaseDirectory.AppData });
      if (hasFile) {
        const existing = await readTextFile(CATEGORIES_FILE, { baseDir: BaseDirectory.AppData });
        const existingData = JSON.parse(existing);
        if (Array.isArray(existingData) && existingData.length > 0) {
          console.warn("경고: 기존 카테고리가 있는데 빈 배열로 덮어쓰기 시도됨. 차단합니다.");
          throw new Error("빈 데이터로 기존 카테고리를 덮어쓸 수 없습니다.");
        }
      }
    } catch (readErr) {
      if (readErr instanceof Error && readErr.message.includes("빈 데이터로")) {
        throw readErr;
      }
    }
  }

  try {
    // AppData 디렉토리 생성 (이미 있으면 무시)
    await mkdir("", { baseDir: BaseDirectory.AppData, recursive: true }).catch(() => {});

    // 안전장치 2: 저장 전 기존 파일을 백업
    try {
      const hasFile = await exists(CATEGORIES_FILE, { baseDir: BaseDirectory.AppData });
      if (hasFile) {
        const existing = await readTextFile(CATEGORIES_FILE, { baseDir: BaseDirectory.AppData });
        await writeTextFile(CATEGORIES_BACKUP_FILE, existing, { baseDir: BaseDirectory.AppData });
      }
    } catch {
      // 백업 실패는 무시
    }

    const json = JSON.stringify(categories, null, 2);
    await writeTextFile(CATEGORIES_FILE, json, {
      baseDir: BaseDirectory.AppData,
    });
  } catch (err) {
    console.error("카테고리 저장 실패:", err);
    throw err;
  }
}

/**
 * 특정 카테고리의 자식 카테고리들을 찾는다.
 * parentId가 일치하는 카테고리를 "이름(한국어 자연 정렬)" 순으로 반환.
 *
 * 왜 order 기반이 아닌 이름 정렬인가:
 *   order 값은 신규 카테고리가 추가될 때 max+1로 단순 부여되어 폴더
 *   재배치/일괄 가져오기 시 사람 눈에 "뒤죽박죽"으로 보이는 문제가 있었다.
 *   파일 탐색기처럼 이름 오름차순(가나다 + 숫자는 수치 비교)으로 정렬하면
 *   "V넥 스탠다드-A"가 "V넥 스탠다드-B" 앞에 오고, "2XL"이 "10XL" 앞에 와서
 *   사용자가 찾기 쉬워진다.
 *
 * order 필드는 데이터에 그대로 유지한다(legacy 호환 및 향후 사용자 드래그로
 * 직접 순서를 덮어쓰는 기능이 들어올 여지를 위해). 지금은 정렬 기준으로만 쓰지 않는다.
 */
export function getChildCategories(
  categories: PatternCategory[],
  parentId: string | null
): PatternCategory[] {
  return categories
    .filter((c) => c.parentId === parentId)
    .sort((a, b) =>
      // numeric:true → "2XL"과 "10XL"을 문자가 아닌 숫자로 비교
      // sensitivity:"base" → 대소문자/악센트 무시 (한글엔 영향 없지만 영문 혼용 안전)
      a.name.localeCompare(b.name, "ko", { numeric: true, sensitivity: "base" })
    );
}

/**
 * 카테고리의 전체 경로를 배열로 반환한다 (빵가루 네비게이션용).
 * 예: "농구 > 상의" → [{ id: "...", name: "농구" }, { id: "...", name: "상의" }]
 */
export function getCategoryPath(
  categories: PatternCategory[],
  categoryId: string
): PatternCategory[] {
  const path: PatternCategory[] = [];
  let current = categories.find((c) => c.id === categoryId);

  // 부모를 따라 올라가며 경로 수집
  while (current) {
    path.unshift(current); // 앞에 추가 (루트가 맨 앞)
    current = current.parentId
      ? categories.find((c) => c.id === current!.parentId)
      : undefined;
  }

  return path;
}

/**
 * 특정 카테고리의 하위에 프리셋이나 자식 카테고리가 있는지 확인한다.
 * 빈 카테고리만 삭제 허용하기 위해 사용.
 */
export function hasChildren(
  categories: PatternCategory[],
  categoryId: string
): boolean {
  return categories.some((c) => c.parentId === categoryId);
}

/**
 * 같은 부모 아래에서 다음 order 값을 계산한다.
 * 기존 자식 중 가장 큰 order + 1 반환.
 */
export function getNextOrder(
  categories: PatternCategory[],
  parentId: string | null
): number {
  const siblings = categories.filter((c) => c.parentId === parentId);
  if (siblings.length === 0) return 0;
  return Math.max(...siblings.map((c) => c.order)) + 1;
}

/**
 * 카테고리를 트리 형태의 계층 드롭다운 옵션으로 변환한다.
 * 프리셋 편집 시 카테고리 선택 드롭다운에 사용.
 * 예: [{ id, label: "농구", depth: 0 }, { id, label: "  상의", depth: 1 }]
 */
export interface CategoryOption {
  id: string;
  label: string;  // 들여쓰기 포함 이름
  depth: number;   // 깊이 (0=루트)
}

export function getCategoryOptions(
  categories: PatternCategory[]
): CategoryOption[] {
  const result: CategoryOption[] = [];

  // 재귀적으로 트리를 순회하며 옵션 목록 생성
  function traverse(parentId: string | null, depth: number) {
    const children = getChildCategories(categories, parentId);
    for (const child of children) {
      // 깊이에 따라 들여쓰기 (공백 2칸씩)
      const indent = "\u00A0\u00A0".repeat(depth);
      result.push({
        id: child.id,
        label: `${indent}${child.name}`,
        depth,
      });
      traverse(child.id, depth + 1);
    }
  }

  traverse(null, 0);
  return result;
}
