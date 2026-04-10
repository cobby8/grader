# 에러 및 함정 모음
<!-- 담당: debugger, tester | 최대 30항목 -->
<!-- 이 프로젝트에서 반복되는 에러 패턴, 함정, 주의사항을 기록 -->

### [2026-04-10] PyMuPDF doc.close() 이후 len(doc) 사용 금지
- **분류**: error
- **발견자**: tester
- **내용**: PyMuPDF(fitz)의 `fitz.Document` 객체를 `doc.close()` 호출한 후에 `len(doc)`을 호출하면 `is_closed == True` 상태가 되어 신뢰할 수 없는 값(0)이 반환될 수 있다. 반드시 close() 호출 전에 `page_count = len(doc)` 같은 지역 변수로 저장한 뒤 사용해야 한다. pdf_handler.get_pdf_info 최초 구현에서 반환 딕셔너리에 `len(doc) if not doc.is_closed else 0` 형태로 작성했더니 항상 0이 반환되는 버그가 발생했다.
- **참조횟수**: 0

### [2026-04-10] pdf_handler 벡터 CMYK 감지 한계
- **분류**: error
- **발견자**: tester
- **내용**: 현재 pdf_handler.get_pdf_info의 색상 공간 감지는 (1) 페이지 내 이미지 xref의 colorspace 번호 + (2) page 객체 문자열에서 "DeviceCMYK"/"ICCBased"/"DeviceRGB" 키워드 검색의 두 경로에 의존한다. 이로 인해 reportlab `setFillColorCMYK`로 그린 "벡터 전용" CMYK 사각형처럼 내용 스트림 연산자(`k`/`K`)로만 CMYK가 사용된 경우 "Unknown"으로 판정된다. 실제 Adobe Illustrator/InDesign이 출력한 PDF는 대부분 /DeviceCMYK ColorSpace 리소스를 포함하므로 정상 동작할 가능성이 높지만, 사용자가 직접 만든 단순 PDF나 일부 변환 도구 출력물은 오탐될 수 있음. 사용자 실제 작업 파일로 추가 검증 권장.
- **참조횟수**: 0

### [2026-04-08] analyze_color는 Form XObject 내부 스트림을 스캔하지 않음
- **분류**: error
- **발견자**: tester (6단계 E2E)
- **내용**: `pdf_handler.analyze_color_space_detailed`의 `_detect_vector_color_operators`는 `page.read_contents()`로 얻은 **페이지 top-level 콘텐츠 스트림**만 검사한다. 그런데 `pdf_grader.generate_graded_pdf`는 `new_page.show_pdf_page(...)`를 사용해 원본 페이지를 Form XObject로 임베드한다. 결과적으로 그레이딩된 출력 PDF의 top-level content stream은 `/fzFrm0 Do` 1줄뿐이고, 원본의 `k`/`K` 같은 CMYK 연산자는 Form XObject xref 내부에 들어가 있다 (`doc.xref_stream(xref)`로만 접근 가능). 이로 인해 그레이딩 결과 PDF를 `analyze_color`로 재검사하면 `vector_cmyk: false`, `overall: "Unknown"`으로 잘못 판정된다. **실제 CMYK 색상은 보존되어 인쇄 품질에는 영향이 없음** — 감지 로직의 한계일 뿐이다. 개선 방안: `_detect_vector_color_operators`가 페이지 콘텐츠뿐 아니라 `doc.xref_length()` 순회로 `/Subtype /Form` XObject까지 재귀 스캔하도록 확장한다. 이 버그는 사용자가 그레이딩 결과 PDF를 다시 프로그램에 업로드하는 드문 케이스에서만 배지가 잘못 표시되는 제한적 영향만 있어 MVP 범위 바깥으로 분류됨.
- **참조횟수**: 0
