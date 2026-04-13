# 기술 결정 이력
<!-- 담당: planner-architect | 최대 30항목 -->
<!-- "왜 A 대신 B를 선택했는지" 기술 결정의 배경과 이유를 기록 -->

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
