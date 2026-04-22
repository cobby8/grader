# 기술 결정 이력
<!-- 담당: planner-architect | 최대 30항목 -->
<!-- "왜 A 대신 B를 선택했는지" 기술 결정의 배경과 이유를 기록 -->

### [2026-04-22] Drive 스캔 시 사이즈 배열 병합 정책: "기존 치수 보존 + 신규 사이즈 자동 추가"
- **분류**: decision
- **발견자**: developer (PM 지시로 근본 수정 중 확정)
- **내용**: `driveSync.mergeDriveScanResult`에서 기존 프리셋의 `sizes` 배열을 Drive 스캔 결과와 병합할 때의 정책. **채택 (A)**: 기존 사이즈는 `width/height` 치수 데이터 그대로 보존 + Drive에 **신규로 존재하는 사이즈만** 자동 추가(width/height=0 초기화) + `SIZE_LIST`(5XS→5XL) 순 정렬. **거부 (B)**: `sizes` 배열 전체 보존(기존 구현) — 신규 사이즈 SVG 추가를 차단하는 안티패턴. **거부 (C)**: Drive가 소유한 `svgPathBySize`에 맞춰 `sizes` 전체 재생성 — 사용자가 PatternManage에서 입력한 mm 치수가 모두 0으로 초기화됨(치명적 데이터 유실). **거부 (D)**: 신규 사이즈를 사용자에게 모달로 확인 — Drive 자동 동기화의 "조용한 갱신" 원칙 위배, 바이브 코더 UX 부담. **핵심 원칙**: 사용자 입력 데이터 보호는 **항목 단위**로 — "기존 항목의 값은 덮지 않되, 신규 항목은 자동 추가". "Drive에는 있지만 로컬에 없는 것 = 자동 추가", "로컬에만 있고 Drive에서 없어진 것 = 일단 유지"(Q2-B 결정, L675~682). **pieceId 연결**: 새 사이즈 엔트리의 `pieceId`는 기존 프리셋의 `sizes[0].pieces[0].pieceId`를 재사용 → 폴백은 `pieces[0].id`. Phase 1 단일 piece 가정 하에 안전. **width/height=0**: 사용자가 PatternManage에서 나중에 입력해야 하는 값임을 "0"으로 표시(경고 UI는 추후 Phase). 상세 커밋은 developer 작업 로그 참조.
- **참조횟수**: 0

### [2026-04-22] 자동 업데이트 시스템: Tauri Updater + GitHub Releases + Actions 채택
- **분류**: decision
- **발견자**: planner-architect (사용자 확정 2026-04-22)
- **내용**: 직원 배포 시 매번 setup.exe 수동 배포하던 방식을 자동 업데이트로 전환. **플랫폼 Q1**: (A) Tauri 공식 Updater 플러그인 **채택** vs (B) 자체 구현 거부. 이유: 공식 플러그인이 서명 검증/atomic replace/rollback을 모두 제공, 자체 구현은 보안 리스크 과다. **배포 저장소 Q2**: (A) GitHub Releases **채택** vs (B) 사내 서버 거부. 이유: (1) 저장소 Public으로 운영 가능(사내 인증서버 불필요), (2) tauri-action@v0가 latest.json 자동 생성, (3) 무료/무제한 대역폭. **빌드 자동화 Q3**: (A) GitHub Actions **채택** vs (B) 로컬 빌드 거부. 이유: 개발자 PC 독립, Windows 클린 러너에서 재현성 보장. **릴리스 공개 방식 Q4**: (A) Draft 후 수동 Publish **채택** vs (B) 자동 공개 거부. 이유: 실수 태그 푸시 시 직원 전파 방지(안전장치). **플랫폼 범위 Q5**: Windows만 우선(macOS/Linux 나중에 matrix로 확장 가능). **코드 사인**: 비용 이슈로 없음(SmartScreen 경고 감수, 설치 가이드로 대응). 구현 기간 총 15~18시간, 5 Phase로 분할(기반/CI/UI/배포자동화/테스트롤아웃). 상세: PLAN-AUTO-UPDATE.md 참조.
- **참조횟수**: 0

### [2026-04-22] 서명 키 보관: G드라이브 공유 폴더 + .gitignore 차단
- **분류**: decision
- **발견자**: planner-architect
- **내용**: Tauri Updater private 키 보관 위치 선정. **채택**: `G:/공유 드라이브/디자인/grader-keys/grader.key` (G드라이브 공유 폴더). **거부**: (A) Git 커밋 — private 키 노출=멀웨어 배포 가능, (B) 로컬 PC만 — 개발자 PC 고장 시 복구 불가, (C) 1Password/Vault — 바이브 코더에게 오버킬. G드라이브 선택 이유: 기존 Drive 연동 인프라 활용, 접근 권한 통제 가능, 여러 기기 동기화 자동, 팀 내 공유 용이. 안전장치: `.gitignore`에 `keys/` 추가 + `keys/README.md`에 "실제 키는 G드라이브" 메모만 남김 + GitHub Secrets에는 키 내용을 Actions용으로만 복사 저장.
- **참조횟수**: 0

### [2026-04-22] 버전 관리 전략: Semantic Versioning + 태그 기반 릴리스
- **분류**: decision
- **발견자**: planner-architect
- **내용**: 버전 관리 규약 확정. **포맷**: `{major}.{minor}.{patch}` (Semantic Versioning). **현재 0.1.0 → 자동 업데이트 최초 릴리스는 0.2.0**(0→1 정식 승격은 피드백 반영 후). **태그 규약**: `v{version}` 접두사(예: `v0.2.0`), 릴리스 트리거는 태그 push만(브랜치 push 아님 — 실수 방지). **major 증가 조건**: breaking change(데이터 마이그레이션 필요 등)에 한정. **3파일 동기화**: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`의 version 필드를 `scripts/bump-version.mjs`로 일괄 갱신(한 곳 까먹으면 업데이트 체크 오작동하므로 스크립트 필수).
- **참조횟수**: 0

### [2026-04-22] Python 엔진 리소스 번들링: 자동 스캔 스크립트 채택
- **분류**: decision
- **발견자**: planner-architect
- **내용**: `tauri.conf.json`의 `bundle.resources`에 Python/JSX 파일을 개별 나열해야 하는 Tauri v2 제약 대응. **채택**: (A) prebuild hook에서 `scripts/sync-bundle-resources.mjs`로 `python-engine/*.py` + `illustrator-scripts/*.jsx` 자동 스캔하여 conf 갱신. **거부**: (B) 수동 나열(현행) — 새 파일 추가 시 까먹어 런타임 에러, (C) 글롭 패턴 `["../python-engine/*"]` — tauri v2는 객체 매핑 필요 + `__pycache__`/`venv`/`test*.py` 제외 불가. 현재 누락 확인: `order_parser.py`, `svg_normalizer.py` 두 개 resources 미등록 상태 → 스크립트 도입으로 즉시 해결. 제외 규칙: `test*.py`, `__pycache__`, `venv`, `grading-*-backup.jsx` 하드코딩. `npm run prebuild` hook에 등록하여 `npm run build` 전 자동 실행.
- **참조횟수**: 0

### [2026-04-22] 업데이트 UI 배치: Settings 페이지 통합 + 자동 팝업
- **분류**: decision
- **발견자**: planner-architect
- **내용**: 업데이트 UI 노출 위치 결정. **채택**: (A) App.tsx mount 시 자동 팝업(UpdateModal) + Settings 페이지 하단에 "버전 정보" 섹션(UpdateSection) **둘 다**. **거부**: (B) 별도 라우트 `/update` — 사이드바 복잡화, (C) Header에 상시 알림 배지 — 업데이트 없을 때 시각적 노이즈. **자동 팝업 조건**: 앱 시작 시 1회 체크(네트워크 오류는 console.warn만 + 무시), 결과 있으면 UpdateModal 표시, "나중에" 클릭으로 세션 내 dismiss 가능. **설정 페이지 섹션**: 현재 버전/최신 체크 시각/상태/[지금 확인] 버튼 표시, 팝업 닫은 후에도 재접근 가능. 선택형 원칙 유지(모든 버튼은 "업데이트" 또는 "나중에").
- **참조횟수**: 0

### [2026-04-22] 릴리스 공개 방식: Draft 생성 후 수동 Publish
- **분류**: decision
- **발견자**: planner-architect
- **내용**: GitHub Actions 워크플로우에서 `releaseDraft: true` 설정. **채택 이유**: (1) 실수로 태그 푸시해도 직원에게 즉시 전파되지 않음(안전장치), (2) release notes를 GitHub UI에서 최종 검토/편집 가능, (3) 빌드 실패 시 draft로만 남아 정리 용이. **운영 절차**: Actions 빌드 완료 → Release 페이지에 draft 생성 → 사용자가 release notes 확인/수정 → "Publish" 버튼 클릭 → 이때부터 직원 앱에 자동 업데이트 전파. **롤백 방법**: 문제 릴리스는 Unpublish(또는 Delete)하면 latest.json이 이전 버전을 가리킴, 이미 받은 직원 PC는 그대로 유지(Tauri updater는 다운그레이드 안 함).
- **참조횟수**: 0

### [2026-04-21] AI→SVG 자동 변환 기능: JSX 스크립트 방식 + 별도 페이지 채택
- **분류**: decision
- **발견자**: pm (사용자 확정 2026-04-21)
- **내용**: 오늘 외부 작업에서 검증된 AI→SVG 변환 파이프라인을 grader에 내장 기능으로 추가 결정. **구현 방식 Q1**: (A) 새 JSX 스크립트 작성(`illustrator-scripts/ai_to_pdf.jsx`) + Python PyMuPDF 조합 **채택** vs (B) pywin32 COM 직접 호출 거부. 이유: (1) 기존 프로젝트가 이미 `run_illustrator_script` Tauri 커맨드와 `grading.jsx` JSX 방식을 사용해 일관성 유지, (2) pywin32는 추가 의존성이며 Windows 전용, (3) JSX는 Illustrator에 내장된 ExtendScript 엔진이라 별도 설치 불필요. **UI 위치 Q2**: (A) 사이드바에 "AI 변환" 신규 페이지 **채택** vs (B) PatternManage 안에 버튼 추가 거부. 이유: 배치 작업(수십~수백 파일)에 적합한 별도 워크스페이스가 필요. **구현 순서**: SVG 표준화 Phase 1 완료 후 planner-architect에게 상세 설계 위임.
- **참조횟수**: 0

### [2026-04-21] AI 파일 처리 분기: 헤더 바이트 검사 기반 2경로 파이프라인
- **분류**: decision
- **발견자**: pm
- **내용**: AI→SVG 변환 시 단일 도구(PyMuPDF만 or Illustrator만) 선택 대신 **헤더 바이트로 분기하는 하이브리드** 채택. 이유: (1) PDF 호환 AI 89%는 PyMuPDF 단독으로 1~2초/파일로 빠르게 처리, (2) PostScript AI 11%는 Illustrator JSX로 PDF 재저장 후 PyMuPDF로 2단계 처리. 도구 단일화 거부 근거: 전체를 Illustrator로 돌리면 63개 변환에 7~10분 소요(각 30~40초), 전체를 PyMuPDF로 돌리면 11%는 실패. **분기 판정**: `open(path, 'rb').read(10)` 첫 10바이트가 `%PDF`로 시작하면 PyMuPDF 경로, `%!PS`이면 Illustrator 경로. 외부 검증 결과 63/63(100%) 성공, 총 소요 1분 32초(PyMuPDF 79초 + Illustrator 12초).
- **참조횟수**: 0

### [2026-04-21] SVG 일괄 표준화: 기존 svg_parser.py 확장 대신 신규 svg_normalizer.py 분리
- **분류**: decision
- **발견자**: planner-architect → developer
- **내용**: U넥 양면유니폼 12개 사이즈 SVG를 기준 파일 구조로 일괄 변환하는 기능 추가 시, 기존 `svg_parser.py`(1088줄, 그레이딩 핵심)에 함수를 추가하는 옵션 A 대신 **신규 모듈 `svg_normalizer.py` 분리(950줄)** 선택. 이유: (1) svg_parser.py는 그레이딩 회귀 위험이 큼, (2) 관심사 분리(parser=읽기, normalizer=변환), (3) 기존 grader 모듈 컨벤션(`pdf_handler`, `pdf_grader`, `pattern_scaler` 따로) 과 일관, (4) cubic bezier 정확 처리를 위해 svgpathtools 의존성 추가가 필요한데 기존 모듈은 의존성 변동 최소화. Phase 1 범위는 **U넥 양면유니폼 전용**으로 한정(상수 하드코딩, `NORMALIZER_VERSION = "1.0-uneck-double-sided"`). 향후 V넥/하의 등 양식 추가 시 Phase 3에서 JSON 프리셋으로 외부화 검토.
- **참조횟수**: 0

### [2026-04-21] SVG path bbox 측정: 자체 파싱 대신 svgpathtools 채택
- **분류**: decision
- **발견자**: developer
- **내용**: 기존 `svg_parser._parse_path_bbox`는 path 명령(M/L/C/S/Q/Z) 단순 파싱으로 cubic bezier 제어점까지 bbox에 포함시키는 한계가 있어, 곡선이 많은 패턴에서 실제 시각 영역보다 큰 bbox를 반환. 신규 `svg_normalizer.py`는 **svgpathtools 1.7.2** 채택해 cubic/quadratic bezier 곡선의 실제 통과 영역을 정확히 측정. 의존성 비용은 svgpathtools(~3MB) + scipy/numpy(이미 거의 표준). 기존 svg_parser의 측정 로직은 그대로 두어 그레이딩 회귀 위험 0. 멱등성 검증 결과 같은 입력 100번 변환해도 비트 단위 동일 결과 보장.
- **참조횟수**: 0

### [2026-04-08] AI 파일 처리 방식: 직접 파싱 대신 Illustrator 스크립팅 선택
- **분류**: decision
- **발견자**: planner-architect
- **내용**: AI 파일은 Adobe 비공개 형식으로 직접 파싱이 불완전함(illustrator-parser-pdfcpu 등 존재하지만 편집 불가). Aspose도 CMYK 벡터 조작 제한적. Illustrator ExtendScript를 통해 AI 파일을 간접 조작하면 CMYK 색상/레이어/효과 100% 보존 가능. 전제조건: 사용자 PC에 Illustrator 설치 필수.
- **참조횟수**: 0

### [2026-04-08] 데스크톱 프레임워크: Electron 대신 Tauri 2.x 선택
- **분류**: decision
- **발견자**: planner-architect
- **내용**: Tauri는 Electron 대비 번들 크기 1/10(10MB vs 100MB+), 메모리 58~75% 절감, 시작 시간 4배 빠름. 디자이너 PC에서 Illustrator와 동시 실행해야 하므로 메모리 효율이 중요. Tauri 2.x는 2024년 말 정식 출시 후 안정화됨. 단점: Rust 빌드 환경 초기 세팅 필요.
- **참조횟수**: 0

### [2026-04-08] 패턴 프리셋 입력 형식: SVG 채택 (DXF는 향후 확장)
- **분류**: decision
- **발견자**: planner-architect
- **내용**: 패턴 프리셋에 필요한 것은 윤곽선(경로) 정보뿐이므로 CMYK 불필요. SVG가 최선인 이유: (1) Illustrator에서 1클릭 내보내기, (2) Python 파싱 라이브러리 풍부(svgelements, svgpathtools, svglib), (3) 웹 표준으로 장기 안정성, (4) 승화전사 업체가 Illustrator 기반 작업이 대부분. DXF는 ezdxf 라이브러리로 향후 확장 가능하나 MVP에서는 불필요. AI 파일/AAMA-DXF/직접입력은 부적합.
- **참조횟수**: 0

### [2026-04-08] 그래픽 엔진: Python(ReportLab + svglib) 선택
- **분류**: decision
- **발견자**: planner-architect
- **내용**: Python의 ReportLab은 CMYK 색상 모델을 네이티브 지원(CMYKColor, PCMYKColor 클래스). PDF/EPS 모두 출력 가능. svglib으로 SVG->ReportLab 직접 변환 가능. Node.js의 CMYK PDF 라이브러리는 Python보다 부족. Ghostscript으로 최종 CMYK 검증 및 ICC 프로파일 적용 가능.
- **참조횟수**: 0

### [2026-04-08] 기준 디자인 파일 형식: PDF 채택 (AI/EPS 대신)
- **분류**: decision
- **발견자**: planner-architect
- **내용**: 기준사이즈 디자인 파일은 PDF 형식으로 등록. 이유: (1) Python 라이브러리(PyMuPDF, pikepdf, reportlab)로 직접 벡터 데이터 추출/클리핑/스케일링 가능, (2) CMYK 네이티브 지원, (3) Illustrator 없이도 처리 가능(Illustrator 필수 조건 완화), (4) 파일 용량 가장 작음, (5) 범용 호환성. AI 파일은 디자이너 원본 보관용, EPS는 PostScript 기반이라 개별 오브젝트 조작 라이브러리 부족. 디자이너는 Illustrator에서 "Illustrator 편집 기능 보존" 옵션으로 PDF 저장 필요.
- **참조횟수**: 0

### [2026-04-08] 주문서 사이즈 인식: MVP는 수동 선택, 확장으로 엑셀 자동 인식
- **분류**: decision
- **발견자**: planner-architect
- **내용**: 워크플로우 3단계(주문서 사이즈 인식)에서 MVP는 UI 체크박스 수동 선택. 수량 정보는 파일 생성에 불필요(사이즈당 1파일). 2차 개발에서 openpyxl로 .xlsx 파일 자동 인식 추가. OCR 방식은 정확도/복잡성 대비 불필요.
- **참조횟수**: 0

### [2026-04-08] Illustrator 연동 역할 변경: 필수 -> 선택적 확장
- **분류**: decision
- **발견자**: planner-architect
- **내용**: 기존 계획에서 AI 파일 처리를 위해 Illustrator 스크립팅이 필수였으나, 기준 디자인 형식을 PDF로 변경하면서 Python만으로 핵심 처리 가능. Illustrator 연동은 (1) 복잡한 특수 효과 디자인의 전처리, (2) AI->PDF 변환 보조 용도로 선택적 확장 기능으로 격하. 이로 인해 Illustrator 미설치 환경에서도 프로그램 사용 가능.
- **참조횟수**: 0

### [2026-04-08] 워크플로우 재설계: 4가지 근본 문제 발견 및 옵션 분류 (초기 분석)
- **분류**: decision
- **발견자**: planner-architect
- **내용**: 실제 사용자 파일 테스트에서 4가지 근본 문제 발견 — (1) SVG 전체 bbox가 개별 조각이 아닌 전체 합산 크기, (2) PDF 아트보드(1580x2000mm)와 SVG 아트보드(1530x1200mm) 불일치, (3) PDF 아트보드 밖 요소(백넘버)가 페이지에 포함, (4) show_pdf_page의 Form XObject 래핑으로 사각형 중복. 4가지 옵션(A:크롭+스케일, B:CTM직접변환, C:래스터화, D:Illustrator연동) 식별. -> 아래 최종 결정으로 대체됨.
- **참조횟수**: 1

### [2026-04-08] 최종 결정: CTM 직접 변환 + CropBox 조합 (옵션 A+B 통합)
- **분류**: decision
- **발견자**: planner-architect
- **내용**: PyMuPDF 1.27.2에서 CTM 직접 삽입 방식의 실제 구현 가능성을 프로토타입으로 검증 완료. 핵심 발견: (1) `page.clean_contents()` + `page.get_contents()` + `doc.update_stream(xref, new_bytes)`로 콘텐츠 스트림 앞에 `q sx 0 0 sy tx ty cm` 연산자를 삽입하면 CMYK 연산자(`k/K`)가 100% 보존됨, (2) `page.set_mediabox()`로 페이지 크기를 스케일 비율에 맞게 변경, (3) `page.set_cropbox()`로 아트보드 밖 요소 제거 가능, (4) show_pdf_page 방식(`q /fzFrm0 Do Q`)은 Form XObject 래핑으로 사각형 중복 유발 -- CTM 직접 방식은 원본 콘텐츠 스트림을 그대로 유지하므로 이 문제 없음. 4가지 근본 문제 모두 해결: bbox(SVG 비율은 동일 조건이라 비율 자체는 정확), 아트보드 차이(CropBox+translate), 밖 요소(CropBox), 사각형 중복(Form XObject 미사용). 예상 구현 기간: 2~3일. CMYK 보존 + 사각형 해결 + 아트보드 크롭을 한 번에 달성.
- **참조횟수**: 0

### [2026-04-08] PDF 아트보드 감지: TrimBox 자동 감지 + 수동 입력 폴백
- **분류**: decision
- **발견자**: planner-architect
- **내용**: Illustrator에서 저장한 PDF에는 TrimBox가 아트보드 크기로 저장된다. PyMuPDF의 page.trimbox로 자동 감지 가능. TrimBox가 없거나 MediaBox와 같은 경우 사용자 수동 입력(회사 표준 크기 1580x2000mm)으로 폴백. PDF 크롭 전에 아트보드 크기를 정확히 파악하는 것이 CropBox 적용의 전제조건이다.
- **참조횟수**: 0

### [2026-04-08] 비균일 스케일링 전략: Phase 1(단순 비례 + 클리핑 + bleed) 우선 채택
- **분류**: decision
- **발견자**: planner-architect
- **내용**: 사이즈별 부위 변화율이 비균일(어깨 -15.6% vs 밑단 -11.1%)하지만, 4가지 전략(단순비례/메시워프/기준점매핑/수평슬라이스) 분석 결과 Phase 1(단순 비례 + 클리핑 + bleed)로 시작하기로 결정. 이유: (1) 업계 대부분이 단순 비례 방식 사용, (2) 전략 1의 최대 위치 오차 약 1.25mm로 업계 허용 오차(+/-2~3mm) 이내, (3) bleed(3~5mm)와 원단 신축성이 오차를 흡수. CMYK 보존도 기존 show_pdf_page 방식으로 완벽 보장. 실물 인쇄 검증 후 필요시 Phase 2(수평 슬라이스)로 확장. 상세: REPORT-SCALING-STRATEGY.md 참조.
- **참조횟수**: 0

### [2026-04-08] 클리핑 마스크 그레이딩: PDF W 연산자 직접 삽입 방식 추천
- **분류**: decision
- **발견자**: planner-architect
- **내용**: 패턴 사이즈별 비례가 균일하지 않으므로(부위별 다른 비율 변화) 단순 스케일링만으로는 정확한 그레이딩 불가. SVG 패턴 윤곽선을 PDF 클리핑 마스크로 적용하는 방식이 필요. 5가지 방법(A:PyMuPDF클리핑, B:reportlab, C:화이트마스크, D:Illustrator, E:PDF W연산자) 비교 후, 방법 E를 최우선 추천. 이유: CTM 직접 삽입(검증 완료)의 자연스러운 확장, CMYK 완벽 보존, Illustrator 불필요, 추가 라이브러리 svgpathtools만 필요. 단계적 접근: Phase1 화이트마스크(3~5일) -> Phase2 PDF W연산자(1~2주) -> Phase3 Illustrator(필요시). 핵심 리스크: SVG-PDF 좌표 변환(Y축 반전)과 디자인-패턴 정렬 규칙 정의 필요.
- **참조횟수**: 0

### [2026-04-08] 조각별 채워넣기 방식: 기술적으로 가능, show_pdf_page clip+비율매핑 구현 추천
- **분류**: decision
- **발견자**: planner-architect
- **내용**: "패턴 조각별 디자인 채워넣기" 방식의 타당성 검토 결과 -- 기술적으로 가능하며 기존 show_pdf_page + clip API를 활용하여 구현할 수 있다. 핵심 발견: (1) SVG 모든 사이즈가 동일한 viewBox(4337.01x3401.57)를 공유하므로 조각 위치의 상대 비율 매핑이 가능, (2) normalize_artboard 함수가 이미 SVG viewBox를 PDF 좌표계로 변환하는 로직을 보유, (3) svg_to_pdf 좌표 변환 함수가 svg_parser.py에 존재하며 정규화 방식으로 viewBox 원점 문제를 해결, (4) 각 polyline의 bbox가 명확히 분리되어 있어 조각 자동 구분 가능(X좌표 기준 좌/우 + 크기 기준 대/소). 접근법: XL SVG에서 각 조각 bbox의 viewBox 내 비율을 구한 뒤, PDF MediaBox에 같은 비율을 적용하여 clip 영역을 산출. 이전 방식(전체 비율 스케일링, PDF 콘텐츠 스트림 클리핑)의 실패 원인이었던 SVG-PDF 좌표 직접 변환 문제를 비율 매핑으로 우회. bleed 완전 제거. 조각별 독립 스케일링으로 4% 오차 해소.
- **참조횟수**: 0

### [2026-04-08] 그레이딩 엔진 전환: PyMuPDF -> Illustrator ExtendScript
- **분류**: decision
- **발견자**: planner-architect
- **내용**: PyMuPDF로 PDF를 프로그래밍 조작하는 5가지 방식(show_pdf_page, CTM 직접 삽입, clip+show_pdf_page, PDF W 연산자, 조각별 채워넣기)이 모두 근본적 한계(좌표 변환 오차, 사각형만 클리핑, 조각 겹침 등)에 도달. Illustrator ExtendScript로 그레이딩 엔진을 완전 전환하기로 결정. 이유: (1) 클리핑 마스크가 네이티브 기능(곡선/복합 경로 지원), (2) item.resize() API로 정밀 스케일링, (3) CMYK 100% 보존(Illustrator 자체 처리), (4) SVG/PDF 좌표 자동 변환. 실행 방법: 커맨드라인 Illustrator.exe /run script.jsx (방법 A) 우선 채택, 필요 시 COM 자동화(방법 B)로 업그레이드. Python 엔진은 PDF 분석 전용으로 유지. 전제조건: Illustrator CC 2020+ 설치 필수. 예상 소요: 2~3주 (Phase 1 MVP 1주, Phase 2 UI 통합 1주, Phase 3 안정화 1주). 상세: REPORT-EXTENDSCRIPT.md 참조.
- **참조횟수**: 0

### [2026-04-15] 패턴선 색상 대비 알고리즘: WCAG 2.x → APCA Lc 교체
- **분류**: decision
- **발견자**: planner-architect (PM 기록)
- **내용**: 초기 구현(c172110)은 WCAG 2.x 대비비 기반이었으나, 파랑 배경(C100M50Y0K0, Y=0.2253)에서 수학적으로는 검정 대비 5.51 > 흰 대비 3.81로 검정을 선택하지만, 실제 사람 눈에는 파랑 위 흰색이 더 선명하게 보이는 지각 불일치 문제 발생. 원인: WCAG 2.x는 밝기 1차원만 측정하여 중채도 색(파랑 B 휘도 계수 0.0722 낮음, 빨강 M+Y 0.2126, 보라)에서 과소평가. 파랑은 M=60% 이상이어야 흰색 선택이라는 불합리한 경계 존재. 해결: **APCA(Accessible Perceptual Contrast Algorithm, WCAG 3.0 초안) Lc 공식으로 교체**. 공식: light-on-dark(Ytxt>Ybg) `Lc=1.14*(Ybg^0.62 - Ytxt^0.65)*100`, dark-on-light(Ytxt<=Ybg) `Lc=1.14*(Ybg^0.56 - Ytxt^0.57)*100`, 최종 `|Lc|` 큰 쪽 선택. 비대칭 지수가 파랑/빨강/보라에서 지각 일치하는 답을 산술로 도출. ES3 호환(Math.pow/Math.abs만 사용). 헬퍼 3종 시그니처/반환 규약(null 폴백, CMYKColor 반환) 완전 유지 → 호출부 무수정, 롤백은 헬퍼 블록+2줄 복구. 재계산 검증: 파랑 C100M50 → |lcW|=68.8 > |lcB|=49.5 → 흰 승 ✅. 실사용 5 케이스(파랑/빨강/초록/노랑/진회색) 모두 지각 일치. 총 +40줄 헬퍼 추가, -2줄 +2줄 교체. APCA는 W3C 초안이지만 핵심 상수(1.14/0.62/0.65/0.56/0.57)는 안정화 단계.
- **참조횟수**: 0

### [2026-04-14] grading.jsx: 새 CMYK 문서 시작 + 몸판→요소 순서 재설계
- **분류**: decision
- **발견자**: planner-architect
- **내용**: 기존 grading.jsx는 패턴 SVG를 직접 작업 베이스로 사용(app.open + CMYK 플래그)하고 RGB→CMYK를 사후 수식 변환하는 구조라, SVG의 RGB hex가 이미 양자화된 상태에서 색 복원이 되지 않음. 신규 설계: (1) app.documents.add(DocumentColorSpace.CMYK, w, h)로 빈 CMYK 문서를 처음부터 생성하여 작업 베이스로 삼음, (2) SVG는 원본 색 공간으로 열되 path만 CMYK 베이스 문서로 duplicate + path 단위로 fillColor를 CMYK로 명시 할당, (3) 디자인 AI가 RGB 모드면 옵션 A(엄격 중단, 사용자에게 AI 원본 CMYK 재저장 요구)를 기본값, config.allowRgbDesign=true면 수식 변환 폴백. STEP 9A 사후 대량 변환 블록은 안전망 수준으로 축소. 작업 순서는 "몸판(패턴) 베이스 확정 → 요소 paste → 면적 비율 스케일 → 몸판 중앙 정렬"로 기존 흐름 대체로 유지(최종 문서가 SVG였던 구조를 "신규 CMYK 문서"로 교체하는 것이 핵심 차이).
- **참조횟수**: 0

### [2026-04-08] 요소 재구성 방식: Level 1(배경색 채우기)부터 단계적 접근
- **분류**: decision
- **발견자**: planner-architect
- **내용**: 사용자 제안 "디자인을 통째로 축소하지 말고 요소별로 분해해서 재구성" 방식의 타당성 검토 완료. 결론: 기술적으로 완전히 가능하나 3단계로 나눠서 접근. Level 1(배경색 추출+패턴 채우기, 1~2주)부터 시작. 현재 grading.jsx를 폐기하지 않고 배경색 추출/채우기 단계만 추가하는 방식. Level 2(요소별 자동 배치, 3~4주)는 Level 1 검증 후 진행, 디자인 파일 레이어 구조 표준화가 선행 조건. Level 3(AI 기반 완전 자동화, 2~3개월+)은 현 단계 불필요. 핵심 근거: ExtendScript가 레이어/그룹/fillColor/GradientColor 등 모든 API를 제공하므로 기술 장벽 없음. 자동 배경색 감지는 pathItem 면적 기준 최대 요소의 fillColor 추출로 구현. 상세: REPORT-ELEMENT-REBUILD.md 참조.
- **참조횟수**: 0
