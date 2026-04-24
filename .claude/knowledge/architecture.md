# 프로젝트 구조 지식
<!-- 담당: planner-architect, developer | 최대 30항목 -->
<!-- 프로젝트의 폴더 구조, 파일 역할, 핵심 패턴을 기록 -->

### [2026-04-24] SVG 표준화 Phase 1-5 구현 완료 + v1.0.0 릴리스 포함
- **분류**: architecture
- **발견자**: pm
- **내용**: SVG 일괄 표준화 Phase 1(1-1~1-5) 전체 구현 완료 상태로 v1.0.0에 포함되어 배포됨. 실제 구현 결과(계획 대비): `svgStandardizeService.ts` **202줄**(계획 ~120줄), `SvgStandardizeModal.tsx` **560줄**(계획 ~320줄, 기준 파일 자동화 보완으로 증가), `App.css` **+353줄**(계획 ~120줄, BEM 스타일 풍부화), `PatternManage.tsx` **+145줄**. Rust: `lib.rs` +55/-1 (svg_preview_normalize/svg_normalize_batch 2개 invoke_handler 등록). Phase 1-5 보완으로 기준 파일 드롭다운 제거 + `resolveBaseFile()` 자동화 도입: 양면 상의는 글로벌 `양면유니폼_U넥_스탠다드_XL.svg` 고정, 그 외는 XL→2XL→L→M→S fallback. Phase 1-6(통합 테스트) 및 1-7(문서 정리)는 v1.0.0 배포 후 실 사용 테스트로 대체하기로 결정 — 사용자 피드백 발생 시 v1.0.1에서 반영. `NORMALIZER_VERSION = "1.0-uneck-double-sided"`로 범위 가드 유지, V넥/슬림/하의 지원은 Phase 3(추후 JSON 프리셋 외부화)로 연기. Python `svg_normalizer.py` 950줄/main.py CLI 무변경, driveSync.ts 무변경 원칙 준수.
- **참조횟수**: 0

### [2026-04-22] SVG 표준화 Phase 1-4 구현 완료 — Rust 커맨드 2개 (Python CLI 래퍼)
- **분류**: architecture
- **발견자**: developer
- **내용**: `src-tauri/src/lib.rs`에 `svg_preview_normalize(app, folder, base_file) -> Result<String, String>` + `svg_normalize_batch(app, folder, base_file, no_backup) -> Result<String, String>` 2개 커맨드 신규 추가(+55/-1). 내부 구현은 기존 `run_python`(L122~177, 무변경)을 그대로 호출하는 **얇은 래퍼** — `svg_preview_normalize`는 `run_python(app, "preview_normalize", vec![folder, base_file])`, `svg_normalize_batch`는 `no_backup=true`일 때만 args에 `"--no-backup"` 추가 후 호출. `invoke_handler!` 튜플 끝에 2개 등록. **sync fn 유지** — `run_python`이 `std::process::Command::output()` 기반 동기이므로 async로 바꾸면 불필요한 `.await` 체인 발생, Tauri가 sync `#[tauri::command]`를 자동 스레드풀 실행해 UI 블로킹 없음. **반환 타입은 `Result<String, String>`** (PLAN 6-3 준수) — 프론트에서 `JSON.parse(raw)` 후 `PreviewResult`/`BatchResult` 타입 캐스팅. 3층 구조 완성: Python(`svg_normalizer.py` 950줄 + main.py CLI) ← Rust(run_python + 신규 래퍼 2개) ← React(Phase 1-5에서 서비스+모달 작성 예정). `cargo check` 29.42초 PASS, 에러/경고 0. Python 엔진/main.py는 무변경. 프론트 호출 규약: `invoke<string>("svg_preview_normalize", { folder, baseFile })` / `invoke<string>("svg_normalize_batch", { folder, baseFile, noBackup })` — Rust snake_case 인자를 Tauri가 camelCase로 자동 변환.
- **참조횟수**: 0

### [2026-04-22] SVG 표준화 앱 UI 통합 아키텍처 — Rust 커맨드 + Modal + PatternManage 연동 (Phase 1-4~1-7)
- **분류**: architecture
- **발견자**: planner-architect
- **내용**: Phase 1-1~1-3에서 완성된 Python `svg_normalizer.py`(950줄)를 앱 UI로 노출하는 통합 설계. **신규 3파일**: (1) `src/services/svgStandardizeService.ts`(~120줄) — Tauri invoke 얇은 래퍼 + `PreviewResult`/`BatchResult` 타입. discriminated union 대신 Python 관례 `{ success, data|error }` 그대로 유지(일관성 우선). `invoke()`에서 받은 JSON 문자열 `JSON.parse` → 컴포넌트에 전달. 에러는 throw 전파(updaterService의 "조용한 실패"와 구분 — 여기는 사용자 명시 액션). (2) `src/components/SvgStandardizeModal.tsx`(~320줄) — **6상태 Phase 머신** `idle/previewing/preview-done/executing/done/error`. UpdateModal 구조 차용(백드롭/카드/헤더/섹션/푸터 BEM). Props: `presetName, pieceBaseName, driveFolder(절대), registeredSizes, onClose, onComplete`. 내부 상태: `phase, baseSize(XL→2XL→큰순 자동 추천), noBackup, preview, result, errorMsg`. executing 시 ESC/백드롭 차단. done 시 `onComplete()` → PatternManage가 쿨다운 리셋 후 `runAutoSync()` 트리거. (3) `src/App.css` append ~120줄 — `.svg-standardize-modal__*` + `.preset-card__menu-*` BEM 클래스. 모두 `var(--color-*)` 변수 사용, Tailwind 금지. **수정 3파일**: (4) `src-tauri/src/lib.rs` — `svg_preview_normalize(folder, base_file)` + `svg_normalize_batch(folder, base_file, no_backup)` Rust 커맨드 2개 신규, 내부는 기존 `run_python` 로직 재사용. `invoke_handler` 튜플에 두 커맨드 등록. (5) `src/pages/PatternManage.tsx` — 즐겨찾기 별 좌측에 `⋮` 버튼 + 드롭다운 메뉴(Drive 프리셋만 활성). `standardizeTarget: PatternPreset | null` state, 모달 조건부 렌더, `onComplete`에서 `lastAutoScanRef.current = 0` 강제 후 `runAutoSync()` 호출하여 60초 쿨다운 우회 + 새 사이즈 즉시 UI 반영. (6) `src/App.css` BEM append. **데이터 흐름**: 카드 ⋮ → Modal idle → [미리보기] → `svg_preview_normalize` → preview-done(파일 N개 + 경고 요약) → [실행] → `svg_normalize_batch` → done(pass/fail/skipped 숫자) → Drive 재스캔 자동 트리거. **핵심 재사용**: Python 측 `svg_normalizer.py`/`main.py` **무변경**, Rust `run_python` 로직 **재사용**, `driveSync.ts` **무변경**. **Phase 1 범위 가드**: U넥 양면유니폼 스탠다드 전용(`NORMALIZER_VERSION = "1.0-uneck-double-sided"`), 단면 유니폼 실행 시 Python FAIL + 원본 파일 무수정. 상세: `PLAN-SVG-STANDARDIZATION.md` 11개 섹션 참조.
- **참조횟수**: 0

### [2026-04-22] 자동 업데이트 Phase C 구현 완료 — 업데이트 UI (service + hook + Modal + Section)
- **분류**: architecture
- **발견자**: developer
- **내용**: Phase C(업데이트 UI) 4파일 신규 + 3파일 수정. **신규**: (1) `src/services/updaterService.ts`(110줄) — Tauri Updater/Process 플러그인 래퍼. `checkForUpdate()`는 네트워크 오류 시 throw하지 않고 discriminated union `{ kind: 'available' | 'up-to-date' | 'error' }` 반환(조용한 실패 원칙). `downloadAndInstall(update, onProgress)`는 Started/Progress/Finished 이벤트를 단순 `(received, total)` 콜백으로 변환 후 `relaunch()` 호출. `getCurrentVersion()`은 `@tauri-apps/api/app`의 `getVersion()` 사용(package.json보다 정확). (2) `src/hooks/useAutoUpdateCheck.ts`(150줄) — **모듈 상태 + 구독자 Set 패턴**(Zustand/Context 대신 기존 svgCacheStore 스타일 채택). 6상태 머신 `UpdateStatus`: idle/checking/available/up-to-date/error/dismissed. `runCheckNow()`/`dismissUpdate()` export. `hasAutoCheckedOnce` 모듈 플래그로 React StrictMode 2회 실행 차단. App과 Settings가 같은 모듈 상태를 공유. (3) `src/components/UpdateModal.tsx`(220줄) — Phase 머신 4종(idle/downloading/finishing/error). ESC + 백드롭 클릭 닫기(다운 중엔 차단). 진행률 바(용량 미상 시 50% 고정). 에러 시 재시도 버튼. role="dialog" aria-modal. (4) `src/components/UpdateSection.tsx`(150줄) — Settings 내부 섹션. `useAutoUpdateCheck(false)`로 구독만. 현재 버전/마지막 확인/상태 문구/[지금 확인]+[업데이트 받기] 버튼. **수정**: (5) `src/App.tsx` — `useAutoUpdateCheck(true)` 1줄 + `<UpdateModal>` 조건부 렌더(기존 구조 완전 보존). (6) `src/pages/Settings.tsx` — `<UpdateSection />` 1줄 삽입(섹션 3 위치). (7) `src/App.css` — `.update-modal__*` BEM 클래스 140줄 append(백드롭/카드/헤더/본문/푸터/진행바/에러, 모두 `var(--color-*)` 사용). `npx tsc --noEmit` exit 0 통과. autoCheck=true는 **App.tsx 한 곳에서만** 호출 필수(Settings는 false).
- **참조횟수**: 0

### [2026-04-22] 자동 업데이트 시스템 아키텍처 (Tauri Updater + GitHub Releases)
- **분류**: architecture
- **발견자**: planner-architect
- **내용**: Windows 전용 자동 업데이트 시스템을 Tauri Updater 플러그인 + GitHub Releases + GitHub Actions로 구성. 신규 파일: `.github/workflows/release.yml`(태그 `v*.*.*` 푸시 트리거, windows-latest runner, tauri-action@v0), `scripts/bump-version.mjs`(3파일 버전 동기화), `scripts/sync-bundle-resources.mjs`(prebuild hook에서 python-engine/*.py + illustrator-scripts/*.jsx 자동 스캔하여 tauri.conf.json bundle.resources 갱신), `src/services/updaterService.ts`, `src/hooks/useAutoUpdateCheck.ts`, `src/components/UpdateModal.tsx`, `src/components/UpdateSection.tsx`. 기존 파일 수정: `src-tauri/Cargo.toml`(tauri-plugin-updater/process 추가), `src-tauri/tauri.conf.json`(createUpdaterArtifacts:true + plugins.updater.pubkey/endpoints), `src-tauri/capabilities/default.json`(updater:default, process:allow-restart 권한 추가), `src-tauri/src/lib.rs`(두 플러그인 등록), `src/App.tsx`(useAutoUpdateCheck + UpdateModal 렌더), `src/pages/Settings.tsx`(UpdateSection 추가). 서명 키는 G드라이브 `grader-keys/`에 private 보관, public만 tauri.conf.json에 임베드. GitHub Secrets(TAURI_SIGNING_PRIVATE_KEY + PASSWORD)로 Actions에서 자동 서명. Release는 draft 생성 → 수동 Publish(안전장치). 체크 타이밍: App.tsx mount 1회(로그인 없음), 사용자 선택적 수락, Settings에서 수동 재체크 가능. 네트워크 오류는 조용히 무시하여 앱 동작 막지 않음.
- **참조횟수**: 0

### [2026-04-22] 자동 업데이트 Phase B 구현 완료 — CI 워크플로우 + 버전 동기화
- **분류**: architecture
- **발견자**: developer
- **내용**: Phase B(CI 워크플로우) 3파일 구현 완료. (1) `.github/workflows/release.yml`(131줄, 신규) — 태그 `v[0-9]+.[0-9]+.[0-9]+(-*)` 푸시 시 `windows-latest` runner에서 자동 실행. Steps: checkout → Node 20 + npm cache → Rust stable → swatinem/rust-cache(src-tauri/target) → `npm ci` → `npm run sync:resources` → `tauri-apps/tauri-action@v0`. tauri-action이 vite build + cargo build + tauri build(MSI+NSIS) + 서명(`.msi.zip.sig`/`.nsis.zip.sig`) + latest.json 생성 + GitHub Release 업로드를 한 번에 수행. env에서 `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `GITHUB_TOKEN`(자동) 3개 Secrets 참조. `releaseDraft: true`(실수 배포 방지), `prerelease: ${{ contains(github.ref_name, '-') }}`(v1.0.0-beta 자동 pre-release), `includeUpdaterJson: true`(Tauri Updater 매니페스트 필수), `args: --target x86_64-pc-windows-msvc`. `permissions: contents: write`로 릴리스 생성 권한 부여. (2) `scripts/bump-version.mjs`(267줄, 신규) — `npm run release:bump 1.1.0` 명령으로 package.json + src-tauri/Cargo.toml + src-tauri/tauri.conf.json 3파일 버전 동시 갱신. semver 검증은 pre-release 허용(`x.y.z-beta.1` OK), build metadata 거부. 핵심 설계: **JSON.parse/stringify 회피**하고 정규식으로 version 필드 한 줄만 교체 — tauri.conf.json의 `["msi","nsis"]` 배열 인라인 포맷 같은 원본 포맷을 완벽히 보존. Cargo.toml은 행 단위 파싱 + [package] 섹션 추적으로 `[dependencies]` 등 타 섹션의 `version = "2"` 같은 라인은 절대 건드리지 않음. 3파일 읽기 모두 성공해야 쓰기 시작(원자성 확보). (3) `package.json` scripts 섹션에 `"release:bump": "node scripts/bump-version.mjs"` + `"release:prepare": "node scripts/bump-version.mjs"` 2개 추가. 왕복 테스트(1.0.0 ↔ 1.0.1) 후 `git diff` 완전 0줄 검증 PASS. release.yml 구조 검증(탭 0, 홀수 들여쓰기 0, 필수 섹션 전부 존재) PASS. Phase E에서 실제 태그 푸시로 워크플로우 동작 검증 예정.
- **참조횟수**: 0

### [2026-04-22] 자동 업데이트 Phase A 구현 완료 — 기반 설정
- **분류**: architecture
- **발견자**: developer
- **내용**: Phase A(기반 설정) 10 Step 구현 완료. 변경 파일 8개: (1) `.gitignore`에 `keys/` 추가로 서명 키 폴더 전체 ignore (2) `keys/grader.key.pub` 생성(public), private는 G드라이브 `디자인/grader-keys/grader.key`로 이동, 로컬 삭제 (3) `keys/README.md` 키 보관 규칙 문서화 (4) `src-tauri/Cargo.toml`: `tauri-plugin-updater = "2"` + `tauri-plugin-process = "2"` 추가, 버전 `0.1.0`→`1.0.0` (5) `src-tauri/src/lib.rs`: `.plugin(tauri_plugin_updater::Builder::new().build())` + `.plugin(tauri_plugin_process::init())` 등록 (6) `src-tauri/tauri.conf.json`: 버전 `1.0.0`, `bundle.createUpdaterArtifacts: true`, `plugins.updater.endpoints`(GitHub Releases latest.json) + `pubkey`(한 줄 Base64), `bundle.resources`에 `svg_normalizer.py` 추가 (7) `src-tauri/capabilities/default.json`: `"updater:default"`, `"process:allow-restart"` 권한 추가 (8) `package.json`: `@tauri-apps/plugin-updater ^2`, `@tauri-apps/plugin-process ^2` 추가, 버전 `1.0.0`. 3파일 버전 1.0.0 완전 통일. `cargo check` 통과 (`tauri-plugin-updater v2.10.1`, `tauri-plugin-process v2.3.1` 컴파일 성공). gitignore 검증: `git check-ignore`로 `keys/grader.key*` 전부 차단 확인. 다음 단계(Phase B): GitHub Secrets 등록 + release.yml + bump-version.mjs.
- **참조횟수**: 0

### [2026-04-21] svg_normalizer.py 모듈 (SVG 일괄 표준화)
- **분류**: architecture
- **발견자**: developer
- **내용**: `python-engine/svg_normalizer.py` (950줄, 신규) — U넥 양면유니폼 사이즈별 SVG 12개를 기준 파일 구조로 일괄 변환. 11개 함수 구성: private 6개(transform 평탄화, path 평행이동, bbox 분류, SVG 조립), public 디버깅 3개(`measure_svg_bboxes`, `classify_svg_paths`, `preview_normalization`), public 핵심 2개(`normalize_svg`, `normalize_batch`). 모든 public 함수는 grader 컨벤션 `{"success": bool, "data": ..., "error": ...}` dict 반환. 모듈 상단에 변환 상수(NORMALIZER_VERSION, ARTBOARD_WIDTH/HEIGHT, PATTERN_X/Y_OFFSET, CUT_LINE_MARGIN, Y_OFFSET 등) 정의. main.py에 CLI 커맨드 3개 등록(`measure_svg`, `preview_normalize`, `normalize_batch`). svgpathtools>=1.6.0 의존성 추가. svg_parser.py와는 완전 분리 (그레이딩 회귀 위험 차단).
- **참조횟수**: 0

### [2026-04-08] 승화전사 유니폼 패턴 자동 생성 프로그램 아키텍처
- **분류**: architecture
- **발견자**: planner-architect
- **내용**: 하이브리드 아키텍처 채택. Tauri 2.x(데스크톱 껍데기) + React(UI) + Python(그래픽 엔진) + Illustrator ExtendScript(AI 파일 조작) + Supabase(인증). 7개 주요 모듈: UI, 패턴 관리, SVG 처리, 스케일링 엔진, Illustrator 연동, 출력, 인증/권한. 데이터 흐름: AI/SVG 입력 -> SVG 파싱 -> 사이즈 선택 -> 스케일 계산 -> Illustrator 자동 조작 -> PDF/EPS 출력.
- **참조횟수**: 1

### [2026-04-08] 확정 워크플로우 5단계 + 아키텍처 변경
- **분류**: architecture
- **발견자**: planner-architect
- **내용**: 5단계 워크플로우 확정: (1) SVG 패턴 등록 (2) PDF 기준 디자인 등록 (3) 주문서 사이즈 인식(MVP:수동/확장:엑셀) (4) 그레이딩 파일 생성 (5) CMYK 유지. 주요 변경점: 기준 디자인 형식이 AI->PDF로 변경되면서 Illustrator 의존도가 "필수"에서 "선택적 확장"으로 완화. 핵심 처리 엔진이 Python(PyMuPDF+ReportLab)으로 일원화. 데이터 흐름: SVG(패턴)+PDF(디자인) 입력 -> 사이즈 선택 -> Python 엔진(벡터 추출+클리핑+스케일링) -> CMYK PDF 출력.
- **참조횟수**: 1

### [2026-04-10] Python 엔진 디렉토리 구조 및 Rust-Python 브릿지
- **분류**: architecture
- **발견자**: developer
- **내용**: python-engine/ 폴더 구조 확정 — (main.py: CLI 엔트리, pdf_handler.py: PyMuPDF 처리 모듈, requirements.txt, venv/). Rust에서 Python 실행은 std::process::Command로 venv/Scripts/python.exe를 subprocess 호출, 작업 디렉토리를 python-engine/으로 설정해야 import 가능. Python 엔진 디렉토리 탐색은 실행파일 경로 기준 역추적(개발) + resource_dir 폴백(프로덕션). 모든 Python 결과는 stdout에 JSON 단일 라인 출력, stderr는 에러 로그용. Python stdout은 UTF-8로 재설정해야 Windows cp949 한글 깨짐 방지. Tauri 커맨드 `run_python(command, args)`로 통합 호출.
- **참조횟수**: 0

### [2026-04-10] 디자인 파일 저장 구조
- **분류**: architecture
- **발견자**: developer
- **내용**: 디자인 파일(PDF)은 AppData/designs.json에 메타데이터 저장 + AppData/designs/{id}.pdf 실파일 + AppData/designs/{id}.preview.png 미리보기. 원본 파일을 앱 데이터로 복사하여 사용자 원본 위치에 의존하지 않음. 파일 ID는 "design-{timestamp36}-{random6}" 형식. 바이너리 파일 복사는 tauri-plugin-fs의 readFile/writeFile (절대 경로는 baseDir 생략, 상대 경로는 BaseDirectory.AppData 지정). 미리보기 이미지는 base64 data URL로 <img src>에 주입하여 asset 프로토콜 권한 없이 표시.
- **참조횟수**: 0

### [2026-04-10] 그레이딩 출력 파일 저장 구조
- **분류**: architecture
- **발견자**: developer
- **내용**: 4단계 그레이딩 결과 PDF는 AppData/outputs/{timestamp}/{디자인명}_{사이즈}.pdf 형식으로 저장된다. timestamp는 "YYYY-MM-DD_HH-mm-ss" 형식으로 매 생성 작업마다 새 하위 폴더 생성. 파일명은 sanitizeFileName으로 확장자 제거 + <>:"/\|?* 치환 처리. 생성 직전에 프리셋 전체 JSON을 같은 폴더 내 _preset.json 임시 파일로 기록하여 Python calc_scale에 경로로 전달, 모든 사이즈 처리 후 삭제. Python은 stdin 대신 파일 경로 입력을 선호(크기 제한/이스케이프 문제 회피). 출력 폴더는 opener 플러그인 `openPath`로 OS 탐색기에서 열 수 있음(capabilities에 `opener:allow-open-path` + `$APPDATA/**` 범위 필요).
- **참조횟수**: 0

### [2026-04-10] CMYK 보존 PDF 스케일링 아키텍처 (v1: show_pdf_page -- 대체됨)
- **분류**: architecture
- **발견자**: developer
- **내용**: [대체됨] show_pdf_page 방식은 Form XObject 래핑으로 인해 일부 뷰어에서 사각형 중복 렌더링 문제 발생. v2 CTM 직접 삽입으로 대체되었으나, 이후 v3 Illustrator ExtendScript 방식으로 최종 대체.
- **참조횟수**: 1

### [2026-04-08] CMYK 보존 PDF 스케일링 아키텍처 (v2: CTM 직접 삽입 -- 대체됨)
- **분류**: architecture
- **발견자**: planner-architect
- **내용**: [대체됨] CTM 직접 삽입 방식도 CropBox/MediaBox 순서 버그, 축소 시 ValueError 등의 문제 발생. 이후 show_pdf_page+clip(v3), PDF W 연산자(v4), 조각별 채워넣기(v5) 모두 실패. 최종적으로 Illustrator ExtendScript 방식으로 전환. 상세: REPORT-EXTENDSCRIPT.md 참조.
- **참조횟수**: 0

### [2026-04-08] 그레이딩 엔진 v3: Illustrator ExtendScript 연동
- **분류**: architecture
- **발견자**: planner-architect
- **내용**: 그레이딩 엔진을 PyMuPDF에서 Illustrator ExtendScript로 전환. 아키텍처: Tauri가 .jsx 스크립트를 동적 생성 -> Illustrator.exe /run 으로 실행 -> 완료 마커 파일을 폴링하여 결과 수신. Illustrator가 PDF 열기/스케일링/SVG 클리핑 마스크/CMYK PDF 저장을 네이티브로 처리. Python 엔진은 PDF 분석 전용(정보 추출, CMYK 검증, 미리보기)으로 역할 축소. 신규 디렉토리: illustrator-scripts/ (grading_template.jsx, utils.jsx). Rust 신규 커맨드: find_illustrator_exe, run_illustrator_script, generate_grading_jsx. 프론트 변경: FileGenerate.tsx가 Python generate_graded 대신 Illustrator 호출. 핵심 이점: 곡선 클리핑 마스크 네이티브 지원, SVG-PDF 좌표 자동 변환, CMYK 100% 보존.
- **참조횟수**: 0
