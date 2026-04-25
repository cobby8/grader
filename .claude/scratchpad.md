# 작업 스크래치패드

## 🎯 다음 세션 시작 가이드
1. **수정 요청 3건 테스트** 결과 확인 (TEST-GUIDE-2026-04-25.md, 사용자 담당)
2. **AI→SVG Phase 1 실 사용 검증** (G드라이브 AI 파일로 사용자 직접 테스트)
3. **Phase 2 (PostScript AI 지원)** 또는 다른 보류 작업

---

## 현재 작업
- **요청**: AI→SVG Phase 1-H (knowledge + scratchpad 정리 + 커밋 C)
- **상태**: 🔨 **PM 마무리 중** (커밋 A `63668d4` + B `629d805` + C 예정)
- **현재 담당**: pm → (다음) Phase 1 전체 종결
- **병행 대기**: 수정 요청 3건 테스트 (TEST-GUIDE-2026-04-25.md, 사용자 담당)

---

## 기획설계 (planner-architect)
(완료 — `PLAN-AI-TO-SVG.md` 1017줄 + `PLAN-SVG-STANDARDIZATION.md` 등 기획서 참조 테이블 참조)

## 구현 기록 (developer)
(Phase 1-A ~ 1-G 완료 — 작업 로그 참조)

## 테스트 결과 (tester)
(Phase 1-G에서 reviewer로 대체 — 사용자 G드라이브 실 테스트 별도)

## 리뷰 결과 (reviewer)
(Phase 1-G 완료 — 🟢 우수, critical 0, 권장 3건 모두 처리됨. 작업 로그 참조)

---

## 수정 요청 3건 진행 상황 (요약)

### ✅ 버그 #1: 3XL 요소 과대 — **수정됨**
- 조치: `ELEMENT_SCALE_EXPONENT` 1.0 → 0.95 (커밋 `801bee4`)
- 사용자 실행 테스트 대기 (TEST-GUIDE-2026-04-25.md 테스트 A)

### 🟡 버그 #2: 3XL/4XL 요소 상단 튀어나감 — **실행 테스트 필요**
- 버그 #1 수정으로 자연 완화 가능, v2 구조 개선으로 v1 근본 버그는 해결됨
- 재현 체크: EPS에서 요소 top Y > 몸판 top Y 여부
- 로그 체크: `grading-debug.log`의 `타겟Bottom` vs `bodyTop`

### 🟡 버그 #3: XL 타겟 요소 0개 — **AI 레이어 구조 확인 필요**
- 의심 지점: `grading.jsx:537` `findBodyForLayer` — `piece=null` 레이어 즉시 -1 반환
- 사용자 제공 필요: XL.ai 레이어 목록 + `grading-debug.log`

**상세 분석**: `.claude/knowledge/errors.md`의 "grading v2 리팩토링 안전장치 3종 누락" 항목

---

## 진행 현황표
| 단계 | 내용 | 상태 |
|------|------|------|
| 0~7 | 기본 기능(패턴/디자인/사이즈/CMYK/Illustrator/APCA) | ✅ 완료 |
| 8 | 설치형 배포 + 자동 업데이트 | ✅ v1.0.0 배포 완료 |
| 9 | Drive 연동 (자동 동기화) | ✅ |
| 10~11 | Phase 1/2 (WorkSetup, 패턴 선택) | ✅ |
| 12 | Phase 3 (즐겨찾기) | ✅ |
| 12-A | SVG 일괄 표준화 Phase 1 | ✅ 완료 (v1.0.0 포함) |
| **12-B** | **AI→SVG 자동 변환 Phase 1** | ✅ **완료** (1-A~1-H, 커밋 A/B/C, reviewer 🟢) |
| 12-C | 양면 유니폼 그레이딩 버그 4종 | ✅ 완료 |
| 13 | Phase 4 (OrderGenerate 통합) | ✅ |
| - | 수정 요청 #1 (3XL 요소 과대) | ✅ 수정됨, 실테스트 대기 |
| - | 수정 요청 #2/#3 | ⏳ 실테스트 대기 |

---

## 프로젝트 핵심 정보
- **기술 스택**: Tauri 2.x + React 19 + TypeScript + react-router-dom 7, Python 엔진(PyMuPDF/reportlab/pillow/openpyxl/svgpathtools), CSS+BEM(Tailwind 금지)
- **빌드**: `dev.bat` (MSVC), `build.bat`
- **주요 폴더**: `src/pages`, `src/components`, `src/services`, `src/stores`, `src/types`, `src-tauri`, `python-engine`, `illustrator-scripts`
- **데이터**: `$APPDATA/com.grader.app/` (presets/categories/settings/favorites.json), Drive `G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG` (60초 쿨다운), sessionStorage `grader.session`

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
| 2026-04-23 | pm | v1.0.0 Release Notes 작성 + Publish (자동 업데이트 활성화) | ✅ Draft→Published |
| 2026-04-24 | pm | 직원 배포용 공지문 + SVG 표준화 Phase 1-7 정리 | 커밋 2a6ac97/bc30017 |
| 2026-04-24 | debugger | 수정 요청 3건 v2 코드 정적 재검증 | 🔴#1 확실 / 🟡#2,#3 실테스트 필요 |
| 2026-04-24 | developer | 버그 #1 A안: ELEMENT_SCALE_EXPONENT 1.0 → 0.95 | 커밋 801bee4 |
| 2026-04-25 | pm | 수정 요청 3건 사용자 테스트 가이드 작성 | TEST-GUIDE-2026-04-25.md |
| 2026-04-25 | planner-architect | AI→SVG 자동 변환 Phase 1 MVP 설계 | PLAN-AI-TO-SVG.md 1017줄 |
| 2026-04-25 | developer | AI→SVG Phase 1-A/1-B (Python+Rust 엔진) | 커밋 A `63668d4` |
| 2026-04-25 | developer | AI→SVG Phase 1-C/1-D/1-E/1-F (Service+driveSync+Modal+PatternManage) | 커밋 B `629d805` |
| 2026-04-25 | reviewer | AI→SVG Phase 1-G 코드 리뷰 (8파일) | 🟢 우수, critical 0, 권장 3 |
| 2026-04-25 | developer | reviewer 권장 3건 처리 (Any 삭제/--ps 교체/invokeAndParse 헬퍼) | refactor only, 동작 변경 0 |

---

## ⏸ 보류 (다음 작업)
- **수정 요청 3건 실행 테스트** (사용자, TEST-GUIDE-2026-04-25.md) — 우선순위 높음
- **AI→SVG Phase 1 실 사용 검증** (G드라이브 AI 변환, 사용자 담당)
- 직원 첫 설치 피드백 수집 → INSTALL-GUIDE-STAFF.md FAQ 갱신
- AI→SVG **Phase 2** (PostScript AI 지원, Illustrator COM, 3~4시간)
- AI→SVG **Phase 3** (자동 백그라운드 변환, 옵트인, 2~3시간)
- SVG 표준화 Phase 2 (슬림/V넥/하의, JSON 프리셋 외부화)
- 자동 업데이트 실제 검증은 v1.0.1 릴리스 시 자연스럽게

### 💡 Phase 1-6 tester용 회귀 테스트 명령 (참고 보관)
```bash
cd "C:\0. Programing\grader\python-engine"
venv\Scripts\activate && pip install -r requirements.txt
mkdir C:\temp\svg_test
copy "G:\...\양면유니폼_U넥_스탠다드_L.svg" C:\temp\svg_test\
copy "G:\...\양면유니폼_U넥_스탠다드_2XL.svg" C:\temp\svg_test\
python main.py normalize_batch "C:/temp/svg_test" "C:/temp/svg_test/양면유니폼_U넥_스탠다드_2XL.svg"
```
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
| PLAN-AUTO-UPDATE.md | Phase A~D 완료, v1.0.0 배포 |
| PLAN-SVG-STANDARDIZATION.md | Phase 1-1~1-5 완료 (v1.0.0 포함) |
| **PLAN-AI-TO-SVG.md** | **Phase 1 완료**, Phase 2/3 대기 |
