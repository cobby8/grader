# 작업 스크래치패드

## 🎯 다음 세션 시작 가이드
1. **수정 요청 3건 테스트** 결과 확인 (TEST-GUIDE-2026-04-25.md, 사용자 담당)
2. **AI→SVG Phase 1+2+3 실 사용 검증** (G드라이브 AI 파일 + Phase 3 토글 ON)
3. **v1.0.1 릴리스 준비** (사용자 테스트 통과 시) 또는 다른 보류 작업

---

## 현재 작업
- **요청**: AI→SVG Phase 3 (자동 백그라운드 변환, 옵트인)
- **상태**: ✅ **완료** (단계 1+2+권장처리 모두, 커밋 E/F 예정)
- **현재 담당**: pm → 커밋 + 사용자 실 동작 검증 대기
- **병행 대기**: 수정 요청 3건 실 테스트, AI→SVG Phase 1+2+3 실 동작 검증 (사용자 담당)

---

## 기획설계 (planner-architect)
(완료 — `PLAN-AI-TO-SVG.md` 13장 1261줄. 9개 결정 + 8단계 실행 계획. decisions.md/architecture.md 참조)

## 구현 기록 (developer)
(Phase 1+2+3 완료 — 작업 로그 + architecture.md 참조)

## 테스트 결과 (tester)
(Phase 3 정적 검증 10/10 PASS, 0 발견. 실 동작은 사용자 담당)

## 리뷰 결과 (reviewer)
(Phase 3 🟢 우수, critical 0, 권장 3건 모두 처리됨. PLAN Q1~Q9 + 주의사항 7건 100%)

---

## 진행 현황표
| 단계 | 내용 | 상태 |
|------|------|------|
| 0~7 | 기본 기능(패턴/디자인/사이즈/CMYK/Illustrator/APCA) | ✅ 완료 |
| 8 | 설치형 배포 + 자동 업데이트 | ✅ v1.0.0 배포 완료 |
| 9~13 | Drive/WorkSetup/즐겨찾기/OrderGenerate | ✅ 완료 |
| 12-A | SVG 일괄 표준화 Phase 1 | ✅ 완료 (v1.0.0 포함) |
| 12-B | AI→SVG 자동 변환 Phase 1+2 | ✅ 완료 (89% + 11% = 100% 커버) |
| **12-C** | **AI→SVG 자동 변환 Phase 3 (옵트인 자동)** | ✅ **완료** (커밋 E/F 예정) |
| 12-D | 양면 유니폼 그레이딩 버그 4종 | ✅ 완료 |
| - | 수정 요청 #1 (3XL 요소 과대) | ✅ 수정됨, 실테스트 대기 |
| - | 수정 요청 #2/#3 | ⏳ 실테스트 대기 |

---

## 수정 요청 3건 진행 상황 (요약)

### ✅ 버그 #1: 3XL 요소 과대 — **수정됨**
- 조치: `ELEMENT_SCALE_EXPONENT` 1.0 → 0.95 (커밋 `801bee4`)
- 사용자 실행 테스트 대기 (TEST-GUIDE-2026-04-25.md 테스트 A)

### 🟡 버그 #2: 3XL/4XL 요소 상단 튀어나감 — 실행 테스트 필요
- 버그 #1 수정으로 자연 완화 가능. EPS에서 요소 top Y > 몸판 top Y 여부 확인

### 🟡 버그 #3: XL 타겟 요소 0개 — AI 레이어 구조 확인 필요
- 의심 지점: `grading.jsx:537` `findBodyForLayer` — `piece=null` 레이어 즉시 -1 반환
- 사용자 제공 필요: XL.ai 레이어 목록 + `grading-debug.log`
- 상세: `.claude/knowledge/errors.md` "grading v2 안전장치 3종 누락" 항목

---

## 수정 요청 (누적 보류)
| 요청자 | 대상 파일 | 문제 설명 | 상태 |
|--------|----------|----------|------|
| user | grading.jsx / 3XL.svg | 3XL 요소 몸판 벗어나 과하게 큼 | ✅ 수정됨 (0.95), 실테스트 대기 |
| user | 3XL.svg / 4XL.svg | 3XL/4XL 요소 몸판 상단 튀어나감 | 🔍 실테스트 필요 |
| user | grading.jsx / OrderGenerate | 기준 AI=XL로 XL 타겟 시 요소 0개 | 🔍 AI 레이어 구조 확인 필요 |
| user | driveSync.ts / PatternManage.tsx | G드라이브 신규 SVG 미인식 | ✅ 수정 완료, 실테스트 대기 |

---

## 작업 로그 (최근 10건)
| 날짜 | 에이전트 | 작업 내용 | 결과 |
|------|---------|----------|------|
| 2026-04-25 | developer | AI→SVG Phase 1-A~1-F + reviewer 권장 처리 | 커밋 `63668d4` + `629d805` + `4c01c05` |
| 2026-04-25 | developer | AI→SVG Phase 2 PostScript AI 지원 (Illustrator COM) | 커밋 `f67d55d` |
| 2026-04-25 | pm | .gitignore에 illustrator-scripts 임시 파일 등록 | 커밋 `69bf4a9` |
| 2026-04-26 | planner-architect | AI→SVG Phase 3 상세 설계 (Q1~Q9 + 8단계) | PLAN-AI-TO-SVG.md 13장 추가 |
| 2026-04-26 | developer | Phase 3 단계 1 인프라 (타입+setter+훅 466줄+모달 217줄) | tsc PASS, 무수정 보호 ✅ |
| 2026-04-26 | developer | Phase 3 단계 2 UI 통합 (Settings/PatternManage 배너 4모드/App.css +257) | tsc PASS, 단계 1 무수정 ✅ |
| 2026-04-26 | tester | Phase 3 정적 검증 (T1~T10 시나리오) | 10/10 PASS, 0 발견 |
| 2026-04-26 | reviewer | Phase 3 코드 리뷰 (7파일, Q1~Q9 + 주의사항 7) | 🟢 우수, critical 0, 권장 3, info 4 |
| 2026-04-26 | developer | Phase 3 reviewer 권장 #1/#2/#3 처리 (선택 D, +27줄) | tsc PASS, 단계 2/Phase 1+2 무수정 ✅ |
| 2026-04-26 | pm | knowledge 갱신 (architecture +1, decisions +1, index 갱신) + scratchpad 정리 | 커밋 E/F 진행 중 |

---

## ⏸ 보류 (다음 작업)
- **수정 요청 3건 실행 테스트** (사용자, TEST-GUIDE-2026-04-25.md) — 우선순위 높음
- **AI→SVG Phase 1+2+3 실 사용 검증** (사용자 담당, 토글 ON 후 G드라이브 AI 자동 변환 동작 확인)
- **v1.0.1 릴리스 준비** (위 검증 통과 후)
- 직원 첫 설치 피드백 수집 → INSTALL-GUIDE-STAFF.md FAQ 갱신
- AI→SVG **UX 보강** (.tmp.ai 경로 매핑, converting sub-status, PS 실패 카운트, 모달 백드롭 변수화) — v1.0.2 검토
- SVG 표준화 Phase 2 (슬림/V넥/하의, JSON 프리셋 외부화)

---

## 프로젝트 핵심 정보
- **기술 스택**: Tauri 2.x + React 19 + TypeScript + react-router-dom 7, Python 엔진(PyMuPDF/reportlab/pillow/openpyxl/svgpathtools), CSS+BEM(Tailwind 금지)
- **빌드**: `dev.bat` (MSVC), `build.bat`
- **주요 폴더**: `src/pages`, `src/components`, `src/services`, `src/stores`, `src/hooks`, `src/types`, `src-tauri`, `python-engine`, `illustrator-scripts`
- **데이터**: `$APPDATA/com.grader.app/` (presets/categories/settings/favorites.json), Drive `G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG` (60초 쿨다운), sessionStorage `grader.session`

### 기획설계 참조
| 계획서 | 상태 |
|--------|------|
| PLAN-GRADING-REBUILD.md | 구현됨 (grading-v2.jsx 607줄) |
| PLAN-WORKFLOW-REDESIGN.md | Phase 1~4 완료 |
| PLAN-AUTO-UPDATE.md | Phase A~D 완료, v1.0.0 배포 |
| PLAN-SVG-STANDARDIZATION.md | Phase 1-1~1-5 완료 (v1.0.0 포함) |
| **PLAN-AI-TO-SVG.md** | **Phase 1+2+3 완료** (13장 1261줄, Q1~Q9 + 8단계) |
