/**
 * 디자인 파일 저장소 (designStore)
 *
 * 디자인 파일(PDF) 메타데이터를 Tauri의 앱 데이터 디렉토리에 JSON으로 저장/로드한다.
 * 실제 PDF 파일과 미리보기 PNG는 appData/designs/ 하위 폴더에 복사되어 관리된다.
 *
 * 저장 구조:
 *   {AppData}/com.grader.app/
 *     ├── designs.json          ← 디자인 메타데이터 목록
 *     └── designs/
 *         ├── {id}.pdf          ← 복사된 원본 PDF
 *         └── {id}.preview.png  ← 미리보기 이미지
 */

import {
  readTextFile,
  writeTextFile,
  readFile,
  writeFile,
  exists,
  mkdir,
  remove,
  BaseDirectory,
} from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";
import type { DesignFile } from "../types/design";
import type { LoadResult } from "./presetStore";

/** JSON 파일명 */
const DESIGNS_FILE = "designs.json";
/** 백업 파일명 */
const DESIGNS_BACKUP_FILE = "designs.backup.json";

/** 디자인 파일이 저장되는 하위 폴더 */
const DESIGNS_DIR = "designs";

/**
 * 저장된 디자인 파일 메타데이터 목록을 읽어온다.
 * - 파일이 없으면 success: true + 빈 배열 (첫 실행 정상 케이스)
 * - 읽기/파싱 에러면 success: false (이 상태에서는 저장이 차단됨)
 */
export async function loadDesigns(): Promise<LoadResult<DesignFile>> {
  try {
    const fileExists = await exists(DESIGNS_FILE, {
      baseDir: BaseDirectory.AppData,
    });

    if (!fileExists) {
      return { success: true, data: [] };
    }

    const raw = await readTextFile(DESIGNS_FILE, {
      baseDir: BaseDirectory.AppData,
    });

    const parsed = JSON.parse(raw) as DesignFile[];
    return { success: true, data: parsed };
  } catch (err) {
    console.error("디자인 목록 로드 실패:", err);
    return { success: false, data: [], error: String(err) };
  }
}

/**
 * 디자인 파일 메타데이터 목록을 JSON으로 저장한다.
 * 안전장치: 빈 배열 덮어쓰기 차단 + 저장 전 백업
 */
export async function saveDesigns(designs: DesignFile[]): Promise<void> {
  // 안전장치 1: 빈 배열 저장 시 기존 파일이 있으면 차단
  if (designs.length === 0) {
    try {
      const hasFile = await exists(DESIGNS_FILE, { baseDir: BaseDirectory.AppData });
      if (hasFile) {
        const existing = await readTextFile(DESIGNS_FILE, { baseDir: BaseDirectory.AppData });
        const existingData = JSON.parse(existing);
        if (Array.isArray(existingData) && existingData.length > 0) {
          console.warn("경고: 기존 디자인이 있는데 빈 배열로 덮어쓰기 시도됨. 차단합니다.");
          throw new Error("빈 데이터로 기존 디자인을 덮어쓸 수 없습니다. 전체 삭제하려면 각각 삭제해주세요.");
        }
      }
    } catch (readErr) {
      if (readErr instanceof Error && readErr.message.includes("빈 데이터로")) {
        throw readErr;
      }
    }
  }

  try {
    // AppData 루트 디렉토리 확인/생성
    const dirExists = await exists("", { baseDir: BaseDirectory.AppData });
    if (!dirExists) {
      await mkdir("", { baseDir: BaseDirectory.AppData, recursive: true });
    }

    // designs/ 하위 폴더도 확인/생성
    const subDirExists = await exists(DESIGNS_DIR, {
      baseDir: BaseDirectory.AppData,
    });
    if (!subDirExists) {
      await mkdir(DESIGNS_DIR, {
        baseDir: BaseDirectory.AppData,
        recursive: true,
      });
    }

    // 안전장치 2: 저장 전 기존 파일을 백업
    try {
      const hasFile = await exists(DESIGNS_FILE, { baseDir: BaseDirectory.AppData });
      if (hasFile) {
        const existing = await readTextFile(DESIGNS_FILE, { baseDir: BaseDirectory.AppData });
        await writeTextFile(DESIGNS_BACKUP_FILE, existing, { baseDir: BaseDirectory.AppData });
      }
    } catch {
      // 백업 실패는 무시
    }

    const json = JSON.stringify(designs, null, 2);
    await writeTextFile(DESIGNS_FILE, json, {
      baseDir: BaseDirectory.AppData,
    });
  } catch (err) {
    console.error("디자인 목록 저장 실패:", err);
    throw err;
  }
}

/**
 * designs/ 하위 폴더의 절대 경로를 반환한다.
 * Python에 넘길 때 사용할 절대 경로가 필요하다.
 */
export async function getDesignsDirPath(): Promise<string> {
  const appData = await appDataDir();
  return await join(appData, DESIGNS_DIR);
}

/**
 * 지정된 designId로 저장될 PDF 파일의 절대 경로를 반환한다.
 */
export async function getDesignPdfPath(designId: string): Promise<string> {
  const dir = await getDesignsDirPath();
  return await join(dir, `${designId}.pdf`);
}

/**
 * 지정된 designId로 저장될 미리보기 PNG의 절대 경로를 반환한다.
 */
export async function getDesignPreviewPath(designId: string): Promise<string> {
  const dir = await getDesignsDirPath();
  return await join(dir, `${designId}.preview.png`);
}

/**
 * 원본 PDF를 앱 데이터 디렉토리의 designs/{id}.pdf로 복사한다.
 * Tauri fs 플러그인의 바이너리 읽기/쓰기로 구현.
 */
export async function copyPdfToAppData(
  originalPath: string,
  designId: string
): Promise<string> {
  // designs/ 하위 폴더 보장
  const subDirExists = await exists(DESIGNS_DIR, {
    baseDir: BaseDirectory.AppData,
  });
  if (!subDirExists) {
    await mkdir(DESIGNS_DIR, {
      baseDir: BaseDirectory.AppData,
      recursive: true,
    });
  }

  // 원본 파일을 바이너리로 읽기 (절대 경로이므로 baseDir 미지정)
  const bytes = await readFile(originalPath);

  // 앱 데이터의 상대 경로에 쓰기 (BaseDirectory.AppData 기준)
  const relativePath = `${DESIGNS_DIR}/${designId}.pdf`;
  await writeFile(relativePath, bytes, {
    baseDir: BaseDirectory.AppData,
  });

  // 절대 경로 반환 (Python에서 사용 가능)
  return await getDesignPdfPath(designId);
}

/**
 * 디자인 파일과 미리보기 이미지를 삭제한다.
 * 메타데이터는 이 함수 호출 전후로 별도 관리.
 */
export async function deleteDesignFiles(design: DesignFile): Promise<void> {
  try {
    // PDF 삭제
    const pdfRelative = `${DESIGNS_DIR}/${design.id}.pdf`;
    const pdfExists = await exists(pdfRelative, {
      baseDir: BaseDirectory.AppData,
    });
    if (pdfExists) {
      await remove(pdfRelative, { baseDir: BaseDirectory.AppData });
    }

    // 미리보기 PNG 삭제
    const pngRelative = `${DESIGNS_DIR}/${design.id}.preview.png`;
    const pngExists = await exists(pngRelative, {
      baseDir: BaseDirectory.AppData,
    });
    if (pngExists) {
      await remove(pngRelative, { baseDir: BaseDirectory.AppData });
    }
  } catch (err) {
    // 파일 삭제 실패는 로그만 남기고 계속 진행 (메타데이터는 삭제됨)
    console.error("디자인 파일 물리 삭제 실패:", err);
  }
}

/**
 * 디자인 ID 생성 (presetStore와 동일 방식)
 */
export function generateDesignId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `design-${timestamp}-${random}`;
}
