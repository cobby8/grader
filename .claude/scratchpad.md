# 작업 스크래치패드

## 현재 작업
- **요청**: 승화전사 유니폼 패턴 자동 생성 프로그램 - 기술 타당성 조사 및 상세 계획 보고서 작성
- **상태**: 개발 1단계 진행 중 (Tauri 프로젝트 세팅 + UI 기본 틀)
- **현재 담당**: developer

## 기획설계 (planner-architect)

### 기획설계

목표: 승화전사 유니폼 패턴 자동 생성 프로그램의 기술 타당성 조사 및 상세 계획 수립

핵심 결론: **조건부 가능**
- AI 파일 직접 파싱은 불가 -> Illustrator 스크립팅(ExtendScript)으로 해결
- CMYK 색상 보존: Illustrator + ReportLab 조합으로 완벽 보존 가능
- SVG 파싱/스케일링: Python 라이브러리(svgelements, svglib)로 용이

추천 기술 스택: Tauri 2.x + React + Python 그래픽 엔진 + Illustrator ExtendScript + Supabase
- 전제조건: 사용자 PC에 Adobe Illustrator 설치 필수

만들 위치와 구조:
| 파일/모듈 | 역할 | 비고 |
|----------|------|------|
| Tauri 앱 (React UI) | 사용자 인터페이스 | 파일 선택, 패턴 관리, 진행 표시 |
| Python 엔진 | SVG 파싱, 스케일링 계산, PDF/EPS 생성 | ReportLab, svglib 활용 |
| ExtendScript (.jsx) | AI 파일 조작, 클리핑 마스크, 내보내기 | Illustrator 자동화 |
| Supabase 연동 | 계정/권한 관리 | 클라우드 인증 |

실행 계획:
| 순서 | 작업 | 예상 기간 | 선행 조건 |
|------|------|----------|----------|
| 1 | Tauri 프로젝트 세팅 + UI 기본 틀 | 1~2주 | 없음 |
| 2 | 패턴 프리셋 시스템 | 1~2주 | 1단계 |
| 3 | SVG 처리 엔진 (Python) | 2~3주 | 1단계 |
| 4 | Illustrator 연동 (ExtendScript) | 2~3주 | 3단계 |
| 5 | PDF 출력 + CMYK 보존 | 1~2주 | 3,4단계 |
| 6 | 통합 테스트 | 2주 | 5단계 |
| MVP 이후 | 계정/권한, EPS, 배치처리 | 4~8주 | 6단계 |

주의사항:
- Illustrator 2026(v30.0) 대형 아트보드 스케일 버그 주의
- RGB->CMYK 변환 절대 금지, 처음부터 CMYK 유지
- Python 번들링 방식 결정 필요 (PyInstaller vs embedded Python)

### [2026-04-08] 패턴 프리셋 입력 파일 형식 분석

결론: **SVG가 최선 (현재 계획 유지)**

형식별 비교 요약:
| 형식 | 파싱 난이도 | 디자이너 편의성 | 스케일링 | 추천도 |
|------|-----------|---------------|---------|--------|
| SVG | 매우 쉬움 | Illustrator 1클릭 내보내기 | 좌표 기반, 용이 | 1순위 (채택) |
| DXF | 보통 | CAD 필요, 디자이너에게 낯섬 | 좌표 기반, 가능 | 2순위 (향후 확장) |
| AAMA/ASTM DXF | 어려움 | 전문 의류 CAD 필요 | 그레이딩 내장 | 불필요 |
| AI 파일 | 매우 어려움 | 원본 그대로 | Illustrator 필요 | 불필요 (디자인 처리에서 별도 대응) |
| 직접 입력 | 해당없음 | 비현실적 | 가능 | 불필요 |

핵심 인사이트: 패턴 프리셋에는 윤곽선(경로) 정보만 필요하고 CMYK 색상은 불필요. AI 파일은 디자인 그래픽 처리에서 Illustrator 연동으로 이미 대응 중.

### [2026-04-08] 워크플로우 확정 + 기준 디자인 파일 형식 분석 + 주문서 인식 방식

확정 5단계 워크플로우: (1) SVG 패턴 등록 (2) PDF 기준 디자인 등록 (3) 주문서 사이즈 인식 (4) 그레이딩 파일 생성 (5) CMYK 유지

기준 디자인 파일 형식 결론: **PDF 채택** (AI/EPS 대신)
- AI: 원본 보존 완벽하나 프로그래밍 직접 조작 불가 (Illustrator 필수)
- EPS: CMYK 완벽하나 개별 오브젝트 조작 라이브러리 부족
- PDF: CMYK 완벽 + Python 라이브러리 풍부(PyMuPDF/pikepdf/reportlab) + Illustrator 불필요 + 용량 최소 + 범용 호환

핵심 변경: Illustrator 연동이 "필수"에서 "선택적 확장"으로 격하. Python 엔진으로 핵심 처리 일원화.

주문서 인식 결론: MVP는 UI 체크박스 수동 선택 / 확장으로 엑셀 자동 인식 (openpyxl)

REPORT.md 업데이트 완료: 목차 재편(10장), 2-4장 신규 추가, 데이터 흐름/로드맵/리스크 새 워크플로우 기반으로 수정

## 구현 기록 (developer)

### [2026-04-09] 1단계: Tauri 2.x 프로젝트 세팅 + UI 기본 틀

구현한 기능: Tauri 2.x + React + TypeScript 프로젝트 생성, CSS 변수 기반 레이아웃, react-router-dom 라우팅 (4페이지 placeholder)

| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| package.json | 프로젝트명 grader, react-router-dom 추가 | 수정 |
| index.html | 타이틀 한글화 | 수정 |
| src-tauri/tauri.conf.json | 앱명, 창 크기(1200x800), identifier 설정 | 수정 |
| src-tauri/Cargo.toml | 패키지명 grader, lib명 grader_lib | 수정 |
| src-tauri/src/main.rs | grader_lib 참조로 변경 | 수정 |
| src/App.css | CSS 변수 기반 전체 스타일 (레이아웃, 사이드바, 헤더, 상태바) | 수정 |
| src/App.tsx | 루트 레이아웃 (Header+Sidebar+Outlet+StatusBar) | 수정 |
| src/main.tsx | BrowserRouter + Routes 라우팅 설정 | 수정 |
| src/components/Header.tsx | 상단 헤더 컴포넌트 | 신규 |
| src/components/Sidebar.tsx | 좌측 네비게이션 (NavLink 4항목) | 신규 |
| src/components/StatusBar.tsx | 하단 상태바 컴포넌트 | 신규 |
| src/pages/PatternManage.tsx | 1단계 패턴 관리 placeholder | 신규 |
| src/pages/DesignUpload.tsx | 2단계 디자인 등록 placeholder | 신규 |
| src/pages/SizeSelect.tsx | 3단계 사이즈 선택 placeholder | 신규 |
| src/pages/FileGenerate.tsx | 4단계 파일 생성 placeholder | 신규 |
| build.bat | MSVC 환경 설정 후 cargo build 실행 | 신규 |
| dev.bat | MSVC 환경 설정 후 npm run tauri dev 실행 | 신규 |

사용 라이브러리:
- Tauri 2.x (tauri 2.10.3, @tauri-apps/api ^2, @tauri-apps/cli ^2)
- React 19.1.0 + ReactDOM 19.1.0
- react-router-dom 7.14.0
- TypeScript 5.8.3
- Vite 7.3.2

실행 방법:
- 개발 서버: `dev.bat` 실행 (cmd 창에서)
- Git Bash에서 직접 `npm run tauri dev`는 불가 (MSVC link.exe PATH 문제)
- 프론트엔드만: `npm run dev` (Git Bash에서 가능)

tester 참고:
- 테스트 방법: dev.bat 실행 후 앱 창이 열리면 사이드바 4개 메뉴 클릭하여 페이지 전환 확인
- 정상 동작: 사이드바 클릭 시 메인 영역 컨텐츠 교체, 현재 페이지 강조 표시
- 주의: Git Bash에서 `npm run tauri dev` 실행 시 Rust 빌드 실패함 (MSVC 환경 미설정). 반드시 dev.bat 사용

reviewer 참고:
- MSVC link.exe PATH 문제로 build.bat/dev.bat 우회 스크립트 필요 (Git Bash의 /usr/bin/link가 MSVC link.exe를 가림)
- VS 2022 Build Tools + Windows 11 SDK 26100 설치됨

## 테스트 결과 (tester)

### [2026-04-08] 1단계 검증

| 테스트 항목 | 결과 | 비고 |
|-----------|------|------|
| 필수 파일 존재 (16개) | 통과 | package.json, tauri.conf.json, Cargo.toml, App.tsx, main.tsx, Header/Sidebar/StatusBar, 4개 페이지, dev.bat, build.bat 모두 존재 |
| TypeScript (tsc --noEmit) | 통과 | 에러 0건 |
| Vite 빌드 (npx vite build) | 통과 | 683ms, index.html + CSS(4.13KB) + JS(234.68KB) 정상 생성 |
| Rust/Tauri 빌드 (cargo build) | 통과 | MSVC 환경에서 dev profile 빌드 성공 (vswhere.exe 미발견 경고는 빌드에 무영향) |
| 라우팅 구조 | 통과 | BrowserRouter + nested Routes, / -> /pattern 리다이렉트, 4개 경로 정상 매핑 |
| 컴포넌트 import/export | 통과 | 모든 컴포넌트 default export, App에서 정상 import, Sidebar에서 NavLink 사용 |
| CSS 변수 사용 | 경미한 이슈 | :root에 변수 정의 완비, 레이아웃/컴포넌트에서 var() 사용. 단, 4곳에서 하드코딩 색상 발견 (아래 참조) |
| 그리드 레이아웃 | 통과 | header/sidebar/content/status 4영역 grid 구조 정상 |

CSS 하드코딩 색상 (경미):
- App.css:211 `#d1d5db` (placeholder 테두리)
- App.css:258 `#22c55e` (상태바 정상 점)
- App.css:262 `#f59e0b` (상태바 경고 점)
- App.css:266 `#ef4444` (상태바 에러 점)
-> 기능에 영향 없음, 2단계 이후 CSS 변수로 통합 권장

종합: 8개 항목 중 7개 완전 통과 / 1개 경미한 이슈 (기능 무영향)

- TypeScript: 통과
- Vite 빌드: 통과
- Rust 빌드: 통과
- 파일 구조: 완전
- 코드 품질: 양호 (CSS 변수 미사용 4곳 경미한 이슈)
- **종합 판정: 통과**
- 수정 필요 사항: 없음 (CSS 하드코딩은 2단계 이후 개선 권장)

## 리뷰 결과 (reviewer)
(아직 없음)

## 수정 요청
| 요청자 | 대상 파일 | 문제 설명 | 상태 |
|--------|----------|----------|------|

## 작업 로그 (최근 10건만 유지)
| 날짜 | 에이전트 | 작업 내용 | 결과 |
|------|---------|----------|------|
| 2026-04-08 | planner-architect | 기술 타당성 조사 + 상세 계획 보고서(REPORT.md) 작성 | 완료 - 조건부 가능 판정 |
| 2026-04-08 | planner-architect | 패턴 프리셋 입력 파일 형식 분석 (SVG/DXF/AI/AAMA-DXF/직접입력 비교) | 완료 - SVG 최선 확인 |
| 2026-04-08 | planner-architect | 워크플로우 확정 + 기준디자인 형식 분석(PDF 채택) + 주문서 인식 분석 + REPORT.md 전면 업데이트 | 완료 |
| 2026-04-09 | developer | 1단계: Tauri 2.x + React + TS 프로젝트 세팅 + UI 기본 틀 (레이아웃+라우팅 4페이지) + VS Build Tools 설치 | 완료 |
| 2026-04-08 | tester | 1단계 검증: TS/Vite/Rust 빌드, 파일구조, 라우팅, 컴포넌트, CSS 변수 | 통과 (경미한 CSS 이슈 1건) |
