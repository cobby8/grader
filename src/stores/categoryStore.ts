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

/** JSON 파일명 */
const CATEGORIES_FILE = "categories.json";

/**
 * 저장된 카테고리 목록을 파일에서 읽어온다.
 * 파일이 없으면 빈 배열을 반환한다 (카테고리 없이도 동작 가능).
 */
export async function loadCategories(): Promise<PatternCategory[]> {
  try {
    const fileExists = await exists(CATEGORIES_FILE, {
      baseDir: BaseDirectory.AppData,
    });

    if (!fileExists) {
      return [];
    }

    const raw = await readTextFile(CATEGORIES_FILE, {
      baseDir: BaseDirectory.AppData,
    });

    return JSON.parse(raw) as PatternCategory[];
  } catch (err) {
    console.error("카테고리 로드 실패:", err);
    return [];
  }
}

/**
 * 카테고리 목록을 JSON 파일로 저장한다.
 */
export async function saveCategories(categories: PatternCategory[]): Promise<void> {
  try {
    const dirExists = await exists("", { baseDir: BaseDirectory.AppData });
    if (!dirExists) {
      await mkdir("", { baseDir: BaseDirectory.AppData, recursive: true });
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
 * parentId가 일치하는 카테고리를 order 순으로 정렬하여 반환.
 */
export function getChildCategories(
  categories: PatternCategory[],
  parentId: string | null
): PatternCategory[] {
  return categories
    .filter((c) => c.parentId === parentId)
    .sort((a, b) => a.order - b.order);
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
