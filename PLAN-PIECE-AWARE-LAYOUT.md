# PLAN: 조각 인식(Piece-Aware) 기반 요소 배치 재설계 검토

**작성일**: 2026-04-16
**작성자**: planner-architect
**상태**: 사용자 의사결정 대기 (Q1~Q5)
**선행 문서**: `PLAN-GRADING-REDESIGN.md` (D1~D5 옵션), `PLAN-GRADING-RECOVERY.md` (Beta 복구)

---

## 0. 요청 배경

사용자 발화:
> "svg 패턴을 토대로 **색상 채운 패턴 조각을 인식**해서 요소들이 **자리를 찾아가도록** 수정"

### 해석
| 키워드 | 기술적 의미 |
|--------|------------|
| "색상 채운 패턴 조각 인식" | SVG의 **filled path = 진짜 몸판 조각**만 조각으로 등록 (선/가이드 제외) |
| "요소들이 자리를 찾아가도록" | 요소가 어떤 조각에 속하는지 판단 → 타겟 조각 자리로 **따라 이동** |

### 비유
- 지금(D1): "학생 전원을 운동장 정중앙에 줄 세운다" — 교실이 어디든 무시
- 요청(D3): "각 학생이 **원래 자기 교실**을 찾아 그 교실 안에 앉는다" — 교실(조각)이 이동하면 학생도 따라감

---

## 1. 현재 구현 진단

### 1-1. `importSvgPathsToDoc` (grading.jsx 825~931)

```
if (Math.abs(path.width) > 50 && Math.abs(path.height) > 50) {
    // 50pt 이상 = 패턴 조각으로 간주
    ...
    basePieces.push({ bbox, cx, cy, area });
}
```

**문제**: 크기 기준만 있고 **fill 유무 체크 없음**.
- SVG에 큰 장식선/보조선/참조 사각형이 있으면 → 가짜 조각으로 등록됨.
- basePieces.length가 `designPieces.length`와 맞지 않으면 STEP 10에서 **폴백으로 빠짐** (조각 매핑 실패).

### 1-2. `extractPatternPieces` (944~982)

디자인 AI의 **"패턴선" 레이어**에서도 동일하게 50pt 크기 필터만 사용. fill 체크 없음.

### 1-3. STEP 10 D1 모드 (1665~1759)

```
var USE_D1_MODE = true;
if (USE_D1_MODE) {
    // 조각 정보 완전 무시
    // 요소 전체 합집합 bounds → 아트보드 95% 내 clamp → 중심 정렬
}
```

**문제**: `designPieces`, `basePieces`, `elementPieceIndex`, `elementOriginalCenters`를 모두 **미사용**.
- Phase 2 사전 수집 로직(1340~1383)은 그대로 돌지만 결과가 사용되지 않음.
- 조각 정보가 준비되어 있는데도 활용 안 함 → **조각 인식은 이미 70% 구현되어 있음**.

### 1-4. 레거시 `alignElementToPiece` (1071~1091, D1=false일 때만 작동)

```
var newCx = basePiece.cx + relX * linearScale;   // ← 사용자 지적 문제
var newCy = basePiece.cy + relY * linearScale;
```

**문제**: 조각 간격이 벌어지면 `basePiece.cx`가 이동하면서 요소도 같이 밀림 → 아트보드 초과. (PLAN-GRADING-REDESIGN에서 D1으로 회피했던 이유)

---

## 2. 옵션 비교

| 옵션 | 설명 | 난이도 | 예측성 | 아트보드 초과 | 디자이너 재작업 |
|------|------|--------|--------|--------------|----------------|
| **A** | 조각 bbox **상대좌표 매핑** (D3 강화) | ⭐⭐⭐ | 높음 | 자연 방지 | 없음 |
| **B** | **filled path만** 조각 후보 (필터 강화) | ⭐ | 높음 | 무관 | 없음 |
| **C** | 앞판/뒷판 **자동 구분** (x범위 기반) | ⭐⭐ | 중간 | 자연 방지 | 없음 |
| **D** | 디자이너 **레이어 분리** ("앞판/뒷판" 레이어명) | ⭐⭐⭐⭐ | 매우 높음 | 자연 방지 | 필요 |
| **E** | A+B+C 하이브리드 | ⭐⭐⭐⭐ | 최고 | 자연 방지 | 없음 |

### 옵션 A — 상대좌표 매핑 상세

```
Phase 1 (디자인 AI 분석, STEP 4):
  for each element:
      belongingPiece = designPieces 중 element와 교집합 최대인 조각
      rx = (elementCx - piece.left) / piece.width      ← 0~1 정규화
      ry = (elementCy - piece.bottom) / piece.height   ← 0~1 정규화
      stored[i] = { pieceIdx, rx, ry }

Phase 2 (타겟 배치, STEP 10):
  for each element:
      targetPiece = basePieces[stored.pieceIdx]
      newCx = targetPiece.left + rx * targetPiece.width
      newCy = targetPiece.bottom + ry * targetPiece.height
      element.translate(newCx - curCx, newCy - curCy)
      # resize는 전역 linearScale이 이미 적용됨
```

**핵심 장점**: 조각이 벌어져도 요소는 **그 조각 내부에만** 머무름 → 아트보드 초과 자연 방지.

**예시**: 앞판 중앙에 있던 로고(rx=0.5, ry=0.7)는 타겟 앞판이 어디로 이동하든 **앞판 중앙(rx=0.5)** 에 그대로 붙음.

### 옵션 B — filled path 필터

```
if (path.filled && path.fillColor && path.fillColor.typename !== "NoColor"
    && Math.abs(path.width) > 50 && Math.abs(path.height) > 50) {
    basePieces.push(...);
}
```

**장점**: 조각 식별 정확도 급상승. basePieces.length와 designPieces.length 일치율 향상.
**주의**: SVG가 CSS `style="fill:#xxx"` 방식으로 색을 지정한 경우 Illustrator가 `path.filled=true`로 해석하는지 검증 필요. 첫 실측에서 로그로 확인.

### 옵션 C — 앞/뒷판 자동 구분

- 조각 개수가 2개면 왼쪽=앞판, 오른쪽=뒷판
- 요소 중심 x가 중간선 기준 왼/오른쪽으로 분류
- 3조각 이상(소매 등)은 복잡 → C 단독 한계

### 옵션 D — 디자이너 레이어 분리

- "요소 앞판", "요소 뒷판" 레이어 나눠서 AI 저장
- 각 레이어를 해당 조각으로 이동
- **장점**: 가장 명확, 오류 0
- **단점**: 기존 AI 파일 전부 재작업 필요 (수백 개?)

### 옵션 E — 하이브리드

B(filled 필터) + A(상대좌표) + C(앞뒷판 자동구분 보조 매칭) 조합. 최고 정확도.

---

## 3. 권장안: 옵션 B + A 단계적 (Phase 1 → Phase 2)

### 왜 B+A인가
1. **디자이너 재작업 없음** (옵션 D 배제)
2. **조각 인식은 이미 70% 구현** — B로 필터만 정교화, A로 기존 `elementPieceIndex`를 **실제 활용**만 하면 됨
3. **아트보드 초과 자연 방지** — 요소가 조각 내부에만 머물러 D1 clamp가 불필요 (또는 안전망으로만 유지)
4. **단계적** — B만 먼저 검증 → A 도입 시 위험 격리

### Phase 1: 옵션 B (1~2시간, 소규모)

#### 작업 내역
| 파일 | 라인 | 변경 | 비고 |
|------|------|------|------|
| `grading.jsx` | 851 | `importSvgPathsToDoc`: path.filled 조건 추가 | fill 없으면 pattern 레이어로만 복제 (기존 else 분기) |
| `grading.jsx` | 952 | `extractPatternPieces`: path.filled 조건 추가 | 동일 |
| `grading.jsx` | 책 862~867 근처 | 디버그 로그에 `filled=` / `fillColor.typename=` 추가 | 실측 검증용 |

#### 코드 변경 예시 (imortSvgPathsToDoc)

```javascript
// Phase 1: filled 체크 추가
var isRealPiece = (
    path.filled === true &&
    path.fillColor &&
    path.fillColor.typename !== "NoColor" &&
    Math.abs(path.width) > 50 &&
    Math.abs(path.height) > 50
);
if (isRealPiece) {
    // ... basePieces.push (기존 로직)
} else {
    // ... pattern 레이어로만 복제 (기존 else)
}
```

#### 검증 체크리스트
- 실측 1회 (2XS~4XL 전 사이즈)
- `grading-log.txt`에서 `filledCount`가 **진짜 조각 수와 일치**하는지 확인
- `designPieces.length === basePieces.length` 확인
- D1 모드 유지 (USE_D1_MODE=true) — 배치 로직은 아직 변경 안 함

### Phase 2: 옵션 A (3~4시간, 중간 규모)

#### 작업 내역
| 파일 | 라인 | 변경 |
|------|------|------|
| `grading.jsx` | 1375 근처 | `elementOriginalCenters`에 `rx, ry` 추가 (조각 내부 정규화 좌표) |
| `grading.jsx` | 1071 (`alignElementToPiece`) | **신규 D2 함수 추가** `alignElementByRelativeCoord` — basePiece bbox 내부 rx,ry 재투영 |
| `grading.jsx` | 1665 | `USE_D1_MODE` → `LAYOUT_MODE` 확장 ("D1" / "D2" / "LEGACY") |
| `grading.jsx` | 1667~ | D2 분기 추가: `elementPieceIndex[i]` 기반 조각별 배치 + **조각 매핑 실패 시 D1 fallback** |

#### 신규 함수 시그니처

```javascript
/**
 * 조각 bbox 내부 상대좌표(rx, ry)로 요소를 재배치.
 *
 * 비유: "각 학생이 교실 안의 원래 자리(앞문 옆, 칠판 앞)를 찾아간다"
 *
 * @param {PageItem} item
 * @param {number} rx - 0~1, piece.left=0, piece.right=1
 * @param {number} ry - 0~1, piece.bottom=0, piece.top=1
 * @param {Object} targetPiece - { bbox:[l,t,r,b], cx, cy }
 */
function alignElementByRelativeCoord(item, rx, ry, targetPiece) {
    var pl = targetPiece.bbox[0];
    var pt = targetPiece.bbox[1];
    var pr = targetPiece.bbox[2];
    var pb = targetPiece.bbox[3];
    var newCx = pl + rx * (pr - pl);
    var newCy = pb + ry * (pt - pb);
    var ib = item.geometricBounds;
    var curCx = (ib[0] + ib[2]) / 2;
    var curCy = (ib[1] + ib[3]) / 2;
    item.translate(newCx - curCx, newCy - curCy);
}
```

#### rx, ry 계산 (STEP 4 추가)

```javascript
// Phase 2 사전 수집에 rx, ry 추가
if (bestIdx >= 0) {
    var piece = designPieces[bestIdx];
    var pl = piece.bbox[0], pt = piece.bbox[1];
    var pr = piece.bbox[2], pb = piece.bbox[3];
    var rx = (emCx - pl) / (pr - pl);
    var ry = (emCy - pb) / (pt - pb);
    elementOriginalCenters.push({ cx: emCx, cy: emCy, rx: rx, ry: ry });
} else {
    elementOriginalCenters.push({ cx: emCx, cy: emCy, rx: -1, ry: -1 });
}
```

#### 안전망 (중요)
- 조각 매핑 실패 (pieceIdx=-1) → 해당 요소만 D1 중심 이동으로 fallback
- basePieces vs designPieces 수 불일치 → **전체 D1 fallback**
- rx/ry 범위 벗어남 (0~1 이탈) → 요소 중심이 조각 밖 = 경계선 위 → clamp(0,1) 적용 + 경고

### Phase 3 (선택): 옵션 C 보강 (1시간)

- 조각이 2개면 앞뒷판 자동 판정
- Phase 2의 매핑 보조 (x 위치로도 확증)
- **Phase 2 실측이 만족스러우면 생략 가능**

---

## 4. 기술 리스크

| 리스크 | 확률 | 완화 |
|--------|------|------|
| SVG CSS fill이 `path.filled`로 안 잡힘 | 중 | Phase 1 실측 로그로 확인 → 안 잡히면 `fillColor !== null` 우회 |
| 조각 수 불일치 (SVG vs AI) | 중 | 전체 D1 fallback + 경고 로그 |
| 요소 중심이 여러 조각에 걸침 | 낮 | 이미 구현됨 (`findBestMatchingPiece` 교집합 최대) |
| rx/ry 범위 초과 (경계 위 요소) | 중 | clamp(0,1) + 경고 |
| 사용자 "요소 간격 고정" 선호와 충돌 | **높음** | **Q2에서 재확인 필수** |
| baseArea 기반 linearScale과 조각별 스케일 불일치 | 낮 | D2는 위치만 조각 기준, 스케일은 linearScale 유지 |

### Q2 리스크 상세
PLAN-GRADING-REDESIGN에서 사용자 Q1=A(요소 간격 "고정" 선호)로 D1이 선택됨. 그런데 이번 요청은 "조각 자리 찾아가기" = **요소 간격 벌어짐 허용** 뉘앙스. **Q2에서 재확인 필수**.

---

## 5. 사용자 의사결정 체크리스트 (Q1~Q5)

### Q1. 조각 인식 범위
- [ ] **A**: Phase 1(B)만 먼저 (1~2h) → 실측 후 Phase 2 판단 **(권장)**
- [ ] B: Phase 1+2 한 번에 (5~6h)
- [ ] C: Phase 1+2+3 전체 (6~7h)

### Q2. 요소 간격 정책 (중요)
- [ ] **A**: 조각 따라감 — 사이즈 커지면 요소 간격도 벌어짐 **(이번 요청 해석)**
- [ ] B: 요소 간격 고정 — 조각 벌어져도 요소는 원래 비율 유지 (→ D1 유지, 이번 요청 취소)

### Q3. 조각 수 불일치 대응
- [ ] **A**: 전체 D1 fallback + 경고 로그 **(권장)**
- [ ] B: x 순서대로 매칭 (수 다르면 앞에서 n번째끼리)
- [ ] C: 크기 유사도로 매칭

### Q4. 조각 밖 요소 처리
- [ ] **A**: rx/ry clamp(0,1) + 경고 **(권장)**
- [ ] B: 가장 가까운 조각으로 매핑 후 배치 (이미 findBestMatchingPiece가 거리 폴백)
- [ ] C: 해당 요소만 D1 중심 이동 폴백

### Q5. 검증 방식
- [ ] **A**: 2XS/L/4XL 3사이즈 실측 후 판정 **(권장)**
- [ ] B: 전 사이즈(2XS~4XL) 일괄 실측
- [ ] C: 사용자가 별도 판단

---

## 6. 예상 시간 / 파일 변경 범위

| Phase | 시간 | 변경 함수/라인 | 위험 |
|-------|------|---------------|------|
| Phase 1 (B) | 1~2h | `importSvgPathsToDoc` L851, `extractPatternPieces` L952 | 낮음 |
| Phase 2 (A) | 3~4h | 신규 `alignElementByRelativeCoord`, STEP 4 L1375, STEP 10 L1665 | 중간 |
| Phase 3 (C) | 1h | 신규 `detectFrontBack` 보조 판정 | 낮음 (선택) |
| **합계** | **5~7h** | | |

롤백: Phase 1은 조건 2줄 제거, Phase 2는 `LAYOUT_MODE="D1"` 한 줄 변경.

---

## 7. 완료 기준 (정의)

Phase 1 완료:
- [ ] `filledCount`와 육안 몸판 조각 수 일치
- [ ] `designPieces.length === basePieces.length` (2XS~4XL 전 사이즈)
- [ ] 기존 D1 동작 무변경 (배치는 그대로)

Phase 2 완료:
- [ ] 요소가 사이즈별로 "같은 조각 같은 자리"에 위치
- [ ] 아트보드 초과 0건 (D1 clamp 없이도)
- [ ] 사용자 육안 검수 OK

---

## 8. 참고 파일

- `C:\0. Programing\grader\illustrator-scripts\grading.jsx`
  - L825~931: `importSvgPathsToDoc`
  - L944~982: `extractPatternPieces`
  - L1010~1050: `findBestMatchingPiece` (재활용)
  - L1071~1091: `alignElementToPiece` (Phase 2에서 D2로 대체)
  - L1340~1383: STEP 4 Phase 2 사전 수집
  - L1665~1759: STEP 10 D1 모드 (Phase 2에서 D2 분기 추가)
- `C:\0. Programing\grader\PLAN-GRADING-REDESIGN.md` (D1~D5 옵션)
- `C:\0. Programing\grader\PLAN-GRADING-RECOVERY.md` (Beta 복구)
