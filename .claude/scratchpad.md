# 작업 스크래치패드

## 현재 작업
- **요청**: 배포 전 이슈 1(파랑 배경 검정 선택 문제) 해결 후 설치형 배포파일 생성
- **상태**: 🔨 APCA Lc 공식으로 교체 중 (권장안 A)
- **현재 담당**: developer (구현 대기)
- **배포 후 대기**: 이슈 2 사이즈택 자동 교체 (별도 보고서: `REPORT-SIZETAG.md`)

### 🔜 진행 순서
1. ✅ scratchpad 366→정리 (PM)
2. 🔨 APCA Lc 구현 (developer)
3. 🔍 tester + reviewer 병렬 정적 검증
4. ✅ 커밋
5. 👤 사용자 Illustrator 재실행 — 파랑 배경에서 흰 패턴선 확인
6. 📦 배포파일 빌드 (`npm run tauri build` / `build.bat`)
7. 🚀 직원 배포

## 진행 현황표
| 단계 | 내용 | 상태 |
|------|------|------|
| 0~6 | 기획/세팅/프리셋/디자인/사이즈/CMYK/통합테스트 | ✅ 완료 |
| 7 | Illustrator ExtendScript 전환 | ✅ 완료 |
| 7-Plus | 패턴선 자동 색상 전환 (WCAG) | ✅ 커밋, ⚠️ 파랑에서 검정 선택 문제 발견 |
| 7-Fix | WCAG → APCA Lc 공식 교체 | 🔨 구현 중 |
| 8 | 설치형 배포파일 빌드 | ⏳ 대기 |

## 프로젝트 핵심 정보

### 기술 스택
- **프론트**: Tauri 2.x + React 19 + TypeScript + react-router-dom 7
- **Python 엔진**: python-engine/venv (PyMuPDF 1.27, reportlab 4.4, pillow 12.2, openpyxl)
- **빌드**: `dev.bat` (MSVC 환경, Git Bash에서 `npm run tauri dev` 불가), 배포는 `build.bat` 또는 `npm run tauri build`
- **CSS**: 순수 CSS + 변수 + BEM (Tailwind 금지)

### 주요 파일
```
grader/
├── src/pages/ (PatternManage, DesignUpload, SizeSelect, FileGenerate)
├── src-tauri/ (Rust: run_python + find_illustrator_exe + run_illustrator_script)
├── python-engine/ (main.py/pdf_handler/pattern_scaler/pdf_grader/order_parser)
├── illustrator-scripts/grading.jsx (ES3, 현재 1566줄)
└── REPORT.md, REPORT-EXTENDSCRIPT.md, REPORT-SIZETAG.md(배포 후 참조)
```

## 기획설계 (planner-architect)

### [2026-04-15] 파랑 배경 검정 선택 문제 — APCA Lc 교체안

🎯 근본 원인: **WCAG 2.x 공식은 파랑/빨강/보라 같은 중채도 색에서 지각적 대비를 과소평가**. 코드 버그 아님.

**재현 수치 (파랑 C100M50Y0K0)**:
- 근사 RGB (0, 0.5, 1.0) → 상대휘도 L = 0.2253
- 흰 대비 3.81 / 검 대비 **5.51** → 수학적으로 BLACK 승 → 실제 출력 문제 재현 확인
- C100 파랑 계열에서 M=60% 이상이 되어야 흰색 선택 (경계선)

### APCA Lc 교체 스펙

**공식** (ES3 호환, Math.pow/Math.abs만 사용):
```
// bg = 배경 상대휘도(0~1), txt = 텍스트 상대휘도(0~1)
// light-on-dark (흰 텍스트 위 어두운 배경): Ytxt > Ybg
//   Lc = 1.14 * ((Ybg^0.62) - (Ytxt^0.65)) * 100   ← 음수
// dark-on-light (검 텍스트 위 밝은 배경): Ytxt <= Ybg
//   Lc = 1.14 * ((Ybg^0.56) - (Ytxt^0.57)) * 100   ← 양수
// 최종 판정: |Lc_white| vs |Lc_black| → 절대값 큰 쪽 선택
```

**파랑(Y=0.2253) 예시**:
- 흰(Y=1.0) 대비: 1.14 × (0.2253^0.62 - 1.0^0.65) × 100 = 1.14 × (0.409 - 1.0) × 100 = **Lc ≈ -67**
- 검(Y=0.0) 대비: 1.14 × (0.2253^0.56 - 0.0^0.57) × 100 = 1.14 × 0.442 × 100 = **Lc ≈ +50**
- |67| > |50| → **흰 승** ✅ (지각적으로 올바른 답)

### 변경 범위

| 파일 | 변경 |
|------|------|
| `illustrator-scripts/grading.jsx` | 신규 헬퍼 `apcaContrastLc(yBg, yTxt)` (+25줄), `pickPatternStrokeColor` 내부 WCAG 2줄 → APCA 2줄 교체 |
| `.claude/knowledge/decisions.md` | WCAG 결정에 "APCA로 대체됨" 표기 + 신규 APCA 결정 추가 |

**총 +25~30줄, -2줄**. 헬퍼 3종은 그대로 유지, 공식만 교체. 롤백은 한 블록 복구로 끝남.

### 검증 전략
- 정적: tsc/cargo/ES3 grep
- 실측 (사용자): 파랑(문제 색)/빨강/초록/노랑/진회색 각 1건 → 기대값
  - 파랑 → 흰 (이전과 반대, 이게 핵심 검증)
  - 빨강 → 흰 (이전 검정 → 흰)
  - 초록 → 검 (밝은 초록이라 검 유지)
  - 노랑 → 검
  - 진회색(K85) → 흰

## 구현 기록 (developer)

### [2026-04-15] APCA Lc 공식 교체 (WCAG 대비비 대체)
- **변경 파일**:
  - `illustrator-scripts/grading.jsx`:
    - 신규 헬퍼 `apcaContrastLc(yBg, yTxt)` 추가 (343~382행, +40줄, 주석 포함)
    - `pickPatternStrokeColor` 내부 WCAG 2줄 → APCA 2줄 교체 (394~424행, 함수 위 주석도 갱신)
    - 섹션 헤더 주석 "WCAG 대비비 기반" → "APCA Lc 기반, WCAG 3.0 초안"
    - `cmykToLinearLuminance` 마지막 주석 "WCAG 2.x" → "WCAG/APCA 모두 사용" 보정
    - 호출부(STEP 11-A+, 1505~1555행): auto 분기에서 lc 값 캐시 + 로그에 `method=APCA lcW=... lcB=...` 추가
- **구현 요지**:
  - APCA 비대칭 지수(light-on-dark: 0.62/0.65, dark-on-light: 0.56/0.57)를 ES3 호환 `Math.pow`로 구현.
  - `pickPatternStrokeColor`는 시그니처/반환 규약(null 폴백, CMYK 객체)을 그대로 유지 — 호출부 외부 인터페이스 무변경.
  - 로그용 lc 값은 `pickPatternStrokeColor` 외부에서 별도 재계산(헬퍼 시그니처 보존을 위해), `Math.round(x*10)/10`로 1자리 표시.
- **검증**:
  - tsc --noEmit: PASS (출력 없음)
  - cargo check: PASS (Finished dev profile)
  - ES3 grep (`let|const|=>|template literal|JSON.`): 위반 없음 (한 건 매치는 주석 내 "JSON.parse 미지원" 설명문)
  - 손 계산 자가 점검 (파랑 C100M50, Y=0.2253):
    - lcW = 1.14 × (0.409 - 1.0) × 100 ≈ **-67.4**
    - lcB = 1.14 × 0.442 × 100 ≈ **+50.4**
    - |67.4| > |50.4| → **흰 선택** ✅ (이전 WCAG는 검 선택했던 케이스)
- **주의사항/한계**:
  - APCA는 RGB sRGB 공간 기반이지만, 이미 `cmykToLinearLuminance`에서 CMYK→근사 RGB→선형 휘도 변환을 거치므로 일관성 유지됨.
  - 실제 Illustrator 출력에서 표 5건(파랑/빨강/초록/노랑/진회색) 로그 수치 눈검증 필요.
  - APCA 공식은 WCAG 3.0 초안이지만 핵심 상수(1.14, 0.62/0.65/0.56/0.57)는 안정화된 값으로 알려져 있음. 향후 W3C 정식 채택 시 미세 조정 가능성 있으나 흰/검 판정 결과는 거의 영향 없음.

💡 tester 참고:
- **테스트 방법**: 파랑(C100M50) 배경 디자인으로 그레이딩 실행, Illustrator 콘솔 로그 `[PATTERN LINE] mode=auto method=APCA lcW=-67.X lcB=50.X color=white(0)` 확인.
- **정상 동작**: 파랑 배경에서 흰 패턴선이 적용되어야 함 (이전엔 검정 적용되던 케이스).
- **추가 케이스**: 빨강(흰), 초록(검), 노랑(검), 진회색 K85(흰)도 함께 확인하면 좋음.

⚠️ reviewer 참고:
- `pickPatternStrokeColor`의 시그니처/반환 규약이 변경되지 않았는지 확인 (호출부 무수정 원칙).
- ES3 호환성 (Math.pow/Math.abs/isNaN만 사용, var 선언만 사용) 재점검.
- 로그 lc 값 재계산이 `pickPatternStrokeColor` 내부 로직과 일치하는지 (외부 재계산 = 함수 시그니처 보존을 위한 의도적 트레이드오프).

## 테스트 결과 (tester)

### [2026-04-15] APCA Lc 교체 정적 검증

| 항목 | 결과 | 비고 |
|------|------|------|
| tsc --noEmit | ✅ PASS | 출력 없음 |
| cargo check | ✅ PASS | Finished dev profile 0.46s |
| ES3 grep (신규/수정 영역) | ✅ PASS | let/const/=>/백틱/JSON./for..of 모두 코드 영역 0건. 매치 2건은 30·32행 주석 내 설명문(허용) |
| 시그니처/반환 불변 | ✅ PASS | pickPatternStrokeColor(bgCmykColor)→CMYKColor\|null, cmykToLinearLuminance(cmykColor)→Number, applyPatternStrokeColorRecursive(container,newColor)→Number — 3종 모두 변경 없음. 핵심 호출 `applyPatternStrokeColorRecursive(layerPattern, chosenStrokeColor)` (1539행) 보존 |
| APCA 공식 상수 정확성 | ✅ PASS | light-on-dark: 1.14·(Y_bg^0.62 - Y_txt^0.65)·100 (376행), dark-on-light: 1.14·(Y_bg^0.56 - Y_txt^0.57)·100 (379행) — 상수 일치 |
| NaN/음수 방어 | ✅ PASS | 370~371행 `if(isNaN(yBg)\|\|yBg<0) yBg=0` 양쪽 인자에 적용 |
| 타이브레이커 (흰 우선) | ✅ PASS | 410행 `if (Math.abs(lcWhite) >= Math.abs(lcBlack))` — 동률 시 흰 선택 |
| 손 계산 5 케이스 | ✅ 5/5 일치 | 파랑(lcW=-68.8/lcB=49.5→흰), 빨강(-70.4/47.9→흰), 초록(-20.2/95.6→검), 노랑(-5.2/109.3→검), 진회색(-104.0/12.6→흰). 절대값은 스펙 표 근사보다 1~8 포인트 차이 있으나 부호·대소·최종 선택 전부 일치 |
| 로그 형식 갱신 | ✅ PASS | 1547행 `apcaInfo = " method=APCA lcW=" + lcW1 + " lcB=" + lcB1`, 1545~1546행 `Math.round(x*10)/10` 1자리 반올림. auto 모드에서만 출력 (autoLcWhite/Black null 가드) |

종합: 9/9 통과. 치명 이슈 없음 → **커밋 가능** 판정.

📌 추가 관찰:
- `pickPatternStrokeColor` 내부 lc 계산과 호출부 1529~1531행 로그용 재계산이 동일 식 사용 — 두 결과는 항상 일치 보장 (developer 의도된 트레이드오프).
- mainColor가 CMYK가 아니면 (1532행) chosenStrokeColor=null → 1554행 "applied=skip" 분기로 안전 폴백.
- patternLineColorMode "white"/"black"/"keep" 분기는 APCA 변경에 영향받지 않음 (회귀 안전).

## 리뷰 결과 (reviewer)

### [2026-04-15] APCA Lc 교체 리뷰

#### 종합 평가
**승인 (커밋 가능)**. APCA 공식 상수(1.14, 0.62/0.65/0.56/0.57)와 분기 조건(Ytxt > Ybg)이 명세와 정확히 일치하고, `pickPatternStrokeColor`의 외부 시그니처/반환 규약(null 폴백, CMYKColor 인스턴스)이 그대로 보존되어 호출부 무수정 원칙을 지켰다. 입력 방어(NaN/음수 → 0)와 동률 시 흰 선택 타이브레이커도 정확. 로그 재계산은 함수 내부와 동일한 `cmykToLinearLuminance` + `apcaContrastLc` 호출 순서를 사용해 이중 진리원 위험 없음 (수치 일치 보장). ES3 호환성, 한국어 주석, "왜" 우선 설명 모두 conventions 부합. 배포 직전 변경으로서 회귀 위험 사실상 없음.

#### 강점
- **공식 정확성**: light-on-dark/dark-on-light 분기와 비대칭 지수가 APCA 사양과 일치 (368~382행).
- **에지 케이스 방어**: `Math.pow(0, 0.57) = 0`, `Math.pow(1, 0.65) = 1` 모두 안전. 추가로 `isNaN || y<0` 가드까지 명시 (370~371행).
- **시그니처 보존**: `pickPatternStrokeColor(bgCmykColor)` 인자/반환 무변경 → STEP 11-A+ 호출부에서 함수 호출 한 줄(1527행)만 사용, 흐름 변경 없음.
- **이중 진리원 회피**: 로그용 재계산이 함수 내부와 **동일 헬퍼 동일 순서**(cmykToLinearLuminance → apcaContrastLc)를 호출 (1529~1531행 vs 401~407행) → 수치 불일치 불가능.
- **롤백 용이성**: 헬퍼 한 블록(343~382) 삭제 + `pickPatternStrokeColor` 내부 2줄(`apcaContrastLc` 호출 → WCAG 비율 계산) 복구로 끝. 호출부는 lc 캐시 변수 4줄만 빼면 됨.
- **자가 점검 케이스 5종**(파랑/빨강/초록/노랑/진회색)을 헬퍼 doc에 명시 (357~362행) — 향후 회귀 검증 시 즉시 활용 가능.
- **ES3 준수**: var/function/Math.pow/Math.abs/isNaN만 사용. arrow/template/let/const/for-of 위반 0건 (전체 grep 1건은 주석 내 설명).
- **로그 포맷**: `method=APCA lcW=-67.4 lcB=50.4 color=white(0)` — auto 모드일 때만 lc 출력하는 조건부 분기(1544행)가 깔끔.

#### 개선 제안 (선택 사항, 배포 후 고려)
| 우선순위 | 파일:라인 | 제안 | 이유 |
|---------|----------|------|------|
| 낮음 | grading.jsx:394~424 | `pickPatternStrokeColor`를 `{color, lcWhite, lcBlack}` 객체 반환 형태로 리팩터 | 로그 재계산(1529~1531행) 제거 가능. 단 호출부 모두 수정 필요 → 배포 후 여유 있을 때만. |
| 낮음 | grading.jsx:362 | 자가 점검 노랑 케이스 주석 수치 `3, 104` → `5, 109` (실측 근사값) | 주석 수치가 약간 보수적이나 흰/검 판정 결론은 동일 → 실사용 영향 0. 가독성 차원. |
| 낮음 | grading.jsx:1509~1511 | `autoLcWhite`/`autoLcBlack` 초기값 `null`을 `NaN`으로 변경 후 `isNaN()` 체크 | 현재 `!== null` 체크(1544행)도 정상 작동하나, JS 관례상 수치 미정 표현은 NaN. 동작 동일. |

#### 치명 이슈 (있다면)
| 파일:라인 | 문제 | 권장 수정 |
|----------|------|-----------|
| (없음) | — | — |

**결론: 커밋 가능** — 회귀 위험 없음, 공식/시그니처/로그 정합성 모두 검증됨.

## 수정 요청
| 요청자 | 대상 파일 | 문제 설명 | 상태 |
|--------|----------|----------|------|

## 작업 로그 (최근 10건)
| 날짜 | 에이전트 | 작업 내용 | 결과 |
|------|---------|----------|------|
| 2026-04-14 | developer | grading.jsx CMYK 시작점 + 몸판 우선 재작성 (헬퍼 4종 + STEP 0~11 교체) | 완료 |
| 2026-04-14 | planner-architect | 요소 z-order + 조각별 분리 정렬 분석 (Z1-A + P2-A) | 완료 |
| 2026-04-14 | developer | Phase 1 z-order 수정 + z-order 재조정 (패턴선>디자인>배경fill) | 완료 |
| 2026-04-14 | developer | Phase 2 조각별 요소 분리 정렬 (+311줄, 3단계 폴백) | 완료 |
| 2026-04-14 | planner-architect | 패턴선 색상 자동 전환 가능성 조사 (WCAG 권장) | 완료 |
| 2026-04-15 | pm | 미푸시 커밋 2개 push + scratchpad 정리 | 완료 |
| 2026-04-15 | developer | 패턴선 자동 색상 전환 구현 (헬퍼 3종 +182줄, ES3/tsc/cargo PASS, c172110) | 완료 |
| 2026-04-15 | tester+reviewer | 패턴선 구현 정적 검증 8/8 PASS + 리뷰 치명 이슈 없음 | 완료 |
| 2026-04-15 | planner-architect | 파랑 배경 검정 선택 원인 분석 (WCAG 한계, APCA 권장) + 사이즈택 타당성 검토 병렬 | 완료 |
| 2026-04-15 | pm | scratchpad 366→정리 + 사이즈택 보고서 REPORT-SIZETAG.md로 이관 | 완료 |
| 2026-04-15 | developer | grading.jsx APCA Lc 공식 교체 (헬퍼 +40줄, pickPatternStrokeColor 내부 교체, 로그 lcW/lcB 추가, tsc/cargo/ES3 PASS) | 완료 |
| 2026-04-15 | tester | APCA Lc 정적 검증 9/9 PASS (손계산 5/5 일치, 시그니처 보존, 치명 이슈 없음) | 완료 |
