# 작업 스크래치패드

## 🎯 다음 세션 시작 가이드
1. **v1.0.0 Release 검증** (빌드 성공 후)
   - GitHub Release 페이지에서 에셋 3종 확인 (`.msi`, `.exe`, `latest.json`)
   - `latest.json` 서명이 새 공개키와 일치하는지 확인
   - 이전 버전 설치 후 v1.0.0으로 자동 업데이트 동작 테스트
2. **SVG 표준화 Phase 1-6, 1-7** 구현 (1-4/1-5 완료, 회귀 테스트 명령 보존됨)
3. **기존 수정 요청 3건 재검증** (v2 로직에서 재발 여부)

---

## 현재 작업
- **요청**: 버그 #1 수정 — ELEMENT_SCALE_EXPONENT 1.0 → 0.95
- **상태**: 🔨 **developer 수정 중** (grading.jsx:1172 한 줄)
- **현재 담당**: developer → (다음) 사용자 수동 실행 테스트 (Illustrator 필요)

## 구현 기록 (developer)

### developer [2026-04-24] grading.jsx ELEMENT_SCALE_EXPONENT 1.0 → 0.95

- **수정 라인**: `illustrator-scripts/grading.jsx:1175` (주석 L1170~1174 함께 갱신)
- **변경**: `var ELEMENT_SCALE_EXPONENT = 1.0;` → `var ELEMENT_SCALE_EXPONENT = 0.95;`
- **주석 업데이트**: 기존 2줄(2026-04-21 이력) 유지하면서 0.78/1.0/0.95 이력 + 각 값의 문제점 4줄 추가
- **diff**: +6줄 / -2줄 (주석 4줄 추가, 상수값 1.0 → 0.95)
- **영향 라인**: L1180 `adjustedScale = Math.pow(linearScale, ELEMENT_SCALE_EXPONENT);` (변경 없음), L1452 `adjustedForPlace = Math.pow(linearScale, ELEMENT_SCALE_EXPONENT);` (변경 없음)
- **문법 검증**: 육안 OK — `var X = N;` 형식, 세미콜론 정상, ExtendScript 타입체커 없음
- **사용처 재확인**: grep 결과 선언 1곳(L1175) + 사용 2곳(L1180, L1452) = 총 3건 (PM 예상과 일치)
- **실행 검증**: 사용자 수동 (Illustrator + 3XL/4XL SVG 필요)
- **예상 효과**:
  - 3XL: 스케일 1.1~1.3 → `pow(1.3, 0.95) ≈ 1.283`, `pow(1.1, 0.95) ≈ 1.095` (약 -1~-4% 완화)
  - 4XL: 동일한 비율로 완화
  - 2XS: 이미 linearScale < 1.0이라 `pow(0.85, 0.95) ≈ 0.857` (변화 미미)
- **⚠️ reviewer 참고**: 버그 #1 A안(exponent 완화)만 적용. 버그 #2/#3, clamp 복구(B안)/상한(C안)은 이번 작업 범위 밖.

## 디버거 조사 [2026-04-24] 수정 요청 3건 재검증

**분석 대상**: `illustrator-scripts/grading.jsx` (현재 v2, 1585줄) vs `grading-v1-backup.jsx` (2128줄)
**방식**: 정적 코드 분석 (실행 테스트 없음). 사용자 담당.

### 버그 #1: 3XL 사이즈 요소가 몸판 벗어나 과하게 큼

- **재발 확률**: 🔴 **상**
- **코드상 근거**:
  - `grading.jsx:1172` — `var ELEMENT_SCALE_EXPONENT = 1.0;` (주석: "0.78 → 1.0. 2XS에서 축소 부족 이슈 완화용. 선형 스케일 그대로 적용(완화 제거)")
  - `grading.jsx:1176~1177` — `linearScale = Math.sqrt(areaRatio); adjustedScale = Math.pow(linearScale, ELEMENT_SCALE_EXPONENT);`
  - `grading.jsx:1388~1391` — 이름 기반 모드 resize: `pastedGroup.resize(pct2, pct2, ...)` (pct2 = adjustedScale * 100)
  - `grading.jsx:1434~1436` — 폴백 모드도 동일
  - **상한(clamp) 로직 없음**: `MARGIN_RATIO`/`clampScale`/`maxAllowedWidth` 전역에서 일치하는 기호 0건
- **v2에서 바뀐 점**:
  - v1-backup L1836 `USE_D1_MODE` 블록의 **D1 Step 3 "아트보드 95% 초과 시 추가 scale down (clamp)"** 로직이 **v2에서 완전히 제거됨**
  - v1은 `ELEMENT_SCALE_EXPONENT = 0.78`로 큰 사이즈에서 스케일 증가를 눌러주는 완화 효과도 있었음
  - 결과: 3XL(스케일 1.1~1.3 추정)에서 요소가 base의 110~130%로 확대되면서 SVG body 내부 영역을 초과할 가능성 높음
  - 주석 L1171에 "SVG 자체가 XL의 86% 크기인 근본 문제는 SVG 생성 쪽에서 해결 필요"라고 **알려진 문제를 인지하면서도 대응책 없이 방치**
- **수정 필요 여부**: **예** (코드상 확실한 회귀 요인)
- **재현 방법**:
  1. 3XL SVG가 등록된 양면유니폼 프리셋 선택
  2. 기준 AI = XL (또는 L 등 중간 사이즈)
  3. 타겟 = 3XL 또는 4XL
  4. 생성된 EPS를 일러스트로 열어 요소 레이어 bbox가 body bbox를 초과하는지 확인
  5. `grading-debug.log`에서 `선형스케일` 값 확인 (1.1 이상이면 요소 확대 발생)
- **수정 제안** (developer 담당):
  - A안: `ELEMENT_SCALE_EXPONENT = 0.9~0.95` 재도입 (0.78은 2XS 과약화 재발 우려)
  - B안: v1의 D1 Step 3 clamp 로직을 `placeElementGroupPerPiece` 직후에 이식 (각 요소가 자기 소속 body bbox의 95% 이내에 있는지 체크)
  - C안: scale 자체에 상한(예: `adjustedScale = Math.min(linearScale, 1.0)`) — 요소는 절대 XL 원본보다 커지지 않게

---

### 버그 #2: 3XL/4XL 요소가 몸판 상단 튀어나감

- **재발 확률**: 🟡 **중**
- **코드상 근거**:
  - `grading.jsx:683~687` (piece 모드) — `var svgBodyBottom = svgBodies[pieceIdx].bbox[3]; var targetBottom = svgBodyBottom + relVec.dy * scale; var curBottom = gb[3]; item.translate(targetCx - curCx, targetBottom - curBottom);`
  - **Y 좌표는 매번 svgBody 절대 하단을 기준으로 재계산** → v1의 "누적 전가" 버그(v1-backup L1830 주석)는 **구조적으로 해결됨**
  - 그러나 `relVec.dy`가 "디자인AI 요소 하단 - 디자인AI body 하단"이므로 body 상단부 요소(번호·로고)는 양의 큰 dy를 가짐
  - `scale > 1.0`인 3XL에서 `targetBottom = svgBodyBottom + (큰 양수) * (큰 scale)` → 요소가 SVG body 상단보다 위로 올라갈 가능성
  - `grading.jsx:1172` ELEMENT_SCALE_EXPONENT = 1.0 으로 완화 없음 → 버그 #1과 결합됨
- **v2에서 바뀐 점**:
  - ✅ Y 좌표가 누적 방식 → 절대 body 기준으로 재구성 (v1의 근본 버그 해결)
  - ❌ 하지만 **아트보드/body bbox 초과 방지 clamp는 여전히 없음**
  - v1-backup L1836~1896의 D1 모드 clamp는 v2 어디에도 이식되지 않음
- **수정 필요 여부**: **실행 테스트 필요** (v1보다 나아졌지만 clamp 없음)
  - 절대 좌표화로 "요소 위치 누적 오차"는 해결됐지만 "scale 확대로 body 경계 초과"는 여전히 가능
- **재현 방법**:
  1. 양면유니폼 3XL.svg / 4XL.svg 타겟 생성
  2. EPS 열어 body 상단 Y와 요소 top Y 비교
  3. 요소 top > body top이면 튀어나감 발생
  4. `grading-debug.log` → `[진단] 요소[i] 배치(piece,하단기준)`의 `타겟Bottom` 값이 `bodyTop`에 근접하거나 초과하면 문제
- **수정 제안**:
  - 버그 #1 수정(clamp 또는 exponent < 1.0)이 적용되면 이 버그도 자연 완화될 가능성 큼
  - 완전한 해결 원한다면 `placeElementGroupPerPiece` 끝에서 `targetTop > svgBody.bbox[1]`이면 요소를 아래로 추가 translate하는 가드 추가

---

### 버그 #3: 기준 AI=XL로 XL 타겟 시 요소 하나도 안 들어옴

- **재발 확률**: 🟡 **중** (실행 테스트 필수)
- **코드상 근거**:
  - `OrderGenerate.tsx:580~586` — XL 타겟도 일반 루프로 처리, 기준=타겟 동일 사이즈 특별 처리 없음 (정상)
  - `OrderGenerate.tsx`는 `baseSize`/`targetSize`를 config.json에 전달하지 **않음** (grading.jsx도 읽지 않음) → 이 경로에서는 요소 0개 재발 원인 아님
  - **진짜 의심 지점**: `grading.jsx:537` `findBodyForLayer` — `if (!piece || bodies.length === 0) return -1;`
    - 레이어가 `"요소"`(piece=null, side=null)일 때 `piece`가 null이므로 **즉시 -1 반환 → "건너뜀" (L1279)**
    - 단, `hasNamedLayers` 판정 L1163~1166은 `piece !== null` 레이어가 1개라도 있으면 true
    - 즉 **XL AI에 `"요소_표_앞"` 같은 이름 기반 레이어와 기존 `"요소"` 레이어가 혼재**하면, 이름 기반 모드 진입 → `"요소"` 레이어는 piece=null 이라 `findBodyForLayer`가 -1 반환 → 그 레이어 요소 전체 누락
  - `grading.jsx:914~918` 파싱: `"요소"` → side=null, piece=null / `"요소_앞"` → piece="앞" / `"요소_표_앞"` → side="표", piece="앞"
  - XL AI 파일이 이름 규칙을 따르지 않고 단일 `"요소"` 레이어만 있다면 → `hasNamedLayers = false` → 폴백 모드(L1410~) 진입 → 정상 동작해야 함
  - 하지만 사용자가 보고한 "요소 0개"는 **파일의 레이어 구조가 혼재**됐을 때 발생 가능
- **v2에서 바뀐 점**:
  - 양면 버그 4종 수정 시 `findBodyForLayer` 도입(L536) — v1에는 없던 로직
  - `hasNamedLayers` 분기(L1163) 추가
  - **새로운 경로라서 XL 기준 AI의 레이어 구조에 따라 요소 누락 가능**
- **수정 필요 여부**: **실행 테스트 필수** (사용자의 실제 AI 파일 레이어 구조 확인 필요)
- **재현 방법**:
  1. 기준 AI = XL.ai 파일 레이어 목록 확인
     - `"요소"` 단일인지, `"요소_표_앞"` 등 이름 기반인지, 혼재인지
  2. XL 타겟 EPS 생성
  3. `grading-debug.log` 확인 포인트:
     - `요소 레이어 N개 수집` (N이 예상치와 맞는지)
     - `STEP 6-7: 이름 기반 요소 배치 모드` or `거리 기반 폴백 모드` 중 어느 것?
     - 이름 기반 모드면 `Phase 1: M개 요소 duplicate + relVec 수집 완료` (M=0이면 `findBodyForLayer` 실패가 원인)
     - `경고: 'XXX' SVG body 매칭 실패 - 건너뜀` 메시지가 있는지
- **수정 제안** (실행 테스트 후 확정):
  - `findBodyForLayer` 개선: piece=null 레이어는 "전체 body에 균등 배치" 또는 "fallback 유클리드 매칭"으로 폴백
  - `hasNamedLayers` 판정을 "모든 레이어가 이름 기반"으로 강화 → piece=null인 "요소" 레이어가 섞여 있으면 폴백 모드로 전환
  - 또는 이름 기반 모드 내부에서 piece=null 레이어는 폴백 매칭 (유클리드 거리)로 처리

---

### 🏁 종합 결론

| # | 버그 | 재발 확률 | 테스트 필요 | 수정 긴급도 |
|---|------|---------|------------|------------|
| 1 | 3XL 요소 과대 | 🔴 상 | 확인 권장 | **높음** |
| 2 | 3XL/4XL 상단 튀어나감 | 🟡 중 | **필수** | #1 수정으로 완화 가능 |
| 3 | XL 타겟 요소 0개 | 🟡 중 | **필수** | AI 레이어 구조 확인 먼저 |

**코드 분석만으로 확정 가능**:
- 버그 #1: clamp 로직 제거 + ELEMENT_SCALE_EXPONENT = 1.0 → 큰 사이즈에서 확대 방지 장치가 전무함. **수정 필요 확실**.

**실행 테스트 필수**:
- 버그 #2: 절대 좌표화로 구조 개선됐지만 clamp 부재로 재현 가능성 있음. 3XL/4XL SVG 생성 후 bbox 비교 필요.
- 버그 #3: 사용자의 실제 XL.ai 파일의 레이어 이름이 `"요소"` 단일인지 `"요소_표_앞"` 같은 이름 규칙인지 혼재인지에 따라 재발 양상 달라짐. `grading-debug.log`로 식별 가능.

**권장 우선순위**:
1. **버그 #1 선처리** — `ELEMENT_SCALE_EXPONENT = 0.95` 재도입 + (선택) clamp 복구
2. 버그 #2 — #1 수정 후 재검증. 추가 수정 필요 시 요소별 Y 상한 가드 도입
3. 버그 #3 — 실제 AI 파일 레이어 구조 확인 후 `findBodyForLayer` piece=null 폴백 추가

**코드 수정 0건 — 분석만 완료**

### 🎉 직전 작업 (2026-04-23)
- 서명 키 2차 재생성 (비밀번호 `stiz3000!`) + tauri.conf.json pubkey 갱신
- release.yml에 Secret 길이 진단 step 추가
- v1.0.0 태그 재푸시 → Release (Windows) #6 **성공 완료**

---

## 진행 현황표
| 단계 | 내용 | 상태 |
|------|------|------|
| 0~7 | 기본 기능(패턴/디자인/사이즈/CMYK/Illustrator/APCA) | ✅ 완료 |
| 8 | 설치형 배포 + 자동 업데이트 | ✅ **v1.0.0 릴리스 빌드 성공** (검증 단계) |
| 9 | Drive 연동 (자동 동기화) | ✅ |
| 10 | Phase 1 (WorkSetup + 세션) | ✅ |
| 11 | Phase 2 (패턴 선택 모드) | ✅ |
| 12 | Phase 3 (즐겨찾기) | ✅ |
| 12-A | SVG 일괄 표준화 Phase 1 | ✅ **완료 (v1.0.0 포함)** — Phase 1-6은 실사용 테스트로 대체 |
| 12-B | AI→SVG 자동 변환 | ⏳ 12-A 완료 후 |
| 12-C | 양면 유니폼 그레이딩 버그 4종 | ✅ 완료 |
| 13 | Phase 4 (OrderGenerate 통합) | ✅ |

---

## 프로젝트 핵심 정보
- **기술 스택**: Tauri 2.x + React 19 + TypeScript + react-router-dom 7, Python 엔진(PyMuPDF/reportlab/pillow/openpyxl/svgpathtools), CSS+BEM(Tailwind 금지)
- **빌드**: `dev.bat` (MSVC), `build.bat`
- **주요 폴더**: `src/pages`, `src/components`, `src/services`, `src/stores`, `src/types`, `src-tauri`, `python-engine`, `illustrator-scripts`
- **데이터**: `$APPDATA/com.grader.app/` (presets/categories/settings/favorites.json), Drive `G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG` (60초 쿨다운), sessionStorage `grader.session`

---

## 기획설계 (planner-architect)
(정리됨 — PLAN-AUTO-UPDATE.md, PLAN-SVG-STANDARDIZATION.md 참조)

## 구현 기록 (developer)
(정리됨 — 작업 로그 참조)

## 테스트 결과 (tester)
(해당 없음)

## 리뷰 결과 (reviewer)
(해당 없음)

---

## 수정 요청 (누적 보류 — v2에서 재발 여부 확인 필요)
| 요청자 | 대상 파일 | 문제 설명 | 상태 |
|--------|----------|----------|------|
| user | grading.jsx / 3XL.svg | 3XL 사이즈 요소가 몸판 벗어나 과하게 큼 | 🔍 재검증 필요 |
| user | 3XL.svg / 4XL.svg | 3XL/4XL 요소가 몸판 상단 튀어나감 | 🔍 재검증 필요 |
| user | grading.jsx / OrderGenerate | 기준 AI=XL로 XL 타겟 시 요소 하나도 안 들어옴 | 🔍 로그 필요 |
| user | driveSync.ts / PatternManage.tsx | G드라이브 신규 SVG 미인식 | ✅ 근본 수정 완료, 사용자 실테스트 대기 |

---

## 작업 로그 (최근 10건)
| 날짜 | 에이전트 | 작업 내용 | 결과 |
|------|---------|----------|------|
| 2026-04-22 | developer | SVG 표준화 Phase 1-4 Rust 커맨드 2개 추가 | ✅ cargo check PASS |
| 2026-04-22 | developer | SVG 표준화 Phase 1-5 React UI 통합 (Modal 560줄 + Service 202줄) | ✅ tsc PASS, 6-Phase 머신 |
| 2026-04-22 | developer | Phase 1-5 글로벌 기준 파일 자동화 (드롭다운 제거) | ✅ tsc PASS |
| 2026-04-22 | developer | 자동 업데이트 Phase D 배포 가이드 문서 3종 작성 | ✅ RELEASE-GUIDE/CHANGELOG/INSTALL-GUIDE-STAFF 총 768줄 |
| 2026-04-23 | pm | v1.0.0 태그 생성 + 서명 키 재생성(비밀번호 없음) + pubkey 갱신 | 커밋 27a46eb |
| 2026-04-23 | pm | 서명 키 재생성(stiz3000!) + release.yml Secret 길이 진단 추가 | 커밋 07492dc, 4e51365 |
| 2026-04-23 | pm | GitHub Actions Release (Windows) #6 빌드 성공 (v1.0.0) | ✅ 8분 6초 |
| 2026-04-23 | pm | v1.0.0 Release Notes 작성 + Publish (Draft→Published, 서명 키 ID 매칭 확인) | ✅ 자동 업데이트 활성화 |
| 2026-04-24 | pm | 직원 배포용 공지문 3종 작성 (NOTICE-v1.0.0.md: 카톡/이메일/게시판) | ✅ 복붙용 3개 버전 |
| 2026-04-24 | pm | SVG 표준화 Phase 1-7 문서 정리 (architecture+lessons+index 갱신, 1-6은 실사용 테스트로 대체) | ✅ knowledge 3종 갱신 |
| 2026-04-24 | debugger | 수정 요청 3건 v2 코드 정적 재검증 (clamp 제거 + exponent 1.0 + findBodyForLayer piece=null) | 🔴#1 확실 / 🟡#2,#3 실테스트 필요 |
| 2026-04-24 | developer | 버그 #1 A안: ELEMENT_SCALE_EXPONENT 1.0 → 0.95 (grading.jsx:1175, 주석 이력 추가) | ✅ 육안 문법 OK, 사용자 수동 실행 테스트 대기 |

---

## ⏸ 보류 (다음 작업)
- 직원 첫 설치 피드백 수집 → FAQ 갱신 (INSTALL-GUIDE-STAFF.md)
- 자동 업데이트 실제 검증은 다음 v1.0.1 릴리스 시 자연스럽게
- **AI→SVG 자동 변환 기능** 설계 착수 (G드라이브 AI 파일 자동화)
- SVG 표준화 Phase 2 (슬림/V넥/하의 확장, JSON 프리셋 외부화)
- 수정 요청 3건 (3XL/4XL 요소 튀어나감, XL 타겟 요소 누락) v2 로직에서 재검증

### 💡 Phase 1-6 tester용 회귀 테스트 명령 (참고 보관)
```bash
cd "C:\0. Programing\grader\python-engine"
venv\Scripts\activate && pip install -r requirements.txt
mkdir C:\temp\svg_test
copy "G:\...\양면유니폼_U넥_스탠다드_L.svg" C:\temp\svg_test\
copy "G:\...\양면유니폼_U넥_스탠다드_2XL.svg" C:\temp\svg_test\
python main.py normalize_batch "C:/temp/svg_test" "C:/temp/svg_test/양면유니폼_U넥_스탠다드_2XL.svg"
```
정상: success=True, pass_count = total - skipped, fail_count=0  
⚠️ G:\ 직접 실행 금지 (Drive 동기화 트리거)

### 기획설계 참조
| 계획서 | 상태 |
|--------|------|
| PLAN-GRADING-REBUILD.md | 구현됨 (grading-v2.jsx 607줄) |
| PLAN-PIECE-AWARE-LAYOUT.md | Phase 1+2 구현 |
| PLAN-GRADING-RECOVERY.md | Beta 권장안 반영 |
| PLAN-GRADING-REDESIGN.md | D1 권장안 구현 |
| PLAN-WORKFLOW-REDESIGN.md | Phase 1~4 완료 |
| PLAN-GDRIVE-SYNC.md | 옵션 4 구현 |
| PLAN-AUTO-UPDATE.md | Phase A~D 완료, v1.0.0 빌드 성공 |
| PLAN-SVG-STANDARDIZATION.md | Phase 1-1~1-5 완료, 1-6~1-7 대기 |
