# 코딩 규칙 및 스타일
<!-- 담당: developer, reviewer | 최대 30항목 -->
<!-- 이 프로젝트만의 코드 스타일, 네이밍 규칙, 패턴을 기록 -->

### [2026-04-22] Tauri 플러그인 래퍼 서비스 패턴 (조용한 실패 원칙)
- **분류**: convention
- **발견자**: developer
- **내용**: Tauri 플러그인 API(updater, fs, dialog 등) 호출은 `src/services/*.ts`의 얇은 래퍼 서비스에 캡슐화한다. 네트워크/외부 의존 플러그인(updater)은 **throw하지 않고 discriminated union으로 반환**(`{ kind: 'available' | 'up-to-date' | 'error' }` 형태). 이유: 앱 시작 시 호출되는 훅이 throw하면 React error boundary가 터져 앱이 기동 안 된다. `console.warn('[updater] ...')`만 남기고 상위에서 조용히 처리. 반면 사용자가 명시적으로 트리거한 동작(`downloadAndInstall`)은 예외 전파 허용 — UI에서 재시도 버튼으로 복구. 기존 `driveSync.ts`, `svgResolver.ts`와 동일한 함수 export 스타일(클래스 X).
- **참조횟수**: 0

### [2026-04-22] React 전역 상태 공유: 모듈 상태 + 구독자 Set 패턴
- **분류**: convention
- **발견자**: developer
- **내용**: 기존 프로젝트에 Zustand/Redux/Context 없음. 여러 컴포넌트가 공유해야 하는 상태(예: 업데이트 체크 결과)는 **모듈 레벨 상태 + `listeners: Set<(s)=>void>`** 패턴으로 구현. 훅 내부에서 `useState(state)` + `useEffect`로 구독/해제, `setState(next)`는 모든 listener에 알림. 싱글톤이라 `hasAutoCheckedOnce` 같은 플래그로 React StrictMode 이중 실행도 쉽게 차단. 장점: (1) 의존성 0(라이브러리 추가 불필요) (2) 기존 `svgCacheStore.ts` 스타일과 일관 (3) 타입 안전. 단점: 앱 재시작 시 초기화(의도적 — 업데이트 상태는 세션 단위로 충분). 훅 인자에 `autoCheck: boolean` 같은 트리거 플래그를 두어 **한 군데만** 자동 실행, 나머지는 구독만 하는 구조 권장.
- **참조횟수**: 0

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

### [2026-04-10] 페이지 간 상태 전달 패턴 (sessionStorage)
- **분류**: convention
- **발견자**: developer
- **내용**: 라우팅으로 분리된 두 페이지 간에 사용자 선택 정보를 전달할 때 Zustand/Recoil 등 별도 상태 라이브러리 대신 sessionStorage + 간단한 store 모듈을 사용한다. 예: `src/stores/generationStore.ts` — `loadGenerationRequest()`, `saveGenerationRequest(req)`, `clearGenerationRequest()` 3개 함수만 export. sessionStorage 키는 `grader.{도메인}.{용도}` 네임스페이스(예: `grader.generation.request`). ID만 저장하고 실제 객체는 해당 스토어(presetStore/designStore)에서 매번 다시 로드(데이터 중복 방지). 브라우저 새로고침에도 유지되고 앱 종료 시 자동 소멸하여 프라이버시 측면도 안전. 에러 처리는 try/catch + console.error, 저장 실패는 throw 하지 않음(사용자 UX 방해 방지).
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

### [2026-04-21] Illustrator ExtendScript 좌표계 규칙 (grading.jsx 필수)
- **분류**: convention
- **발견자**: developer
- **내용**:
  - Illustrator `geometricBounds` = `[top, left, bottom, right]`. ExtendScript 좌표계는 **Y값이 클수록 위쪽** (일반 그래픽 좌표계와 반대)
  - "위/아래" 4분면 판정 시 **반드시** `isTop = (cy > midY)` 로 통일. `<` 쓰면 표/이 스왑 버그 재발
  - grading.jsx에서 이 규칙을 쓰는 위치: `findBodyForLayer`(L556), 색상 4분면 매칭(L1218 `dTop`, L1222 `sTop`) — **3곳 전부 동일 방향**이어야 함
  - 참고: 정렬 함수(예: `colors.sort`에서 `b.cy - a.cy`)도 "cy 큰 게 위쪽 우선"으로 일관되게 작성
  - 관련 errors.md: [2026-04-21] "양면 유니폼 Y축 부등호 방향 혼용" 항목
- **참조횟수**: 0

### [2026-04-21] 요소 배치는 "relVec 개별 translate" 패턴으로 통일 (grading.jsx 필수)
**[복구됨 2026-04-21, 폴백 함수 재사용 방식]** — 초기 구현(그룹별 4회 group/ungroup 반복)은 ExtendScript `executeMenuCommand("ungroup")` 호출 시 PageItem 참조 파괴 가능성(가설 D)으로 롤백. 재구현에서는 **폴백 모드의 `placeElementGroupPerPiece` 함수를 그대로 재사용**하는 구조로 안정화. 아래 패턴 본문은 유효.

- **분류**: convention
- **발견자**: developer (이름 기반 모드 버그 3 "외측 위 쏠림" 수정 중 확립)
- **내용**:
  - 모든 요소 배치 모드(이름 기반 / 폴백 유클리드 / band)는 **요소별 상대벡터(relVec) + 스케일 곱** 패턴을 사용해야 한다. 그룹 전체를 한 번에 translate(그룹 bbox → body bbox) 하면 요소 간 상대 위치가 파괴되어 body 가장자리에 쏠림(버그 3 "외측 위 쏠림"). 이유: 디자인AI의 요소 분포 영역 bbox와 SVG body 영역 bbox 형태가 다르기 때문.
  - **표준 패턴 3단계 (이름 기반 모드 ≡ 폴백 모드 동일 구조)**:
    1. Phase 1 (디자인AI 열려있을 때): `findBodyForLayer(piece, side, designPieces.bodies)`로 요소가 속한 body 찾기 + 각 요소별 `relVec = {dx: elCx - bodyCx, dy: elBottom - bodyBottom}` 수집. **단일 평탄 배열 `allDups`와 `allElemMeta`에** 동반 저장 (그룹별 서브배열 금지).
    2. Phase 2 (타겟 문서): **전체를 단일 그룹으로 묶어** `resize(pct, pct, ..., Transformation.CENTER)`로 스케일만 적용 → `ungroup` **1회만** 실행. group/ungroup을 그룹별로 반복하면 PageItem 참조가 파괴됨(가설 D).
    3. Phase 2 (개별 translate): `placeElementGroupPerPiece(allDups, allElemMeta, svgPieces, svgFallback, adjustedScale, bandPositions)` 호출. 내부에서 각 요소를 `targetCx = baseCenter.cx + relVec.dx * scale`, `targetBottom = svgBodies[pieceIdx].bbox[3] + relVec.dy * scale`로 개별 translate.
  - **스케일 인자**: `placeElementGroupPerPiece`의 scale 인자로 **`adjustedScale`** (ELEMENT_SCALE_EXPONENT 적용 후 값) 전달. 2026-04-21 튜닝: exponent=0.78 → **1.0** (선형스케일 그대로). `linearScale` 원본은 band 처리에만 사용.
  - Y축 기준은 **하단(bbox[3])**. 중심(cy) 기준은 band 모드 fallback이나 최종 안전망에만 사용.
  - **group/ungroup 횟수 규칙**: 배치 로직 전체에서 최대 1회. for 루프 내부에 group/ungroup을 넣지 말 것.
  - **`elemMeta` 스키마**: `{pieceType: "body"|"band", pieceIdx: number, relVec: {dx, dy}}`. 이름 기반 모드에서는 `pieceType="body"` 고정(이름 기반 레이어는 body 전용).
  - grading.jsx에서 이 패턴을 쓰는 위치(3곳): 이름 기반 모드(L1259~1407, Phase 1+2 분리 구조), 폴백 모드 `placeElementGroupPerPiece`(L606~707), band 배치 `placeBandsPerPiece`(L713~).
  - 관련 errors.md: [2026-04-21] "이름 기반 요소 배치 모드에 relVec 누락" 항목 / "executeMenuCommand ungroup 반복 시 PageItem 참조 파괴" 가설
- **참조횟수**: 1
