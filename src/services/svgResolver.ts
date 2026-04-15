/**
 * SVG 해석기 (svgResolver)
 *
 * 왜 이 파일이 필요한가:
 *   패턴 조각(PatternPiece)은 출처에 따라 SVG 데이터를 서로 다른 방식으로 보관한다.
 *     - Local 프리셋  → `svgBySize[size]` 에 SVG 문자열 직접 저장
 *     - Drive 프리셋  → `svgPathBySize[size]` 에 절대경로만 저장
 *                       (실제 문자열은 svgCacheStore.getSvg()로 on-demand 로드)
 *
 *   지금까지 FileGenerate.tsx는 `svgBySize` 만 읽어서 Drive 프리셋에서는
 *   "사이즈 SVG가 없습니다" 에러로 종료됐다. 이를 한 곳에서 통합 해석한다.
 *
 * 비유:
 *   - Local = 서랍에 실제 서류가 들어있음 (바로 꺼냄)
 *   - Drive = 서랍엔 주소만 있고 창고(Drive)에서 매번 가져와야 함
 *     (한 번 꺼낸 건 책상 위 캐시에 둠 → svgCacheStore)
 *   - 이 파일은 "어디서 꺼내야 하는지" 판단하는 사서(librarian) 역할.
 */

import type { PatternPiece } from "../types/pattern";
import { getSvg } from "../stores/svgCacheStore";

/**
 * 조각에서 특정 사이즈의 SVG 문자열을 해석한다.
 *
 * 우선순위:
 *   1. `svgBySize[size]` (Local 인라인)    — 동기적으로 즉시 반환
 *   2. `svgPathBySize[size]` (Drive 경로) — svgCacheStore 경유로 로드
 *   3. 둘 다 없으면 undefined
 *
 * @param piece  패턴 조각
 * @param size   타겟 사이즈명 (예: "L", "XL")
 * @returns SVG 문자열 또는 undefined (해당 사이즈 데이터가 아예 없을 때)
 */
export async function resolveSvgContent(
  piece: PatternPiece,
  size: string
): Promise<string | undefined> {
  // 1) Local 인라인 우선 — 이미 메모리에 있으므로 디스크 I/O 불필요
  const inline = piece.svgBySize?.[size];
  if (inline) return inline;

  // 2) Drive 경로 — svgCacheStore가 캐시 + 파일 읽기 담당
  const drivePath = piece.svgPathBySize?.[size];
  if (drivePath) {
    return await getSvg(drivePath);
  }

  // 3) 해당 사이즈 데이터 없음
  return undefined;
}

/**
 * 동기 해석 — 이미 svgBySize에 실려있는 경우에만 사용.
 *
 * 왜 별도로 두는가: 렌더 중(React render phase) SVG를 즉시 그려야 할 때
 * await를 쓸 수 없다. 이 함수는 Local 전용이며 Drive 경로면 undefined 반환.
 *
 * @param piece  패턴 조각
 * @param size   타겟 사이즈명
 * @returns SVG 문자열 또는 undefined (Drive 경로이거나 미등록)
 */
export function resolveSvgContentSync(
  piece: PatternPiece,
  size: string
): string | undefined {
  return piece.svgBySize?.[size];
}
