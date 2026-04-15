# 사이즈택 자동 교체 기능 — 타당성 검토 보고서

> **작성일**: 2026-04-15
> **작성자**: planner-architect
> **상태**: 🟡 **배포 후 진행 예정** (사용자 결정)

🎯 **한 줄 결론**: **두 기능 모두 기술적으로 완전히 가능**. 단, 각 기능의 실현성/난이도/디자이너 부담이 크게 다름. **권장안 = 기능 2(텍스트 교체)를 Phase 1로 먼저, 기능 1(요소 스왑)은 Phase 2로 분리**. 비유하면 — 기능 2는 "편지 주소 한 줄만 바꾸기"(쉽고 위험 적음), 기능 1은 "편지에 붙은 스티커를 통째로 교체하기"(가능하지만 정렬 기준과 스티커 보관함 규칙을 먼저 정해야 함).

---

## [A] 현재 시스템 흐름 파악 (실측)

**유저 플로우 → grading.jsx까지 사이즈가 흐르는 경로**
| 단계 | 파일 | 변수/키 | 사이즈 값 예 |
|------|------|--------|------------|
| ① 사이즈 체크 | `SizeSelect.tsx:191 toggleSize()` | `selectedSizes: Set<string>` | `"XL"` |
| ② 세션 저장 | `SizeSelect.tsx:242 saveGenerationRequest` | `GenerationRequest.selectedSizes: string[]` | `["S","M","L","XL","XXL"]` |
| ③ 세션 로드 | `FileGenerate.tsx:124 loadGenerationRequest` | 동일 | 동일 |
| ④ 루프 | `FileGenerate.tsx:281 for (const targetSize)` | `targetSize: string` | `"XL"` |
| ⑤ config 작성 | `FileGenerate.tsx:319~333` | `config: Record<string,string>` (객체에 주입) | `patternSvgPath` 등 |
| ⑥ 파일명 | `FileGenerate.tsx:311` | `${baseFileName}_${targetSize}.eps` | `유니폼A_XL.eps` |
| ⑦ jsx 수신 | `grading.jsx:1044 readConfig()` | `config.*` | (현재 sizeName 키 없음) |

**중요 실측 사실**:
- **현재 config에는 `sizeName` 필드가 없다**. `grading.jsx` 내 `targetSize/sizeName/sizeLabel` 검색 결과 0건. 즉 jsx는 "내가 지금 어느 사이즈를 그리는지" 모른다.
- **AI 레이어 구조 (확정)**: 디자인 AI는 **3개 레이어** 필수 보유 — `"패턴선"` / `"요소"` / `"몸판"` (grading.jsx:20~22, 1091/1106/1148/1155).
  - `"요소"` = 스트라이프/로고/텍스트/번호/**사이즈택** (= 이번 건의 대상)
  - `"몸판"` = 배경색 패턴 조각
  - `"패턴선"` = 윤곽선

**선결 조건(공통 인프라)**: config에 `sizeName` 추가. 한 줄이면 끝.
```ts
// FileGenerate.tsx:319 근처
config.sizeName = targetSize;
```
```js
// grading.jsx:1052 근처
var sizeName = (config && config.sizeName) ? String(config.sizeName) : "";
```

---

## [B] 기능 1: 사이즈택 요소 통째 교체 — 3개 접근법 비교

비유: "유니폼에 바코드 스티커를 붙이는 방식". 세 가지 방식이 있다.

| 접근법 | 비유 | 디자이너 부담 | 구현 복잡도 | 신뢰성 | 권장 |
|--------|------|-------------|------------|--------|------|
| **A. 사이즈별 AI 프리셋 5개** | "S/M/L/XL/XXL 5장의 스티커를 각각 준비해서 상자에 보관 → 프로그램이 해당 사이즈 스티커를 꺼내 붙임" | 중 (매 디자인마다 AI 5개 제작) | 중 | 높음 (원본 벡터 그대로 복제) | 권장 |
| **B. 단일 AI + 5개 레이어/심볼, visible 토글** | "한 장의 스티커에 5개 버전이 겹쳐있고, 해당 사이즈만 보이게 켬" | 낮음 (AI 1개만 관리) | 중 | 중 (레이어명 규칙 어기면 전부 실패) | 보조안 |
| **C. SVG 기반 템플릿** | "스티커를 SVG 형태로 5개 업로드" | 높음 (AI→SVG 변환 5회, CMYK 보존 어려움) | 낮음 | 낮음 (SVG 저장 시 CMYK 손실 위험) | 비추천 |

**권장: A (사이즈별 AI 프리셋)**

**위치 식별 규칙**:
- **R1. 이름 규칙**: `"요소"` 레이어 내 그룹 중 이름이 `"사이즈택"`인 것 — 단순·명확·재귀 탐색 불필요. **권장**
- R2. 하위 레이어 분리, R3. 색상/좌표 마커 — 비권장

**구현 흐름 (약식)**:
```
STEP 4-A (기존 STEP 4 직전 삽입):
  try {
    var tagGroup = findNamedGroupInLayer(elemLayer, "사이즈택");
    if (tagGroup && sizeName) {
      var presetAiPath = getSizeTagPresetPath(designId, sizeName);
      if (presetFileExists) {
        var origBounds = tagGroup.geometricBounds;
        var origCenter = {cx:(l+r)/2, cy:(t+b)/2};
        app.open(presetFile);
        var newTag = duplicateAllItemsToGroup(presetDoc, designDoc);
        presetDoc.close(DONOTSAVECHANGES);
        newTag.position = offsetBy(newTag.geometricBounds, origCenter);
        tagGroup.remove();
      }
    }
  } catch(e) { /* 사이즈택 없으면 조용히 스킵 */ }
```

**면적 스케일링과의 상호작용**: 프리셋 AI는 **최종 실제 크기로 제작**하거나 linearScale 통과에 맡기는 것 중 선택. → **결정 필요**.

---

## [C] 기능 2: "XL" 작은 글씨 자동 변경 — 3개 접근법 비교

비유: "유니폼 안쪽에 작은 라벨 하나만 사이즈에 맞게 바꾸는 것".

| 접근법 | 비유 | 디자이너 부담 | 오탐 위험 | 권장 |
|--------|------|-------------|----------|------|
| **P1. placeholder 패턴 `{SIZE}`** | "빈칸 뚫어놓기. 프로그램이 채워 넣음" | 낮음 | 거의 없음 | 권장 |
| P2. 특정 TextFrame 이름/레이어 | "작은 라벨에 이름 붙이기" | 중 | 없음 | 보조 |
| P3. 전체 TextFrame 스캔 | "편지 안에 '서울'이란 글자가 있으면 무조건 '부산'으로 바꾸기" | 없음 | 높음 (선수 이름 "LEE" 등과 충돌) | 비추천 |

**권장: P1 (placeholder)**

**TextFrame API 검증**:
- `textFrame.contents = "L"`으로 **내용 교체 가능**, 폰트/크기/색상/위치/회전 **모두 유지됨**.
- 아웃라인화된 텍스트(path)는 교체 불가 → **경고 로그 + 폴백**.

**구현 흐름 (약식)**:
```
STEP 6.5 (paste 직후, STEP 7 스케일 전):
  var replaced = 0;
  var textFrames = layerDesign.textFrames;
  for (var i = 0; i < textFrames.length; i++) {
    var tf = textFrames[i];
    if (tf.contents.indexOf("{SIZE}") !== -1) {
      tf.contents = tf.contents.replace(/\{SIZE\}/g, sizeName);
      replaced++;
    }
  }
  $.writeln("[SIZE TEXT] replaced=" + replaced);
```

GroupItem 내부에 TextFrame 중첩 시 재귀 헬퍼 필요.

---

## [D] 공통 인프라

1. **config.sizeName 추가** — FileGenerate.tsx 1줄 + grading.jsx 1줄.
2. **UI 토글 불필요** — `patternLineColor`와 동일하게 "알아서 작동".
3. **레이어 추출 전에 실행** — 기능 1은 STEP 4(요소 copy) **직전**, 기능 2는 STEP 6(paste) **직후** ~ STEP 7(스케일) **직전**.

---

## [E] 현재 수작업 vs 자동화 비교

| 항목 | 현재 | 자동화 후 |
|------|------|----------|
| 디자이너 매 주문 작업 | 사이즈별로 AI 열고 수동 수정 × N건 | 최초 1회 준비만 |
| 1건당 예상 시간 | 5~10분 | 0분 |
| 누락 리스크 | 중 | 낮음 |

**판단**: 자동화 가치 **명확**. 성공 관건은 "디자이너가 관습(`{SIZE}`, GroupItem 이름 `"사이즈택"`)을 지킬지".

---

## [F] 권장 실행 전략: Phase 분리

**Phase 1 (MVP)**: 기능 2 "작은 XL 텍스트 자동 교체"
- +30줄, 리스크 낮음, 가치 바로 체감
- `FileGenerate.tsx` +1줄 (`config.sizeName = targetSize`)
- `grading.jsx` 재귀 헬퍼(+15줄) + STEP 6.5 호출 블록(+15줄) = **+30줄**

**Phase 2**: 기능 1 "사이즈택 요소 통째 교체"
- 프리셋 AI 보관 구조, 스케일 타이밍, 매칭 실패 폴백 UX 등 설계 항목 많음
- `grading.jsx` 헬퍼 3개 + STEP 4-A 블록 = **+100~150줄**
- 신규 페이지 `SizeTagManage.tsx` + 스토어 (+200줄 내외)

---

## [G] 사용자 의사결정이 필요한 포인트

| # | 질문 | 권장안 | 대안 |
|---|------|--------|------|
| 1 | Phase 1만 먼저? 동시에? | **Phase 분리** | 동시 구현 |
| 2 | 기능 2 식별 방식 | **`{SIZE}` placeholder** | 전체 TextFrame 스캔 / 특정 레이어명 |
| 3 | 기능 1 프리셋 보관 구조 | **디자인별 AI 5개** | 단일 AI + 레이어 토글 |
| 4 | 기능 1 원본 식별 | **GroupItem 이름 `"사이즈택"`** | 서브레이어 / 색상 마커 |
| 5 | 기능 1 프리셋 크기 기준 | **최종 실제 크기로 제작** | 기준 사이즈 후 linearScale |
| 6 | 매칭 실패 시 | **조용히 스킵 + 로그** | 에러로 중단 |
| 7 | `{SIZE}` 외 다른 패턴? | **`{SIZE}` 한 가지만** | `{사이즈}`, `[SIZE]` 등 |

---

## [H] Phase 1 실행 계획 (승인 후)

| 순서 | 작업 | 담당 | 예상 시간 |
|------|------|------|----------|
| 1 | `FileGenerate.tsx`에 `config.sizeName = targetSize` 추가 | developer | 5분 |
| 2 | `grading.jsx`에 재귀 헬퍼 `replaceSizePlaceholder` 추가 | developer | 15분 |
| 3 | STEP 6.5 블록 추가 + `[SIZE TEXT]` 로그 | developer | 10분 |
| 4 | 정적 검증 | tester | 10분 |
| 5 | 실 테스트: S/M/L/XL/XXL 5건 | 사용자 | 15분 |
| 6 | Phase 2 상세 설계 착수 | planner-architect | — |

**Phase 1 총**: 40분 내외 + 디자이너 `{SIZE}` 수정 1회.

---

## [I] 리스크/폴백

| 리스크 | 대응 |
|--------|------|
| 디자이너가 `{SIZE}` 잊음 | 조용히 스킵 + 로그 (퇴행 없음) |
| 폰트/정렬 깨짐 | TextFrame.contents 속성 보존 보장 |
| 프리셋 AI RGB 저장 | documentColorSpace 체크 → 경고 + 스킵 |
| 프리셋 경로 AppData 밖 | 업로드 시 강제 복사 |
| `"사이즈택"` GroupItem 여러 개 | 첫 번째만 사용 + 경고 로그 |
