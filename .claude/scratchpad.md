# 작업 스크래치패드

## 현재 작업
- **요청**: 승화전사 유니폼 패턴 자동 생성 프로그램 개발
- **상태**: 개발 5단계 진행 중 (CMYK 고급 검증 + 출력 고도화)
- **현재 담당**: developer

## 진행 현황표

| 단계 | 내용 | 상태 |
|------|------|------|
| 0 | 기획설계 + REPORT.md 작성 | ✅ 완료 |
| 1 | Tauri 2.x + React + TS 프로젝트 세팅 + UI 기본 틀 | ✅ 완료 |
| 2 | 패턴 프리셋 시스템 (SVG 업로드, 치수 테이블, 로컬 저장) | ✅ 완료 |
| 3 | 디자인 파일 처리 + Python 엔진 (PDF 업로드, CMYK 검증, 미리보기) | ✅ 완료 |
| 4 | 사이즈 선택 + 그레이딩 파일 생성 (CMYK 보존 스케일링) | ✅ 완료 |
| 5 | CMYK 보존 + 출력 고도화 (ICC 프로파일, Ghostscript 검증) | ⏳ 대기 |
| 6 | 통합 테스트 | ⏳ 대기 |

## 프로젝트 핵심 정보

### 확정 기술 스택
- **프론트**: Tauri 2.x + React 19 + TypeScript + react-router-dom 7
- **Python 엔진**: python-engine/venv (PyMuPDF 1.27, reportlab 4.4, pillow 12.2)
- **빌드**: `dev.bat` (MSVC 환경, Git Bash에서 `npm run tauri dev` 불가)
- **CSS**: 순수 CSS + 변수 + BEM 네이밍 (Tailwind 금지)
- **상태 관리**: React useState + sessionStorage (라이브러리 미사용)

### 프로젝트 구조 요약
```
grader/
├── src/
│   ├── components/ (Header, Sidebar, StatusBar)
│   ├── pages/ (PatternManage, DesignUpload, SizeSelect, FileGenerate)
│   ├── types/ (pattern, design, generation)
│   ├── stores/ (presetStore, designStore, generationStore)
│   └── App.tsx, App.css, main.tsx
├── src-tauri/ (Rust, run_python 커맨드, dialog/fs/opener 플러그인)
├── python-engine/
│   ├── main.py (CLI 엔트리)
│   ├── pdf_handler.py (정보/CMYK/미리보기)
│   ├── pattern_scaler.py (스케일 비율 계산)
│   ├── pdf_grader.py (show_pdf_page로 CMYK 보존 그레이딩)
│   └── venv/ (gitignore)
└── REPORT.md, build.bat, dev.bat
```

### 데이터 저장 위치
- 프리셋: `$APPDATA/presets.json`
- 디자인: `$APPDATA/designs.json` + `$APPDATA/designs/{id}.pdf/.preview.png`
- 출력: `$APPDATA/outputs/{timestamp}/{디자인명}_{사이즈}.pdf`
- 페이지 간 상태: sessionStorage key=`grader.generation.request`

## 기획설계 (planner-architect)
완료 — REPORT.md (10장) + decisions.md + architecture.md 참조

## 구현 기록 (developer)
1~4단계 모두 완료. 각 단계 상세는 git 로그 참조 (커밋 메시지에 요약).

### [2026-04-08] 5단계: CMYK 고도화 + 출력 최적화

📝 구현 요약:
- Python `analyze_color_space_detailed()` 신규 — 콘텐츠 스트림 바이트에서 벡터 페인트 연산자(k/K, rg/RG, g/G) 정규식 감지 → reportlab 벡터 CMYK 정상 판정 가능해짐
- `generate_graded_pdf`에 파일 크기/압축률(`file_size_bytes`, `original_size_bytes`, `compression_ratio`) 반환 필드 추가 + `deflate_images/deflate_fonts` 저장 옵션 (구버전 폴백 포함)
- 새 CLI 커맨드 `analyze_color` 추가 (기존 `verify_cmyk`, `get_pdf_info`, `generate_graded` 유지)
- TS 타입 `ColorAnalysis`, `PageColorInfo`, `AnalyzeColorResult` 신규 / `DesignFile.colorAnalysis?` 선택 필드
- `DesignUpload` 업로드 플로우에 `analyze_color` 호출 추가 (실패 내성 try/catch), 카드에 V-CMYK/V-RGB/IMG-CMYK/IMG-RGB/ICC 배지 + 경고 리스트 UI
- `FileGenerate` 결과 목록에 파일 크기 + 압축률 표시

| 파일 | 변경 | 신규/수정 |
|------|------|----------|
| python-engine/pdf_handler.py | `_detect_vector_color_operators` + `analyze_color_space_detailed` 추가 | 수정 |
| python-engine/pdf_grader.py | 저장 옵션 강화 + file_size/compression_ratio 반환 | 수정 |
| python-engine/main.py | `analyze_color` CLI 커맨드 추가 | 수정 |
| src/types/design.ts | `ColorAnalysis`, `PageColorInfo`, `AnalyzeColorResult` 타입 + DesignFile.colorAnalysis | 수정 |
| src/types/generation.ts | GenerationResult/GenerateGradedResult에 파일 크기 필드 | 수정 |
| src/pages/DesignUpload.tsx | analyze_color 호출 + toColorAnalysis + 상세 배지/경고 UI | 수정 |
| src/pages/FileGenerate.tsx | formatFileSize + 결과 목록에 크기/압축률 표시 | 수정 |
| src/App.css | 신규 배지 5종(vector-cmyk/rgb, img-cmyk/rgb, icc, gray) + 경고 리스트 + gen-result 크기 스타일 | 수정 |

🆕 새 Python CLI 커맨드:
- `python main.py analyze_color <pdf_path>` → `{overall, pages[], warnings[], has_vector_cmyk, ...}` 반환

💡 tester 참고:
- 테스트 방법:
  1. `npx tsc --noEmit` 통과 확인 (이미 통과)
  2. `npx vite build` 통과 확인 (이미 통과, 266KB JS)
  3. `dev.bat`으로 실행 → 디자인 업로드 → 새 카드에 V-CMYK/IMG-CMYK 등 상세 배지 표시되는지 확인
  4. 파일 생성 후 결과 목록에 `1.2 MB (88%)` 같은 파일 크기/압축률 표시 확인
  5. Python CLI 수동 테스트: reportlab CMYK PDF로 `analyze_color` 호출 → `vector_cmyk: true, overall: "CMYK"` 반환 확인됨
- 정상 동작:
  - reportlab 벡터 CMYK도 `analyze_color`에서 `overall: "CMYK"` 판정됨 (4단계에서는 "Unknown"이었음)
  - `generate_graded` 결과에 파일 크기 정보 포함
  - 기존 디자인(colorAnalysis 없음)은 상세 배지가 표시되지 않고 기존 UI 그대로 (하위 호환)
- 주의할 입력:
  - 기존에 업로드한 디자인은 colorAnalysis가 없으므로 카드에 상세 배지가 안 나옴 → 재업로드 시에만 표시됨 (정상)
  - 매우 큰 PDF의 경우 `page.read_contents()`가 메모리 부담 가능성 있음 → MVP 범위 내에서는 OK
- Python 단위 테스트 결과:
  - CMYK 벡터 PDF: `overall=CMYK`, `vector_cmyk=true` ✓
  - RGB 벡터 PDF: `overall=RGB`, `vector_rgb=true`, warnings 2건 ✓
  - Mixed 벡터 PDF: `overall=Mixed`, `vector_cmyk & vector_rgb=true` ✓
  - 기존 `verify_cmyk`는 여전히 호환성 유지 (reportlab CMYK → Unknown 반환, 기존 동작)
  - `generate_graded`: `file_size_bytes=1178, original_size_bytes=1331, compression_ratio=0.885` ✓

⚠️ reviewer 참고:
- 새 기능은 모두 **선택적** (colorAnalysis는 `?`, 파일 크기 필드도 `?`) → 기존 데이터 호환
- Python → TS snake_case/camelCase 변환은 `toColorAnalysis()` 수동 매퍼로 처리 (의존성 추가 없음)
- `_detect_vector_color_operators` 정규식은 latin-1 디코딩 후 공백 경계로 매칭 — false positive 가능성 낮음
- reportlab의 실제 CMYK 출력 스트림 예: `0.5 0.3 0.2 0.1 k\n` (공백 구분, 소문자 k) → 정규식이 이 형태를 정확히 매칭
- PyMuPDF 구버전 호환을 위해 `deflate_images/deflate_fonts` TypeError 폴백 추가함

## 테스트 결과 (tester)
| 단계 | 판정 | 항목 | 이슈 |
|------|------|------|------|
| 1단계 | 통과 | 기본 빌드/구조 | CSS 하드코딩 4곳 (2단계에서 해결) |
| 2단계 | 통과 | 12/12 | 없음 |
| 3단계 | 최종 통과 | 21/21 | pdf_handler page_count 버그 1건 → 수정 완료 |
| 4단계 | 통과 | 30/30 | 없음 (실제 Illustrator PDF 수동 검증 권장) |
| 5단계 | 통과 | 10/10 | 없음 (analyze_color 3종 PDF 정확, 기존 CLI 호환, file_size 필드 정상) |

### 5단계 검증 상세 (경량)
- 빌드: `npx tsc --noEmit` 통과, `npx vite build` 통과 (266.90 KB JS / 18.38 KB CSS)
- Python 코드: `_detect_vector_color_operators`, `analyze_color_space_detailed` 함수 존재 확인 / `main.py`에 `analyze_color` 서브커맨드 정상 분기
- 신규 CLI: CMYK→`overall:CMYK vector_cmyk:true` / RGB→`overall:RGB vector_rgb:true warnings 2건` / Mixed→`overall:Mixed 양쪽 true`
- 호환성: `verify_cmyk`(reportlab PDF→Unknown, 기존 동작 유지) / `get_pdf_info`(page_count=1 정상) / `generate_graded` 모두 동작
- generate_graded 반환에 `file_size_bytes=1239, original_size_bytes=1373, compression_ratio=0.902` 정상 포함
- 에러 케이스: 존재하지 않는 파일 → `{success:false, error:"파일을 찾을 수 없습니다..."}` + exit 1 (정상)
- 하위 호환: `DesignFile.colorAnalysis?` 선택 필드 / `fileSizeBytes?` 등 모두 optional → TS 에러 없음
- `toColorAnalysis` 매퍼: Python이 항상 pages 배열 반환하므로 `.map()` 호출 안전

## 리뷰 결과 (reviewer)
(아직 없음 — 소규모 수정 시 tester만 실행 규칙에 따라 생략 중)

## 수정 요청
| 요청자 | 대상 파일 | 문제 설명 | 상태 |
|--------|----------|----------|------|
| tester | pdf_handler.py | page_count=0 반환 버그 | 완료 |

## 작업 로그 (최근 10건)
| 날짜 | 에이전트 | 작업 내용 | 결과 |
|------|---------|----------|------|
| 2026-04-08 | planner-architect | 워크플로우 확정 + 기준디자인 PDF 채택 + REPORT.md 전면 업데이트 | 완료 |
| 2026-04-09 | developer | 1단계: Tauri + React + TS 프로젝트 세팅 + UI 기본 틀 | 완료 |
| 2026-04-09 | pm | Git 초기화 + GitHub(cobby8/grader) 연결 + 푸시 | 완료 |
| 2026-04-08 | developer | 2단계: 패턴 프리셋 시스템 (CRUD + SVG + 치수 테이블 + 로컬 저장) | 완료 |
| 2026-04-08 | tester | 2단계 검증 | 통과 (12/12) |
| 2026-04-10 | developer | 3단계: Python엔진(PyMuPDF) + DesignUpload(업로드/CMYK/미리보기) | 완료 |
| 2026-04-10 | developer | 3단계 버그 수정: pdf_handler page_count | 완료 |
| 2026-04-10 | tester | 3단계 재검증 | 최종 통과 |
| 2026-04-10 | developer | 4단계: SizeSelect/FileGenerate + pattern_scaler/pdf_grader (CMYK 보존) | 완료 |
| 2026-04-10 | tester | 4단계 검증 | 통과 (30/30) |
| 2026-04-08 | developer | 5단계: analyze_color + 벡터 연산자 감지 + 파일 크기 리포트 + 상세 배지 UI | 완료 |
| 2026-04-08 | tester | 5단계 검증 (빌드+Python CLI 3종+호환성+파일크기필드) | 통과 (10/10) |
