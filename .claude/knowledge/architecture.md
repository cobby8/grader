# 프로젝트 구조 지식
<!-- 담당: planner-architect, developer | 최대 30항목 -->
<!-- 프로젝트의 폴더 구조, 파일 역할, 핵심 패턴을 기록 -->

### [2026-04-08] 승화전사 유니폼 패턴 자동 생성 프로그램 아키텍처
- **분류**: architecture
- **발견자**: planner-architect
- **내용**: 하이브리드 아키텍처 채택. Tauri 2.x(데스크톱 껍데기) + React(UI) + Python(그래픽 엔진) + Illustrator ExtendScript(AI 파일 조작) + Supabase(인증). 7개 주요 모듈: UI, 패턴 관리, SVG 처리, 스케일링 엔진, Illustrator 연동, 출력, 인증/권한. 데이터 흐름: AI/SVG 입력 -> SVG 파싱 -> 사이즈 선택 -> 스케일 계산 -> Illustrator 자동 조작 -> PDF/EPS 출력.
- **참조횟수**: 1

### [2026-04-08] 확정 워크플로우 5단계 + 아키텍처 변경
- **분류**: architecture
- **발견자**: planner-architect
- **내용**: 5단계 워크플로우 확정: (1) SVG 패턴 등록 (2) PDF 기준 디자인 등록 (3) 주문서 사이즈 인식(MVP:수동/확장:엑셀) (4) 그레이딩 파일 생성 (5) CMYK 유지. 주요 변경점: 기준 디자인 형식이 AI->PDF로 변경되면서 Illustrator 의존도가 "필수"에서 "선택적 확장"으로 완화. 핵심 처리 엔진이 Python(PyMuPDF+ReportLab)으로 일원화. 데이터 흐름: SVG(패턴)+PDF(디자인) 입력 -> 사이즈 선택 -> Python 엔진(벡터 추출+클리핑+스케일링) -> CMYK PDF 출력.
- **참조횟수**: 0
