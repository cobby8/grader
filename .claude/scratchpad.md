# 작업 스크래치패드

## 🎯 다음 세션 시작 가이드

### 📂 작업 폴더
```
C:\0. Programing\grader
```
이 폴더를 Claude Code나 VS Code에서 열고 시작하세요.

### 🚦 시작 시 할 일 (우선순위 순)
1. **사용자에게 2개 질문 받기** (Phase 1-3 완료 후 Phase 1-4 진입 전 확인 필요):
   - ① 분류 로직 수정 승인 (폭 우선 비교 + 4그룹 위쪽쌍 채택 정책)
   - ② CLI 인터페이스 확정 (preview_normalize의 `;` 구분)
2. **승인 받으면** Phase 1-4 착수: Rust Tauri 커맨드 추가
3. 그 후 순서대로: 1-5 (UI) → 1-6 (통합 테스트) → 1-7 (커밋)
4. Phase 1 완료 후 → **AI→SVG 자동 변환 기능** 설계/구현 착수

---

## 현재 작업
- **요청**: 🆕 **SVG 일괄 표준화 기능** 신규 추가 (Phase 1)
- **상태**: **Phase 1-3 완료** → 사용자 확인 필요 → 1-4 대기
- **현재 담당**: pm → 사용자 (2개 확인 질문) → developer (1-4)
- **배경**: 디자이너가 12개 사이즈 SVG 등록 시 구조 차이 자동 표준화. U넥 양면유니폼 작업 경험을 grader에 이식.

### 🔒 사용자 확정 사항 (Phase 1, 2026-04-21)
- **기능명**: "SVG 일괄 표준화"
- **범위**: U넥 양면유니폼 전용 (좁지만 안전)
- **진행**: Phase 1만 즉시 (Phase 2/3은 실사용 후 판단)

### 📋 SVG 표준화 작업 단계 (Phase 1)
| # | 작업 | 담당 | 상태 |
|---|------|------|------|
| 1-1 | svg_normalizer.py 모듈 작성 (4개 스크립트 통합, 950줄) | developer | ✅ 완료 |
| 1-2 | requirements.txt에 svgpathtools 추가 | developer | ✅ 완료 |
| 1-3 | main.py CLI 커맨드 3개 추가 + 분류 로직 보강 | developer | ✅ 완료 (py_compile PASS + 멱등성 PASS) |
| 1-4 | Rust Tauri 커맨드 추가 | developer | ⏳ 대기 (사용자 2개 확인 후) |
| 1-5 | PatternManage.tsx UI (버튼 + 모달) | developer | 대기 |
| 1-6 | 통합 테스트 (U넥 폴더로 회귀 검증) | tester | 대기 |
| 1-7 | 커밋 + scratchpad/knowledge 기록 | pm | 대기 |

### ❓ 사용자 확인 필요 (1-4 진입 전)
1. **분류 로직 수정 승인**: 이번에 추가한 "폭 우선 비교 + 4그룹 위쪽쌍 채택" 정책이 향후 다른 의류(배구/야구/럭비)에도 안전한지 (현재는 U넥 양면유니폼 한정 가정)
2. **CLI 인터페이스 확정**: 인자/옵션 형식이 React UI에서 호출하기 적절한지 (특히 `preview_normalize <folder_or_files>`의 `;` 구분자)

### 🔜 SVG 표준화 후 착수 예정
- **🆕 AI→SVG 자동 변환 기능** (2026-04-21 사용자 확정)
  - **방식 확정**: 기존 JSX 스크립트 방식 / 별도 페이지 (사이드바 "AI 변환")
  - **대상**: `G:\공유 드라이브\...\2026 커스텀용 패턴` → `00. 2026 커스텀용 패턴 SVG`
  - **외부 검증 완료**: 63개 AI→SVG 변환 성공 (PyMuPDF 56개 + Illustrator COM 7개)
  - **작동 방식**:
    - PDF 호환 AI(`%PDF-1.4`) → PyMuPDF `page.get_svg_image(text_as_path=True)` 직접 변환
    - PostScript AI(`%!PS-Adobe`) → Illustrator JSX로 PDF 재저장 → PyMuPDF → SVG
  - **Phase 1 완료 후** `@agent-planner-architect`에게 상세 설계 위임

### ⏸ 일시 보류된 작업
- **Phase 3 (즐겨찾기)**: 구현 완료 상태, SVG 표준화 우선
- grading.jsx 누적 회귀 감사 (PLAN-GRADING-RECOVERY.md)

### 🔜 남은 Phase (보류)
- Phase 4 (2~3일): OrderGenerate 통합 (tsc/build PASS 상태)
- Phase 5 (2~3일): PDF 파이프라인 제거 (MVP 후)
- Phase 6 (1일): 문서 정리

## SVG 표준화 구현 기록 (Phase 1-1, 1-2, 1-3)

### 변경 파일
| 파일 | 변경 | 규모 |
|------|------|------|
| python-engine/svg_normalizer.py | 신규 + 4그룹 분류 보강 | 950+25줄 |
| python-engine/requirements.txt | svgpathtools>=1.6.0 추가 | 1줄 |
| python-engine/main.py | 3개 CLI 커맨드 추가(measure_svg/preview_normalize/normalize_batch) | +110줄 |

### 핵심 상수 (svg_normalizer.py)
- `NORMALIZER_VERSION = "1.0-uneck-double-sided"`
- 아트보드: 4478.74 × 5669.29
- Offset (큰 패턴): X=313.58, Y=2665.92 / (작은 패턴): X=2761.24
- 절단선 마진: 28.52
- Y 좌표 고정값: 절단선/패턴 각 4개 그룹

### 공개 API
**디버깅**: `measure_svg_bboxes` / `classify_svg_paths` / `preview_normalization`  
**핵심**: `normalize_svg(file, base, out, backup=True)` / `normalize_batch(folder, base, backup=True)`  
**CLI**: `python main.py measure_svg <svg>` / `preview_normalize <folder_or_files>` / `normalize_batch <folder> <base> [--no-backup]`

### 분류 로직 보강 (Phase 1-3에서 발견 및 수정)
**버그**: 4그룹 구조 SVG(12 path) 입력 시 좌측 큰 패턴 누락 → 재변환 시 좌표 망가짐  
**수정**: 
1. path 분리 → 패턴 vs 절단선 (높이 < 5)
2. 패턴 4개(4그룹) → y_min 기준 위쪽 쌍만 채택, 절단선 8개도 위쪽 4개만
3. 큰/작은 결정: **폭 우선 비교** (이전: x_min 비교 → 4그룹 오작동)

**검증 결과** (분류 후 big/small):
| 파일 | path 수 | big_x_min | big_width | small_x_min | small_width |
|------|---------|-----------|-----------|-------------|-------------|
| L.svg.bak (원본 6) | 6 | 2354.36 (우측) | 1712.46 | 328.64 (좌측) | 1712.36 |
| L.svg (변환됨 12) | 12 | 313.57 (좌측) | 1712.46 | 2396.08 (우측) | 1712.36 |
| 2XL.svg (기준 12) | 12 | 313.58 (좌측) | 1825.89 | 2367.79 (우측) | 1825.75 |

### 멱등성(Idempotency) 검증
- C:/temp/svg_test 에 L.svg + 2XL.svg 복사 후 normalize_batch 2회 연속 실행
- pass1 결과 hash: `e235a5a4161e98bcfd711ac0810a8039`
- pass2 결과 hash: `e235a5a4161e98bcfd711ac0810a8039` (**동일**)
- checks 6개 모두 PASS → 재변환해도 비트 단위 동일

### 회귀 테스트 (기존 main.py)
| 커맨드 | 결과 |
|--------|------|
| `--help` | 16개 커맨드 정상 (기존 13 + 신규 3) |
| `svg_bbox <L.svg>` | success=True |
| `extract_clip_paths <L.svg>` | success=True |
| `unknown_cmd` | success=False, 안내 에러 |

💡 **tester 참고 (Phase 1-6에서 쓸 명령)**:
```bash
cd "C:\0. Programing\grader\python-engine"
venv\Scripts\activate
pip install -r requirements.txt

# 임시 폴더 회귀 테스트 (안전, 권장)
mkdir C:\temp\svg_test
copy "G:\...\양면유니폼_U넥_스탠다드_L.svg" C:\temp\svg_test\
copy "G:\...\양면유니폼_U넥_스탠다드_2XL.svg" C:\temp\svg_test\
python main.py normalize_batch "C:/temp/svg_test" "C:/temp/svg_test/양면유니폼_U넥_스탠다드_2XL.svg"
```
정상 기준: `success=True`, pass_count = total - skipped_count, fail_count=0

⚠️ **G:\ 드라이브 직접 실행 주의**: 이미 변환된 파일도 재변환되어 mtime 갱신 → Drive 동기화 트리거 가능

## 진행 현황표
| 단계 | 내용 | 상태 |
|------|------|------|
| 0~7 | 기본 기능(패턴/디자인/사이즈/CMYK/Illustrator/APCA) | ✅ 완료 |
| 8 | 설치형 배포 준비 | ⏸ 보류 (커밋 eda27b9) |
| 9 | Drive 연동 (자동 동기화) | ✅ 커밋 8ec96a3 외 |
| 10 | 작업 흐름 Phase 1 (WorkSetup + 세션) | ✅ 커밋 3efa370, ad3d073 |
| 11 | Phase 2 (패턴 선택 모드) | ✅ 커밋 3e5a069 외 |
| 12 | Phase 3 (즐겨찾기) | ✅ tsc/build PASS (보류 중) |
| 12-A | SVG 일괄 표준화 Phase 1 | 🔨 진행중 (1-1~1-3 완료 / 1-4~1-7 대기) |
| 12-B | AI→SVG 자동 변환 | ⏳ 12-A 완료 후 |
| 13 | Phase 4 (OrderGenerate 통합) | ✅ tsc/build PASS |

## 프로젝트 핵심 정보

### 기술 스택
- Tauri 2.x + React 19 + TypeScript + react-router-dom 7
- Python 엔진 (PyMuPDF/reportlab/pillow/openpyxl/svgpathtools)
- 빌드: `dev.bat` (MSVC), 배포: `build.bat`
- CSS: 순수 CSS + BEM (Tailwind 금지)

### 주요 파일
```
grader/
├── src/pages/ (WorkSetup, PatternManage, DesignUpload, SizeSelect, FileGenerate, Settings, OrderGenerate)
├── src/components/ (Sidebar, CategoryTree)
├── src/services/ (driveSync, svgResolver)
├── src/stores/ (sessionStore, presetStore, categoryStore, designStore, generationStore, svgCacheStore, settingsStore, favoritesStore)
├── src/types/ (pattern, design, generation, order, session)
├── src-tauri/ (Rust + capabilities)
├── python-engine/ (PDF 분석, 주문서 파서, SVG 표준화)
├── illustrator-scripts/grading.jsx (ES3, 활성), grading-v2.jsx (607줄, 대기)
└── PLAN-*.md, REPORT-*.md 다수
```

### 데이터 저장
- `$APPDATA/com.grader.app/` presets.json / categories.json / settings.json / favorites.json
- Drive: `G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG` (60초 쿨다운)
- 세션: sessionStorage `grader.session` (workFolder, baseAiPath, selectedPresetId)

## 기획설계 참조
| 계획서 | 상태 | 요약 |
|--------|------|------|
| PLAN-GRADING-REBUILD.md | 구현됨 (grading-v2.jsx 607줄) | grading.jsx 원점 재구축 (dd51cc5 참조) |
| PLAN-PIECE-AWARE-LAYOUT.md | Phase 1+2 구현 | 조각 인식 기반 요소 배치 |
| PLAN-GRADING-RECOVERY.md | Beta 권장안 반영 | 3버그 독립 진단 후 개별 수정 |
| PLAN-GRADING-REDESIGN.md | D1 권장안 구현 | 몸판 중심 고정 스케일 |
| PLAN-WORKFLOW-REDESIGN.md | Phase 1~4 완료 | 작업 흐름 재설계 |
| PLAN-GDRIVE-SYNC.md | 옵션 4 구현 | Drive 자동 동기화 |

## 테스트 결과 (tester)
(Phase 1-6 통합 테스트에서 검증 예정)

## 리뷰 결과 (reviewer)
(Phase 1-6 완료 후 리뷰)

## 수정 요청 (누적 보류)
| 요청자 | 대상 파일 | 문제 설명 | 상태 |
|--------|----------|----------|------|
| user | grading.jsx / 3XL.svg | 3XL 사이즈 요소가 몸판 벗어나 과하게 큼 | 🔍 조사 중 (추가 정보 대기) |
| user | 3XL.svg / 4XL.svg | 3XL/4XL 요소가 몸판 상단 튀어나감 | 🔍 조사 중 (SVG 검증 대기) |
| user | grading.jsx / OrderGenerate | 기준 AI = XL로 XL 타겟 시 요소 하나도 안 들어옴 | 🔍 조사 중 (로그 필요) |
| user | grading.jsx (c52d80f 회귀) | STEP 8B selection 오염 | ✅ 수정 완료 — 사용자 테스트 대기 |

## 작업 로그 (최근 10건)
| 날짜 | 에이전트 | 작업 내용 | 결과 |
|------|---------|----------|------|
| 2026-04-16 | developer | grading-v2.jsx 신규 생성 (607줄, 원점 재구축) | 구현 완료 |
| 2026-04-16 | developer | grading.jsx 성능 최적화: 로그 DEBUG_LOG 조건부 전환 | 구현 완료 |
| 2026-04-20 | pm(외부) | G드라이브 AI↔SVG 대조 63개 도출, 파이프라인 검증 | 63/63 성공 |
| 2026-04-21 | developer | SVG 표준화 Phase 1-1: svg_normalizer.py 950줄 작성 | 구현 완료 |
| 2026-04-21 | developer | SVG 표준화 Phase 1-2: requirements.txt svgpathtools 추가 | 구현 완료 |
| 2026-04-21 | developer | SVG 표준화 Phase 1-3: main.py CLI 3개 + 분류 로직 보강 | py_compile PASS + 멱등성 PASS |
| 2026-04-21 | pm | grader에 AI→SVG 변환 기능 타당성 분석 → "매우 높음" | 기존 Illustrator 연동 재사용 가능 확인 |
| 2026-04-21 | pm | scratchpad 정리 (1482→~200줄, -87%) + 다음 세션 가이드 추가 | 완료 |
