# 작업 스크래치패드

## 🎯 다음 세션 시작 가이드
1. **PLAN-AI-TO-SVG.md 검토** (1017줄, 12섹션) → 승인 시 developer Phase 1-A 착수
2. **수정 요청 3건 테스트** 결과 확인 (TEST-GUIDE-2026-04-25.md, 사용자 담당)
3. **AI→SVG 자동 변환 Phase 1 구현** (Phase 1-A ~ 1-H, 총 8.5~13.5시간)

---

## 현재 작업
- **요청**: AI→SVG Phase 1-B Rust 커맨드 2개 추가 (`ai_convert_preview`/`ai_convert_batch`)
- **상태**: 🔨 **developer 구현 중** (1-A 완료 ✅, 1-B 진행)
- **현재 담당**: developer → (다음) 커밋 A (1-A + 1-B 묶음) → 1-D 또는 1-C
- **병행 대기**: 수정 요청 3건 테스트 (TEST-GUIDE-2026-04-25.md, 사용자 담당)

---

## 기획설계 (planner-architect)

### [2026-04-25] AI→SVG 자동 변환 Phase 1 MVP 상세 설계 완료
- **산출물**: `PLAN-AI-TO-SVG.md` (1017줄, 12섹션 + 부록 3개)
- **범위**: PyMuPDF 기반 반자동 변환 (PDF 호환 AI 약 89% 커버)
- **예상**: **8.5~13.5시간** (Phase 1-A~1-H)
- **신규 4파일 / 수정 5파일** (3층 구조 미러: Python ← Rust ← React)
- **핵심 분기**: AI 헤더 10바이트 (`%PDF-` → PyMuPDF / `%!PS-Adobe` → Phase 2 skip / 그 외 → 에러)
- **커밋 전략**: A(엔진 Python+Rust) → B(UI React+driveSync) → C(docs)
- **사용자 확정 5건**: 반자동 / 동일 폴더 저장 / 기본 skip + 옵션 덮어쓰기 / Phase 1 PyMuPDF만 / Phase 분할
- **외부 검증**: 2026-04-20 G드라이브 63개 100% 성공 (PyMuPDF 56 + Illustrator COM 7) — Phase 1은 89% 커버

---

## 수정 요청 3건 진행 상황 (요약)

### ✅ 버그 #1: 3XL 요소 과대 — **수정됨**
- 조치: `ELEMENT_SCALE_EXPONENT` 1.0 → 0.95 (커밋 `801bee4`)
- 사용자 실행 테스트 대기 (TEST-GUIDE-2026-04-25.md 테스트 A)

### 🟡 버그 #2: 3XL/4XL 요소 상단 튀어나감 — **실행 테스트 필요**
- 상태: 버그 #1 수정으로 자연 완화 가능, v2 구조 개선으로 v1 근본 버그는 해결됨
- 재현 체크: EPS에서 요소 top Y > 몸판 top Y 여부
- 로그 체크: `grading-debug.log`의 `타겟Bottom` vs `bodyTop`
- #1 수정 후 재발 시 → `placeElementGroupPerPiece` Y 상한 가드 추가 (1~2h)

### 🟡 버그 #3: XL 타겟 요소 0개 — **AI 레이어 구조 확인 필요**
- 의심 지점: `grading.jsx:537` `findBodyForLayer` — `piece=null` 레이어 즉시 -1 반환
- 재현 조건: `"요소"`(piece=null) + `"요소_표_앞"`(piece="앞") 혼재 AI 파일
- 사용자 제공 필요: XL.ai 레이어 목록 + `grading-debug.log`
- 재발 시 → piece=null 폴백 로직 추가 (2~3h)

**상세 분석**: `.claude/knowledge/errors.md`의 "grading v2 리팩토링 안전장치 3종 누락" 항목 참조

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
| **12-B** | **AI→SVG 자동 변환** | 🔨 **Phase 1 설계 완료 (구현 대기)** |
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

## 구현 기록 (developer)

### developer [2026-04-25] Phase 1-A: ai_converter.py + main.py CLI (AI→SVG)

📝 **구현한 기능**: PyMuPDF 기반 AI→SVG 자동 변환 Python 엔진 (헤더 10바이트 분기 + atomic write)

| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| `python-engine/ai_converter.py` | 437줄 신규 — 헤더 분류 + PyMuPDF 변환 + atomic write | 신규 |
| `python-engine/main.py` | +107줄 — `ai_convert_preview`/`ai_convert_batch` 분기 + `_expand_ai_files` 헬퍼 + help 2줄 + examples 3줄 | 수정 |

**ai_converter.py 구조**:
- 모듈 상수 3개: `CONVERTER_VERSION="1.0-pymupdf-pdf-compatible"`, `HEADER_PDF_PREFIX=b"%PDF-"`, `HEADER_POSTSCRIPT_PREFIX=b"%!PS-Adobe"`
- private 4개: `_read_header`(첫 10바이트), `_classify_ai`(분류), `_convert_pdf_compatible`(변환+atomic write), `_ai_to_svg_path`(경로 변환)
- public 2개: `preview_ai_conversion(files)` / `convert_ai_batch(files, overwrite)`

**핵심 구현 요점**:
- 헤더 첫 10바이트 검사로 `pdf_compatible`/`postscript`/`unknown` 분류 (lessons.md [2026-04-21] 교훈 반영)
- PyMuPDF `page.get_svg_image(text_as_path=True)` — 글자 path 변환으로 폰트 의존 제거
- atomic write (.tmp → `os.replace`) — 변환 중 강제 종료 시에도 svg 파일 안전
- overwrite=False 기본 + `--overwrite` 시 자동 .bak 백업 (shutil.copy2)
- 파일 단위 실패 → FAIL 기록만, 배치 중단 없이 다음 파일 계속 진행
- PostScript / unknown / 기존 SVG → SKIP 분류 (실패 아님)

**검증 (모두 PASS)**:
- py_compile ai_converter.py: ✅
- py_compile main.py: ✅
- help 출력에 `ai_convert_preview` + `ai_convert_batch` 2건 포함: ✅
- 빈 인자 테스트: ✅ `{"success": false, "error": "인자가 부족합니다..."}` 한 줄 JSON
- 없는 파일 테스트(preview): ✅ `entries: [], summary: {0,0,0,0}`
- 없는 파일 테스트(batch): ✅ `total: 0, converted: 0, results: []`
- `--overwrite` 옵션 인식: ✅
- 알 수 없는 옵션 거부: ✅ 한 줄 JSON 에러

**무변경 확인**: svg_normalizer.py, svg_parser.py, pdf_grader.py, pattern_scaler.py, pdf_handler.py, order_parser.py 모두 수정 없음 (`git status` 확인)
**requirements.txt**: PyMuPDF>=1.25.0 이미 등록되어 있음 (수정 불필요)

💡 **tester 참고**:
- 실제 AI 파일 변환 테스트는 사용자(G드라이브 접근 필요) 담당
- syntax/CLI 동작은 Phase 1-A 내에서 모두 검증됨
- Phase 1-B(Rust 커맨드) 완료 후에 통합 테스트 권장

⚠️ **reviewer 참고**:
- atomic write 구현부 (ai_converter.py L165~185) — `.tmp` 정리 분기까지 모두 처리되었는지 점검 권장
- backup=True 고정값 (convert_ai_batch L289) — Phase 1에선 항상 .bak 생성. 향후 옵션화 검토 가능

**다음 단계**: Phase 1-B Rust 커맨드 2개 (`src-tauri/src/lib.rs`에 `ai_convert_preview`/`ai_convert_batch` 추가, 기존 `run_python` 재사용 패턴 — SVG 표준화 Phase 1-4와 동일)

### developer [2026-04-25] Phase 1-B: lib.rs Rust 커맨드 2개 (AI→SVG)

📝 **구현한 기능**: Phase 1-A의 Python CLI를 Tauri invoke로 노출

| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| `src-tauri/src/lib.rs` | +47줄 / -1줄 — `ai_convert_preview`/`ai_convert_batch` 커맨드 2개 + invoke_handler 등록 + 한국어 주석 | 수정 |

**구현 요점**:
- SVG 표준화 Phase 1-4(2026-04-22) 패턴 완전 미러 — 신규 발명 0
- `run_python` 재사용 (lib.rs L122~177) — Python subprocess 로직 중복 안 함
- 반환 타입 `Result<String, String>` (PLAN 6-3 준수, 프론트에서 `JSON.parse`)
- sync fn 유지 (run_python이 sync `Command::output()` 기반, Tauri가 자동 스레드풀 실행)
- `overwrite` bool → "--overwrite" 인자 변환은 Rust 측에서 처리 (Python 측 args 구성 실수 차단)
- camelCase 변환: 프론트 호출은 `invoke<string>("ai_convert_preview", { files })` / `invoke<string>("ai_convert_batch", { files, overwrite })`
- `svg_normalize_batch` 뒤 콤마 추가 + 신규 라인 2개 (트레일링 콤마 없이 `ai_convert_batch`로 끝)

**최종 lib.rs 구조** (검증 grep 결과):
- L414 `fn svg_preview_normalize` (무변경)
- L435 `fn svg_normalize_batch` (무변경)
- L461 `fn ai_convert_preview` ⭐ 신규
- L480 `fn ai_convert_batch` ⭐ 신규
- L515~519 invoke_handler 등록 (svg 2개 + ai 2개)

**검증 (모두 PASS)**:
- `cargo check` (src-tauri): ✅ `Finished dev profile in 18.72s`, 에러 0
- 함수 정의 grep: ✅ 2건 (L461, L480)
- invoke_handler 등록 grep: ✅ ai_convert_preview/ai_convert_batch 각 2건씩 출현 (정의+등록)
- 기존 svg_preview_normalize/svg_normalize_batch 무변경: ✅ L414/L435 위치 보존

**무변경 확인**: lib.rs 외 다른 Rust 파일 수정 0건, Python 엔진 수정 0건, Cargo.toml 수정 0건, capabilities 수정 0건

💡 **tester 참고**:
- 이 단계 단독 통합 테스트는 어려움 (프론트 호출 코드가 아직 없음)
- Phase 1-C(aiConvertService.ts)까지 완료된 후에 `invoke("ai_convert_preview", { files: "..." })` end-to-end 테스트 가능
- `cargo check` 통과로 컴파일 타임 시그니처 정합성은 확보됨

⚠️ **reviewer 참고**:
- 신규 발명 0 — 완전 미러 패턴이라 별도 검토 포인트 적음
- 인자명 `files`(camelCase 변환 후 `files`)는 Phase 1-A `_expand_ai_files`와 짝
- `overwrite` bool 변환 흐름이 Phase 1-A의 `--overwrite` 인자와 정확히 매칭되는지만 검토 권장

**다음 단계**: 커밋 A (Phase 1-A + 1-B 묶음). 그 이후 Phase 1-C(aiConvertService.ts) 또는 1-D(driveSync.ts) 진행.


## 테스트 결과 (tester)
(해당 없음 — 수정 요청 3건은 사용자 실테스트 담당)

## 리뷰 결과 (reviewer)
(해당 없음)

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
| 2026-04-22 | developer | 자동 업데이트 Phase D 배포 가이드 문서 3종 작성 | ✅ RELEASE-GUIDE/CHANGELOG/INSTALL-GUIDE-STAFF 총 768줄 |
| 2026-04-23 | pm | v1.0.0 서명 키 재생성 + GitHub Actions 빌드 성공 (8분 6초) | 커밋 27a46eb~4e51365 |
| 2026-04-23 | pm | v1.0.0 Release Notes 작성 + Publish (자동 업데이트 활성화) | ✅ Draft→Published |
| 2026-04-24 | pm | 직원 배포용 공지문 3종 작성 (NOTICE-v1.0.0.md) | 커밋 2a6ac97 |
| 2026-04-24 | pm | SVG 표준화 Phase 1-7 문서 정리 (architecture+lessons+index 갱신) | 커밋 bc30017 |
| 2026-04-24 | debugger | 수정 요청 3건 v2 코드 정적 재검증 | 🔴#1 확실 / 🟡#2,#3 실테스트 필요 |
| 2026-04-24 | developer | 버그 #1 A안: ELEMENT_SCALE_EXPONENT 1.0 → 0.95 | 커밋 801bee4 |
| 2026-04-25 | pm | 수정 요청 3건 사용자 테스트 가이드 작성 (TEST-GUIDE-2026-04-25.md) | ✅ 버그 #1/#2/#3 검증 체크리스트 |
| 2026-04-25 | planner-architect | AI→SVG 자동 변환 Phase 1 MVP 설계 (PLAN-AI-TO-SVG.md 1017줄) | ✅ 12섹션+부록 3개, knowledge 7건 갱신 |
| 2026-04-25 | pm | scratchpad 정리 (273줄 → ~135줄) | ✅ 디버거 조사 상세 → errors.md 참조로 단순화 |
| 2026-04-25 | developer | AI→SVG Phase 1-B: lib.rs Rust 커맨드 2개 추가 | ✅ ai_convert_preview/ai_convert_batch + invoke_handler, cargo check 통과 |

---

## ⏸ 보류 (다음 작업)
- 사용자 PLAN-AI-TO-SVG.md 검토 → 승인 후 developer Phase 1-A 착수
- 수정 요청 3건 실행 테스트 (사용자, TEST-GUIDE-2026-04-25.md)
- 직원 첫 설치 피드백 수집 → INSTALL-GUIDE-STAFF.md FAQ 갱신
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
| **PLAN-AI-TO-SVG.md** | **Phase 1 설계 완료 (구현 대기)** |
