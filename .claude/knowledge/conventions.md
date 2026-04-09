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

### [2026-04-09] 빌드 및 실행 환경 규칙
- **분류**: convention
- **발견자**: developer
- **내용**:
  - Git Bash에서 직접 `npm run tauri dev` 불가 (MSVC link.exe PATH 충돌)
  - Tauri 실행은 반드시 `dev.bat` (cmd 환경) 사용
  - 프론트엔드만 테스트: `npm run dev` (Git Bash에서 가능)
  - TypeScript 검증: `npx tsc --noEmit` (Git Bash에서 가능)
  - Rust 빌드/실행 시 vcvarsall.bat x64 환경 선행 필수
- **참조횟수**: 0
