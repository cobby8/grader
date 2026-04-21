# 에러 및 함정 모음
<!-- 담당: debugger, tester | 최대 30항목 -->
<!-- 이 프로젝트에서 반복되는 에러 패턴, 함정, 주의사항을 기록 -->

### [2026-04-21] SVG 분류 로직 4그룹 12 path 누락 버그 (svg_normalizer._extract_pattern_paths)
- **분류**: error
- **발견자**: tester → developer (svg_normalizer Phase 1-3 검증 중)
- **내용**: 초기 `_extract_pattern_paths`는 6 path 한 쌍 구조만 가정하여, 변환된 4그룹 12 path SVG 입력 시 좌측 큰 패턴 2개가 분류에서 누락되고 우측 작은 패턴 위/아래만 인식. 결과: 변환된 SVG를 다시 normalize하면 좌표가 viewBox 밖으로 나가 망가짐(idempotent 실패). **수정**: (1) path를 패턴/절단선으로 분리(높이 < 5 → 절단선), (2) 패턴이 4개(4그룹) → y_min 기준 위쪽 쌍만 채택, (3) 큰/작은 결정 기준을 `x_min` 비교에서 **`width`(폭) 비교 우선**으로 변경(폭이 더 큰 쪽이 큰 패턴=앞판). 검증 결과 6/12 path 모두 정확히 분류됨. **교훈**: SVG 변환 도구의 분류 로직은 변환 전(원본)과 변환 후(결과물) 양쪽 구조 모두 다룰 수 있어야 한다(멱등성 보장).
- **참조횟수**: 0

### [2026-04-21] SVG 패턴 단순 Tx swap 금지 (로컬 좌표계 원점 위치 다름)
- **분류**: error
- **발견자**: developer (U넥 양면유니폼 외부 작업 시행착오)
- **내용**: SVG path들의 좌우 위치를 바꿀 때 transform matrix의 Tx 값을 단순 swap하면 가운데서 겹침 발생(417pt). 원인: 패턴마다 d 속성의 로컬 좌표계 원점(M0 0)이 다른 위치에 있음. 큰 패턴은 원점이 패턴 왼쪽 아래(X 0~1712), 작은 패턴은 원점이 패턴 오른쪽 위(X -365~1347). 단순 Tx swap 시 작은 패턴이 음수 X 영역까지 뻗어서 겹침 발생. **해결**: bbox 정확 측정(svgpathtools cubic bezier 포함) 후 새 좌표 계산(절대 위치 기준 평행이동). 또한 작은 절단선 Y 좌표는 **사이즈 무관 상수**(작은 패턴 따라 이동시키면 큰 절단선과 어긋남). svg_normalizer.py에 두 원칙 모두 반영됨.
- **참조횟수**: 0

### [2026-04-16] ExtendScript clipboard(copy/paste) + svgDoc.close() 간헐 무효화
- **분류**: error
- **발견자**: debugger → developer (버그 B 수정)
- **내용**: grading.jsx STEP 4에서 `app.executeMenuCommand("copy")`로 요소를 clipboard에 담은 뒤, STEP 5~7에서 svgDoc 열고 baseDoc 생성하고 svgDoc.close()하면 AICB 번역기가 간헐적으로 무효화되어 STEP 8의 `paste`가 **paste=0** 결과(요소 0개 붙여짐)를 낸다. 특히 Illustrator는 **단일 인스턴스** 앱이라 이전 실행의 clipboard 상태가 다음 실행과 공유되어 재현성도 간헐적. **해결**: clipboard 경로를 아예 제거하고 `PageItem.duplicate(targetContainer, ElementPlacement.PLACEATEND)`로 문서 간 직접 복제. STEP 7의 `path.duplicate(layerFill)` 패턴과 동일하며 clipboard를 건드리지 않는다. 단 duplicate는 원본 PageItem이 **살아있을 때만** 유효하므로 source document를 duplicate 루프 완료 직후 close해야 한다.
- **참조횟수**: 0

### [2026-04-16] Illustrator 문서 간 geometricBounds 직접 비교 금지 (ruler origin 차이)
- **분류**: error
- **발견자**: planner-architect (PLAN-GRADING-RECOVERY 감사 중)
- **내용**: grading.jsx STEP 8B의 "pasteInPlace 복원 안전망"이 designDoc의 `geometricBounds`([left, top, right, bottom])와 baseDoc의 `geometricBounds`를 **동일 좌표계인 것처럼 빼서** translate 보정했다가 정확히 `dy = -svgHeight`(-3401.57pt)만큼 파괴하는 버그 발생. 원인: 두 문서의 ruler origin이 다르면(설정 또는 새 문서 생성 기본값 차이) 같은 **아트보드 기준 위치**도 **문서 기준 좌표값**은 아트보드 높이만큼 차이가 난다. pasteInPlace는 아트보드 좌표 기준이라 정확히 맞게 붙여넣고, geometricBounds는 문서 좌표라 "어긋나 보이지만 실제로는 맞는" 상태를 만든다. 해결: (1) 서로 다른 문서의 bounds를 직접 비교하지 않는다. (2) 비교가 필요하면 각 문서의 `artboards[0].artboardRect`로 아트보드 기준 상대 좌표로 환산 후 비교. (3) pasteInPlace가 지원되는 Illustrator 버전(CS6+)에서는 안전망을 **두지 않는 편이 안전**.
- **참조횟수**: 0

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

### [2026-04-08] loadPresets 에러 시 빈 배열 반환 → 데이터 소실 위험
- **분류**: error
- **발견자**: debugger
- **내용**: presetStore/designStore/categoryStore의 load 함수가 에러 발생 시 빈 배열 `[]`을 그대로 반환했다. 이 상태에서 사용자가 UI 조작(추가/삭제 등)을 하면 `save([])` 또는 `save([새 항목만])` 형태로 기존 데이터를 덮어쓰게 된다. 원인: (1) Tauri AppData 경로가 없거나 권한 문제로 파일 접근 실패, (2) JSON 파싱 에러, (3) Tauri fs 플러그인 초기화 타이밍 문제. **수정**: LoadResult 타입으로 success/failure를 구분하고, 실패 시 UI에서 저장을 차단. 저장 전 백업 파일(.backup.json) 생성. 빈 배열로 기존 데이터를 덮어쓰는 것을 차단.
- **참조횟수**: 0
