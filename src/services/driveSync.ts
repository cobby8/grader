/**
 * Drive 폴더 동기화 서비스 (driveSync)
 *
 * 왜 이 파일이 필요한가:
 *   디자인팀이 Google Drive에 정리해둔 패턴 SVG 폴더를 grader 앱이 직접 읽어
 *   카테고리/프리셋으로 자동 매핑하기 위한 "스캔 엔진"이다.
 *
 * 책임 범위 (Phase 1):
 *   1) 루트 경로 재귀 스캔 (최대 5레벨, 권장 3레벨)
 *   2) 파일명 파싱: `{패턴명}_{사이즈}.svg` 단일 규칙
 *   3) meta.json 읽기/자동 생성 (stableId UUID 유지)
 *   4) 파일 시스템 접근은 Tauri fs 플러그인 사용 (절대경로)
 *
 * Phase 1 범위 밖:
 *   - 다중 조각(여러 SVG path를 여러 파일로 쪼개는 케이스) 파싱 — 조각 1개 가정
 *   - watcher(파일 변경 감지) — Phase 2
 *   - Drive REST API — Phase 3
 *
 * 저장 위치: 이 파일 자체는 저장소가 아니라 "로직 모듈"이다.
 *           SVG 내용 캐시는 svgCacheStore가, 설정은 settingsStore가 담당.
 */

import {
  readDir,
  readTextFile,
  writeTextFile,
  exists,
} from "@tauri-apps/plugin-fs";

import type { DriveMetaJson } from "../types/pattern";
import { SIZE_LIST } from "../types/pattern";

// ============================================================================
// 상수 및 정규식
// ============================================================================

/**
 * 사이즈 토큰 정규식
 *
 * 왜 이 패턴인가:
 *   파일명 끝이 `_{사이즈}.svg`로 끝나면 그 앞 전부를 패턴명으로 간주한다.
 *   alternation(|)은 정규식 엔진이 긴 것부터 시도하지 않으므로,
 *   길이 내림차순으로 정렬한 SIZE_LIST를 사용한다 (5XL이 XL보다 먼저 와야
 *   "농구_5XL.svg"가 "농구_5" + "XL"이 아닌 "농구" + "5XL"로 파싱된다).
 */
const SIZE_LIST_DESC = [...SIZE_LIST].sort((a, b) => b.length - a.length);
const SIZE_ALT = SIZE_LIST_DESC.join("|");
export const SIZE_REGEX = new RegExp(`^(.+)_(${SIZE_ALT})\\.svg$`, "i");

/** 재귀 스캔 최대 깊이 (무한 재귀 방지 안전장치) */
const MAX_SCAN_DEPTH = 5;

/** meta.json 파일의 확장자 규약 (`{패턴명}.meta.json`) */
const META_JSON_SUFFIX = ".meta.json";

// ============================================================================
// 타입
// ============================================================================

/** 스캔 결과로 추출된 카테고리 노드 */
export interface ScanCategory {
  /** 카테고리 식별자 — 경로 해시로 생성 (meta.json stableId 아님) */
  id: string;
  /** 폴더명 그대로 (정렬용 번호 "1. " 포함) */
  name: string;
  /** 상위 카테고리 id, 루트면 null */
  parentId: string | null;
  /** 루트=0, 하위로 갈수록 +1 */
  depth: number;
  /** 이 카테고리 폴더의 절대경로 */
  absPath: string;
}

/** 스캔 결과로 추출된 프리셋 후보 */
export interface ScanPreset {
  /** meta.json의 UUID (있으면 읽고, 없으면 자동 생성) */
  stableId: string;
  /** 파일명에서 추출한 패턴명 (사이즈 토큰 제거) */
  presetName: string;
  /** 이 프리셋이 속한 최하위 카테고리 id */
  categoryId: string;
  /** Drive 루트로부터의 상대경로 (카테고리 폴더까지) */
  driveFolder: string;
  /** 사이즈별 SVG 파일의 절대경로 (예: { "XS": "G:\\...\\농구_XS.svg" }) */
  svgPathBySize: Record<string, string>;
}

/** 전체 스캔 결과 */
export interface ScanResult {
  categories: ScanCategory[];
  presets: ScanPreset[];
  /** 규칙 위반 파일, 빈 폴더 등 경고 메시지 모음 */
  warnings: string[];
  /** 스캔 성공 여부 (루트 접근 실패면 false) */
  success: boolean;
  /** 실패 시 에러 메시지 */
  error?: string;
}

// ============================================================================
// 파일명 파싱
// ============================================================================

/**
 * 파일명을 패턴명 + 사이즈로 분해한다.
 *
 * 예:
 *   "농구유니폼_V넥_스탠다드_암홀X_XS.svg" → { presetName: "농구유니폼_V넥_스탠다드_암홀X", size: "XS" }
 *   "안전지대.svg" → null (사이즈 토큰 없음)
 *   "농구_V넥.meta.json" → null (SVG가 아님)
 *
 * @param filename 확장자 포함 순수 파일명 (경로 X)
 * @returns 파싱 성공 시 {presetName, size}, 실패 시 null
 */
export function parseFilename(
  filename: string
): { presetName: string; size: string } | null {
  const match = filename.match(SIZE_REGEX);
  if (!match) return null;
  const [, presetName, size] = match;
  // 사이즈는 대문자로 정규화 (SIZE_LIST와 비교 용이)
  return { presetName, size: size.toUpperCase() };
}

// ============================================================================
// 유틸: UUID, 경로 조작
// ============================================================================

/**
 * UUID v4 생성 (crypto.randomUUID 가용 시 사용, fallback 포함)
 *
 * 왜 fallback이 필요한가: crypto.randomUUID는 secure context에서만 동작한다.
 * Tauri 웹뷰는 secure context지만 방어적으로 fallback을 둔다.
 */
function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // RFC4122 v4 흉내 (보안 목적 아님, 식별자 전용)
  const hex = (n: number) =>
    Math.floor(Math.random() * Math.pow(16, n))
      .toString(16)
      .padStart(n, "0");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${((Math.random() * 4) | 8).toString(16)}${hex(3)}-${hex(12)}`;
}

/**
 * 경로 해시 (카테고리 id 생성용)
 *
 * 왜 해시인가: 카테고리 id는 앱 세션 내 일관되기만 하면 되므로,
 * 절대경로를 간단히 해시해서 사용한다. stableId(UUID)와는 다른 용도.
 */
function hashPath(absPath: string): string {
  // 간단한 FNV-1a 32비트 해시
  let h = 0x811c9dc5;
  for (let i = 0; i < absPath.length; i++) {
    h ^= absPath.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `cat-${(h >>> 0).toString(16)}`;
}

/**
 * 두 경로를 구분자로 합친다 (Windows 백슬래시 유지).
 *
 * 왜 직접 구현했나: 브라우저 환경에는 node path.join이 없고,
 * Tauri fs API는 절대경로 문자열을 그대로 받기 때문에 단순 합성만 필요하다.
 */
function joinPath(parent: string, child: string): string {
  if (!parent) return child;
  const sep = parent.includes("\\") ? "\\" : "/";
  // 끝에 구분자가 이미 있으면 중복 방지
  const trimmed = parent.endsWith("\\") || parent.endsWith("/")
    ? parent.slice(0, -1)
    : parent;
  return `${trimmed}${sep}${child}`;
}

/**
 * baseAbs를 루트로 보고, targetAbs의 상대경로를 계산한다.
 *
 * 왜 필요한가: Drive 카테고리 루트로부터의 상대경로(driveFolder)를 저장해야
 * 사용자가 드라이브 문자를 바꿔도(G→H) 데이터가 유효하다.
 */
function toRelativePath(baseAbs: string, targetAbs: string): string {
  // 경로 구분자를 정규화해서 비교
  const normBase = baseAbs.replace(/\\/g, "/").replace(/\/+$/, "");
  const normTarget = targetAbs.replace(/\\/g, "/");
  if (normTarget.toLowerCase().startsWith(normBase.toLowerCase() + "/")) {
    return normTarget.slice(normBase.length + 1);
  }
  if (normTarget.toLowerCase() === normBase.toLowerCase()) {
    return "";
  }
  // 루트 바깥이면 그대로 (에러 케이스 방어)
  return normTarget;
}

// ============================================================================
// meta.json 읽기/쓰기
// ============================================================================

/**
 * 폴더에서 특정 presetName의 meta.json을 읽는다.
 * 없으면 null 반환 (에러 X — 호출자가 "없음=신규 생성"을 결정).
 */
async function readMetaJson(
  folderPath: string,
  presetName: string
): Promise<DriveMetaJson | null> {
  const metaPath = joinPath(folderPath, `${presetName}${META_JSON_SUFFIX}`);
  try {
    const has = await exists(metaPath);
    if (!has) return null;
    const raw = await readTextFile(metaPath);
    const parsed = JSON.parse(raw) as DriveMetaJson;
    // 최소 필드 검증
    if (!parsed.stableId || !parsed.presetName) return null;
    return parsed;
  } catch (err) {
    console.warn(`[driveSync] meta.json 읽기 실패: ${metaPath}`, err);
    return null;
  }
}

/**
 * 폴더에 meta.json을 생성/갱신한다.
 *
 * 왜 필요한가: 스캔 시 meta.json이 없으면 UUID를 발급해서 자동 저장해야
 * 다음 스캔 때 같은 stableId를 유지할 수 있다 (J-7 사용자 승인 완료).
 */
export async function writeMetaJson(
  folderPath: string,
  meta: DriveMetaJson
): Promise<void> {
  const metaPath = joinPath(folderPath, `${meta.presetName}${META_JSON_SUFFIX}`);
  const json = JSON.stringify(meta, null, 2);
  await writeTextFile(metaPath, json);
}

/**
 * meta.json을 읽거나, 없으면 새로 만들어 저장한다.
 *
 * @returns 최종 meta (새로 만든 것이거나 기존 것)
 */
export async function readOrCreateMetaJson(
  folderPath: string,
  presetName: string,
  pieceCount: number = 1
): Promise<DriveMetaJson> {
  const existing = await readMetaJson(folderPath, presetName);
  if (existing) return existing;

  // 신규 생성
  const fresh: DriveMetaJson = {
    stableId: generateUUID(),
    presetName,
    createdAt: new Date().toISOString(),
    pieceCount,
  };
  try {
    await writeMetaJson(folderPath, fresh);
  } catch (err) {
    // 쓰기 실패해도 메모리 상 meta는 유지 (사용자 권한 문제 등)
    console.warn(`[driveSync] meta.json 쓰기 실패 (메모리에만 유지): ${folderPath}/${presetName}`, err);
  }
  return fresh;
}

// ============================================================================
// SVG 로딩
// ============================================================================

/**
 * 절대경로의 SVG 파일 내용을 문자열로 읽는다.
 *
 * 왜 별도 함수인가: svgCacheStore에서 캐시 미스 시 이 함수를 호출한다.
 * driveSync 외부에서는 getSvg()를 쓰고, 이 함수는 내부 fallback용.
 */
export async function loadSvgFromPath(absPath: string): Promise<string> {
  return await readTextFile(absPath);
}

// ============================================================================
// 메인 스캔 함수
// ============================================================================

/**
 * 한 폴더의 자식 목록을 조사해 (하위 폴더들, SVG 파일들, 기타)로 분류한다.
 */
async function listChildren(folderAbs: string): Promise<{
  subfolders: { name: string; absPath: string }[];
  svgFiles: { name: string; absPath: string }[];
}> {
  const entries = await readDir(folderAbs);
  const subfolders: { name: string; absPath: string }[] = [];
  const svgFiles: { name: string; absPath: string }[] = [];

  for (const entry of entries) {
    const name = entry.name;
    if (!name) continue;
    // meta.json은 데이터가 아니므로 스킵 (별도 경로에서 읽음)
    if (name.toLowerCase().endsWith(META_JSON_SUFFIX)) continue;

    const absPath = joinPath(folderAbs, name);
    if (entry.isDirectory) {
      subfolders.push({ name, absPath });
    } else if (entry.isFile && name.toLowerCase().endsWith(".svg")) {
      svgFiles.push({ name, absPath });
    }
    // 그 외(.ai, .pdf 등)는 스캔 대상 아님 — 조용히 스킵
  }
  return { subfolders, svgFiles };
}

/**
 * BFS 재귀로 폴더 트리를 탐색하며 카테고리 + 프리셋 후보를 수집한다.
 *
 * @param rootAbs Drive 루트 절대경로 (사용자가 Settings에서 지정)
 * @returns 전체 스캔 결과
 */
export async function scanDriveRoot(rootAbs: string): Promise<ScanResult> {
  const warnings: string[] = [];
  const categories: ScanCategory[] = [];
  const presets: ScanPreset[] = [];

  // 루트 존재 확인
  try {
    const rootExists = await exists(rootAbs);
    if (!rootExists) {
      return {
        categories: [],
        presets: [],
        warnings: [],
        success: false,
        error: `루트 폴더를 찾을 수 없습니다: ${rootAbs}`,
      };
    }
  } catch (err) {
    return {
      categories: [],
      presets: [],
      warnings: [],
      success: false,
      error: `루트 폴더 접근 실패 (권한/드라이브 문제일 수 있음): ${String(err)}`,
    };
  }

  /**
   * 큐 기반 BFS 순회
   * 각 항목: (폴더 절대경로, 부모 카테고리 id, 현재 깊이)
   * 왜 BFS인가: 카테고리를 얕은 레벨부터 등록해야 parentId 체인이 깨지지 않는다.
   */
  const queue: Array<{
    absPath: string;
    parentId: string | null;
    depth: number;
    isRoot: boolean;
  }> = [{ absPath: rootAbs, parentId: null, depth: 0, isRoot: true }];

  while (queue.length > 0) {
    const node = queue.shift()!;

    // 깊이 제한 체크 (무한 재귀 방지)
    if (node.depth > MAX_SCAN_DEPTH) {
      warnings.push(
        `스캔 깊이 제한(${MAX_SCAN_DEPTH})을 초과하여 스킵됨: ${node.absPath}`
      );
      continue;
    }

    // 자식 조회
    let children: Awaited<ReturnType<typeof listChildren>>;
    try {
      children = await listChildren(node.absPath);
    } catch (err) {
      warnings.push(`폴더 읽기 실패: ${node.absPath} (${String(err)})`);
      continue;
    }

    // 현재 폴더를 카테고리로 등록
    // 왜 루트도 depth=0 카테고리로 등록하지 않나: 루트는 "모든 카테고리의 부모"
    // 역할일 뿐 그 자체가 카테고리가 되면 UI에 불필요한 상위 노드가 생긴다.
    // 단, 루트에 직접 SVG가 있을 수도 있으므로 그 경우엔 루트를 "기본 카테고리"로 등록.
    let currentCategoryId: string | null = node.parentId;

    const shouldRegisterAsCategory = !node.isRoot || children.svgFiles.length > 0;
    if (shouldRegisterAsCategory) {
      // 폴더명 = 카테고리명 (루트면 루트폴더의 마지막 세그먼트)
      const folderName = extractFolderName(node.absPath);
      const catId = hashPath(node.absPath);
      currentCategoryId = catId;
      categories.push({
        id: catId,
        name: folderName,
        parentId: node.parentId,
        depth: node.depth,
        absPath: node.absPath,
      });
    }

    // SVG 파일들을 patternName으로 묶어 프리셋 후보 생성
    if (children.svgFiles.length > 0 && currentCategoryId) {
      // 파일명 → {presetName, size} 매핑
      const bucket = new Map<string, Record<string, string>>();
      for (const svg of children.svgFiles) {
        const parsed = parseFilename(svg.name);
        if (!parsed) {
          warnings.push(
            `파일명 규칙 위반(사이즈 토큰 없음), 스킵: ${svg.absPath}`
          );
          continue;
        }
        if (!bucket.has(parsed.presetName)) {
          bucket.set(parsed.presetName, {});
        }
        const pathBySize = bucket.get(parsed.presetName)!;
        // 같은 사이즈 중복이면 경고 후 나중 것 우선
        if (pathBySize[parsed.size]) {
          warnings.push(
            `사이즈 중복(${parsed.size}) — 덮어쓰기: ${svg.absPath}`
          );
        }
        pathBySize[parsed.size] = svg.absPath;
      }

      // bucket → ScanPreset
      for (const [presetName, svgPathBySize] of bucket.entries()) {
        // meta.json 읽기/자동 생성
        const meta = await readOrCreateMetaJson(node.absPath, presetName, 1);

        // Drive 루트 기준 상대경로 계산
        const driveFolder = toRelativePath(rootAbs, node.absPath);

        presets.push({
          stableId: meta.stableId,
          presetName,
          categoryId: currentCategoryId,
          driveFolder,
          svgPathBySize,
        });
      }
    }

    // 하위 폴더를 큐에 추가
    for (const sub of children.subfolders) {
      queue.push({
        absPath: sub.absPath,
        parentId: currentCategoryId,
        depth: node.depth + 1,
        isRoot: false,
      });
    }

    // 빈 폴더 경고 (하위 폴더도 없고 SVG도 없을 때 — 루트는 예외)
    if (
      !node.isRoot &&
      children.subfolders.length === 0 &&
      children.svgFiles.length === 0
    ) {
      warnings.push(`빈 폴더: ${node.absPath}`);
    }
  }

  return {
    categories,
    presets,
    warnings,
    success: true,
  };
}

/**
 * 절대경로에서 마지막 폴더명만 추출한다.
 *
 * 예: "G:\\공유 드라이브\\디자인\\00. 2026 커스텀용 패턴 SVG" → "00. 2026 커스텀용 패턴 SVG"
 */
function extractFolderName(absPath: string): string {
  // 끝의 구분자 제거
  const trimmed = absPath.replace(/[\\/]+$/, "");
  // 마지막 구분자 이후
  const lastSlash = Math.max(
    trimmed.lastIndexOf("\\"),
    trimmed.lastIndexOf("/")
  );
  if (lastSlash < 0) return trimmed;
  return trimmed.slice(lastSlash + 1);
}
