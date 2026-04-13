# 작업 스크래치패드

## 현재 작업
- **요청**: 승화전사 유니폼 패턴 자동 생성 프로그램 개발
- **상태**: 확장 기능 개발 중 (엑셀 주문서 자동 인식)
- **현재 담당**: developer

## 진행 현황표

| 단계 | 내용 | 상태 |
|------|------|------|
| 0 | 기획설계 + REPORT.md 작성 | ✅ 완료 |
| 1 | Tauri 2.x + React + TS 프로젝트 세팅 + UI 기본 틀 | ✅ 완료 |
| 2 | 패턴 프리셋 시스템 (SVG 업로드, 치수 테이블, 로컬 저장) | ✅ 완료 |
| 3 | 디자인 파일 처리 + Python 엔진 (PDF 업로드, CMYK 검증, 미리보기) | ✅ 완료 |
| 4 | 사이즈 선택 + 그레이딩 파일 생성 (CMYK 보존 스케일링) | ✅ 완료 |
| 5 | CMYK 보존 + 출력 고도화 (벡터 CMYK 감지 + 파일 크기 리포트) | ✅ 완료 |
| 6 | 통합 테스트 (E2E 워크플로우 검증) | ✅ 완료 |

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

#### 개선 이력
| 회차 | 날짜 | 수정 내용 | 수정 파일 | 사유 |
|------|------|----------|----------|------|
| 1차 | 2026-04-08 | Form XObject 내부 CMYK 감지 확장 | python-engine/pdf_handler.py | 6단계 E2E 발견: 그레이딩 결과 PDF(Form XObject 래핑) 재분석 시 Unknown 오판정 |

**1차 수정 상세 (2026-04-08) — Form XObject 내부 CMYK 감지 확장**
- **문제**: `pdf_grader.generate_graded_pdf`가 `show_pdf_page`로 원본을 Form XObject(/fzFrm0)로 래핑하여 저장 → 결과 PDF의 최상위 콘텐츠 스트림에는 `Do` 연산자만 있고 실제 `k/K`는 Form XObject 내부 스트림에 보존됨 → 기존 `page.read_contents()`만 스캔하는 `analyze_color_space_detailed`는 그레이딩 결과를 `overall: "Unknown"`으로 오판정
- **수정**:
  1. `pdf_handler.py`에 `_scan_form_xobjects(doc)` 신규 함수 추가 — `doc.xref_length()`로 전체 xref 순회 → `xref_get_key(xref, "Subtype")`가 `/Form`인 객체만 골라 `xref_stream()`으로 바이트 추출 → 기존 `_detect_vector_color_operators`를 재사용하여 cmyk/rgb/gray 플래그 반환. 예외는 xref별로 안전하게 스킵, 3종 모두 감지 시 조기 종료 최적화.
  2. `analyze_color_space_detailed`에서 페이지 루프 직후 `_scan_form_xobjects(doc)` 호출하여 결과를 전역 `has_vector_cmyk/rgb/gray`에 OR 병합. 페이지별 `vector_*` 플래그도 Form XObject 감지 결과로 보완(단일 페이지 PDF 기준).
- **검증 (6/6 통과)**:
  - 회귀: CMYK 원본 → CMYK / RGB 원본 → RGB / Mixed 원본 → Mixed (이전 동작 유지)
  - 핵심: CMYK 그레이딩 결과(Form XObject) → CMYK (이전 Unknown) / RGB 그레이딩 → RGB / Mixed 그레이딩 → Mixed
  - 빌드: `npx tsc --noEmit` 통과, `npx vite build` 통과 (266.90 KB JS / 18.38 KB CSS — 이전과 동일)
- **실제 변경 파일**: `python-engine/pdf_handler.py` 단일 파일 (신규 함수 +70줄, 기존 함수 +25줄 병합 로직)
- **주의**: 프론트 TS 코드/타입/UI는 변경 없음 (백엔드 감지 로직만 확장). 사용자는 그레이딩 결과 재업로드 시 이제 CMYK 배지가 정상 표시됨.

### [2026-04-08] 확장: 엑셀 주문서 자동 인식

📝 구현 요약:
- Python `order_parser.py` 신규 — openpyxl로 xlsx 파일 전체 셀을 스캔하여 사이즈 키워드(5XS~5XL) 자동 감지, 인접 셀에서 수량 추출. 가로형/세로형/분산형 3가지 레이아웃 자동 판별.
- `main.py`에 `parse_order` CLI 서브커맨드 추가
- `SizeSelect.tsx`에 "엑셀 주문서로 선택" 버튼 추가 — Tauri 파일 다이얼로그(xlsx 필터) → Python parse_order 호출 → 반환된 사이즈로 체크박스 자동 체크 + 수량 배지 표시
- 기존 수동 체크박스 UI 완전 유지, "수동 선택으로 돌아가기" 버튼으로 초기화 가능
- 프리셋에 없는 사이즈가 엑셀에 있으면 경고 메시지 표시 + 해당 사이즈 선택 제외

| 파일 | 변경 | 신규/수정 |
|------|------|----------|
| python-engine/order_parser.py | 엑셀 주문서 파서 (사이즈 감지 + 수량 추출 + 형식 판별) | 신규 |
| python-engine/main.py | parse_order 서브커맨드 추가 + import 추가 | 수정 |
| python-engine/requirements.txt | openpyxl>=3.1.0 추가 | 수정 |
| src/types/order.ts | OrderSize, OrderParseResult, toOrderParseResult 타입/변환 함수 | 신규 |
| src/pages/SizeSelect.tsx | 엑셀 업로드 버튼 + 결과 요약 바 + 수량 배지 + 수동 복귀 | 수정 |
| src/App.css | btn--excel, order-summary, size-cell__qty, size-count__total 스타일 | 수정 |

🆕 새 Python CLI 커맨드:
- `python main.py parse_order <excel_path>` → `{success, sizes[{size,quantity}], total_quantity, source_sheet, detected_format}`

💡 tester 참고:
- 테스트 방법:
  1. `npx tsc --noEmit` 통과 확인 (통과)
  2. `npx vite build` 통과 확인 (통과, 269KB JS / 19.3KB CSS)
  3. Python CLI 수동 테스트: 가로형/세로형/표형 3종 엑셀 → 모두 success, 사이즈/수량 정확 추출
  4. `dev.bat`으로 실행 → SizeSelect 페이지 → "엑셀 주문서로 선택" 버튼 → xlsx 파일 선택 → 체크박스 자동 선택 + 수량 배지 표시 확인
  5. "수동 선택으로 돌아가기" → 체크 초기화 확인
  6. 프리셋에 없는 사이즈가 엑셀에 있으면 경고 표시 확인
- 정상 동작:
  - 엑셀 업로드 시 프리셋에 등록된 사이즈만 자동 체크됨
  - 수량은 참고 정보로만 표시 (파일 생성에는 영향 없음)
  - 기존 수동 체크/전체선택/전체해제 기능 변함없이 동작
- 주의할 입력:
  - 사이즈 키워드가 없는 엑셀 → "사이즈 정보를 찾을 수 없습니다" 에러
  - xls(구형) 파일은 미지원 (다이얼로그에서 xlsx만 필터)
  - 수량이 없는 엑셀 → 사이즈는 추출되지만 수량 0 (배지 미표시)

⚠️ reviewer 참고:
- `_normalize_size` 정규식은 긴 키워드부터 매칭하여 "5XL"이 "XL"로 잘못 매칭되는 것을 방지
- `read_only=True, data_only=True`로 엑셀을 열어 메모리 효율적 + 수식 대신 값 읽기
- 수량 추출 시 "12장", "12개" 등 한국어 접미사 패턴도 처리
- 엑셀의 여러 시트 중 가장 많은 사이즈를 찾은 시트를 자동 선택

## 테스트 결과 (tester)
| 단계 | 판정 | 항목 | 이슈 |
|------|------|------|------|
| 1단계 | 통과 | 기본 빌드/구조 | CSS 하드코딩 4곳 (2단계에서 해결) |
| 2단계 | 통과 | 12/12 | 없음 |
| 3단계 | 최종 통과 | 21/21 | pdf_handler page_count 버그 1건 → 수정 완료 |
| 4단계 | 통과 | 30/30 | 없음 (실제 Illustrator PDF 수동 검증 권장) |
| 5단계 | 통과 | 10/10 | 없음 (analyze_color 3종 PDF 정확, 기존 CLI 호환, file_size 필드 정상) |
| 6단계 | 통과 | 18/19 | analyze_color가 그레이딩 결과 PDF(Form XObject 래핑)를 Unknown으로 판정 (개선 제안) |
| 엑셀 주문서 | 통과 | 11/11 | 없음 (가로/세로/복잡형 정확, 에러 4종 정상, 빌드 OK, 회귀 없음) |

### [2026-04-08] 6단계 E2E: 통과 (18/19, Form XObject 개선 제안 1건 -> 수정 완료)
### [2026-04-08] 5단계 검증: 통과 (10/10, 빌드+CLI 3종+호환성+파일크기 정상)

### [2026-04-13] 실사용 시나리오 E2E 테스트
- Scenario A (A3 복잡 CMYK 유니폼 디자인 + 6사이즈 그레이딩): 통과 (12/12)
- Scenario B (경계 조건 5종): 통과 (6/6)
- Scenario C (Form XObject 재귀 체인 그레이딩): 통과 (3/3)
- 핵심 발견: 이슈 없음. Form XObject 개선이 완벽하게 작동함
- 종합: 통과 (21/21)

**사이즈 비교표** (원본 A3=297x420mm, 기준 L):

| Size | Scale X | Scale Y | Out(mm) | Expected(mm) | CMYK |
|------|---------|---------|---------|---------------|------|
| 2XS | 0.8543 | 0.8734 | 253.7x366.8 | 253.7x366.8 | CMYK |
| XS | 0.8914 | 0.9030 | 264.7x379.2 | 264.7x379.2 | CMYK |
| S | 0.9272 | 0.9325 | 275.4x391.6 | 275.4x391.7 | CMYK |
| M | 0.9629 | 0.9662 | 286.0x405.8 | 286.0x405.8 | CMYK |
| XL | 1.0437 | 1.0338 | 310.0x434.2 | 310.0x434.2 | CMYK |
| 2XL | 1.0887 | 1.0675 | 323.4x448.4 | 323.4x448.4 | CMYK |

**경계 조건**: 5XS(scale~0.5) 정상 / 5XL(scale~1.5) 정상 / L->L(scale 1.0) 원본과 동일 크기 / 0치수 에러 정상 / 없는 사이즈 에러 정상
**Form XObject 재귀**: 1차 그레이딩->CMYK 감지 OK / 체인 그레이딩(2중 래핑)->CMYK 감지 OK

### [2026-04-08] 엑셀 주문서 자동 인식: 통과 (11/11)
- 빌드: tsc --noEmit 통과, vite build 통과 (269KB JS / 19.3KB CSS)
- Python: openpyxl 3.1.5 설치 확인
- 가로형(S~2XL 5개+수량): success, horizontal, 수량 정확(30합계)
- 세로형(S~XL 4개+수량): success, vertical, 수량 정확(28합계)
- 복잡형(한국어 "L사이즈/10장/5개"): success, vertical, 수량 정확(18합계)
- 에러 4종: 사이즈 없음/빈 파일/없는 파일/인자 누락 모두 success:false + 적절한 에러 메시지 + exit code 1
- 기존 CLI: --help에서 7개 커맨드 모두 정상 노출
- 회귀: SizeSelect의 toggleSize/수동 체크박스 로직 영향 없음 (코드 확인)

## 리뷰 결과 (reviewer)
(아직 없음 — 소규모 수정 시 tester만 실행 규칙에 따라 생략 중)

## 수정 요청
| 요청자 | 대상 파일 | 문제 설명 | 상태 |
|--------|----------|----------|------|
| tester | pdf_handler.py | page_count=0 반환 버그 | 완료 |

## 작업 로그 (최근 10건)
| 날짜 | 에이전트 | 작업 내용 | 결과 |
|------|---------|----------|------|
| 2026-04-10 | developer | 3단계: Python엔진(PyMuPDF) + DesignUpload(업로드/CMYK/미리보기) | 완료 |
| 2026-04-10 | tester | 3단계 재검증 | 최종 통과 |
| 2026-04-10 | developer | 4단계: SizeSelect/FileGenerate + pattern_scaler/pdf_grader (CMYK 보존) | 완료 |
| 2026-04-10 | tester | 4단계 검증 | 통과 (30/30) |
| 2026-04-08 | developer | 5단계: analyze_color + 벡터 연산자 감지 + 파일 크기 리포트 + 상세 배지 UI | 완료 |
| 2026-04-08 | tester | 5단계 검증 (빌드+Python CLI 3종+호환성+파일크기필드) | 통과 (10/10) |
| 2026-04-08 | tester | 6단계 E2E 통합 테스트 (워크플로우+빌드+데이터흐름) | 통과 (18/19, 개선 제안 1건) |
| 2026-04-08 | developer | Form XObject 내부 CMYK 감지 확장 (_scan_form_xobjects 추가) | 완료 (6/6) |
| 2026-04-13 | tester | 실사용 시나리오 E2E (A3 복잡 CMYK + Form XObject 재귀) | 통과 (21/21) |
| 2026-04-08 | developer | 엑셀 주문서 자동 인식 (order_parser.py + SizeSelect 엑셀 업로드) | 완료 |
| 2026-04-08 | tester | 엑셀 주문서 검증 (3종 샘플+에러4종+빌드+회귀) | 통과 (11/11) |
