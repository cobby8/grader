# 코딩 규칙 및 스타일
<!-- 담당: developer, reviewer | 최대 30항목 -->
<!-- 이 프로젝트만의 코드 스타일, 네이밍 규칙, 패턴을 기록 -->

### [2026-04-09] CSS 변수 네이밍 규칙
- **분류**: convention
- **발견자**: developer
- **내용**:
  - 색상: `--color-{용도}-{변형}` (예: `--color-bg-primary`, `--color-text-muted`, `--color-accent-hover`)
  - 레이아웃: `--{요소}-{속성}` (예: `--header-height`, `--sidebar-width`)
  - 폰트: `--font-{속성}-{변형}` (예: `--font-size-sm`, `--font-family`)
  - 그림자: `--shadow-{크기}` (예: `--shadow-sm`, `--shadow-md`)
  - 둥글기: `--radius-{크기}` (예: `--radius-sm`, `--radius-md`)
  - 전환: `--transition-{속도}` (예: `--transition-fast`, `--transition-normal`)
  - 하드코딩 색상 절대 금지, 반드시 var(--color-*) 사용
- **참조횟수**: 0

### [2026-04-09] 컴포넌트 구조 규칙
- **분류**: convention
- **발견자**: developer
- **내용**:
  - 레이아웃 컴포넌트: `src/components/` (Header, Sidebar, StatusBar 등)
  - 페이지 컴포넌트: `src/pages/` (각 라우트에 대응하는 페이지)
  - 컴포넌트는 function 선언 + default export 방식
  - 각 컴포넌트 파일 상단에 JSDoc 주석으로 역할 설명
  - 중요 코드에 한국어 주석 필수
- **참조횟수**: 0

### [2026-04-09] 파일 네이밍 규칙
- **분류**: convention
- **발견자**: developer
- **내용**:
  - React 컴포넌트: PascalCase (예: `PatternManage.tsx`, `StatusBar.tsx`)
  - CSS 파일: 전역 스타일은 `App.css` 하나로 관리 (CSS Modules 미사용, 추후 필요시 도입)
  - 스타일 클래스명: BEM 패턴 (`block__element--modifier`) (예: `sidebar__link--active`)
  - Batch 파일: 소문자 (build.bat, dev.bat)
- **참조횟수**: 0

### [2026-04-08] 데이터 저장 패턴
- **분류**: convention
- **발견자**: developer
- **내용**:
  - 로컬 데이터는 Tauri의 `BaseDirectory.AppData`에 JSON 파일로 저장
  - 스토어 함수는 `src/stores/` 폴더에 `{도메인}Store.ts` 형태로 작성
  - 로드/세이브는 async 함수, 에러 시 빈 배열 반환 (로드) 또는 throw (세이브)
  - 컴포넌트에서 useState로 상태 관리, 변경 시 persistPresets 패턴으로 자동 저장
- **참조횟수**: 0

### [2026-04-08] 타입 정의 구조
- **분류**: convention
- **발견자**: developer
- **내용**:
  - 타입/인터페이스는 `src/types/` 폴더에 도메인별 파일로 분리 (예: `pattern.ts`)
  - 상수(SIZE_LIST 등)도 같은 파일에 `as const`로 정의
  - 유니온 타입은 `typeof CONST[number]` 패턴으로 도출
- **참조횟수**: 0

### [2026-04-09] 빌드 및 실행 환경 규칙
- **분류**: convention
- **발견자**: developer
- **내용**:
  - Git Bash에서 직접 `npm run tauri dev` 불가 (MSVC link.exe PATH 충돌)
  - Tauri 실행은 반드시 `dev.bat` (cmd 환경) 사용
  - 프론트엔드만 테스트: `npm run dev` (Git Bash에서 가능)
  - TypeScript 검증: `npx tsc --noEmit` (Git Bash에서 가능)
  - Rust 빌드/실행 시 vcvarsall.bat x64 환경 선행 필수
- **참조횟수**: 1

### [2026-04-10] Python 엔진 호출 패턴
- **분류**: convention
- **발견자**: developer
- **내용**:
  - 프론트엔드에서 Python 호출: `invoke<string>("run_python", { command, args })` → 결과는 JSON 문자열
  - Python CLI는 반드시 JSON 단일 라인을 stdout에 출력 (`print(json.dumps(data, ensure_ascii=False))`)
  - 모든 Python 결과에 `success: boolean` 필드 포함, 실패 시 `error: string` 추가
  - Python 스크립트 상단에서 sys.stdout을 UTF-8 TextIOWrapper로 재설정 (Windows cp949 대응)
  - Tauri 타입 정의 시 Python 응답 인터페이스는 snake_case 유지 (Python 측 필드명과 1:1 매칭)
  - 에러 핸들링은 프론트에서 try/catch + `result.success` 체크 두 단계
- **참조횟수**: 0

### [2026-04-10] Tauri 바이너리 파일 처리 패턴
- **분류**: convention
- **발견자**: developer
- **내용**:
  - 바이너리 파일 복사: `readFile(절대경로)` → Uint8Array → `writeFile(상대경로, bytes, { baseDir: BaseDirectory.AppData })`
  - 절대 경로로 읽을 때는 `baseDir` 생략, 상대 경로는 `baseDir` 지정
  - capabilities의 fs:allow-read-file / fs:allow-write-file / fs:allow-remove 권한은 별도로 추가 필요 (fs:default에 미포함)
  - 바이너리 → base64 변환 시 8KB 청크 단위 루프로 String.fromCharCode 스택 초과 방지
  - 로컬 이미지를 <img>에 표시할 때는 asset:// 대신 `data:image/png;base64,...` data URL 사용이 권한 설정 없이 안전
- **참조횟수**: 0
