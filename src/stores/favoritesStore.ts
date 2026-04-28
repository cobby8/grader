/**
 * 즐겨찾기 저장소 (favoritesStore)
 *
 * 프리셋의 "즐겨찾기" 표시 여부를 Tauri의 앱 데이터 디렉토리에 JSON 파일로 저장/로드한다.
 * presetStore 패턴을 그대로 모방하여 안정성(빈배열 덮어쓰기 차단 + 백업)을 유지한다.
 *
 * 저장 위치: {앱 데이터 폴더}/favorites.json
 * - Windows: C:\Users\{user}\AppData\Roaming\com.grader.app\favorites.json
 *
 * 저장 포맷: 문자열 배열 (["stableId1", "localId2", ...])
 * - 왜 단순 배열인가: 즐겨찾기는 "ON/OFF"만 관리하면 되므로 Set과 동등한 배열이 가장 단순.
 * - 왜 stableId인가: Drive 프리셋은 폴더/파일명이 바뀌어도 meta.json의 UUID(stableId)가 유지되므로
 *   동기화 후에도 즐겨찾기가 끊기지 않는다. stableId가 없는 Local 프리셋은 id로 폴백.
 *
 * Drive 동기화 대상 X: favorites는 사용자 개인 취향이므로 Drive에 올리지 않는다.
 */

import {
  readTextFile,
  writeTextFile,
  exists,
  mkdir,
  BaseDirectory,
} from "@tauri-apps/plugin-fs";
import type { PatternPreset } from "../types/pattern";

/** JSON 파일명 */
const FAVORITES_FILE = "favorites.json";
/** 백업 파일명 */
const FAVORITES_BACKUP_FILE = "favorites.backup.json";

/**
 * 로드 결과 타입 — presetStore와 동일한 규약.
 * 에러 시 빈 배열로 덮어쓰는 사고를 방지하기 위해 success 플래그를 분리한다.
 */
export interface LoadResult<T> {
  success: boolean; // true: 정상 로드(파일 없음 포함), false: 읽기/파싱 에러
  data: T[];
  error?: string;
}

/**
 * 저장된 즐겨찾기 키 목록을 파일에서 읽어온다.
 * - 파일이 없으면 success: true + 빈 배열 (첫 실행 정상)
 * - 파싱 실패면 success: false (저장 차단)
 */
export async function loadFavorites(): Promise<LoadResult<string>> {
  try {
    const fileExists = await exists(FAVORITES_FILE, {
      baseDir: BaseDirectory.AppData,
    });

    if (!fileExists) {
      // 첫 실행 — 빈 즐겨찾기 목록은 정상 상태
      return { success: true, data: [] };
    }

    const raw = await readTextFile(FAVORITES_FILE, {
      baseDir: BaseDirectory.AppData,
    });

    const parsed = JSON.parse(raw);
    // 방어: 파일이 손상되어 배열이 아닌 경우 실패로 취급
    if (!Array.isArray(parsed)) {
      return {
        success: false,
        data: [],
        error: "favorites.json 형식 오류(배열이 아님)",
      };
    }
    // 문자열 배열만 허용 (타입 안전성)
    const filtered = parsed.filter((x): x is string => typeof x === "string");
    return { success: true, data: filtered };
  } catch (err) {
    console.error("즐겨찾기 로드 실패:", err);
    return { success: false, data: [], error: String(err) };
  }
}

/**
 * 즐겨찾기 키 목록을 JSON 파일로 저장한다.
 * 안전장치:
 * 1) 빈 배열로 기존 데이터(비어있지 않은)를 덮어쓰는 것을 차단
 *    — 단, "전체 해제"가 정상 시나리오이므로 presetStore보다 규칙이 느슨하다.
 *    즉, 빈 배열 저장은 허용하되 기존 파일 자체는 백업해두고 덮어쓴다.
 * 2) 저장 전 기존 파일을 백업
 */
export async function saveFavorites(ids: string[]): Promise<void> {
  try {
    // AppData 디렉토리 생성 (이미 있으면 무시)
    // 왜 명시 catch + console.warn: settingsStore.ts와 동일 사유 (errors.md 2026-04-28).
    await mkdir("", { baseDir: BaseDirectory.AppData, recursive: true }).catch(
      (err) => {
        console.warn("[favoritesStore] mkdir AppData 실패 (capabilities 확인 필요):", err);
      }
    );

    // 저장 전 기존 파일을 백업 (presetStore와 동일 전략)
    try {
      const hasFile = await exists(FAVORITES_FILE, { baseDir: BaseDirectory.AppData });
      if (hasFile) {
        const existing = await readTextFile(FAVORITES_FILE, { baseDir: BaseDirectory.AppData });
        await writeTextFile(FAVORITES_BACKUP_FILE, existing, { baseDir: BaseDirectory.AppData });
      }
    } catch {
      // 백업 실패는 저장을 막지 않는다 — 새 저장이 더 중요
    }

    // 중복 제거 후 저장 — 동일 id가 두 번 들어가는 사고 예방
    const unique = Array.from(new Set(ids));
    const json = JSON.stringify(unique, null, 2);
    await writeTextFile(FAVORITES_FILE, json, {
      baseDir: BaseDirectory.AppData,
    });
  } catch (err) {
    console.error("즐겨찾기 저장 실패:", err);
    throw err;
  }
}

/**
 * 프리셋에서 즐겨찾기 키를 뽑는다.
 *
 * 왜 별도 헬퍼인가: Drive 프리셋은 stableId(폴더/파일명 변경에도 유지되는 UUID)를,
 * Local 프리셋은 id(앱 내부 생성 ID)를 써야 한다. 호출부에서 매번 분기하지 않도록
 * 이 함수가 단일 진입점을 제공한다.
 *
 * 비유: 상품에 "바코드(UUID)"가 있으면 바코드로, 없으면 "매장 라벨 번호(id)"로
 * 즐겨찾기를 식별하는 것과 같다.
 */
export function getFavoriteKey(preset: PatternPreset): string {
  return preset.stableId || preset.id;
}
