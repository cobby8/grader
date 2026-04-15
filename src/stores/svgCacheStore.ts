/**
 * SVG 메모리 캐시 스토어 (svgCacheStore)
 *
 * 왜 이 파일이 필요한가:
 *   Drive 출처 프리셋은 `svgPathBySize`에 "경로"만 저장하고 실제 SVG 문자열은
 *   없다. 매번 SizeSelect/FileGenerate 화면에서 파일을 다시 읽으면 디스크 I/O
 *   비용이 크고, 특히 Drive for Desktop "파일 스트리밍" 모드에서는 원격 다운로드
 *   지연이 수 초 단위로 발생한다. 따라서 한 번 읽은 SVG는 메모리에 캐시한다.
 *
 * 캐시 정책:
 *   - LRU (Least Recently Used): MAX_ENTRIES 초과 시 가장 오래 안 쓴 항목 제거
 *   - 키: 절대경로 (예: "G:\\공유 드라이브\\...\\농구_XS.svg")
 *   - 값: SVG 문자열 (string)
 *
 * 제한:
 *   - 전역 Map (싱글톤). 여러 탭 간 공유 아님 (Tauri 앱은 보통 단일 윈도우).
 *   - 파일 내용이 변경되어도 자동 감지 X (Phase 2 watcher에서 invalidate 호출).
 *
 * 비유:
 *   - Drive가 "창고", 이 캐시는 "책상 위 자주 쓰는 서류 500장".
 *   - 책상이 꽉 차면 가장 안 본 서류부터 다시 창고로 보낸다.
 */

import { loadSvgFromPath } from "../services/driveSync";

// ============================================================================
// 상수
// ============================================================================

/**
 * 캐시 최대 항목 수
 *
 * 왜 500인가: SVG 평균 크기 ~200KB 가정 시 500개 ≈ 100MB.
 * Tauri 웹뷰(Chromium) 메모리 여유 내 안전한 수치.
 * 실제 운영 중 더 줄이거나 늘려야 하면 이 값만 조정.
 */
const MAX_ENTRIES = 500;

// ============================================================================
// 내부 상태
// ============================================================================

interface SvgCacheEntry {
  content: string;
  /**
   * 마지막 사용 시각 (밀리초 타임스탬프).
   * LRU 판정 기준 — 값이 가장 작은 항목이 가장 오래 미사용.
   */
  loadedAt: number;
}

/**
 * 실제 캐시 저장소.
 * Map은 insertion order를 보장하지만 LRU는 loadedAt을 명시 비교해 결정한다.
 */
const cache = new Map<string, SvgCacheEntry>();

// ============================================================================
// 공개 API
// ============================================================================

/**
 * 절대경로의 SVG 내용을 가져온다 (캐시 우선, 미스 시 파일 읽기).
 *
 * @param absPath SVG 파일의 절대경로
 * @returns SVG 문자열
 * @throws 파일 읽기 실패 시 예외 전파
 */
export async function getSvg(absPath: string): Promise<string> {
  const hit = cache.get(absPath);
  if (hit) {
    // 캐시 히트 — LRU 갱신을 위해 loadedAt 업데이트
    hit.loadedAt = Date.now();
    return hit.content;
  }

  // 캐시 미스 — 디스크에서 읽어 캐시에 추가
  const content = await loadSvgFromPath(absPath);
  cache.set(absPath, { content, loadedAt: Date.now() });

  // 용량 초과 시 오래된 항목 제거 (LRU)
  if (cache.size > MAX_ENTRIES) {
    evictOldest(cache.size - MAX_ENTRIES);
  }

  return content;
}

/**
 * 특정 경로의 캐시 항목을 무효화한다.
 *
 * 언제 호출되나:
 *   - Phase 2 watcher가 파일 변경을 감지했을 때
 *   - 사용자가 "강제 새로고침"을 눌렀을 때
 */
export function invalidate(absPath: string): void {
  cache.delete(absPath);
}

/**
 * 전체 캐시를 비운다.
 *
 * 언제 호출되나:
 *   - 사용자가 Drive 루트 경로를 변경했을 때 (기존 경로 캐시 무의미)
 *   - "캐시 초기화" 관리 메뉴
 */
export function clearAll(): void {
  cache.clear();
}

/**
 * 캐시 통계 (디버그/Settings 표시용)
 */
export function getCacheStats(): {
  size: number;
  totalBytes: number;
  maxEntries: number;
} {
  let totalBytes = 0;
  for (const entry of cache.values()) {
    // 문자열 바이트 수 근사 — UTF-16 기준 2 bytes/char
    // 정확한 UTF-8 바이트 수가 필요하면 TextEncoder 사용 (성능 비용 큼)
    totalBytes += entry.content.length * 2;
  }
  return {
    size: cache.size,
    totalBytes,
    maxEntries: MAX_ENTRIES,
  };
}

// ============================================================================
// 내부 헬퍼
// ============================================================================

/**
 * loadedAt이 가장 오래된 n개를 제거한다.
 *
 * 왜 단순 정렬인가: MAX_ENTRIES=500, 초과 건수도 보통 1~2건이라
 * 500개 배열 정렬이 충분히 빠르다 (O(n log n) ≈ 수 µs).
 * 만약 규모가 커지면 linked-list 기반 LRU로 교체 가능.
 */
function evictOldest(n: number): void {
  // 전체 항목을 loadedAt 오름차순 정렬
  const sorted = Array.from(cache.entries()).sort(
    (a, b) => a[1].loadedAt - b[1].loadedAt
  );
  for (let i = 0; i < n && i < sorted.length; i++) {
    cache.delete(sorted[i][0]);
  }
}
