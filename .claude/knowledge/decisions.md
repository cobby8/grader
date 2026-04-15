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
