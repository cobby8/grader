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

/**
 * 저장된 프리셋 목록을 파일에서 읽어온다.
 * 파일이 없으면 빈 배열을 반환한다.
 */
export async function loadPresets(): Promise<PatternPreset[]> {
  try {
    // AppData 디렉토리에 파일이 있는지 확인
    const fileExists = await exists(PRESETS_FILE, {
      baseDir: BaseDirectory.AppData,
    });

    if (!fileExists) {
      return []; // 파일 없으면 빈 배열
    }

    // 파일 읽기
    const raw = await readTextFile(PRESETS_FILE, {
      baseDir: BaseDirectory.AppData,
    });

    return JSON.parse(raw) as PatternPreset[];
  } catch (err) {
    console.error("프리셋 로드 실패:", err);
    return [];
  }
}

/**
 * 프리셋 목록을 JSON 파일로 저장한다.
 * AppData 디렉토리가 없으면 자동으로 생성한다.
 */
export async function savePresets(presets: PatternPreset[]): Promise<void> {
  try {
    // AppData 디렉토리가 없으면 생성
    const dirExists = await exists("", { baseDir: BaseDirectory.AppData });
    if (!dirExists) {
      await mkdir("", { baseDir: BaseDirectory.AppData, recursive: true });
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
