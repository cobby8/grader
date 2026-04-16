# 요소 배치 로직 재설계 (B-2안: 몸판 조각별 개별 요소 배치 — N개 조각 지원)

- 대상 파일: `C:\0. Programing\grader\illustrator-scripts\grading.jsx` (현재 718줄)
- 출발점: B안 완료 상태 (`stable-B-relpos` 태그, 커밋 `cdcc6c8`)
- 백업: `illustrator-scripts/grading-B-backup.jsx`
- 변경 성격: **정렬 로직만 교체**. 스케일/색상/임포트 파이프라인은 그대로 유지.
- 선행 문서: `PLAN-POSITION-REDESIGN.md` (B안 상세)

**업데이트 (2026-04-16)**: front/back 2분할 설계에서 **N개 body 조각 지원**으로 확장. 사용자 결정에 따라 "조각이 많은 패턴이 이미 존재하기 때문에 N개로" 방향 확정. Q1(유클리드 거리)/Q2(나중 일반화)/Q3(표준 ungroup) 추천 확정.

---

## 1. B안 → B-2안 달라지는 점 요약

B안은 디자인 AI "몸판 레이어 **합집합 중심**"과 "요소 레이어 **합집합 중심**"의 단일 상대벡터(`relVec`)만 측정해 요소 그룹 전체를 한꺼번에 옮긴다. 디자인 AI 원본의 몸판 조각별 요소 구성이 비대칭(예: 왼쪽 몸판에 로고 2개, 오른쪽 몸판에 넘버 1개)이면 합집합 중심이 한쪽으로 치우쳐 **전체 요소가 그쪽으로 밀린 인상**이 남는다.

B-2안은 몸판을 **띠(band)와 N개의 body 조각**으로 분류하고, 각 요소를 **가장 가까운 body 조각에 소속**시킨 뒤, 디자인 AI에서 `요소중심 - 소속조각중심` 상대벡터를 개별 측정한다. SVG에서도 동일하게 조각을 분류하고, 각 요소를 `SVG소속조각중심 + 개별상대벡터 × linearScale` 위치에 **독립 배치**한다. 요소 그룹은 더 이상 한 덩어리로 이동하지 않고, 조각 기준으로 각자 자기 자리를 찾아간다.

조각 매칭은 **x중심 오름차순 정렬 후 인덱스 대응**을 기본 전략으로 쓴다. 디자인 AI와 SVG가 같은 패턴 템플릿에서 나왔다는 가정 아래, 조각 개수와 좌우 배치가 같으므로 정렬 후 `designBodies[i] ↔ svgBodies[i]`가 성립한다.

---

## 2. 알고리즘 단계

```
[1] 디자인 AI 열기 (기존 STEP 1 유지, grading.jsx L471~474)
[2] 디자인 AI 몸판 레이어에서 pathItems 수집 → classifyBodyPieces()
    → { bands: [...], bodies: [...] } 로 분류
    → bands: height < 500pt 인 조각 (복수 가능)
    → bodies: 나머지 전부, x중심 오름차순으로 정렬되어 idx 부여
[3] 요소 레이어 아이템별로 assignElementToPiece() 호출
    → 요소 중심에서 각 bodies[i] 중심까지 유클리드 거리 계산
    → 최단 거리 body의 idx 반환 (bodies 비어있으면 -1 = fallback)
    → elemItems[i].__pieceIdx 메타 부여
    → elemItems[i].__relVec = 요소중심 - bodies[idx]중심
[4] SVG 임포트 + fillLayer 구성 (기존 STEP 3~5 그대로, L559~584)
[5] 요소 duplicate (기존 STEP 6 그대로, L599~604)
[6] SVG fillLayer에서도 classifyBodyPieces() 호출
    → svgBodies 배열 획득 (동일하게 x중심 오름차순 정렬)
[7] 스케일 적용: linearScale 계산 (기존 그대로, L626~642)
    - 전체 그룹 resize는 유지 (요소 간 내부 비율 변형 방지)
[8] 개별 배치 루프 (placeElementGroupPerPiece):
    for each pastedItem:
        idx = item.__pieceIdx
        if (idx >= 0 && idx < svgBodies.length):
            target = svgBodies[idx] + item.__relVec * linearScale
        else:
            target = fallbackCenter + item.__relVec * linearScale   // B안 동작
        translate item to target
[9] 레이어 통합 + EPS 저장 (기존 그대로, L665~689)
```

**핵심 전환점**:
- [3]에서 요소별 메타(`__pieceIdx`, `__relVec`)를 부여하고 [8]에서 개별 translate. 그룹 단위 정렬 사라짐.
- **매칭 전략**: 디자인 AI bodies와 SVG bodies는 **x중심 오름차순 정렬 후 인덱스 대응**. 개수 불일치 시 min까지 매칭, 초과분은 fallback.

---

## 3. 새 함수 시그니처

```js
/**
 * 몸판 레이어의 pathItems를 band(띠)와 body(본체 조각)로 분류한다.
 *
 * 분류 규칙:
 *   - band: height < 500pt (경험값, 상수로 관리)
 *   - bodies: 나머지 전부, 그 수에 제한 없음 (N개 지원)
 *   - bodies 배열은 x중심 오름차순으로 정렬되어 각 원소에 idx(0..N-1) 부여
 *
 * @param {Layer} layer - 분석 대상 레이어 (디자인 AI "몸판" 또는 SVG fillLayer)
 * @returns {{
 *   bands:  Array<{cx:number, cy:number, bbox:Array<number>, areaSize:number}>,
 *   bodies: Array<{cx:number, cy:number, bbox:Array<number>, areaSize:number, idx:number}>,
 *   source: "design" | "svg",    // 진단 로그용 표기
 *   pieceCount: number           // bodies.length (편의 필드)
 * }}
 *   bodies가 비어있을 수 있음 (모든 조각이 band로 분류되었거나 레이어가 비었을 때).
 *   호출자는 bodies.length === 0 을 fallback 트리거로 사용한다.
 */
function classifyBodyPieces(layer) { ... }

/**
 * 요소 1개의 소속 body 조각 인덱스를 판별한다.
 *
 * 규칙 (유클리드 거리 기반):
 *   - bodies 배열에서 요소 중심까지의 직선 거리가 최소인 body의 idx 반환
 *   - bodies가 비어있으면 -1 반환 (호출자는 fallbackCenter 사용)
 *   - 거리 동률 시 더 작은 idx 선택 (왼쪽 우선, 결정적 동작)
 *
 * @param {PageItem} elemItem - 대상 요소 (geometricBounds로 중심 계산)
 * @param {Array<{cx:number, cy:number, idx:number}>} bodies - classifyBodyPieces().bodies
 * @returns {number} 매칭된 body의 idx (0..N-1), 또는 -1 (매칭 실패)
 */
function assignElementToPiece(elemItem, bodies) { ... }

/**
 * 요소별 메타(__pieceIdx, __relVec)에 따라 각 요소를 SVG bodies 기준 위치로 개별 translate한다.
 *
 * 동작:
 *   - pastedItems[i].__pieceIdx >= 0 && < svgBodies.length
 *     → target = svgBodies[pieceIdx] + relVec × linearScale
 *   - 그 외 (fallback):
 *     → target = fallbackCenter + relVec × linearScale (B안 동작)
 *
 * @param {Array<PageItem>} pastedItems - 배치 대상 요소 배열 (__pieceIdx, __relVec 메타 필수)
 * @param {Array<{cx:number, cy:number}>} svgBodies - SVG fillLayer classifyBodyPieces().bodies
 * @param {{cx:number, cy:number}} fallbackCenter - fallback용 중심 (SVG fillLayer 합집합 중심)
 * @param {number} linearScale - 면적비 제곱근 (1.0이면 크기 변화 없음)
 */
function placeElementGroupPerPiece(pastedItems, svgBodies, fallbackCenter, linearScale) { ... }
```

---

## 4. 변경 지점 (before/after, 라인 번호)

### 4-1. L387~423 요소 배치 함수군 교체

**before (B안, L388~423)**: `getItemsCenter`, `getLayerCenter`, `placeElementGroup` 3개
- `getItemsCenter`, `getLayerCenter`는 **재사용** (삭제 금지, classify에서 그대로 씀)
- `placeElementGroup` → **제거 또는 폴백용으로 유지**

**after**: 기존 2개 유지 + 새 3개 추가
```
- getItemsCenter        (L388~399, 유지)
- getLayerCenter        (L401~405, 유지)
- placeElementGroup     (L407~423, 제거 또는 "_legacy"로 rename 후 폴백에만 사용)
+ classifyBodyPieces    (신규, ~40줄, bodies 정렬 포함)
+ assignElementToPiece  (신규, ~12줄, 유클리드 거리 한 줄 loop)
+ placeElementGroupPerPiece (신규, ~30줄, pieceIdx 분기 단순화)
```

### 4-2. L527~552 상대벡터 측정 블록 교체

**before (L536~552)**: 단일 `relVec` 계산
```js
var relVec = { dx: 0, dy: 0 };
if (hasBody && hasElements) {
    var dBody = getLayerCenter(designDoc.layers.getByName("몸판"));
    var dElem = getItemsCenter(elemItems);
    if (dBody && dElem) {
        relVec.dx = dElem.cx - dBody.cx;
        relVec.dy = dElem.cy - dBody.cy;
        ...
    }
}
```

**after**: 조각 분류 + 요소별 메타 부여
```js
// B-2안: 몸판 조각 분류 + 요소별 소속/상대벡터 계산
var designPieces = null;
var elemMeta = []; // [{ index, pieceIdx, relVec }, ...] 인덱스 = elemItems와 1:1
var designFallbackCenter = null; // B안 동작 폴백용

if (hasBody && hasElements) {
    var designBodyLayer = designDoc.layers.getByName("몸판");
    designPieces = classifyBodyPieces(designBodyLayer);
    designPieces.source = "design";
    designFallbackCenter = getLayerCenter(designBodyLayer);

    // 좌→우 순서로 cx 리스트 문자열 만들기 (로그용)
    var designCxList = "";
    for (var di = 0; di < designPieces.bodies.length; di++) {
        designCxList += (di>0?",":"") + "body"+di+"="+designPieces.bodies[di].cx.toFixed(1);
    }
    logWrite("[진단] 디자인AI 몸판 분류: bands=" + designPieces.bands.length
        + "개 bodies=" + designPieces.bodies.length + "개 ("+designCxList+")");

    for (var mi = 0; mi < elemItems.length; mi++) {
        var elem = elemItems[mi];
        var elemCenter = getItemsCenter([elem]);
        var pieceIdx = assignElementToPiece(elem, designPieces.bodies);
        var pieceCenter = (pieceIdx >= 0) ? designPieces.bodies[pieceIdx]
                                          : designFallbackCenter;
        var rv = { dx: 0, dy: 0 };
        if (elemCenter && pieceCenter) {
            rv.dx = elemCenter.cx - pieceCenter.cx;
            rv.dy = elemCenter.cy - pieceCenter.cy;
        }
        elemMeta.push({ index: mi, pieceIdx: pieceIdx, relVec: rv });

        // 거리 로그용 계산
        var dist = -1;
        if (elemCenter && pieceCenter) {
            var dxL = elemCenter.cx - pieceCenter.cx;
            var dyL = elemCenter.cy - pieceCenter.cy;
            dist = Math.sqrt(dxL*dxL + dyL*dyL);
        }
        logWrite("[진단] 요소[" + mi + "] 소속 body 인덱스=" + pieceIdx
            + " 거리=" + (dist>=0?dist.toFixed(1):"?")
            + " relVec=(" + rv.dx.toFixed(1) + "," + rv.dy.toFixed(1) + ")");
    }
}
```

### 4-3. L599~655 STEP 6~7 교체

**before (L611~655)**: 그룹화 → 전체 resize → 단일 translate

**after**: 그룹화 후 **resize는 유지** (요소 간 비율 보존), translate만 요소별로 분리. ungroup은 **표준 `app.executeMenuCommand("ungroup")`** 사용 (Q3 추천 확정).

```js
if (pastedItems.length > 0) {
    // --- 그룹화 + 스케일 (기존 그대로 유지) ---
    baseDoc.selection = null;
    for (var si = 0; si < pastedItems.length; si++) pastedItems[si].selected = true;
    app.executeMenuCommand("group");
    var pastedGroup = baseDoc.selection[0];

    var linearScale = 1.0;
    if (baseArea > 0 && targetArea > 0) {
        var areaRatio = targetArea / baseArea;
        linearScale = Math.sqrt(areaRatio);
        if (Math.abs(linearScale - 1.0) > 0.005) {
            var pct = linearScale * 100;
            pastedGroup.resize(pct, pct, true, true, true, true, pct, Transformation.CENTER);
        }
    }

    // --- 그룹 해제 (표준 ungroup 명령) ---
    // pastedItems 배열은 duplicate 시점의 최상위 1레벨 참조만 담고 있어 ungroup 1회만 실행.
    app.executeMenuCommand("ungroup");

    // --- SVG 조각 분류 ---
    var svgPieces = classifyBodyPieces(fillLayer);
    svgPieces.source = "svg";
    var svgFallback = getLayerCenter(fillLayer);

    // 매칭 일치/불일치 판정
    var matchCount = Math.min(designPieces ? designPieces.bodies.length : 0,
                              svgPieces.bodies.length);
    var matchStatus = (designPieces && designPieces.bodies.length === svgPieces.bodies.length)
                    ? "일치" : "불일치";
    logWrite("[진단] SVG 몸판 분류: bands=" + svgPieces.bands.length
        + "개 bodies=" + svgPieces.bodies.length + "개");
    logWrite("[진단] 매칭 결과: designBodies="
        + (designPieces ? designPieces.bodies.length : 0) + "개 svgBodies="
        + svgPieces.bodies.length + "개 (" + matchStatus
        + ", 유효 매칭=" + matchCount + "개)");

    // --- 요소별 개별 배치 ---
    var scaleForPlace = (typeof linearScale === "number" && linearScale > 0) ? linearScale : 1.0;
    placeElementGroupPerPiece(pastedItems, elemMeta, svgPieces.bodies, svgFallback, scaleForPlace);
}
```

**매칭 안전장치**: `placeElementGroupPerPiece` 내부에서 각 요소마다 `if (pieceIdx >= 0 && pieceIdx < svgBodies.length)` 조건을 한 번 더 확인. 조건 불충족 시 fallbackCenter 기반 B안 동작으로 자동 회귀.

### 4-4. 라인 영향 범위 요약

| 구역 | 현재 라인 | 변경 성격 |
|------|-----------|-----------|
| 함수 정의 | L380~423 | 기존 2개 유지 + 신규 3개 추가 (+82줄, 분기 제거로 약간 압축) |
| 상대벡터 측정 | L536~552 | 블록 확장 (+22줄) |
| STEP 7 배치 | L611~655 | translate 로직 교체 (+10줄) |
| 예상 총 증분 | +110줄 | 718줄 → **약 828줄** |

---

## 5. 엣지 케이스 매트릭스

| # | 상황 | 감지 방법 | 처리 |
|---|------|----------|------|
| 1 | bodies.length === 1 (몸판 단일 조각) | `designPieces.bodies.length === 1` | 모든 요소가 bodies[0]에 소속 (유클리드 거리 최단) |
| 2 | bodies.length === 0 (큰 조각 없음, 모두 band로 분류됨) | `designPieces.bodies.length === 0` | 전체 fallback → B안 동작 (합집합 중심 기준) |
| 3 | bodies.length === 2 (띠 없는 앞뒤판) | path 2개 + 둘 다 height ≥ 500 | bands=[], bodies 2개 정상 매칭 |
| 4 | bodies.length === 3 (앞뒷판 + 띠) | path 3개 중 1개만 height<500 | bands=1, bodies=2 |
| 5 | bodies.length >= 4 (소매 포함 등) | 큰 조각 4개 이상 | 각 요소가 가장 가까운 body 선택하므로 **자연 처리**. 특별 로직 불필요. |
| 6 | 띠 구분 실패 (height=480 애매) | 임계값 500pt 경계 | band으로 분류되거나 body로 분류되거나 둘 다 유클리드 거리에서는 일관 동작. 단, body 쪽으로 분류되면 bodies.length가 예상보다 1 증가하므로 디자인 AI vs SVG 매칭에 영향 |
| 7 | 디자인 AI bodies.length ≠ SVG bodies.length | `min(design.length, svg.length)` 까지만 매칭 | 초과 idx를 가진 요소는 fallback (svgBodies 범위 초과 → fallbackCenter 사용) + 경고 로그 |
| 8 | 요소 레이어가 그룹 중첩 | `pageItems[i].typename === "GroupItem"` | `geometricBounds`는 그룹 전체 bbox 반환 → 문제 없음 |
| 9 | 요소가 여러 body에 걸친 큰 오브젝트 | 요소 width > 몸판 width × 0.7 | 유클리드 거리상 가까운 하나로 자동 귀속 (현재 설계에서 특수 처리 없음) |
| 10 | 몸판 레이어 자체 없음 | `hasBody === false` | 기존 B안처럼 전체 스킵 |
| 11 | 디자인 AI와 SVG의 조각 순서 반전 (재정렬됨) | 로그로 cx 순서 비교 | 리스크 A (§7 참조). 현재 설계는 경고만 출력, 자동 보정 없음 |

---

## 6. 진단 로그 추가 목록

grading-debug.log에 다음 5종을 신규 추가:

```
[진단] 디자인AI 몸판 분류: bands=1개 bodies=3개 (body0=142.3,body1=398.7,body2=655.1)
[진단] 요소[0] 소속 body 인덱스=0 거리=172.5 relVec=(18.2,-169.8)
[진단] 요소[1] 소속 body 인덱스=1 거리=140.1 relVec=(21.4,-139.7)
[진단] 요소[2] 소속 body 인덱스=2 거리=155.8 relVec=(-5.5,-120.1)
[진단] SVG 몸판 분류: bands=1개 bodies=3개
[진단] 매칭 결과: designBodies=3개 svgBodies=3개 (일치, 유효 매칭=3개)
[진단] 요소[0] 배치: pieceIdx=0 svg중심=(153.8,454.2) relVec=(18.2,-169.8) scale=1.08 타겟=(173.5,260.5)
[진단] 요소[1] 배치: pieceIdx=1 svg중심=(430.5,454.2) relVec=(21.4,-139.7) scale=1.08 타겟=(453.6,303.3)
```

검증 포인트:
- 디자인AI `body[i]` cx 순서와 SVG `body[i]` cx 순서가 **같은 방향** (모두 좌→우)
- 각 요소의 `relVec` 부호가 디자인/SVG 양쪽에서 일관 (design의 왼쪽 요소는 svg에서도 왼쪽)

---

## 7. 리스크 분석

### 리스크 A — 디자인 AI와 SVG의 조각 순서가 다를 수 있음
- **증상**: 두 도큐먼트가 같은 패턴 템플릿에서 출발했더라도, 레이어 내 path 순서가 재정렬됐거나 반전됐으면 x중심 오름차순 정렬 후에도 `designBodies[0]`와 `svgBodies[0]`가 서로 다른 조각을 가리킬 수 있음. 결과: 요소가 엉뚱한 조각으로 배치됨.
- **대처**:
  1. **x중심 오름차순 정렬**이 1차 방어. 레이어 내 순서 무관하게 좌→우 고정.
  2. `pieceCount` 일치 검증 + 불일치 시 fallback + 경고 로그.
  3. 분류 직후 로그에 bodies cx 리스트 출력 → 사용자가 육안 검증 가능.
  4. 장기 개선: 몸판 조각에 레이어 이름 또는 태그("body-left"/"body-right"/"sleeve-L") 규약 도입 고려 (Q2 미해결, 나중 일반화).

### 리스크 B — 앞뒷판 크기/형태가 유사해 bodies 개수 판정 모호
- **증상**: 앞뒷판이 거의 대칭이면 x중심 차이가 10pt 미만. bodies가 2개 이상이어도 "좌우 구분"이 실질적으로 모호. 단, 현재 설계는 좌우 구분을 필요로 하지 않고 **유클리드 거리 최단 조각**만 찾으므로 배치 자체는 안정.
- **대처**:
  - 유클리드 거리는 대칭 패턴에서도 결정적 동작 (동률 시 더 작은 idx).
  - 로그에 body cx 리스트가 있으므로 사용자가 의심스러우면 수동 검증 가능.

### 리스크 C — ungroup 부작용
- **증상**: `app.executeMenuCommand("ungroup")` 실행 시 디자인 AI에서 온 요소가 **이미 그룹**이었다면 내부 그룹까지 해제되어 구조 파괴.
- **대처**:
  - pastedItems 배열은 duplicate 시점의 **최상위 1레벨** 참조만 담고 있다. ungroup 1회만 실행하면 우리가 만든 그룹만 해제되고 내부 그룹은 유지 (ExtendScript ungroup 동작 규약).
  - Q3 표준 ungroup 추천 확정. 수동 group 해제 로직은 추가 복잡도만 낳으므로 표준 사용.

### 리스크 D — 스케일 타이밍 혼란
- **증상**: 요소별 translate를 scale 전에 하면 relVec의 단위가 디자인 AI 좌표계 그대로라 확대 반영 안 됨. scale 후에 하면 이미 요소들이 전체 그룹 중심 기준으로 확대된 상태라 개별 위치가 흐트러짐.
- **대처**: 스케일은 그룹 기준 `Transformation.CENTER`로 먼저 적용 (요소 내부 비율 유지), 그 다음 ungroup, 그 다음 개별 translate. translate는 "현재 요소 중심 → 타겟"을 매번 다시 계산하므로 스케일 이력과 무관.

### 리스크 E — 디자인 AI vs SVG bodies 개수 불일치
- **증상**: 예상외로 SVG가 추가 조각을 포함하거나 디자인 AI가 일부 조각을 생략한 경우. `designBodies.length ≠ svgBodies.length`.
- **대처**:
  - §4-3에서 `matchCount = min(design, svg)` 계산 후 로그로 "불일치" 경고.
  - `placeElementGroupPerPiece` 내부에서 요소별로 `pieceIdx < svgBodies.length` 확인. 범위 초과 시 fallbackCenter 사용.
  - 결과: 일부 요소만 fallback, 나머지는 정상 조각별 배치. 최악의 경우도 B안 수준.

---

## 8. 롤백 플랜

3단계로 단계별 복원:

### 레벨 1: 파일만 복원 (B안 상태로 즉시 복귀)
```bash
cp illustrator-scripts/grading-B-backup.jsx illustrator-scripts/grading.jsx
```

### 레벨 2: git working tree 롤백 (커밋 전)
```bash
git checkout -- illustrator-scripts/grading.jsx
```

### 레벨 3: 태그로 완전 복원
```bash
# B안 안정판으로 복귀
git checkout stable-B-relpos -- illustrator-scripts/grading.jsx
# 또는 A안(B 이전, 단일 중앙정렬)으로 극단 복원
git checkout stable-A-color-unified -- illustrator-scripts/grading.jsx
```

작업 시작 전 추가 백업 권장:
```bash
cp illustrator-scripts/grading.jsx illustrator-scripts/grading-preB2-backup.jsx
```

---

## 9. 테스트 체크포인트

실행 대상: **2XS, L, XL, 4XL** 4개 사이즈. XL은 원본 기준치, 2XS/4XL은 스케일 극단값.

| # | 체크 포인트 | 판정 기준 | 실패 증상 |
|---|-------------|----------|-----------|
| 1 | XL 결과가 디자인 AI 원본과 육안 일치 | 각 body 조각의 요소가 올바른 위치 | B안의 "전체 한쪽 편향" 해소 |
| 2 | 4XL 요소 위치가 XL 대비 **조각 기준 1.08배**로 확장 | 로그 `relVec`는 동일, `target`이 svgBody 중심 × scale로 증가 | target이 XL과 동일하면 linearScale 미반영 실패 |
| 3 | 2XS 요소 위치가 XL 대비 축소 (linearScale ≈ 0.75) | 각 요소가 자기 조각 중심 쪽으로 수축 | 중심에서 벗어나면 조각 분류 실패 |
| 4 | 디자인 AI `bodies[i].cx` 오름차순 로그 확인 | `[진단] 디자인AI 몸판 분류` 출력에서 cx 값이 좌→우 단조 증가 | 순서 섞이면 정렬 로직 버그 |
| 5 | 요소 소속 분포가 디자인 AI 원본 의도와 일치 | `[진단] 요소[i] 소속 body 인덱스=J` 로그와 원본 위치 대조 | 왼쪽 로고가 idx=1 이상으로 분류되면 assignElementToPiece 버그 |
| 6 | 폴백 모드 동작 확인 (인위적 테스트: 몸판 0개 디자인) | `bodies.length=0`일 때 B안 동작과 동일 결과 | fallback 실패 시 요소 위치 무작위 |
| 7 | 띠가 있는 디자인에서 띠 중심 영향 제거 확인 | band 포함 여부와 무관하게 bodies 중심만 사용 | band 포함 시 중심이 위로 치우침 |
| 8 | bodies.length >= 4 디자인 테스트 (소매 포함) | 각 요소가 가장 가까운 body로 정상 귀속 | 엉뚱한 조각으로 날아가면 유클리드 거리 버그 |
| 9 | 디자인 AI vs SVG bodies 개수 불일치 시나리오 | matchCount=min 까지만 매칭, 초과분 fallback | 스크립트 크래시 시 안전장치 실패 |

---

## 10. 구현 체크리스트 (developer용, 10단계 이내)

1. [ ] `grading-preB2-backup.jsx` 백업 생성
2. [ ] L380~423 구역에 `classifyBodyPieces`, `assignElementToPiece`, `placeElementGroupPerPiece` 3개 함수 **추가** (기존 5개 함수는 유지)
3. [ ] L536~552 상대벡터 측정 블록을 §4-2 after로 교체 (단일 `relVec` 제거, `elemMeta` 배열 생성)
4. [ ] L611~655 STEP 7을 §4-3 after로 교체 (그룹 resize 유지, ungroup 추가, `placeElementGroupPerPiece` 호출)
5. [ ] `linearScale` 변수 스코프 유지 (L626에서 이미 `if` 밖 선언) — 추가 수정 불필요
6. [ ] ExtendScript(ES3) 문법 검증: let/const/화살표/`Math.hypot`/`Array.forEach`/`Array.map` 금지 → 모두 `for (var i=0; i<arr.length; i++)` 사용. 단, `Array.sort(compareFn)`는 사용 가능.
7. [ ] `front/back` 하드코딩 변수 제거 확인 (grep으로 검색, 0건 되어야 함)
8. [ ] XL 사이즈 1회 실행 → 신규 진단 로그 5종 출력 확인
9. [ ] 2XS/L/XL/4XL 4개 실행 → §9 체크포인트 9개 모두 통과
10. [ ] 통과 시 `feat: B-2안 N개 조각별 요소 배치` 커밋 + 태그 `stable-B2-piece-aware`

**ES3 제약 상기**:
- `Array.prototype.sort(compareFn)` OK → `bodies.sort(function(a,b){return a.cx-b.cx;})`
- `Array.prototype.forEach`, `map`, `filter`, `find` 모두 **금지** → for 루프
- `Math.hypot` 없음 → `Math.sqrt(dx*dx + dy*dy)`
- Arrow function (`=>`) 금지 → `function(...){...}`
- `let`/`const` 금지 → 전부 `var`

---

## 11. 예상 구현 규모

| 구분 | 내용 | 줄수 |
|------|------|------|
| 신규 함수 | `classifyBodyPieces` (bodies 배열 + 정렬) | ~40 |
| 신규 함수 | `assignElementToPiece` (유클리드 거리 루프) | ~12 |
| 신규 함수 | `placeElementGroupPerPiece` (pieceIdx 분기 단순화) | ~30 |
| 블록 확장 | 상대벡터 측정 (L536~552) | +22 |
| 블록 확장 | STEP 7 배치 (L611~655) | +10 |
| 진단 로그 | 신규 5종 추가 | +10 |
| **총 순증** | | **+100~120줄** |
| **최종 파일 규모** | 718 → | **약 820~840줄** |

**N개 지원 효과**: front/back 분기 제거로 `assignElementToPiece`와 `placeElementGroupPerPiece` 본체는 오히려 **약간 단순**해짐 (조건문 2개 → 배열 인덱스 1개). `classifyBodyPieces`는 정렬 로직이 추가되어 약간 증가. 총량은 B안 front/back 설계 예상치(+120)와 비슷하거나 조금 적음.

**수정 함수 개수**:
- 신규: 3개 (`classifyBodyPieces`, `assignElementToPiece`, `placeElementGroupPerPiece`)
- 유지: 2개 (`getItemsCenter`, `getLayerCenter` — classifyBodyPieces에서 재사용)
- 제거 또는 폴백 전환: 1개 (`placeElementGroup` → `_legacy` 접미사로 유지 or 완전 제거)
- `main()` 내부 블록 수정: 2곳 (STEP 2 상대벡터 측정, STEP 7 배치)

---

## 12. 미해결 질문

- **Q2 나중 일반화**: 몸판 조각에 레이어 이름/태그("body-L", "sleeve-R") 규약을 디자이너가 직접 부여하는 방식. 현재는 x중심 정렬에 의존하므로 리스크 A 완전 해소 못함. 실제 운영에서 리스크 A가 자주 발생하면 규약 도입 검토 (현 시점 미결정, 다음 이터레이션으로 이관).
- **body vs band 임계값 500pt 검증**: 현재 경험값. 실제 패턴 여러 개 테스트 후 조정 필요 가능성 있음. 상수화해서 쉽게 튜닝 가능하게 유지.
