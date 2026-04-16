# grading-v2 문제 분석 보고서 (2026-04-16)

분석 대상: `illustrator-scripts/grading.jsx` (v2, 607줄)
비교 대상: `illustrator-scripts/grading-v1-backup.jsx` (v1, 2128줄)

## 요약

| 가설 | 판정 | 핵심 원인 |
|------|------|----------|
| 1. 4XL 색상 채우기 실패 | **맞다 (강한 확신)** | SVG의 몸판 조각이 `<g>` 그룹으로 묶여있는 사이즈에서 `importPatternPaths`(L254–313)가 그룹 내부 path를 순회하지 않아 fill 복제가 0건 → 몸판 색상 누락. |
| 2. 요소 배치 기준 좌표 | **부분적으로 맞다** | 현재 `alignToBodyCenter`(L321–346)는 `fillLayer.pageItems` 합집합 bounds 중심을 쓴다. 4XL에서 가설 1로 fillLayer가 비면 `items.length === 0` 조기 리턴(L324)해 요소가 원래 위치에 남는다. 패턴선 기준(또는 아트보드 기준) 폴백은 증상 완화에만 유효. |
| 3. 교체용요소 간섭 | **틀리다** | v2는 `designDoc.layers.getByName("요소")`(L450)로 정확한 이름만 필터. baseArea도 `"패턴선"` 레이어만(L435). "교체용요소"는 어느 경로에도 섞이지 않는다. v1 파일에도 "교체용요소" 문자열이 grep으로 0건. |

## 가설 1: 4XL 색상 채우기 실패

### 현재 코드 흐름 (라인 번호)

1. **STEP 4~5** L482: `importPatternPaths(svgDoc, baseDoc, mainColor, fillLayer, patternLayer)` 호출
2. 함수 본체 L254–313:
   - L258 `for (var li = 0; li < svgDoc.layers.length; li++)` — SVG 레이어 순회
   - L262 `var pathN = src.pathItems.length;` — **레이어 직속 pathItems만** 카운트
   - L263 `for (var pi = pathN - 1; pi >= 0; pi--)` 역순 path 순회
   - L266 `if (Math.abs(path.width) > 50 && Math.abs(path.height) > 50)` 50pt 필터
   - L271 `path.duplicate(fillLayer, ElementPlacement.PLACEATEND)` — **fillLayer로 복제되는 유일한 경로**
   - L276–282 원본 filled면 `toCMYK` 유지, 아니면 `mainColor` 적용
3. **그룹 처리** L306–309:
   ```
   for (var gi = groupN - 1; gi >= 0; gi--) {
       src.groupItems[gi].duplicate(patternLayer, ElementPlacement.PLACEATEND);
   }
   ```
   - **GroupItem은 patternLayer로만** 복제, fillLayer로는 절대 가지 않음
   - 그룹 내부 path는 펼치지 않고 통째 복제

### 4XL만 실패하는 원인

사용자 image 7의 "패턴선 레이어 하위 `<패..>` 3개"가 결정적 단서다.

- SVG 파일에서 `<g id="패..">` 구조는 Illustrator로 열릴 때 **GroupItem**이 된다. ExtendScript에서 `layer.pathItems`는 **레이어 직속 path만** 반환하며 그룹 내부 path는 포함하지 않는다.
- L/2XS 사이즈 SVG는 path가 레이어에 평평하게 들어있어 L262 순회로 모든 조각을 잡을 수 있다 → 색상 OK.
- 4XL 사이즈 SVG는 path가 `<g>`로 묶여있어 L262의 `pathItems.length`가 0 또는 매우 적고, 실제 조각은 L306 `groupItems` 경로로 **patternLayer에만** 복제된다.
- 결과: `filledCount=0`, `targetArea=0` → L488 "50pt 이상 조각 없음" 경고 → L526 `baseArea > 0 && targetArea > 0` 조건 실패 → 스케일 생략 → fillLayer 비어 출력 EPS는 선만 있고 **전부 흰색**.

### 제안 수정 방향 (코드 없이)

1. **재귀 수집 함수 도입**: `collectAllPathsDeep(container)` 헬퍼가 PathItem + GroupItem 재귀 탐색해서 모든 하위 path를 평평한 배열로 반환.
2. **50pt 필터를 GroupItem에도 적용**: GroupItem의 `width`/`height`가 크면 내부 path를 fillLayer로 복제, 작으면 patternLayer로만.
3. **단순 대안**: SVG 열자마자 `app.executeMenuCommand("selectall") → app.executeMenuCommand("ungroup")`을 반복해 그룹을 풀어버린 뒤 기존 로직 유지.
4. **검증 로그 필수**: `filledCount`가 예상치보다 현저히 작으면 즉시 경고 출력.

## 가설 2: 요소 배치 기준 좌표

### 현재 기준

`alignToBodyCenter(elementGroup, fillLayer)` L321–346:
- L328 `var items = fillLayer.pageItems;` — **fillLayer 아이템 (= 몸판 fill 복제본들)**
- L329–334 각 아이템 `geometricBounds` 합집합으로 minX/maxX/minY/maxY 계산
- L335–336 `bodyCx, bodyCy` = 합집합 중심
- L339–342 요소 그룹 중심을 그 지점으로 translate

### 패턴선 기준으로 바꿨을 때 예상 효과

- **가설 1 해결된 정상 상태**: fillLayer 중심 ≈ patternLayer 중심 ≈ 아트보드 중심 → **기준 변경 효과 거의 없음**.
- **가설 1 미해결(현재 4XL)**: fillLayer 비어 L324 `items.length === 0 return`으로 조기 종료 → 요소가 원본 SVG 좌표 그대로 남음. 패턴선/아트보드 기준이면 최소한 중앙 근처로 이동은 됨 → **증상 일부 완화**.

### 결론

가설 2는 가설 1의 증상을 완화하는 **보조 방어**로만 의미가 있고 **근본 해결책은 아니다**.

### 주의할 점

- 몸판이 아트보드에 대해 비대칭이면 "아트보드 중심" ≠ "몸판 중심". 사용자 의도가 "요소는 몸판 위"라면 몸판 중심이 정답.
- patternLayer에는 너치/가이드선/50pt 미만 조각까지 포함 → **중심이 바깥으로 편향**될 수 있음.
- **2XS 요소 과대**는 기준 좌표와 별개 문제일 가능성. sqrt(areaRatio) 계산에서 2XS SVG도 그룹 구조면 가설 1 영향으로 `targetArea`가 축소 왜곡 → `linearScale`이 제대로 작아지지 않아 요소가 상대적으로 큼.

### 구체 제안

- **단순**: `alignToBodyCenter`에 폴백 체인 추가. fillLayer 비면 patternLayer, 그것도 비면 `baseDoc.artboards[0].artboardRect` 중심 사용.

## 가설 3: 교체용요소 간섭

### 현재 요소 수집 로직 (L445–454)

```
var elemItems = [];
if (hasElements) {
    var elemLayer = designDoc.layers.getByName("요소");
    for (var ei = 0; ei < elemLayer.pageItems.length; ei++) {
        elemItems.push(elemLayer.pageItems[ei]);
    }
}
```

- L406–411 `hasElements`는 **이름이 정확히 "요소"** 일 때만 true.
- L450 `layers.getByName("요소")`는 완전 일치 반환. "교체용요소"는 제외.
- L502–505 STEP 6 duplicate도 `elemItems`만 순회.

### 교체용요소가 섞이는지

**섞이지 않음.** 모든 요소 수집 경로가 이름 "요소"로 엄격 한정.

### baseArea 계산도 오염 없음

- L433–443 STEP 2: `layers.getByName("패턴선")`로 **패턴선만** 계산.
- L208 `calcLayerArea`는 인자 레이어의 직속 pathItems만 합산.

### 4XL 요소 크기 과소의 진짜 원인

**가설 1.** `importPatternPaths`가 그룹 내부 path를 놓쳐 `targetArea=0` → L526 조건 실패 → `linearScale` 계산/적용 생략(L540 "면적 계산 불가 - 스케일 생략") → 요소는 원본 크기 그대로 배치 → 4XL 아트보드 대비 상대적으로 작음.

### 영향 범위

**가설 3은 기각.** 레이어 이름이 엄격 일치라 간섭 경로 없음.

## 종합 결론 및 우선순위

1. **(치명) 가설 1 수정 — 그룹 내부 path 재귀 수집**
   - 증상: 4XL 몸판 색상 전체 누락 + 스케일 무력화
   - 제안: `importPatternPaths`에 재귀 수집 헬퍼, 또는 SVG 열자마자 ungroup 반복
   - 검증: 4XL SVG에서 `svgDoc.layers[0].pathItems.length` vs `groupItems.length` + 그룹 내부 `pathItems.length` 로그

2. **(보조) 가설 2 부분 — 기준 좌표 폴백 체인**
   - 증상: fillLayer 비면 정렬 no-op
   - 제안: fillLayer → patternLayer → artboardRect 순 폴백

3. **(기각) 가설 3** — 이름 필터 엄격, 간섭 불가

## 추가 발견

### A. RGB 문서 체크 약화
L398–400에서 `documentColorSpace !== CMYK`면 경고만 하고 진행. v1은 L765 `isRgbDocument`로 중단 가능.

### B. 기본 레이어 제거 타이밍 중복
L495 빈 defaultLayer 제거 + L554–571 finalLayer로 통합하며 fillLayer/designLayer/patternLayer 제거. 기능 문제는 없지만 중복.

### C. 요소 resize 기준
L537 `resize(..., Transformation.CENTER)`는 **그룹 자체 중심** 기준. 이후 L544에서 몸판 중심으로 translate — 순서 OK.

### D. baseArea vs targetArea 측정 대상 비대칭 (잠재 버그)
- `baseArea` = 디자인 AI **"패턴선" 레이어만**(L436–438)
- `targetArea` = SVG **모든 레이어** 50pt 이상 path 합(L258 `svgDoc.layers` 전체 순회)
- 디자인 AI가 다중 레이어이고 SVG가 단일 레이어라면 분자/분모 기준이 달라 `linearScale`이 왜곡. 사이즈별 SVG 레이어 수가 다르면 사이즈별로 다른 오차가 생김.

### E. STEP 7 group 명령 후 selection 가정
L521–522 `app.executeMenuCommand("group")` 후 `pastedGroup = baseDoc.selection[0]`. selection getter가 문서 포커스/타이밍 따라 배열이 비거나 다른 아이템을 반환할 위험.
