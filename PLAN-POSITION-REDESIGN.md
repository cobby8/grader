# 요소 배치 로직 재설계 (B안: 디자인 AI 상대 위치 보존)

- 대상 파일: `C:\0. Programing\grader\illustrator-scripts\grading.jsx` (현재 674줄)
- 안전망: git tag `stable-A-color-unified` (d8e404b) + 백업 `illustrator-scripts/grading-A-backup.jsx`
- 상태: 면적/스케일 검증 완료 (XL→4XL 실측 1.082 vs 코드 1.078, 오차 0.4%)
- 변경 성격: 정렬 로직만 교체. 스케일/색상/임포트 파이프라인은 그대로 유지.

---

## 1. 현재 코드 분석

### 관련 함수 위치

| 위치 | 역할 |
|------|------|
| L385-410 `alignToBodyCenter(elementGroup, fillLayer)` | **교체 대상**. fillLayer 전체 bbox 합집합 중심 = 이동 타겟으로 사용 |
| L444-671 `main()` | 전체 파이프라인 (STEP 0~9) |
| L457-521 STEP 1~2 | 디자인 AI 오픈, baseArea 계산, 요소 레퍼런스 수집 (**여기서 상대 벡터 측정 추가**) |
| L566-577 STEP 6 | 요소 duplicate 후 designDoc close (**close 직전에 측정 끝나야 함**) |
| L579-614 STEP 7 | 그룹화 + resize + alignToBodyCenter 호출 (**호출 시그니처 변경 지점**) |
| L203-240 `extractBodyColor` | 몸판 레이어 접근 예시 (pathItems/pageItems fallback 패턴 참고) |

### 현재 데이터 흐름

1. `fillLayer`의 모든 pageItem bbox 합집합 → 몸판 SVG 중심 `(bodyCx, bodyCy)`
2. 요소 그룹 bbox 중심 → `(grpCx, grpCy)`
3. `translate(bodyCx - grpCx, bodyCy - grpCy)` → 요소 그룹 중심을 SVG 몸판 중심으로 옮김

### 현재 방식이 놓치는 것

- 디자인 AI에서 요소가 몸판 중심에 있었는지, 가슴에 있었는지 **모른다** (상대 위치 정보를 버린다).
- `fillLayer`는 앞판+뒤판+띠 3개 합집합 → 중심이 띠 쪽으로 치우침.
- 스케일(linearScale)을 위치에는 반영하지 않음.

---

## 2. B안 데이터 흐름

### 핵심 아이디어
디자인 AI가 닫히기 **전에** 두 중심을 측정하고 차이를 상수로 저장한다.
```
(dxDesign, dyDesign) = 디자인요소중심 - 디자인몸판중심
```
SVG 쪽에서는 이 상수를 스케일에 맞춰 **확대**한 뒤 SVG 몸판 중심에 더해 최종 위치를 만든다.
```
최종요소중심 = SVG몸판중심 + (dxDesign * linearScale, dyDesign * linearScale)
```

### 새/수정 함수 시그니처

```js
// 여러 pageItem의 합집합 bbox 중심. layer든 아이템 배열이든 OK.
function getItemsCenter(items) // returns {cx, cy} 또는 null

// 레이어 전체 요소 중심 (디자인 AI에서 "요소" 레이어 대상)
function getLayerCenter(layer) // returns {cx, cy} 또는 null

// alignToBodyCenter 대체
function placeElementGroup(elementGroup, svgBodyCenter, relVec, linearScale)
//   svgBodyCenter = {cx, cy}
//   relVec = {dx, dy}  (디자인 AI에서 측정된 값)
//   linearScale = number (1.0 = 등가)
```

### 디자인 AI 닫히기 전(L577 이전)에 반드시 측정할 값

1. `designBodyCenter = getLayerCenter(designDoc.layers.getByName("몸판"))`
2. `designElemCenter = getLayerCenter(designDoc.layers.getByName("요소"))` (또는 elemItems 합집합)
3. `relVec = { dx: designElemCenter.cx - designBodyCenter.cx, dy: designElemCenter.cy - designBodyCenter.cy }`

---

## 3. 변경 지점 (before/after)

### 3-1. L385-410 `alignToBodyCenter` → `placeElementGroup` 로 교체

**before (현재)**
```js
function alignToBodyCenter(elementGroup, fillLayer) {
    // fillLayer 전체 bbox 중심 계산 → bodyCx, bodyCy
    // elementGroup bbox 중심 → grpCx, grpCy
    // translate(bodyCx - grpCx, bodyCy - grpCy)
}
```

**after**
```js
// 합집합 bbox 중심 유틸 (재사용)
function getItemsCenter(items) {
    if (!items || items.length === 0) return null;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < items.length; i++) {
        var b = items[i].geometricBounds; // [L, T, R, B] (Y위가 큼)
        if (b[0] < minX) minX = b[0];
        if (b[1] > maxY) maxY = b[1];
        if (b[2] > maxX) maxX = b[2];
        if (b[3] < minY) minY = b[3];
    }
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

function getLayerCenter(layer) {
    if (!layer) return null;
    return getItemsCenter(layer.pageItems);
}

// 요소 그룹을 SVG몸판중심 + (상대벡터 * 스케일) 위치로 이동
function placeElementGroup(elementGroup, svgBodyCenter, relVec, linearScale) {
    if (!elementGroup || !svgBodyCenter || !relVec) return;
    var scale = (typeof linearScale === "number" && linearScale > 0) ? linearScale : 1.0;
    var targetCx = svgBodyCenter.cx + relVec.dx * scale;
    var targetCy = svgBodyCenter.cy + relVec.dy * scale;
    var gb = elementGroup.geometricBounds;
    var grpCx = (gb[0] + gb[2]) / 2;
    var grpCy = (gb[1] + gb[3]) / 2;
    elementGroup.translate(targetCx - grpCx, targetCy - grpCy);
    logWrite("[진단] 최종배치 svg몸판=(" + svgBodyCenter.cx.toFixed(1) + "," + svgBodyCenter.cy.toFixed(1)
        + ") relVec=(" + relVec.dx.toFixed(1) + "," + relVec.dy.toFixed(1)
        + ") scale=" + scale.toFixed(4)
        + " 타겟=(" + targetCx.toFixed(1) + "," + targetCy.toFixed(1) + ")"
        + " 이동=(" + (targetCx - grpCx).toFixed(1) + "," + (targetCy - grpCy).toFixed(1) + ")");
}
```

### 3-2. L497-521 STEP 2 뒤 (요소 레퍼런스 수집 직후) - 상대 벡터 측정

**before**
```js
var elemItems = [];
if (hasElements) {
    var elemLayer = designDoc.layers.getByName("요소");
    for (var ei = 0; ei < elemLayer.pageItems.length; ei++) {
        elemItems.push(elemLayer.pageItems[ei]);
    }
}
```

**after**: 아래 블록을 바로 뒤에 추가
```js
// B안: 디자인 AI의 (요소중심 - 몸판중심) 상대 벡터 측정
var relVec = { dx: 0, dy: 0 }; // 폴백 기본값
if (hasBody && hasElements) {
    var dBody = getLayerCenter(designDoc.layers.getByName("몸판"));
    var dElem = getItemsCenter(elemItems); // elemItems 배열 직접 사용
    if (dBody && dElem) {
        relVec.dx = dElem.cx - dBody.cx;
        relVec.dy = dElem.cy - dBody.cy;
        logWrite("[진단] 디자인AI 몸판중심=(" + dBody.cx.toFixed(1) + "," + dBody.cy.toFixed(1)
            + ") 요소중심=(" + dElem.cx.toFixed(1) + "," + dElem.cy.toFixed(1)
            + ") 상대벡터=(" + relVec.dx.toFixed(1) + "," + relVec.dy.toFixed(1) + ")");
    } else {
        logWrite("[진단] 디자인AI 중심 측정 실패 → relVec=(0,0) 폴백 (현행 B안 = 기존 중앙정렬)");
    }
}
```

### 3-3. L580-614 STEP 7 - 호출부 교체

**before (L611)**
```js
alignToBodyCenter(pastedGroup, fillLayer);
```

**after**
```js
// SVG 쪽 몸판 중심은 fillLayer 합집합으로 계산 (기존 방식 재사용)
var svgBodyCenter = getLayerCenter(fillLayer);
if (!svgBodyCenter) {
    logWrite("[진단] SVG 몸판중심 없음 - 배치 생략");
} else {
    // linearScale은 STEP 7 앞쪽에서 계산됨. 스케일 미적용 케이스 대비해 스코프 확장 필요.
    var scaleForPlace = (typeof linearScale === "number" && linearScale > 0) ? linearScale : 1.0;
    logWrite("[진단] SVG 몸판중심=(" + svgBodyCenter.cx.toFixed(1) + "," + svgBodyCenter.cy.toFixed(1) + ")"
        + " 사용 스케일=" + scaleForPlace.toFixed(4));
    placeElementGroup(pastedGroup, svgBodyCenter, relVec, scaleForPlace);
}
```

**주의**: `linearScale` 변수는 L595 `if (baseArea > 0 && targetArea > 0)` 블록 안에서 선언됨 → 블록 밖으로 끌어내거나 `var linearScale = 1.0`을 `if` 앞에 미리 선언해야 한다.

---

## 4. 엣지 케이스

| 상황 | 처리 |
|------|------|
| 디자인 AI에 "몸판" 레이어 없음 | `hasBody=false` → `relVec=(0,0)` 폴백 = 기존 중앙정렬과 동일 동작 |
| 디자인 AI에 "요소" 레이어 없음 | 기존처럼 STEP 7 전체 스킵 (L612 `else`) |
| baseArea 또는 targetArea 0 | `linearScale=1.0` 폴백. 위치는 스케일 미반영 상대 벡터로 계산 |
| 몸판 레이어 안에 여러 조각(앞판/뒤판/띠) | 합집합 bbox 중심 사용. 디자인 AI와 SVG 둘 다 같은 방식이라 **대칭성 유지** = OK. 띠 편향 문제는 SVG에만 있는 게 아니라 양쪽 모두 같이 가지므로 상쇄됨 |
| 몸판이 그룹 내부에 중첩 | `getItemsCenter`는 `pageItems.geometricBounds` 사용 → 그룹 전체 bbox 포함. 내부까지 재귀 불필요 |

---

## 5. 추가 진단 로그

기존 로그 유지에 더해:

```
[진단] 디자인AI 몸판중심=(X,Y) 요소중심=(X,Y) 상대벡터=(dx,dy)
[진단] SVG 몸판중심=(X,Y) 사용 스케일=S
[진단] 최종배치 svg몸판=(X,Y) relVec=(dx,dy) scale=S 타겟=(X,Y) 이동=(tx,ty)
```

검증 포인트: 4XL 로그의 `이동` 값이 XL 로그의 `이동` 값의 약 1.08배이면 정상.

---

## 6. 리스크와 회피

### 리스크 A — 디자인 AI의 "몸판" 구조가 그룹 중첩
- 증상: `layer.pageItems[i].geometricBounds`가 빈 그룹 bbox로 찍혀 중심이 엉뚱함.
- 회피: 재귀 없이도 `pageItems`가 그룹이면 **그룹의 geometricBounds**가 내부 path 합집합을 이미 반영하므로 문제 없음. 단 `geometricBounds`(스트로크 제외) 대신 `visibleBounds`가 필요한 상황은 아님 (스트로크 두께가 중심에 영향 주지 않음).
- 만약 문제 발생 시: `getItemsCenter` 내부에 PathItem만 추출하는 재귀 추가.

### 리스크 B — SVG fillLayer 중심도 띠 포함
- 원래 걱정이던 "띠 때문에 중심이 위로 치우친다" 문제가 SVG 쪽에도 여전히 존재.
- 대칭 효과: **디자인 AI 몸판도 같은 구조(앞판+뒤판+띠)라면 양쪽 편향이 상쇄되어 상대 벡터가 옳게 작동한다**. B안이 A안보다 나은 이유가 정확히 이것.
- 만약 SVG와 디자인 AI의 몸판 구성이 다르면(예: 디자인에는 띠 없음): 로그로 중심 y값 차이 확인 후 `몸판` 하위에서 "앞판"만 선택하는 로직 추가 필요. 현재는 **필요하지 않으면 하지 않는다**.

---

## 7. 롤백 플랜

변경 전 작업:
```bash
# 현재 상태 추가 백업 (B안 작업 전)
cp illustrator-scripts/grading.jsx illustrator-scripts/grading-preB-backup.jsx
```

롤백 3단계 (상황별):

1. **파일만 되돌리기** (git 이력 유지, 가장 가벼움):
   ```bash
   cp illustrator-scripts/grading-A-backup.jsx illustrator-scripts/grading.jsx
   ```
2. **git working tree 롤백** (아직 커밋 안 한 경우):
   ```bash
   git checkout -- illustrator-scripts/grading.jsx
   ```
3. **마지막 안정판으로 전체 롤백** (이미 커밋된 경우):
   ```bash
   git checkout stable-A-color-unified -- illustrator-scripts/grading.jsx
   # 또는 필요 시 전체 리셋
   git reset --hard stable-A-color-unified
   ```

---

## 8. 테스트 시나리오

실행 대상: 2XS, L, 4XL 3개 사이즈.

| # | 체크 포인트 | 실패 판정 |
|---|-------------|----------|
| 1 | YONSEI 로고가 **앞판 가슴 중앙**(디자인 AI와 같은 상대 위치)에 온다 | 로고가 띠 위나 배꼽 아래로 내려오면 실패 |
| 2 | 4XL 로고가 L보다 **약간 아래**(dy * 1.08만큼 확장) | L과 4XL 로고 위치가 동일하면 스케일 미반영 실패 |
| 3 | 2XS 로고가 L보다 **약간 위**(dy가 음수면 더 음수로) | 같으면 실패 |
| 4 | `grading-debug.log`의 `상대벡터`가 모든 사이즈에서 **동일** (디자인 AI 한 번만 읽으므로) | 사이즈마다 다르면 측정 버그 |
| 5 | `최종배치 이동` 값이 `XL:4XL = 1 : 1.082` 비율로 증가 | 비율이 1:1이면 스케일 미반영 |

---

## 9. 구현 체크리스트 (developer용)

1. [ ] `grading-preB-backup.jsx` 백업 생성
2. [ ] L385-410 `alignToBodyCenter` 제거, `getItemsCenter` / `getLayerCenter` / `placeElementGroup` 3개 함수 추가
3. [ ] L514 `elemItems` 수집 직후, 상대 벡터 측정 블록 삽입 (§3-2 after)
4. [ ] L593 `linearScale` 변수 선언을 `if (baseArea > 0 && targetArea > 0)` 블록 밖으로 이동 (`var linearScale = 1.0;` 선언 + if 안에서 재할당)
5. [ ] L611 `alignToBodyCenter(pastedGroup, fillLayer);` → §3-3 after 블록으로 교체
6. [ ] ExtendScript 문법 검증: `#target illustrator` 또는 AI에서 실행해 구문 오류 없는지 (ES3 제약: let/const/화살표 금지)
7. [ ] L 사이즈 1회 실행 → grading-debug.log의 `[진단] 디자인AI` / `[진단] SVG` / `[진단] 최종배치` 3줄 모두 출력 확인
8. [ ] 2XS/L/4XL 3개 실행 → §8 체크포인트 통과
9. [ ] 통과 시 git commit (`feat: B안 상대위치 보존 배치`)
10. [ ] 실패 시 §7 롤백 후 원인 분석

---

## 예상 구현 규모

- **제거**: `alignToBodyCenter` 26줄 (L385-410)
- **추가**:
  - `getItemsCenter` + `getLayerCenter` + `placeElementGroup` ≈ 35줄
  - STEP 2 뒤 상대 벡터 측정 블록 ≈ 15줄
  - STEP 7 호출부 교체 ≈ 10줄 (기존 1줄 대체)
- **수정**: `linearScale` 스코프 이동 2줄
- **순증**: +36줄 내외, 총 710줄 규모
- **수정 함수 개수**: 신규 3개, 교체 1개 (alignToBodyCenter → placeElementGroup), main() 블록 2곳 수정
