# 프로젝트 구조 지식
<!-- 담당: planner-architect, developer | 최대 30항목 -->
<!-- 프로젝트의 폴더 구조, 파일 역할, 핵심 패턴을 기록 -->

### [2026-04-21] svg_normalizer.py 모듈 (SVG 일괄 표준화)
- **분류**: architecture
- **발견자**: developer
- **내용**: `python-engine/svg_normalizer.py` (950줄, 신규) — U넥 양면유니폼 사이즈별 SVG 12개를 기준 파일 구조로 일괄 변환. 11개 함수 구성: private 6개(transform 평탄화, path 평행이동, bbox 분류, SVG 조립), public 디버깅 3개(`measure_svg_bboxes`, `classify_svg_paths`, `preview_normalization`), public 핵심 2개(`normalize_svg`, `normalize_batch`). 모든 public 함수는 grader 컨벤션 `{"success": bool, "data": ..., "error": ...}` dict 반환. 모듈 상단에 변환 상수(NORMALIZER_VERSION, ARTBOARD_WIDTH/HEIGHT, PATTERN_X/Y_OFFSET, CUT_LINE_MARGIN, Y_OFFSET 등) 정의. main.py에 CLI 커맨드 3개 등록(`measure_svg`, `preview_normalize`, `normalize_batch`). svgpathtools>=1.6.0 의존성 추가. svg_parser.py와는 완전 분리 (그레이딩 회귀 위험 차단).
- **참조횟수**: 0

### [2026-04-08] 승화전사 유니폼 패턴 자동 생성 프로그램 아키텍처
- **분류**: architecture
- **발견자**: planner-architect
- **내용**: 하이브리드 아키텍처 채택. Tauri 2.x(데스크톱 껍데기) + React(UI) + Python(그래픽 엔진) + Illustrator ExtendScript(AI 파일 조작) + Supabase(인증). 7개 주요 모듈: UI, 패턴 관리, SVG 처리, 스케일링 엔진, Illustrator 연동, 출력, 인증/권한. 데이터 흐름: AI/SVG 입력 -> SVG 파싱 -> 사이즈 선택 -> 스케일 계산 -> Illustrator 자동 조작 -> PDF/EPS 출력.
- **참조횟수**: 1

### [2026-04-08] 확정 워크플로우 5단계 + 아키텍처 변경
- **분류**: architecture
- **발견자**: planner-architect
- **내용**: 5단계 워크플로우 확정: (1) SVG 패턴 등록 (2) PDF 기준 디자인 등록 (3) 주문서 사이즈 인식(MVP:수동/확장:엑셀) (4) 그레이딩 파일 생성 (5) CMYK 유지. 주요 변경점: 기준 디자인 형식이 AI->PDF로 변경되면서 Illustrator 의존도가 "필수"에서 "선택적 확장"으로 완화. 핵심 처리 엔진이 Python(PyMuPDF+ReportLab)으로 일원화. 데이터 흐름: SVG(패턴)+PDF(디자인) 입력 -> 사이즈 선택 -> Python 엔진(벡터 추출+클리핑+스케일링) -> CMYK PDF 출력.
- **참조횟수**: 1

### [2026-04-10] Python 엔진 디렉토리 구조 및 Rust-Python 브릿지
- **분류**: architecture
- **발견자**: developer
- **내용**: python-engine/ 폴더 구조 확정 — (main.py: CLI 엔트리, pdf_handler.py: PyMuPDF 처리 모듈, requirements.txt, venv/). Rust에서 Python 실행은 std::process::Command로 venv/Scripts/python.exe를 subprocess 호출, 작업 디렉토리를 python-engine/으로 설정해야 import 가능. Python 엔진 디렉토리 탐색은 실행파일 경로 기준 역추적(개발) + resource_dir 폴백(프로덕션). 모든 Python 결과는 stdout에 JSON 단일 라인 출력, stderr는 에러 로그용. Python stdout은 UTF-8로 재설정해야 Windows cp949 한글 깨짐 방지. Tauri 커맨드 `run_python(command, args)`로 통합 호출.
- **참조횟수**: 0

### [2026-04-10] 디자인 파일 저장 구조
- **분류**: architecture
- **발견자**: developer
- **내용**: 디자인 파일(PDF)은 AppData/designs.json에 메타데이터 저장 + AppData/designs/{id}.pdf 실파일 + AppData/designs/{id}.preview.png 미리보기. 원본 파일을 앱 데이터로 복사하여 사용자 원본 위치에 의존하지 않음. 파일 ID는 "design-{timestamp36}-{random6}" 형식. 바이너리 파일 복사는 tauri-plugin-fs의 readFile/writeFile (절대 경로는 baseDir 생략, 상대 경로는 BaseDirectory.AppData 지정). 미리보기 이미지는 base64 data URL로 <img src>에 주입하여 asset 프로토콜 권한 없이 표시.
- **참조횟수**: 0

### [2026-04-10] 그레이딩 출력 파일 저장 구조
- **분류**: architecture
- **발견자**: developer
- **내용**: 4단계 그레이딩 결과 PDF는 AppData/outputs/{timestamp}/{디자인명}_{사이즈}.pdf 형식으로 저장된다. timestamp는 "YYYY-MM-DD_HH-mm-ss" 형식으로 매 생성 작업마다 새 하위 폴더 생성. 파일명은 sanitizeFileName으로 확장자 제거 + <>:"/\|?* 치환 처리. 생성 직전에 프리셋 전체 JSON을 같은 폴더 내 _preset.json 임시 파일로 기록하여 Python calc_scale에 경로로 전달, 모든 사이즈 처리 후 삭제. Python은 stdin 대신 파일 경로 입력을 선호(크기 제한/이스케이프 문제 회피). 출력 폴더는 opener 플러그인 `openPath`로 OS 탐색기에서 열 수 있음(capabilities에 `opener:allow-open-path` + `$APPDATA/**` 범위 필요).
- **참조횟수**: 0

### [2026-04-10] CMYK 보존 PDF 스케일링 아키텍처 (v1: show_pdf_page -- 대체됨)
- **분류**: architecture
- **발견자**: developer
- **내용**: [대체됨] show_pdf_page 방식은 Form XObject 래핑으로 인해 일부 뷰어에서 사각형 중복 렌더링 문제 발생. v2 CTM 직접 삽입으로 대체되었으나, 이후 v3 Illustrator ExtendScript 방식으로 최종 대체.
- **참조횟수**: 1

### [2026-04-08] CMYK 보존 PDF 스케일링 아키텍처 (v2: CTM 직접 삽입 -- 대체됨)
- **분류**: architecture
- **발견자**: planner-architect
- **내용**: [대체됨] CTM 직접 삽입 방식도 CropBox/MediaBox 순서 버그, 축소 시 ValueError 등의 문제 발생. 이후 show_pdf_page+clip(v3), PDF W 연산자(v4), 조각별 채워넣기(v5) 모두 실패. 최종적으로 Illustrator ExtendScript 방식으로 전환. 상세: REPORT-EXTENDSCRIPT.md 참조.
- **참조횟수**: 0

### [2026-04-08] 그레이딩 엔진 v3: Illustrator ExtendScript 연동
- **분류**: architecture
- **발견자**: planner-architect
- **내용**: 그레이딩 엔진을 PyMuPDF에서 Illustrator ExtendScript로 전환. 아키텍처: Tauri가 .jsx 스크립트를 동적 생성 -> Illustrator.exe /run 으로 실행 -> 완료 마커 파일을 폴링하여 결과 수신. Illustrator가 PDF 열기/스케일링/SVG 클리핑 마스크/CMYK PDF 저장을 네이티브로 처리. Python 엔진은 PDF 분석 전용(정보 추출, CMYK 검증, 미리보기)으로 역할 축소. 신규 디렉토리: illustrator-scripts/ (grading_template.jsx, utils.jsx). Rust 신규 커맨드: find_illustrator_exe, run_illustrator_script, generate_grading_jsx. 프론트 변경: FileGenerate.tsx가 Python generate_graded 대신 Illustrator 호출. 핵심 이점: 곡선 클리핑 마스크 네이티브 지원, SVG-PDF 좌표 자동 변환, CMYK 100% 보존.
- **참조횟수**: 0
