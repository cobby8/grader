# 띠(band) 개별 이동 설계 (B-3안: band도 조각별 상대벡터 배치)

- 대상 파일: `C:\0. Programing\grader\illustrator-scripts\grading.jsx` (현재 879줄)
- 출발점: B-2안 완료 상태 (`stable-B2-piece-aware` 태그, 커밋 `a5a5bf9`)
- 선행 문서: `PLAN-POSITION-PIECE-AWARE.md` (430줄, N개 body 분류 + 요소 개별 배치)
- 변경 성격: **band 배치 로직 추가**. body/요소 배치, 스케일, 색상, 임포트 파이프라인은 그대로 유지.

---

## 1. 개념 요약

B-2안은 "요소(로고, 넘버 등)"만 조각별 개별 배치를 한다. **몸판 레이어의 띠(band)는 SVG 원본 좌표 그대로 방치**되어, 아트보드 최상단에 덩그러니 남거나 몸판과 뚝 떨어져 보이는 증상이 있다 (2XS에서 특히 심함).

B-3안은 **요소 개별 배치 메커니즘을 band에도 그대로 적용**한다. 디자인 AI에서 각 band가 "가장 가까운 body 조각으로부터 얼마나 떨어져 있는지"를 상대벡터로 측정해두고, SVG에서는 각 band를 "대응되는 svgBody + 스케일된 상대벡터" 위치로 개별 translate한다. body 자체는 건드리지 않는다 (SVG 원본 좌표가 정답).

**비유**: body는 "자석"이고 band는 "자석에 붙는 작은 금속 조각"이다. 자석 위치는 고정(SVG 좌표)이고, 금속 조각은 디자인 AI에서 측정한 "자석과의 거리" 그대로 SVG의 자석 옆으로 이동한다.

---

## 2. 기존 인프라 재사용

| 기존 자산 | 재사용 방법 |
|-----------|-------------|
| `classifyBodyPieces` (L420~458) | 그대로 호출. 이미 `{ bands: [], bodies: [] }` 둘 다 반환 중. **수정 불필요**. |
| `assignElementToPiece` (L462~482) | 그대로 호출. band 중심도 "점 하나"이므로 body와의 최단 거리 계산에 적용 가능. 단, 파라미터 이름이 `elemItem`이라 의미적으로 band에도 써도 되게 **이름 의미를 주석으로 확장**. |
| `getItemsCenter` (L388~399) | 그대로. band 중심 계산용으로 재사용. |
| `placeElementGroupPerPiece` (L486~529) | **건드리지 않음**. band는 별도 헬퍼 함수(`placeBandsPerPiece`)로 분리. 이유: band는 그룹화/스케일 단계를 거치지 않고 fillLayer에 이미 존재하는 path를 그대로 translate하므로 API가 다르다. |

요약: 신규 함수 1개(`placeBandsPerPiece`)만 추가. 나머지는 호출만 추가.

---

## 3. 알고리즘 단계

```
[1] STEP 1 (디자인 AI 열기) ~ STEP 2 (기준 면적 계산) : 기존 그대로
[2] B-2안의 "디자인 AI 조각 분류" 블록(L650~691)에서 designPieces를 이미 만든다.
    → designPieces.bands[] 가 이미 존재 (B-2안은 사용만 안 할 뿐 데이터는 있음)
[3] 신규: 디자인 AI band 상대벡터 측정 루프
    for each band in designPieces.bands:
        pieceIdx = assignElementToPiece(band(의사-item), designPieces.bodies)
        relVec   = bandCenter - bodies[pieceIdx].center
        bandMeta.push({ index, pieceIdx, relVec })
    ※ band는 PathItem 원본이 아니라 {cx, cy, bbox} 형태이므로
      "의사-item" 처리 또는 center 기반 별도 헬퍼(assignCenterToPiece) 사용
[4] STEP 3~6 (새 문서 생성, 패턴 임포트, 요소 duplicate) : 기존 그대로
[5] STEP 7 스케일 (그룹 resize) : 기존 그대로 (요소에만 적용)
[6] 신규: SVG 조각 분류 직후(기존 L788 svgPieces 생성 위치 재사용) 
    svgPieces.bands[] 가 이미 존재 → 별도 호출 불필요
[7] 신규: SVG band 이동 루프 (placeBandsPerPiece)
    for each svgBand[i] (i = 0..matchCount-1):
        baseBody = svgPieces.bodies[ bandMeta[i].pieceIdx ]
        target   = baseBody.center + bandMeta[i].relVec * linearScale
        translate svgBand[i] path to target
    ※ svgPieces.bands[i]는 PathItem이 아닌 {cx,cy,bbox} 스냅샷이므로
      실제 translate 대상 PathItem 참조를 classifyBodyPieces가 함께 담아야 함 (§5 참고)
[8] STEP 8~9 (레이어 통합, EPS 저장) : 기존 그대로
```

**핵심 전환점**:
- [3] 디자인 AI band 메타 부여: 요소 메타 루프와 동일한 패턴
- [7] SVG band translate: 요소 배치 루프와 동일한 패턴 (단, 대상이 band path)

---

## 4. 새 변수/메타 구조

### 4-1. bandMeta 배열 (디자인 AI 측정 단계에서 생성)

```js
// bandMeta[i] = {
//   index: i,           // designPieces.bands 배열 내 인덱스
//   pieceIdx: number,   // 소속 body의 idx (0..N-1), bodies.length===0 이면 -1
//   relVec: { dx, dy }  // bandCenter - bodies[pieceIdx].center
// }
var bandMeta = [];
```

elemMeta와 구조가 동일하다 (재사용 관점에서 의도적으로 맞춤).

### 4-2. classifyBodyPieces 반환 구조 확장 (band에 path 참조 추가)

**현재(B-2안)**:
```js
result.bands.push({ cx, cy, bbox, areaSize });
```

**B-3안 추가**:
```js
result.bands.push({ cx, cy, bbox, areaSize, pathRef: p });
//                                          ^^^^^^^^^^^^^^ 신규
// pathRef = 원본 PathItem 참조. translate 대상.
// 디자인 AI에서는 pathRef를 사용하지 않음 (center만 있으면 됨).
// SVG에서만 pathRef를 써서 실제 path를 translate.
```

bodies 쪽도 동일하게 `pathRef`를 추가해도 되지만 **body는 이동하지 않으므로 추가 불필요**.

---

## 5. band 매칭 전략 (설계자 권고안)

### 권고: **x중심 오름차순 정렬 후 인덱스 대응**
B-2안의 body 매칭과 **동일 전략**을 쓴다.

- `classifyBodyPieces`는 이미 bodies를 x중심 오름차순으로 정렬한다. **bands도 같은 정렬 적용**.
- 디자인 AI bands[i] ↔ SVG bands[i] 가 인덱스로 대응.

### 이유
1. **일관성**: body와 매칭 전략이 같으면 디버깅 쉽다. "좌→우 순서" 한 가지 규칙만 기억하면 된다.
2. **결정성**: x중심 정렬은 레이어 내 path 순서와 무관하게 고정된다.
3. **대부분 케이스 해결**: 티셔츠/상의 패턴에서 띠는 보통 "소매단 좌/우" 또는 "밑단 1개" 구조라 x중심 정렬이 자연스럽다.

### 대안 검토 및 기각 이유
- **y 오름차순**: 소매단 좌/우 띠가 같은 y라서 동률 발생 → 결정적 동작 어려움.
- **bbox 크기 내림차순**: 크기가 비슷한 띠가 여러 개면 동률. 디자인 AI와 SVG에서 scale 차이로 순서 바뀔 수 있음.
- **소속 body + 좌/우 라벨**: 복잡도 증가. 레이어 이름 규약 필요 (향후 일반화, 리스크 A와 묶어 이관).

### 구현 변경
```js
// classifyBodyPieces 함수 내 bodies.sort 뒤에 bands도 같은 방식으로 정렬 추가
result.bodies.sort(function(a,b){ return a.cx - b.cx; });
result.bands.sort(function(a,b){ return a.cx - b.cx; }); // 신규 1줄
for (var j = 0; j < result.bands.length; j++) result.bands[j].idx = j; // 신규
```

---

## 6. 변경 지점 (before/after, 라인 번호)

### 6-1. L420~458 `classifyBodyPieces` 확장

**before** (B-2안):
```js
for (var i = 0; i < layer.pathItems.length; i++) {
    var p = layer.pathItems[i];
    var b = p.geometricBounds;
    ...
    var piece = { cx: cx, cy: cy, bbox: b, areaSize: areaSize };
    if (h < BODY_BAND_HEIGHT_THRESHOLD) result.bands.push(piece);
    else                                result.bodies.push(piece);
}
result.bodies.sort(function(a,b){ return a.cx - b.cx; });
for (var j = 0; j < result.bodies.length; j++) result.bodies[j].idx = j;
```

**after** (B-3안, +4줄):
```js
for (var i = 0; i < layer.pathItems.length; i++) {
    var p = layer.pathItems[i];
    var b = p.geometricBounds;
    ...
    var piece = { cx: cx, cy: cy, bbox: b, areaSize: areaSize, pathRef: p };
    //                                                        ^^^^^^^^^^^^^^ 신규: band translate 대상
    if (h < BODY_BAND_HEIGHT_THRESHOLD) result.bands.push(piece);
    else                                result.bodies.push(piece);
}
result.bodies.sort(function(a,b){ return a.cx - b.cx; });
result.bands.sort(function(a,b){  return a.cx - b.cx; });           // 신규
for (var j = 0; j < result.bodies.length; j++) result.bodies[j].idx = j;
for (var k = 0; k < result.bands.length;  k++) result.bands[k].idx  = k;  // 신규
```

### 6-2. L486~529 뒤 신규 헬퍼 함수 추가 (`placeBandsPerPiece`)

**신규** (~35줄):
```js
// SVG bands[i]를 대응 svgBody + scale된 relVec 위치로 개별 translate
// bandMeta[i] 와 svgBands[i] 는 인덱스 1:1 대응 (둘 다 x중심 오름차순 정렬)
function placeBandsPerPiece(svgBands, bandMeta, svgBodies, fallbackCenter, linearScale) {
    if (!svgBands || svgBands.length === 0) return;
    var scale = (typeof linearScale === "number" && linearScale > 0) ? linearScale : 1.0;
    var matchCount = Math.min(svgBands.length, bandMeta ? bandMeta.length : 0);

    for (var i = 0; i < svgBands.length; i++) {
        var svgBand = svgBands[i];
        if (!svgBand || !svgBand.pathRef) continue;

        // 메타 범위 초과 → 이 band는 디자인 AI에 대응이 없음 (그대로 두고 경고)
        var meta = (i < matchCount) ? bandMeta[i] : null;
        if (!meta) {
            logWrite("[진단] SVG band[" + i + "] 메타 없음 - 이동 생략 (원본 좌표 유지)");
            continue;
        }

        var pieceIdx = meta.pieceIdx;
        var relVec   = meta.relVec || { dx: 0, dy: 0 };

        var baseCenter = null;
        var mode = "";
        if (pieceIdx >= 0 && svgBodies && pieceIdx < svgBodies.length) {
            baseCenter = svgBodies[pieceIdx];
            mode = "piece";
        } else {
            baseCenter = fallbackCenter;  // bodies.length===0 케이스
            mode = "fallback";
        }
        if (!baseCenter) {
            logWrite("[진단] SVG band[" + i + "] baseCenter 없음 - 생략");
            continue;
        }

        var targetCx = baseCenter.cx + relVec.dx * scale;
        var targetCy = baseCenter.cy + relVec.dy * scale;

        // 현재 band 중심 → 타겟. geometricBounds 재조회 (스케일/변형 이후 좌표 반영)
        var gb = svgBand.pathRef.geometricBounds;
        var curCx = (gb[0] + gb[2]) / 2;
        var curCy = (gb[1] + gb[3]) / 2;
        svgBand.pathRef.translate(targetCx - curCx, targetCy - curCy);

        logWrite("[진단] SVG band[" + i + "] 이동(" + mode + "): pieceIdx=" + pieceIdx
            + " svg중심=(" + baseCenter.cx.toFixed(1) + "," + baseCenter.cy.toFixed(1) + ")"
            + " relVec=(" + relVec.dx.toFixed(1) + "," + relVec.dy.toFixed(1) + ")"
            + " scale=" + scale.toFixed(4)
            + " 타겟=(" + targetCx.toFixed(1) + "," + targetCy.toFixed(1) + ")");
    }
}
```

### 6-3. L650~691 디자인 AI 측정 블록 확장 (band 메타 측정 추가)

**before** (B-2안): 요소 메타만 만들고 종료.

**after** (B-3안, +25줄): 요소 메타 루프 뒤에 band 메타 루프 추가.
```js
// (기존: 요소 메타 루프 L664~690)
...

// --- B-3안 신규: band 상대벡터 측정 ---
// 왜 지금: designDoc이 닫히기 전, designPieces.bands cx/cy 가 확정된 시점.
// 각 band를 "요소처럼" 취급해 가장 가까운 body idx와 상대벡터를 기록.
var bandMeta = [];
if (hasBody && designPieces && designPieces.bands.length > 0) {
    for (var bi = 0; bi < designPieces.bands.length; bi++) {
        var bandPiece = designPieces.bands[bi];
        // bandCenter는 이미 bandPiece.cx/cy로 존재
        // assignElementToPiece는 PageItem을 받으므로 의사-item 대신 직접 계산
        var bPieceIdx = -1;
        if (designPieces.bodies.length > 0) {
            var bestIdx = 0;
            var bestDist = -1;
            for (var bj = 0; bj < designPieces.bodies.length; bj++) {
                var dxB = bandPiece.cx - designPieces.bodies[bj].cx;
                var dyB = bandPiece.cy - designPieces.bodies[bj].cy;
                var dB = Math.sqrt(dxB*dxB + dyB*dyB);
                if (bestDist < 0 || dB < bestDist) { bestDist = dB; bestIdx = bj; }
            }
            bPieceIdx = bestIdx;
        }
        var bBase = (bPieceIdx >= 0) ? designPieces.bodies[bPieceIdx] : designFallbackCenter;
        var bRv = { dx: 0, dy: 0 };
        if (bBase) {
            bRv.dx = bandPiece.cx - bBase.cx;
            bRv.dy = bandPiece.cy - bBase.cy;
        }
        bandMeta.push({ index: bi, pieceIdx: bPieceIdx, relVec: bRv });
        logWrite("[진단] 디자인AI band[" + bi + "] 소속 body 인덱스=" + bPieceIdx
            + " relVec=(" + bRv.dx.toFixed(1) + "," + bRv.dy.toFixed(1) + ")");
    }
} else {
    logWrite("[진단] 디자인AI bands 없음 - band 이동 스킵 예정");
}
```

> **왜 assignElementToPiece를 안 쓰고 인라인 계산**: 해당 함수는 `geometricBounds`를 호출하는 PageItem 의존. band는 이미 `{cx, cy}` 스냅샷이라 PageItem 접근 불필요. 함수 오버로드 대신 인라인이 명확. (대안: `assignCenterToPiece(cx, cy, bodies)` 헬퍼 추출도 가능 — 본 설계는 인라인 선택, 구현자 판단으로 헬퍼 추출 허용)

### 6-4. L749~819 STEP 7 배치 블록 확장 (band 이동 호출 추가)

**before** (B-2안): `placeElementGroupPerPiece` 호출로 종료.

**after** (B-3안, +8줄): 요소 배치 호출 직후 band 이동 호출.
```js
// --- 요소별 개별 배치 (기존 L816) ---
placeElementGroupPerPiece(pastedItems, elemMeta, svgPieces.bodies, svgFallback, scaleForPlace);

// --- B-3안 신규: band 개별 이동 ---
// 왜 요소 배치 뒤: band는 fillLayer path이므로 요소 그룹 해제(ungroup)와 무관.
// 실행 순서는 요소↔band 상호 영향 없음. 로그 가독성 위해 요소 다음으로 배치.
if (svgPieces.bands.length > 0 && bandMeta.length > 0) {
    var bandMatchStatus = (bandMeta.length === svgPieces.bands.length) ? "일치" : "불일치";
    logWrite("[진단] band 매칭 결과: designBands=" + bandMeta.length
        + "개 svgBands=" + svgPieces.bands.length + "개 (" + bandMatchStatus + ")");
    placeBandsPerPiece(svgPieces.bands, bandMeta, svgPieces.bodies, svgFallback, scaleForPlace);
} else {
    logWrite("[진단] band 이동 스킵: design bands=" + bandMeta.length
        + ", svg bands=" + svgPieces.bands.length);
}
```

### 6-5. 라인 영향 범위 요약

| 구역 | 현재 라인 | 변경 성격 | 증분 |
|------|-----------|-----------|------|
| `classifyBodyPieces` | L420~458 | 정렬/idx + pathRef 추가 | +4 |
| `placeBandsPerPiece` | L529 뒤 신규 | 신규 함수 | +45 |
| 디자인 AI 측정 블록 | L650~691 뒤 | band 루프 추가 | +25 |
| STEP 7 배치 | L816 뒤 | band 호출 추가 | +10 |
| **예상 총 증분** | | | **+80~90줄** |
| **최종 파일 규모** | 879 → | | **약 960~970줄** |

---

## 7. 엣지 케이스 매트릭스

| # | 상황 | 감지 방법 | 처리 |
|---|------|----------|------|
| 1 | bands.length === 0 (띠 없는 단순 티셔츠) | `designPieces.bands.length===0` | bandMeta=[] → STEP 7에서 `placeBandsPerPiece` 자체를 호출 안 함. 로그 "스킵" |
| 2 | design bands 개수 ≠ svg bands 개수 | `bandMeta.length !== svgPieces.bands.length` | `matchCount = min(design, svg)` 까지만 매칭. 초과 svg band는 "메타 없음" 로그 + 원본 좌표 유지 |
| 3 | bodies.length === 0 (디자인 AI에 몸판이 모두 band 크기) | `designPieces.bodies.length===0` | bandMeta 생성 시 pieceIdx=-1, relVec=(0,0). placeBandsPerPiece에서 fallbackCenter(=fillLayer 합집합 중심) 기준 이동 |
| 4 | SVG에는 band가 있지만 design에는 없음 | `bandMeta.length===0 && svgBands.length>0` | 전체 스킵 (band 원본 좌표 유지). 로그 "design bands=0 → svg band 이동 보류" |
| 5 | design에는 band가 있지만 SVG에는 없음 | `bandMeta.length>0 && svgBands.length===0` | 스킵. placeBandsPerPiece가 첫 줄에서 `if (!svgBands || svgBands.length===0) return` |
| 6 | band 1개, body 2개 (좌우 몸판 + 밑단) | 일반 케이스 | bandPiece는 두 body 중 더 가까운 쪽(유클리드) 선택. 대부분 중간 정도라 어느 쪽이든 결과 유사. body 간 대칭이면 부록 로그로 확인 가능 |
| 7 | band가 2개, body가 1개 (소매단 2개 + 단일 본체) | `bodies.length===1, bands.length===2` | 두 band 모두 pieceIdx=0 (유일한 body). relVec만 서로 다르게 측정되어 양옆으로 독립 이동 |
| 8 | 스케일 linearScale이 1.0 (원본 크기) | `baseArea===0 || targetArea===0` | scale=1.0 으로 translate 그대로. 디자인 AI 좌표 그대로 재현 |
| 9 | pathRef가 PathItem이 아닌 CompoundPathItem | `p.typename === "CompoundPathItem"` | classifyBodyPieces는 `layer.pathItems`만 순회해 CompoundPath 배제. band가 CompoundPath로 되어있으면 누락 → 별도 케이스(향후 개선) |
| 10 | svgBand 이동 후 band가 body와 겹침 | 육안 확인 | 현재 설계는 겹침 검사 없음. 디자인 AI에서 band가 body "위"에 있었으면 그 상대 관계가 SVG에서도 재현되므로 의도된 동작. 리스크 C 참조 |

---

## 8. 진단 로그 추가 목록

기존 B-2안 로그에 3종 추가:

```
[진단] 디자인AI band[0] 소속 body 인덱스=0 relVec=(12.3,-234.7)
[진단] 디자인AI band[1] 소속 body 인덱스=1 relVec=(-8.1,-241.2)
[진단] band 매칭 결과: designBands=2개 svgBands=2개 (일치)
[진단] SVG band[0] 이동(piece): pieceIdx=0 svg중심=(153.8,454.2) relVec=(12.3,-234.7) scale=1.08 타겟=(167.1,200.7)
[진단] SVG band[1] 이동(piece): pieceIdx=1 svg중심=(430.5,454.2) relVec=(-8.1,-241.2) scale=1.08 타겟=(421.7,193.7)
```

검증 포인트:
- band relVec의 dy가 보통 **음수** (body보다 "아래" 좌표 = 실제 화면 "위쪽", 일러 Y 반전 주의)
- SVG band 이동 후 타겟 y 값이 대응 body cy 보다 위쪽 (일러 좌표 기준 큰 값)
- design vs svg 매칭 "일치" 상태가 대부분

---

## 9. 리스크 분석

### 리스크 A — 디자인 AI band가 body 위쪽에 있다는 가정 검증 필요
- **증상**: 설계는 "디자인 AI의 band-body 상대 관계가 자연스러운 배치"라는 전제. 만약 디자인 AI도 SVG와 마찬가지로 band가 아트보드 상단에 덩그러니 있다면 relVec이 **엄청난 음수 dy**가 되어 SVG에서도 똑같이 상단으로 날아감 → 아무것도 개선 안 됨.
- **확인 방법**: 구현 전 디자인 AI 1개 열어서 몸판 레이어의 band 위치를 육안 확인. 또는 B-3 첫 실행 후 `[진단] 디자인AI band[i] relVec` 로그의 dy 크기 점검.
- **대처**:
  - 전제가 틀리면 B-3은 적용 무의미. B-2로 복귀.
  - 대안: "band를 body 경계에 스냅" 로직 (band bbox top을 body bbox bottom에 붙임 등) 검토. 본 설계 범위 외.

### 리스크 B — design vs svg band 개수 불일치
- **증상**: 디자인 AI는 소매단+밑단 총 3개 band, SVG는 밑단 1개만. 매칭 idx=0 은 잘 되지만 idx=1,2 의 bandMeta가 SVG에서 참조 안 됨.
- **대처**:
  - placeBandsPerPiece에서 `matchCount = min(design, svg)`로 처리. 초과 idx는 자연 스킵.
  - 로그 "불일치" 경고.
  - 반대 케이스(svg가 더 많음)는 svg 초과 band가 "메타 없음 - 이동 생략" 처리되어 원본 좌표 유지 (개선 없지만 크래시 없음).

### 리스크 C — 이동된 band가 body와 겹치거나 아트보드 밖으로 나감
- **증상**: 디자인 AI에서 band가 body bbox 안에 살짝 들어가 있으면, 스케일 적용 시 band 위치가 body 내부로 깊이 들어갈 수 있음. 또는 linearScale이 매우 크면 band가 아트보드 밖으로 튀어 나감.
- **대처**:
  - 겹침은 의도된 동작 (디자인 AI 원본 재현). 시각 문제면 디자인 AI 원본부터 수정.
  - 아트보드 밖 이탈은 linearScale 극단값(4XL 이상) 테스트 시 육안 확인. 필요 시 clamp 로직 추가 (본 설계 범위 외).

### 리스크 D — band가 CompoundPathItem인 경우 누락
- **증상**: `layer.pathItems`만 순회하므로 CompoundPath로 된 band는 분류 누락 → bandMeta 없음.
- **대처**:
  - 현재 B-2안이 이미 동일 제약을 가지며 bodies 분류도 동일. 패턴 디자인 컨벤션으로 CompoundPath 금지 권고. 발견되면 errors.md에 기록.

### 리스크 E — translate 누적 오차
- **증상**: band.translate는 현재 중심 → 타겟으로 이동. SVG 원본 좌표를 기준 삼으므로 1회 translate. 여러 번 호출되면 누적되지만 본 설계는 band마다 1회만 호출.
- **대처**: placeBandsPerPiece는 단일 호출. 안전.

---

## 10. 롤백 플랜

### 레벨 1: 파일만 복원 (B-2안 상태 즉시 복귀)
```bash
cp illustrator-scripts/grading-B2-backup.jsx illustrator-scripts/grading.jsx
```

### 레벨 2: git working tree 롤백 (커밋 전)
```bash
git checkout -- illustrator-scripts/grading.jsx
```

### 레벨 3: 태그로 완전 복원
```bash
# B-2안 안정판으로 복귀
git checkout stable-B2-piece-aware -- illustrator-scripts/grading.jsx
```

**구현 전 추가 백업 필수**:
```bash
cp illustrator-scripts/grading.jsx illustrator-scripts/grading-preB3-backup.jsx
```

---

## 11. 테스트 체크포인트

실행 대상: **2XS, L, XL, 4XL** 4개 사이즈.

| # | 체크 포인트 | 판정 기준 | 실패 증상 |
|---|-------------|----------|-----------|
| 1 | 디자인 AI의 band-body 시각 관계가 SVG에 재현 | XL 결과에서 band가 body 위/아래 상대 위치 유지 | band가 여전히 아트보드 최상단에 남음 → 리스크 A |
| 2 | 2XS에서 band가 body 위에 자연스럽게 붙음 | 2XS 결과 육안 | 2XS에서 band가 body와 분리 (이전 문제 재현) → 메타 측정 실패 |
| 3 | 4XL에서 band가 body 위에 자연스럽게 붙음 (스케일 반영) | 4XL 결과 육안 + 로그 scale=linearScale | scale 미반영 → placeBandsPerPiece의 scale 파라미터 실패 |
| 4 | 로그 "일치" 경고 예상대로 출력 | `[진단] band 매칭 결과: ... (일치)` | "불일치" 뜨면 리스크 B |
| 5 | bodies.length=0 테스트 (인위적) | 폴백 동작 확인 | 크래시하면 fallbackCenter 처리 실패 |

---

## 12. 구현 체크리스트 (developer용)

1. [ ] `grading-preB3-backup.jsx` 백업 생성 (`cp illustrator-scripts/grading.jsx illustrator-scripts/grading-preB3-backup.jsx`)
2. [ ] L420~458 `classifyBodyPieces` 수정: `piece`에 `pathRef: p` 추가 + `bands.sort` + `bands[k].idx=k` (총 +4줄)
3. [ ] L529 뒤 `placeBandsPerPiece` 함수 신규 추가 (§6-2 코드, ~45줄)
4. [ ] L691 뒤(디자인 AI 측정 블록 끝) band 메타 측정 루프 신규 추가 (§6-3 코드, ~25줄). `bandMeta` 변수는 `hasBody && hasElements` 바깥(main 함수 스코프)에 선언 — STEP 7에서 참조 필요
5. [ ] L816 `placeElementGroupPerPiece` 호출 뒤 band 이동 블록 신규 추가 (§6-4 코드, ~10줄)
6. [ ] ExtendScript(ES3) 문법 검증: `let/const/arrow/Math.hypot/forEach/map` 금지. 모두 `for (var)` + `Math.sqrt` + `function(){}`
7. [ ] XL 사이즈 1회 실행 → 신규 진단 로그 3종 출력 확인 (`디자인AI band[i]`, `band 매칭 결과`, `SVG band[i] 이동`)
8. [ ] 2XS/L/XL/4XL 4개 실행 → §11 체크포인트 5개 모두 통과
9. [ ] 통과 시 `feat: B-3안 band도 조각별 상대벡터 배치` 커밋 + 태그 `stable-B3-band-aware`

**ES3 재확인**: `Array.prototype.sort(compareFn)` OK, `Math.min(a, b)` OK, 객체 리터럴 OK.

---

## 13. 예상 구현 규모

| 구분 | 내용 | 줄수 |
|------|------|------|
| `classifyBodyPieces` 확장 | pathRef + bands sort + idx | +4 |
| 신규 함수 | `placeBandsPerPiece` | +45 |
| 디자인 AI band 측정 루프 | bandMeta 생성 | +25 |
| STEP 7 band 호출 블록 | placeBandsPerPiece 호출 + 로그 | +10 |
| **총 순증** | | **+80~90줄** |
| **최종 파일 규모** | 879 → | **약 960~970줄** |

**수정 함수 개수**:
- 신규: 1개 (`placeBandsPerPiece`)
- 확장: 1개 (`classifyBodyPieces` 4줄 추가)
- 유지: 기존 모든 함수 (`getItemsCenter`, `getLayerCenter`, `assignElementToPiece`, `placeElementGroupPerPiece`)
- `main()` 내부 블록 추가: 2곳 (디자인 AI 측정 뒤 band 루프, STEP 7 끝 band 호출)

---

## 14. 미해결 질문

1. **[중요] 디자인 AI 원본에서 band가 body 위쪽에 자연스럽게 위치하는가?** (리스크 A)
   - 구현 전 1회 육안 확인 필요. 만약 디자인 AI도 band가 아트보드 상단 분리 상태라면 본 설계 무의미.
2. **band 매칭 전략 권고 수락 여부**: x중심 오름차순 인덱스 매칭. 대안(y 정렬, 크기 정렬, 라벨 규약)은 §5 기각 근거 참고.
3. **bodies.length=0 케이스 fallback 동작 범위**: 현재 설계는 fillLayer 합집합 중심 기준. 이 케이스가 실제 발생하면 별도 처리가 필요할 수 있음 (논의 후 결정).
4. **CompoundPathItem band 지원 여부**: 현재 누락. 필요 시 별도 PR.
