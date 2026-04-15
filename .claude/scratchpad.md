# 작업 스크래치패드

## 현재 작업
- **요청**: Illustrator ExtendScript 연동 그레이딩 엔진 재설계
- **상태**: 🔄 패턴선 자동 색상 전환 — developer 구현 완료, tester/사용자 실행 확인 대기
- **현재 담당**: tester (정적) → 사용자 (실제 Illustrator 실행)
- **사용자 결정**: Q1=auto+UI숨김 / Q2=WCAG 대비비 / Q3=stroke만 / Q4=keep 폴백

### 🔜 다음 액션
1. 사용자가 아래 "의사결정 포인트 4개"에 답변
2. developer에게 구현 위임 (예상 +80줄)
3. tester 정적 검증 → 사용자 실제 Illustrator 실행 테스트
4. 통과 시 커밋

## 진행 현황표
| 단계 | 내용 | 상태 |
|------|------|------|
| 0~6 | 기획/세팅/프리셋/디자인/사이즈/CMYK/통합테스트 | ✅ 완료 |
| 7 | Illustrator ExtendScript 전환 (Phase 1+2) | ✅ 완료 |
| 7-Plus | 패턴선 자동 색상 전환 | 🔄 의사결정 대기 |

## 프로젝트 핵심 정보

### 기술 스택
- **프론트**: Tauri 2.x + React 19 + TypeScript + react-router-dom 7
- **Python 엔진**: python-engine/venv (PyMuPDF 1.27, reportlab 4.4, pillow 12.2, openpyxl)
- **빌드**: `dev.bat` (MSVC 환경, Git Bash에서 `npm run tauri dev` 불가)
- **CSS**: 순수 CSS + 변수 + BEM (Tailwind 금지)
- **상태 관리**: React useState + sessionStorage (라이브러리 미사용)

### 프로젝트 구조
```
grader/
├── src/            (pages: PatternManage/DesignUpload/SizeSelect/FileGenerate, stores, components)
├── src-tauri/      (Rust: run_python + find_illustrator_exe + run_illustrator_script)
├── python-engine/  (main.py/pdf_handler/pattern_scaler/pdf_grader/order_parser)
├── illustrator-scripts/grading.jsx (ES3, 현재 ~1300줄)
└── REPORT.md, REPORT-EXTENDSCRIPT.md, dev.bat, build.bat
```

### 데이터 저장
- 프리셋: `$APPDATA/presets.json`, 카테고리: `$APPDATA/categories.json`
- 디자인: `$APPDATA/designs.json` + `$APPDATA/designs/{id}.pdf/.preview.png`
- 출력: `$APPDATA/outputs/{timestamp}/{디자인명}_{사이즈}.pdf`
- 페이지 간 상태: sessionStorage key=`grader.generation.request`

## 기획설계 (planner-architect)

### [2026-04-14] 패턴선 색상 자동 전환 가능성 조사 (← 현재 이 건만 진행 중)

**결론**: 가능. 단순 1~2시간, 고품질 반나절. **권장안 = 후보 B + WCAG 대비비 + 전역 + config `auto` 기본**.

#### 핵심 판정 방식
- 배경 CMYK → 근사 RGB(`R=(1-C/100)*(1-K/100)` 등) → 선형화 → 상대휘도 `L=0.2126R+0.7152G+0.0722B`
- 흰/검 각각 WCAG 대비비 `(L_brighter+0.05)/(L_darker+0.05)` 계산 → **큰 쪽 선택** (임계값 튜닝 불필요, 에지 케이스 자동 해결)
- `app.convertSampleColor`는 환경 편차 있어 미사용. 순수 산술만.

#### 적용 범위
- **전역 적용** (모든 layerPattern 아이템 stroke 동일 색). 현재 mainColor가 전 몸판 단일이므로 조각별 구분 불필요.
- Phase 1: **stroke만**. fill은 원본 유지 (별표 등 기호 보존).
- 흰색 CMYK=(0,0,0,0), 검정 CMYK=(0,0,0,100).

#### config 키 설계
```
"patternLineColor": "auto"   // 기본 (WCAG 자동)
                  | "white"  // 고정 흰
                  | "black"  // 고정 검
                  | "keep"   // 원본 유지 (현재 동작, 폴백)
```
UI 노출 X, config.json만. mainColor 추출 실패 시 내부적으로 `keep` 폴백.

#### 삽입 위치
- `grading.jsx` STEP 11-A(RGB 안전망) **직후** & STEP 11-B(레이어 통합) **직전**
- 이유: layerPattern이 아직 살아있고 중첩 구조 그대로 → 재귀 순회 명확
- 롤백 = 한 블록 삭제

#### 변경 예상 범위
- `grading.jsx`: 헬퍼 3개(`cmykToLinearLuminance`, `pickPatternStrokeColor`, `applyPatternColorRecursive`) + config 읽기 1줄 + 호출 블록 10줄 내외. **총 +80줄**
- `src/pages/FileGenerate.tsx` 또는 config 생성 지점: `patternLineColor: "auto"` 기본값 1줄
- Rust 변경 없음

#### 위험/폴백
| 위험 | 대응 |
|------|------|
| mainColor 추출 실패 | 회색(85%K) 폴백 → 어두움 판정 → 흰색 선택. 안전 |
| stroke가 Gradient/Pattern | typename 체크, 단색만 덮고 나머지 스킵+로그 |
| fill 기호(별표 등) | Phase 1은 stroke만 변경, fill 보존 |
| 패턴 PDF 폴백(AI 없음) | mainColor null이면 `keep` 폴백 |
| 흰 선이 흰 종이에 안 보임 | 최종 PDF는 배경 위에 덮는 구조 → 무관 |

## 🟡 사용자 의사결정이 필요한 포인트 (4개)

| # | 질문 | 권장안 | 대안 |
|---|------|--------|------|
| 1 | `patternLineColor` 기본값 전략 | `auto` + UI 숨김 | UI 토글 노출 |
| 2 | 밝기 판정 기준 | **WCAG 대비비** | 단순 임계값 0.5 |
| 3 | 적용 범위 | **stroke만** (보수) | stroke+fill 둘 다 |
| 4 | 자동 실패 시 폴백 | **keep** (원본 유지) | black 고정 |

## 실행 계획 (승인 후)
| 순서 | 작업 | 담당 |
|------|------|------|
| 1 | 헬퍼 3종 + config 읽기 + 호출 블록 추가 | developer |
| 2 | config 기본값 `"auto"` 주입 1줄 | developer |
| 3 | ES3 + tsc + cargo 정적 검증 | tester |
| 4 | Illustrator 어두운/밝은 배경 각 1개 실행 확인 | 사용자 |

## 구현 기록 (developer)

### [2026-04-15] 패턴선 자동 색상 전환 구현 (Phase 1: stroke 한정)
- 변경 파일:
  - `illustrator-scripts/grading.jsx`: 헬퍼 3종 신규(+138줄, 308~445 영역), main() config 읽기 1줄(920행 근처), STEP 11-A/B 사이 호출 블록(+45줄, 1370~1414 영역) → 총 +182줄 (1384→1566)
  - `src/pages/FileGenerate.tsx`: config 객체에 `patternLineColor: "auto"` 기본값 1줄 추가 (323행)
- 구현 요지:
  - `cmykToLinearLuminance()`: CMYK→근사RGB→sRGB 역감마→WCAG 상대휘도 계산
  - `pickPatternStrokeColor()`: 배경 L 기준 흰/검 WCAG 대비비 비교 → 큰 쪽 CMYKColor 반환 (배경 null이면 null)
  - `applyPatternStrokeColorRecursive()`: PathItem/CompoundPathItem/GroupItem 재귀 순회, 단색 stroke만 덮어쓰기 (fill 건드리지 않음, Gradient/Pattern/NoColor 스킵)
  - main() STEP 11-A+ 블록: mode별 분기(keep/white/black/auto), auto에서 mainColor 없으면 keep 폴백, applyPatternStrokeColorRecursive(layerPattern, chosenColor) 호출, `[PATTERN LINE]` 로그
- 검증:
  - `npx tsc --noEmit` → **PASS** (출력 없음)
  - `cargo check` → **PASS** (Finished dev profile)
  - ES3 호환성 grep(`let/const/=>/\${/JSON.parse|stringify`) → **PASS** (주석 1줄 외 실제 코드 없음)
- 주의사항/한계:
  - Phase 1이므로 stroke만 변경 — fill 기호(별표 등)는 원본 유지
  - mainColor가 CMYK가 아니거나 null이면 "auto"도 keep 폴백(원본 유지)
  - Gradient/Pattern/NoColor 타입 stroke는 덮어쓰지 않음 (안전 스킵)
  - 실제 Illustrator 실행 테스트 필요: 어두운 배경(흰선 기대) + 밝은 배경(검선 기대) 각각 1건

💡 tester 참고:
- 테스트 방법: grading.jsx 실행 시 stdout의 `[PATTERN LINE]` 로그 확인
- 정상 동작: `mode=auto color=white(0) applied=N` 또는 `color=black(K100) applied=N` 형태
- 주의할 입력: mainColor 추출 실패 케이스 → `applied=skip (keep original)` 로그 확인

⚠️ reviewer 참고:
- 특별히 봐줬으면 하는 부분:
  - 헬퍼 3종 위치(cloneColor 직후, line 308 근처) — 프로젝트 구조 적합성
  - STEP 11-A+ 블록이 기존 z-order/CMYK 흐름을 건드리지 않는지
  - CompoundPathItem의 pathItems 직접 순회가 올바른지 (pageItems 없음)

## 테스트 결과 (tester)

### [2026-04-15] 패턴선 자동 색상 전환 정적 검증

| 항목 | 결과 | 비고 |
|------|------|------|
| tsc --noEmit | PASS | 출력 없음 |
| cargo check | PASS | Finished dev profile (0.46s) |
| ES3 grep (금지 문법 5종) | PASS | let/const/=>/백틱/for..of 전부 0건, JSON.parse는 주석 1줄뿐 |
| 헬퍼 위치 (cloneColor 직후) | PASS | cloneColor(262) → cmykToLinearLuminance(324) → pickPatternStrokeColor(352) → applyPatternStrokeColorRecursive(400) |
| STEP 0 config 선언 위치 | PASS | 1052행 `var patternLineColorMode = (config && config.patternLineColor) ? ... : "auto"` (STEP 0 config 블록 1044~1052 범위 내) |
| STEP 11-A/B 사이 호출 블록 | PASS | STEP 11-A(1428) → STEP 11-A+(1454~1498) → STEP 11-B(1500) 순서 OK |
| FileGenerate patternLineColor 기본값 | PASS | 323행 `patternLineColor: "auto"` 정확히 1회 |
| 로직 정합성 (null 폴백/stroked 체크/4 모드) | PASS | bgCmykColor null→null(354), stroked&&strokeColor 체크(410), CMYK/RGB/Gray만 덮고 Gradient/Pattern/NoColor 스킵(412,425), white/black/auto 분기 존재 + keep은 chosenStrokeColor 초기값 null 유지로 자연스럽게 스킵 경로 → skip 로그 |

종합: **8/8 통과**. 정적 검증 모든 항목 PASS, 실제 Illustrator 실행 테스트(어두운/밝은 배경)는 사용자 몫으로 남김.

## 리뷰 결과 (reviewer)

### [2026-04-15] 패턴선 자동 색상 전환 리뷰

#### 종합 평가
**조건부 승인 → 커밋 가능**. 설계 의도(A-A-A-A)가 코드에 정확히 반영됐고, WCAG 수식·ES3 호환성·롤백 격리성 모두 문제없다. CompoundPathItem 직접 순회, 단색 typename 게이트, keep 폴백 경로까지 방어가 촘촘하다. 치명 이슈는 없고, 개선 제안 3건(미세 일관성)만 있다.

#### 강점
- **헬퍼 위치**: cloneColor(306행) 직후 308~438행에 "색상 관련 함수" 연장선으로 배치 — 기존 색상 섹션과 주제가 같아 자연스럽다. 다른 위치(예: AI 레이어 추출 이후)보다 색 관련 기능이 한곳에 모이는 현 위치가 적절.
- **WCAG 공식 정확성**:
  - CMYK→RGB 근사식 `R=(1-C/100)*(1-K/100)` 등 세 채널 모두 정확 (330~332행)
  - sRGB 역감마 임계값 0.03928 및 분기식(`v/12.92` vs `pow((v+0.055)/1.055, 2.4)`) 정확 (335~337행)
  - 상대휘도 계수 0.2126(R) / 0.7152(G) / 0.0722(B) 순서 정확 (340행)
  - 대비비 `(L+0.05)/(0+0.05)`, `(1+0.05)/(L+0.05)` 모두 WCAG 2.x 정의와 일치 (363~365행)
- **STEP 11-A+ 격리성**: STEP 11-A(RGB 안전망)와 STEP 11-B(레이어 통합) 사이에 독립 블록으로 삽입. layerPattern만 건드리고 layerDesign/layerFill/mainColor를 읽기 전용으로만 참조 — 기존 z-order/CMYK 흐름에 부작용 없음. 블록 전체(1454~1498) 삭제만으로 롤백 가능.
- **CompoundPathItem 처리**: pageItems 없는 타입임을 인지하고 `item.pathItems` 직접 순회(420~430행) — 올바른 접근. PathItem/CompoundPathItem/GroupItem 세 타입 모두 커버.
- **ES3 호환성**: var만 사용, arrow/template literal/JSON 메서드 없음. 문자열 연결은 `+`만 사용.
- **방어 로직**:
  - `item.stroked && item.strokeColor` 복합 체크 (410, 423행) — stroke 없는 path 안전 스킵
  - typename 단색 화이트리스트 `CMYKColor|RGBColor|GrayColor` — Gradient/Pattern/NoColor 자동 제외 (412, 425행)
  - auto 모드에서 `mainColor.typename === "CMYKColor"` 방어 후 pickPatternStrokeColor 호출, 아니면 keep 폴백 (1481~1485행)
  - pickPatternStrokeColor는 bgCmykColor null일 때 null 반환 (354~356행)
- **한국어 주석**: conventions.md의 "중요 코드에 한국어 주석 필수" 규칙 준수. "왜 ~인가" 설명이 각 헬퍼 상단에 있어 유지보수자 친화적.
- **로그**: `[PATTERN LINE] mode=... color=... applied=N` 형식으로 적용/스킵 모두 기록 — tester/사용자가 동작 확인 용이.

#### 개선 제안 (선택 사항)
| 우선순위 | 파일:라인 | 제안 | 이유 |
|---------|----------|------|------|
| 낮음 | grading.jsx:413,426 | `cloneCMYKColor(newColor)` 호출 시, PathItem이 루프 내에서 여러 번 동일 색을 할당받을 때마다 새 객체 생성 — 반복마다 복제가 꼭 필요한가 검토. 루프 진입 전에 한 번만 복제한 고정 객체를 재사용해도 안전할 수 있음 (호출부 chosenStrokeColor가 이미 로컬 객체라 참조 공유 위험 낮음) | 성능/할당 최소화. 단 현 구현도 동작엔 문제없음. |
| 낮음 | grading.jsx:1492 | `colorLabel = (chosenStrokeColor.black >= 100) ? "black(K100)" : "white(0)"` — 만약 향후 회색 등 중간 색을 지원하게 되면 이 이분법이 오라벨링 유발. 현재는 흰/검 이분만 반환하므로 OK. | 확장 시 라벨 정확도. |
| 낮음 | grading.jsx:1467~1485 | white/black 분기에서 CMYKColor를 직접 new로 만들고 있어 동일 패턴이 pickPatternStrokeColor에도 중복(369~381행). 흰/검 생성 유틸(makeWhiteCMYK/makeBlackCMYK) 추출 고려. | DRY. 현재 중복 2곳이라 미미. |

#### 치명 이슈 (있다면)
없음.

결론: **커밋 가능**. tester 정적 검증(이미 PASS)과 사용자 실행 테스트(어두운/밝은 배경 각 1건)만 남음.

## 수정 요청
| 요청자 | 대상 파일 | 문제 설명 | 상태 |
|--------|----------|----------|------|

## 작업 로그 (최근 10건)
| 날짜 | 에이전트 | 작업 내용 | 결과 |
|------|---------|----------|------|
| 2026-04-08 | developer | grading.jsx 3가지 수정 (요소 몸판 중앙 정렬 + 레이어 통합 + CMYK 강제 변환) | 완료 |
| 2026-04-14 | tester | 7단계 Phase 1 통합 검증 (빌드 3종 + ES3 + Rust 커맨드 3종 + FileGenerate 하이브리드) | 완료 |
| 2026-04-14 | planner-architect | grading.jsx 재설계 기획 (새 CMYK 문서 시작 + 몸판→요소 순서 + RGB 원본 엄격 모드) | 완료 |
| 2026-04-14 | developer | grading.jsx CMYK 시작점 + 몸판 우선 재작성 (헬퍼 4종 + STEP 0~11 교체, ES3/tsc/cargo 통과) | 완료 |
| 2026-04-14 | planner-architect | 요소 z-order + 조각별 분리 정렬 분석 (Z1-A + P2-A 권장, Phase 1~3 분할) | 완료 |
| 2026-04-14 | developer | Phase 1 z-order 수정 (디자인>배경fill>패턴선) | 완료 |
| 2026-04-14 | developer | z-order 재조정 (패턴선>디자인>배경fill) | 완료 |
| 2026-04-14 | developer | Phase 2 조각별 요소 분리 정렬 (+311줄, 3단계 폴백, ES3/tsc/cargo 통과) | 완료 |
| 2026-04-14 | planner-architect | 패턴선 색상 자동 전환 가능성 조사 (후보 B + WCAG + auto 기본, 예상 +80줄) | 완료 |
| 2026-04-15 | pm | 미푸시 커밋 2개 push + scratchpad 792→95줄 정리 | 완료 |
| 2026-04-15 | developer | 패턴선 자동 색상 전환 구현 (헬퍼 3종 +138줄, 호출 블록 +45줄, config 기본값 1줄, ES3/tsc/cargo PASS) | 완료 |
| 2026-04-15 | tester | 패턴선 자동 색상 전환 정적 검증 (tsc/cargo/ES3/삽입위치/로직정합성 8항목 전부 PASS) | 완료 |
