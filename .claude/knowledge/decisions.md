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
