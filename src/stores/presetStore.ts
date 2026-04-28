/**
 * 프리셋 저장소 (presetStore)
 *
 * 패턴 프리셋 데이터를 Tauri의 앱 데이터 디렉토리에 JSON 파일로 저장/로드한다.
 * React 컴포넌트에서 useState로 관리하는 데이터를 파일시스템과 동기화하는 역할.
 *
 * 저장 위치: {앱 데이터 폴더}/presets.json
 * - Windows: C:\Users\{user}\AppData\Roaming\com.grader.app\presets.json
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
const PRESETS_FILE = "presets.json";
/** 백업 파일명 */
const PRESETS_BACKUP_FILE = "presets.backup.json";

/**
 * 로드 결과 타입: 성공/실패를 명확히 구분하여
 * 에러 시 빈 배열로 기존 데이터가 덮어쓰여지는 사고를 방지한다.
 */
export interface LoadResult<T> {
  success: boolean; // true: 정상 로드 (파일 없음 포함), false: 읽기/파싱 에러
  data: T[];
  error?: string;   // 실패 시 에러 메시지
}

/**
 * 저장된 프리셋 목록을 파일에서 읽어온다.
 * - 파일이 없으면 success: true + 빈 배열 (첫 실행 정상 케이스)
 * - 읽기/파싱 에러면 success: false (이 상태에서는 저장이 차단됨)
 */
export async function loadPresets(): Promise<LoadResult<PatternPreset>> {
  try {
    // AppData 디렉토리에 파일이 있는지 확인
    const fileExists = await exists(PRESETS_FILE, {
      baseDir: BaseDirectory.AppData,
    });

    if (!fileExists) {
      // 파일 없음 = 첫 실행, 정상적으로 빈 배열 반환
      return { success: true, data: [] };
    }

    // 파일 읽기
    const raw = await readTextFile(PRESETS_FILE, {
      baseDir: BaseDirectory.AppData,
    });

    const parsed = JSON.parse(raw) as PatternPreset[];
    return { success: true, data: parsed };
  } catch (err) {
    // 읽기/파싱 실패 → success: false로 반환하여 저장을 차단
    console.error("프리셋 로드 실패:", err);
    return { success: false, data: [], error: String(err) };
  }
}

/**
 * 프리셋 목록을 JSON 파일로 저장한다.
 * 안전장치:
 * 1) 빈 배열로 기존 데이터를 덮어쓰는 것을 차단
 * 2) 저장 전 기존 파일을 백업
 */
export async function savePresets(presets: PatternPreset[]): Promise<void> {
  // 안전장치 1: 빈 배열 저장 시 기존 파일이 있으면 차단
  if (presets.length === 0) {
    try {
      const hasFile = await exists(PRESETS_FILE, { baseDir: BaseDirectory.AppData });
      if (hasFile) {
        const existing = await readTextFile(PRESETS_FILE, { baseDir: BaseDirectory.AppData });
        const existingData = JSON.parse(existing);
        if (Array.isArray(existingData) && existingData.length > 0) {
          console.warn("경고: 기존 프리셋이 있는데 빈 배열로 덮어쓰기 시도됨. 차단합니다.");
          throw new Error("빈 데이터로 기존 프리셋을 덮어쓸 수 없습니다. 전체 삭제하려면 각각 삭제해주세요.");
        }
      }
    } catch (readErr) {
      // throw된 에러는 다시 throw, 파일 읽기 실패는 무시
      if (readErr instanceof Error && readErr.message.includes("빈 데이터로")) {
        throw readErr;
      }
      // 기존 파일 읽기 실패 → 파일이 없는 것이므로 빈 배열 저장 OK
    }
  }

  try {
    // AppData 디렉토리 생성 (이미 있으면 무시)
    // 왜 명시 catch + console.warn: settingsStore.ts와 동일 사유 (errors.md 2026-04-28).
    await mkdir("", { baseDir: BaseDirectory.AppData, recursive: true }).catch(
      (err) => {
        console.warn("[presetStore] mkdir AppData 실패 (capabilities 확인 필요):", err);
      }
    );

    // 안전장치 2: 저장 전 기존 파일을 백업
    try {
      const hasFile = await exists(PRESETS_FILE, { baseDir: BaseDirectory.AppData });
      if (hasFile) {
        const existing = await readTextFile(PRESETS_FILE, { baseDir: BaseDirectory.AppData });
        await writeTextFile(PRESETS_BACKUP_FILE, existing, { baseDir: BaseDirectory.AppData });
      }
    } catch {
      // 백업 실패는 무시 (저장은 계속 진행)
    }

    // JSON 문자열로 변환하여 저장 (보기 좋게 2칸 들여쓰기)
    const json = JSON.stringify(presets, null, 2);
    await writeTextFile(PRESETS_FILE, json, {
      baseDir: BaseDirectory.AppData,
    });
  } catch (err) {
    console.error("프리셋 저장 실패:", err);
    throw err; // 저장 실패는 상위에서 처리할 수 있도록 throw
  }
}

/**
 * 고유 ID를 생성한다.
 * 간단한 타임스탬프 + 랜덤 문자열 조합.
 */
export function generateId(): string {
  const timestamp = Date.now().toString(36); // 타임스탬프를 36진수로
  const random = Math.random().toString(36).substring(2, 8); // 랜덤 6자리
  return `${timestamp}-${random}`;
}
