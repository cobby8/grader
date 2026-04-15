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

/**
 * SVG 문자열 안의 "조각 수"를 센다.
 *
 * 왜 필요한가:
 *   패턴 카드 UI에 "조각 N개"를 실제 SVG 내용 기반으로 표시하기 위함.
 *   옷 패턴 한 장(SVG 파일) 안에 앞판/뒷판/소매 등 여러 조각이 들어있는 경우
 *   사용자가 "이 패턴은 재단 조각이 몇 개짜리인지" 알고 싶어 한다.
 *
 * 핵심 문제 (개선 이유):
 *   Illustrator는 여러 닫힌 도형을 하나의 <path>로 묶을 수 있다.
 *   예: `<path d="M10,10 L20,20 Z  M30,30 L40,40 Z">` → 실제 조각은 2개지만
 *       태그 개수로 세면 1개.
 *   따라서 **<path>의 `d` 속성 안의 M/m 명령어(서브패스 시작점) 개수**를 세야
 *   실제 조각 수가 나온다.
 *
 * 비유:
 *   하나의 전지(<path>)에 재단선을 여러 번 그려둔 것과 같다.
 *   전지 수가 아니라 "재단선이 몇 번 시작됐는가(Move to)"를 세야 조각 수가 맞다.
 *
 * 구현:
 *   - DOMParser로 SVG XML 파싱
 *   - 각 <path>의 `d`에서 정규식 `/[Mm]/g` 매치 개수 = 해당 path의 조각 수
 *     · d 속성이 없거나 비어있으면 0으로 취급
 *     · 최소 1을 보장하지는 않음 (빈 path는 조각 아님)
 *   - <polyline>, <polygon>은 태그 하나 = 조각 1개 (M 명령어가 의미 없음)
 *   - <g> 그룹 내부도 querySelectorAll이 재귀 탐색하므로 자연 포함
 *   - 파싱 실패 시 0 반환
 *
 * @param svgContent SVG 파일 내용(문자열)
 * @returns 조각 수 (0 이상 정수)
 */
export function countSvgPieces(svgContent: string): number {
  if (!svgContent) return 0;
  try {
    const parser = new DOMParser();
    // image/svg+xml 파서로 정확히 해석 (text/html은 태그 대소문자 잃음)
    const doc = parser.parseFromString(svgContent, "image/svg+xml");
    // 파싱 에러 검사 — DOMParser는 실패해도 예외 없이 <parsererror> 삽입
    const parserError = doc.querySelector("parsererror");
    if (parserError) return 0;

    let pieceCount = 0;

    // <path>: d 속성의 M/m(Move to) 명령어 개수만큼 서브패스 = 조각
    doc.querySelectorAll("path").forEach((pathEl) => {
      const d = pathEl.getAttribute("d") || "";
      const moveMatches = d.match(/[Mm]/g);
      pieceCount += moveMatches ? moveMatches.length : 0;
    });

    // <polyline>, <polygon>: 태그 하나가 한 조각
    pieceCount += doc.querySelectorAll("polyline, polygon").length;

    return pieceCount;
  } catch {
    // DOMParser 자체가 없는 환경 등 (Node test 시) — 안전한 기본값
    return 0;
  }
}
