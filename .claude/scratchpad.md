# 작업 스크래치패드

## 현재 작업
- **요청**: 승화전사 유니폼 패턴 자동 생성 프로그램 - 기술 타당성 조사 및 상세 계획 보고서 작성
- **상태**: 개발 3단계 진행 중 (디자인 파일 처리 + Python 엔진)
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

### [2026-04-08] 2단계: 패턴 프리셋 시스템

구현한 기능: 타입 정의, 프리셋 CRUD (생성/편집/삭제), SVG 파일 업로드 및 미리보기, 사이즈별 치수 입력 테이블 (13단계), JSON 로컬 저장/로드, Tauri 플러그인(dialog/fs) 연동, 1단계 CSS 하드코딩 색상 4곳 수정

| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| src/types/pattern.ts | PatternPiece, SizeSpec, PatternPreset 타입 + SIZE_LIST 상수 | 신규 |
| src/stores/presetStore.ts | loadPresets, savePresets, generateId — AppData JSON 저장 | 신규 |
| src/pages/PatternManage.tsx | 목록모드(카드그리드) + 편집모드(폼/SVG미리보기/치수테이블) | 수정 |
| src/App.css | CSS 변수 6종 추가, 하드코딩 4곳 수정, 버튼/카드/폼/테이블 스타일 추가 | 수정 |
| src-tauri/src/lib.rs | tauri-plugin-dialog, tauri-plugin-fs 플러그인 등록 | 수정 |
| src-tauri/Cargo.toml | tauri-plugin-dialog, tauri-plugin-fs 의존성 추가 | 수정 |
| src-tauri/capabilities/default.json | dialog:default, fs 관련 권한 6종 추가 | 수정 |
| package.json | @tauri-apps/plugin-dialog, @tauri-apps/plugin-fs 추가 | 수정 |

추가한 라이브러리:
- @tauri-apps/plugin-dialog ^2 (npm) + tauri-plugin-dialog 2.7.0 (cargo)
- @tauri-apps/plugin-fs ^2 (npm) + tauri-plugin-fs 2.5.0 (cargo)

tester 참고:
- 테스트 방법: `dev.bat` 실행 후 "패턴 관리" 페이지에서 (1) "새 프리셋 추가" 클릭 (2) 이름 입력 (3) "조각 추가" 버튼으로 SVG 파일 선택 (4) SVG 미리보기 확인 (5) 조각 이름 수정 (6) 사이즈 치수 입력 (7) 저장 (8) 목록에 카드 표시 확인 (9) 편집/삭제 동작 확인
- 정상 동작: 프리셋 카드가 목록에 표시되고, 앱 재시작 후에도 데이터가 유지됨
- 주의: Tauri 파일 다이얼로그/fs API는 `npm run dev`(프론트엔드만)에서 동작 안함. 반드시 `dev.bat`으로 Tauri 앱 실행 필요
- TypeScript: tsc --noEmit 통과 (에러 0건)
- Vite 빌드: npx vite build 통과 (771ms)
- 1단계 CSS 하드코딩 색상 4곳 모두 CSS 변수로 교체 완료

reviewer 참고:
- dangerouslySetInnerHTML로 SVG를 렌더링함 — 사용자가 직접 선택한 로컬 SVG 파일만 대상이므로 XSS 위험 낮음
- presetStore에서 AppData 디렉토리에 JSON 저장 (BaseDirectory.AppData)
- capabilities에 fs 권한을 $APPDATA 경로로 제한하여 보안 유지

### [2026-04-10] 3단계: 디자인 파일 처리 + Python 엔진

구현한 기능:
- Python 엔진 신규 도입 (python-engine/ 폴더, venv 기반)
- PDF 정보 추출 / CMYK 검증 / 미리보기 PNG 생성 기능
- Rust → Python subprocess 호출 브릿지 (`run_python` Tauri 커맨드)
- DesignUpload 페이지 전면 교체: 업로드/목록/미리보기/삭제 UI
- 디자인 메타데이터 JSON 저장 + PDF/PNG 바이너리 복사 관리

| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| python-engine/requirements.txt | PyMuPDF, reportlab 의존성 | 신규 |
| python-engine/pdf_handler.py | get_pdf_info, verify_cmyk, generate_preview 함수 | 신규 |
| python-engine/main.py | CLI 엔트리포인트 (JSON 출력, UTF-8 stdout 강제) | 신규 |
| python-engine/venv/ | 가상환경 (PyMuPDF 1.27, reportlab 4.4 설치) | 신규 |
| src-tauri/src/lib.rs | run_python Tauri 커맨드 + get_python_engine_dir 헬퍼 | 수정 |
| src-tauri/capabilities/default.json | fs:allow-read-file/write-file/remove 권한 추가 | 수정 |
| src/types/design.ts | DesignFile, PdfInfoResult, CmykVerifyResult 등 타입 | 신규 |
| src/stores/designStore.ts | loadDesigns/saveDesigns/copyPdfToAppData/deleteDesignFiles | 신규 |
| src/pages/DesignUpload.tsx | 디자인 업로드/목록/미리보기/삭제 기능 완전 구현 | 수정 |
| src/App.css | 디자인 카드/배지/CMYK 메시지/에러/진행표시 스타일 | 수정 |
| .gitignore | python-engine/venv/, __pycache__ 추가 | 수정 |

추가한 라이브러리:
- npm: 신규 없음 (기존 @tauri-apps/api, plugin-dialog, plugin-fs 재사용)
- pip: PyMuPDF 1.27.2, reportlab 4.4.10, pillow 12.2.0, charset-normalizer 3.4.7

Python 엔진 실행 방법:
- 환경 구성 (최초 1회): `cd python-engine && python -m venv venv && venv/Scripts/pip install -r requirements.txt`
- CLI 직접 실행: `python-engine/venv/Scripts/python python-engine/main.py --help`
- 사용 가능 명령:
  - `main.py get_pdf_info "C:/path/file.pdf"` — PDF 정보(페이지수/크기/색상공간)
  - `main.py verify_cmyk "C:/path/file.pdf"` — CMYK 검증
  - `main.py generate_preview "C:/path/file.pdf" "C:/out/preview.png" 150` — 미리보기 PNG
- 앱 내 호출: React → `invoke("run_python", { command, args })` → Rust → Python subprocess

데이터 흐름:
1. 사용자가 "새 디자인 업로드" 클릭 → Tauri 다이얼로그로 PDF 선택
2. 원본 PDF를 AppData/designs/{id}.pdf 로 복사
3. Python get_pdf_info → 페이지 수, 크기(mm), 색상 공간, 파일 크기
4. Python verify_cmyk → CMYK 검증 메시지 생성
5. Python generate_preview → AppData/designs/{id}.preview.png 생성
6. 메타데이터 DesignFile 객체 → AppData/designs.json 저장
7. 미리보기 PNG를 바이너리 읽어 base64 data URL로 변환하여 <img> 렌더링

tester 참고:
- 테스트 방법:
  1. `dev.bat` 실행하여 앱 기동
  2. "디자인 등록" 메뉴 진입
  3. "새 디자인 업로드" 버튼 → CMYK PDF 선택
  4. 진행 메시지(복사중→분석중→검증중→미리보기생성중) 순차 표시 확인
  5. 카드 형태로 추가되고 미리보기 이미지 렌더링 확인
  6. 카드 메타 배지(CMYK/RGB/Mixed), 크기(mm), 파일크기, CMYK 메시지 확인
  7. "삭제" 버튼 → 확인 다이얼로그 → 제거 후 파일시스템에서도 사라지는지
  8. 앱 재시작 후 목록이 유지되는지
- 정상 동작 기준:
  - CMYK 순수 PDF: 초록 "CMYK 색상이 정상적으로 보존되어 있습니다"
  - RGB PDF: 노랑 경고 "RGB 색상만 사용된 파일입니다..."
  - 혼합 PDF: 노랑 "RGB 색상이 일부 포함..."
  - 미리보기 PNG가 150dpi로 선명하게 표시됨
- 주의할 입력:
  - 매우 큰 PDF (50MB+): 복사/분석 시간이 오래 걸림 (비동기라 UI는 안 멈춤)
  - 손상된 PDF: Python이 FileNotFoundError 외 예외 발생 시 에러 박스 표시
  - 다중 페이지 PDF: 첫 페이지 기준으로 크기 측정, 미리보기는 첫 페이지만
  - venv 미설치 상태: 첫 업로드 시 "Python venv를 찾을 수 없습니다" 에러

reviewer 참고:
- 보안:
  - 원본 PDF를 AppData로 복사하여 관리 (사용자가 원본 삭제/이동해도 무영향)
  - Python subprocess에 파일 경로를 넘길 때 shell=False 기본(Command::new 사용) → 쉘 인젝션 불가
  - Python 스크립트는 venv 내에서만 실행되어 시스템 Python과 격리
  - capabilities의 fs:allow-read-file에 `**/*.pdf`, `**/*.png` 허용 범위가 넓음 — 원본 PDF 읽기를 위해 필요하나 보안 관점에서는 주의
- 아키텍처:
  - Python 엔진 경로 탐색은 exe 경로 기준 역추적 (개발 모드 대응). 프로덕션 배포 시 `tauri.conf.json` bundle > resources에 python-engine을 포함시켜야 `resource_dir` 폴백이 동작함
  - Python CLI는 모든 결과를 JSON으로 stdout 출력, stderr는 에러 로그용으로만 사용
  - 미리보기는 asset:// 프로토콜 대신 base64 data URL로 처리 → Tauri asset 권한 설정 불필요, 동작 확실
- 성능:
  - 미리보기 로드는 초기 마운트 시 순차적으로 읽음 (디자인 100개+ 시 느려질 수 있음 → 추후 lazy load 고려)
  - base64 변환을 8KB 청크 단위로 수행하여 String.fromCharCode 스택 오버플로우 방지

#### 수정 이력

| 회차 | 날짜 | 수정 내용 | 수정 파일 | 사유 |
|------|------|----------|----------|------|
| 1차 | 2026-04-10 | pdf_handler.py `page_count` 0 반환 버그 수정 (close 전 지역변수로 저장) | python-engine/pdf_handler.py | tester 요청: 3단계 검증에서 get_pdf_info가 항상 page_count=0 반환하는 버그 발견 |

- [2026-04-10] pdf_handler.py page_count 버그 수정
  - 문제: `doc.close()` 호출 후 `len(doc) if not doc.is_closed else 0` 평가 시 `doc.is_closed`가 항상 True → 무조건 0 반환
  - 수정: `doc.close()` 직전에 `page_count = len(doc)` 지역 변수로 저장하고, 반환 딕셔너리에서 그 변수 사용
  - 다른 함수 점검: `verify_cmyk`는 내부에서 `get_pdf_info`를 호출하므로 위 수정으로 자동 해결. `generate_preview`는 `doc.close()` 전에 이미 `pixmap.width/height`를 `result`에 저장하고 있어 동일 패턴 버그 없음
  - 검증: reportlab으로 3페이지 샘플 PDF 임시 생성 후 CLI 3종 모두 실행
    - `get_pdf_info _sample_3p.pdf` → `"page_count": 3` (정상)
    - `verify_cmyk _sample_3p.pdf` → 정상 JSON 응답
    - `generate_preview ... 150` → 1241×1754 PNG 생성 성공
  - 검증 후 임시 파일(`_make_sample.py`, `_sample_3p.pdf`, `_sample_preview.png`) 모두 정리 완료

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

### [2026-04-08] 2단계 검증

| 테스트 항목 | 결과 | 비고 |
|-----------|------|------|
| 필수 파일 존재 (8개) | 통과 | pattern.ts, presetStore.ts, PatternManage.tsx, App.css, lib.rs, Cargo.toml, default.json, package.json 모두 존재 |
| TypeScript (tsc --noEmit) | 통과 | 에러 0건 |
| Vite 빌드 (npx vite build) | 통과 | 937ms, index.html + CSS(9.95KB) + JS(243.90KB) 정상 생성 |
| Rust/Tauri 빌드 (cargo build) | 통과 | MSVC 환경 build.bat 경유, dev profile 22.95s 성공 |
| 타입 시스템 | 통과 | PatternPiece, PieceDimension, SizeSpec, PatternPreset 인터페이스 + SIZE_LIST 13단계(5XS~5XL) + SizeName 유니온 타입 |
| 코드 품질 (presetStore) | 통과 | loadPresets, savePresets, generateId 함수 존재, AppData JSON 저장, 에러 핸들링 포함 |
| 코드 품질 (PatternManage) | 통과 | 목록모드(list)/생성모드(create)/편집모드(edit) 3가지 상태 구분, CRUD 동작 로직 완비 |
| Tauri 플러그인 등록 | 통과 | lib.rs에 tauri_plugin_dialog::init(), tauri_plugin_fs::init() 등록 |
| capabilities 권한 | 통과 | dialog:default, fs:default, fs:allow-exists/read-text-file/write-text-file/mkdir (APPDATA+SVG 경로 제한) |
| CSS 하드코딩 수정 | 통과 | 1단계 지적 4곳(#d1d5db, #22c55e, #f59e0b, #ef4444) 모두 CSS 변수로 교체. 새 변수 6종 :root 정의 |
| npm 의존성 | 통과 | @tauri-apps/plugin-dialog@2.7.0, @tauri-apps/plugin-fs@2.5.0 설치 확인 (npm ls + node_modules 실물) |
| Cargo 의존성 | 통과 | tauri-plugin-dialog 2.7.0, tauri-plugin-fs 2.5.0 Cargo.toml에 명시, 빌드 시 다운로드+컴파일 성공 |

경미한 참고사항:
- App.css 301행, 323행에 `color: #fff` 잔존 (버튼 텍스트 색상). 기능 무영향, 향후 CSS 변수화 권장.

종합: 12개 항목 중 12개 통과 / 0개 실패
- **종합 판정: 통과**
- 수정 필요 사항: 없음

### [2026-04-10] 3단계 검증

| 테스트 항목 | 결과 | 비고 |
|-----------|------|------|
| 필수 파일 존재 (Python) | 통과 | requirements.txt, main.py, pdf_handler.py, venv/Scripts/python.exe 모두 존재 |
| 필수 파일 존재 (Rust/프론트) | 통과 | lib.rs(run_python 포함), design.ts, designStore.ts, DesignUpload.tsx 모두 존재/실구현 |
| .gitignore venv 제외 | 통과 | python-engine/venv/, python-engine/__pycache__/ 19-20행 포함 |
| TypeScript (tsc --noEmit) | 통과 | 에러 0건 (TSC_OK) |
| Vite 빌드 (npx vite build) | 통과 | 739ms, CSS 12.64KB + JS 252.46KB, 56 modules 정상 |
| Rust/Tauri 빌드 (build.bat) | 통과 | dev profile 0.49s (캐시 활용), vcvarsall 환경 초기화 OK |
| invoke_handler 등록 | 통과 | lib.rs 113행 `generate_handler![greet, run_python]` 확인 |
| Python 엔진 --help | 통과 | JSON 응답 정상, 3개 커맨드 및 예시 포함 |
| pip list (의존성 설치) | 통과 | PyMuPDF 1.27.2.2, reportlab 4.4.10, pillow 12.2.0 설치 확인 |
| pdf_handler 함수 정의 | 통과 | get_pdf_info, verify_cmyk, generate_preview 모두 구현 |
| 에러 처리 (없는 파일) | 통과 | `get_pdf_info C:/nonexistent.pdf` → JSON error 반환, exit 1 |
| 에러 처리 (알 수 없는 명령) | 통과 | unknown_command → 사용법 안내 error JSON, exit 1 |
| 에러 처리 (인자 누락) | 통과 | get_pdf_info 인자 없이 실행 → 경로 필요 메시지 반환 |
| 실제 PDF 분석 (reportlab 샘플) | 부분 통과 | get_pdf_info/verify_cmyk/generate_preview 모두 정상 응답, 미리보기 PNG 7KB 생성 |
| page_count 반환 값 | **실패** | 테스트 PDF(1페이지) 분석 시 page_count=0 반환. doc.close() 이후 len(doc) 호출로 발생하는 버그 (pdf_handler.py 112행) |
| 벡터 CMYK 색상 감지 | 제한사항 | reportlab setFillColorCMYK로 그린 사각형은 "Unknown"으로 판정. 현 구현은 이미지/ColorSpace 키워드 기반이라 벡터 페인트 연산자는 감지 불가 (실제 Illustrator/InDesign 출력 PDF는 /DeviceCMYK 키워드를 포함하므로 정상 동작할 가능성 높음 — 사용자 실제 파일로 추가 검증 필요) |
| Rust run_python 보안 | 통과 | Command::new(&python_exe) + .args() 사용, shell 경유 없음 → 쉘 인젝션 불가. current_dir로 python-engine 고정 |
| fs 권한 범위 (capabilities) | 통과 (주의) | $APPDATA/** 주력 + **/*.pdf, **/*.png 읽기 허용. 원본 PDF 읽기를 위해 필요하나 범위가 다소 넓음 (기존 reviewer 지적과 동일) |
| DesignUpload 주요 핸들러 | 통과 | handleUpload(1단계:다이얼로그 → 8단계:미리보기로드), handleDelete(확인창+물리파일삭제) 구현 완료 |
| designStore CRUD | 통과 | loadDesigns/saveDesigns/copyPdfToAppData/deleteDesignFiles/getDesignPdfPath/getDesignPreviewPath/generateDesignId 구현 |
| 타입 정의 (colorSpace 유니온) | 통과 | `ColorSpace = "CMYK" \| "RGB" \| "Mixed" \| "Unknown"` + 3종 result 인터페이스 + DesignFile 완비 |

종합: 21개 항목 중 19개 통과 / 1개 실패 / 1개 제한사항
- **종합 판정: 조건부 통과** (page_count 버그 수정 필요. 기능은 미리보기/업로드/삭제 모두 동작)
- 수정 필요 사항: pdf_handler.py `page_count` 0 반환 버그 1건

상세 이슈 — page_count 버그:
- 파일: `python-engine/pdf_handler.py`
- 위치: 112행 `"page_count": len(doc) if not doc.is_closed else 0,`
- 원인: 97행에서 이미 `doc.close()`를 호출한 뒤 딕셔너리를 반환하므로 항상 `doc.is_closed == True` → 무조건 0 반환
- 해결: `doc.close()` 전에 `page_count = len(doc)` 지역변수로 저장하고 딕셔너리에서 그 변수 사용
- 영향: DesignFile.pageCount가 항상 0으로 저장됨 → 앱 카드/검증 화면에서 페이지 수 잘못 표시. 현재 UI는 pageCount를 배지로 노출하진 않아 시각적 결함은 경미하나 데이터 정합성 문제.

### [2026-04-10] 3단계 재검증 (pdf_handler.py 버그 수정)

| 테스트 항목 | 결과 | 비고 |
|-----------|------|------|
| 수정 코드 확인 (get_pdf_info) | 통과 | pdf_handler.py 100행에서 `page_count = len(doc)`를 doc.close() 직전에 지역 변수로 저장. 117행 반환 딕셔너리에서 지역 변수 사용. 주석으로 의도 명시 |
| 다른 함수 점검 (verify_cmyk) | 통과 | 내부에서 get_pdf_info 호출만 하므로 수정 파급 효과로 자동 해결, 별도 close 로직 없음 |
| 다른 함수 점검 (generate_preview) | 통과 | `doc.close()` 전에 `pixmap.width/height`로 result 딕셔너리 먼저 구성 후 반환. 같은 패턴 버그 없음 |
| CLI 실행: get_pdf_info (3페이지 샘플) | 통과 | `page_count: 3` 정상 반환. page_width_mm=210.0, page_height_mm=297.0 (A4 정확), file_size=2348 |
| CLI 실행: verify_cmyk | 통과 | success=true, Unknown (reportlab 벡터 한계는 이전 검증에서 제한사항으로 기록됨) |
| CLI 실행: generate_preview 150dpi | 통과 | 1241×1754 PNG 생성, preview_path 정상 반환 |
| TypeScript (tsc --noEmit) | 통과 | 에러 0건 (TSC_OK) |
| Vite 빌드 (npx vite build) | 통과 | 693ms, 56 modules, CSS 12.64KB + JS 252.46KB 정상 생성 |
| 임시 파일 정리 | 통과 | _tester_make_sample.py, _tester_sample_3p.pdf, _tester_sample_preview.png 모두 삭제 확인 |

테스트 환경:
- 샘플 PDF: reportlab 4.4.10으로 A4 3페이지 생성 (각 페이지에 CMYK 사각형 + 텍스트)
- Python 엔진: python-engine/venv/Scripts/python.exe (PyMuPDF 1.27.2.2)
- 작업 디렉토리: python-engine/ (상대 경로로 CLI 실행)

종합: 9개 항목 중 9개 통과 / 0개 실패
- **종합 판정: 3단계 최종 통과**
- 1차 검증에서 지적한 page_count=0 버그 완전 해소 (3페이지 PDF에서 정확히 3 반환)
- 프론트엔드 빌드/타입 영향 없음 확인
- 수정 필요 사항: 없음

## 리뷰 결과 (reviewer)
(아직 없음)

## 수정 요청
| 요청자 | 대상 파일 | 문제 설명 | 상태 |
|--------|----------|----------|------|
| tester | python-engine/pdf_handler.py | get_pdf_info가 page_count=0 반환 (doc.close() 후 len(doc) 호출하는 순서 버그). close 전 변수에 저장하도록 수정 필요 | 완료 |

## 작업 로그 (최근 10건만 유지)
| 날짜 | 에이전트 | 작업 내용 | 결과 |
|------|---------|----------|------|
| 2026-04-08 | planner-architect | 기술 타당성 조사 + 상세 계획 보고서(REPORT.md) 작성 | 완료 - 조건부 가능 판정 |
| 2026-04-08 | planner-architect | 패턴 프리셋 입력 파일 형식 분석 (SVG/DXF/AI/AAMA-DXF/직접입력 비교) | 완료 - SVG 최선 확인 |
| 2026-04-08 | planner-architect | 워크플로우 확정 + 기준디자인 형식 분석(PDF 채택) + 주문서 인식 분석 + REPORT.md 전면 업데이트 | 완료 |
| 2026-04-09 | developer | 1단계: Tauri 2.x + React + TS 프로젝트 세팅 + UI 기본 틀 (레이아웃+라우팅 4페이지) + VS Build Tools 설치 | 완료 |
| 2026-04-09 | tester | 1단계 검증: TS/Vite/Rust 빌드 통과, 파일구조 완전, CSS 하드코딩 4곳 경미 이슈 | 통과 |
| 2026-04-09 | pm | Git 초기화 + GitHub 연결(cobby8/grader) + 커밋 + 푸시 | 완료 |
| 2026-04-08 | tester | 1단계 검증: TS/Vite/Rust 빌드, 파일구조, 라우팅, 컴포넌트, CSS 변수 | 통과 (경미한 CSS 이슈 1건) |
| 2026-04-08 | developer | 2단계: 패턴 프리셋 시스템 (타입/스토어/CRUD/SVG미리보기/치수테이블/CSS변수수정) | 완료 — tsc/vite 통과 |
| 2026-04-08 | tester | 2단계 검증: 파일존재/TS/Vite/Rust빌드/타입시스템/코드품질/CSS수정/의존성 전항목 통과 | 통과 (12/12) |
| 2026-04-10 | developer | 3단계: Python엔진(PyMuPDF/reportlab) + run_python Rust커맨드 + DesignUpload 업로드/CMYK검증/미리보기/삭제 | 완료 — TS/Vite/Rust 빌드 통과 |
| 2026-04-10 | tester | 3단계 검증: 파일/TS/Vite/Rust/Python CLI/에러처리/보안 19개 통과, pdf_handler page_count=0 버그 1건 발견 | 조건부 통과 |
| 2026-04-10 | tester | 3단계 재검증: pdf_handler page_count 버그 수정 확인(3페이지 PDF → page_count=3), 타 함수 점검, TSC/Vite 통과 | 3단계 최종 통과 |
| 2026-04-10 | developer | pdf_handler.py page_count 버그 수정 (close 전 지역변수 저장) + 3페이지 샘플 CLI 검증 | 완료 — page_count=3 정상 |
