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

/** JSON 파일명 */
const DESIGNS_FILE = "designs.json";

/** 디자인 파일이 저장되는 하위 폴더 */
const DESIGNS_DIR = "designs";

/**
 * 저장된 디자인 파일 메타데이터 목록을 읽어온다.
 * 파일이 없으면 빈 배열을 반환한다.
 */
export async function loadDesigns(): Promise<DesignFile[]> {
  try {
    const fileExists = await exists(DESIGNS_FILE, {
      baseDir: BaseDirectory.AppData,
    });

    if (!fileExists) {
      return [];
    }

    const raw = await readTextFile(DESIGNS_FILE, {
      baseDir: BaseDirectory.AppData,
    });

    return JSON.parse(raw) as DesignFile[];
  } catch (err) {
    console.error("디자인 목록 로드 실패:", err);
    return [];
  }
}

/**
 * 디자인 파일 메타데이터 목록을 JSON으로 저장한다.
 * AppData 디렉토리가 없으면 자동 생성한다.
 */
export async function saveDesigns(designs: DesignFile[]): Promise<void> {
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
