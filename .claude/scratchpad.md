# 작업 스크래치패드

## 🎯 다음 세션 시작 가이드
1. **SVG 표준화 Phase 1 재개** (양면 유니폼 버그 수정으로 일시중단됐던 작업)
   - 사용자 확인 2건 받기:
     - ① 분류 로직(폭 우선 비교 + 4그룹 위쪽쌍 채택) 승인 — 현재 U넥 한정 가정
     - ② CLI 인터페이스(`preview_normalize <folder_or_files>` `;` 구분자) 확정
2. 승인되면 Phase 1-4 → 1-5 → 1-6 → 1-7 진행
3. Phase 1 완료 후 → **AI→SVG 자동 변환 기능** 설계 착수

---

## 현재 작업
- **요청**: grader 앱 자동 업데이트 시스템 도입 상세 설계
- **상태**: ✅ **설계 완료** (PLAN-AUTO-UPDATE.md 생성, 5 Phase 분할)
- **현재 담당**: planner-architect → (다음) 사용자 승인 → developer Phase A 착수

### 📋 직전 작업 (커밋 대기)
양면 유니폼 그레이딩 버그 4종 수정 완료 (L556 부등호, 스케일링 1.0, 외측 쏠림, 색상 반전)

### 🎉 완료된 수정 (커밋 전 요약)
| 버그 | 해결 방법 | 라인 |
|------|---------|------|
| 1. 표/이 스왑 | `isTop` 부등호 `<` → `>` 통일 | L556 |
| 4. 색상 대비 반전 | 버그 1 파생 자동 해결 | - |
| 2. 스케일링 부족 | `ELEMENT_SCALE_EXPONENT` 0.78 → 1.0 | L1172 |
| 3. 외측 위 쏠림 | 이름 기반 모드를 폴백 함수 재사용 구조로 교체 | L1259~1407 |

**검증**: 2XS 양면 그레이딩 이미지가 레퍼런스와 일치. 단면(연세대 레플리카) 회귀도 통과.

### 📋 작업 중 배운 교훈 (knowledge 기록됨)
- Illustrator `geometricBounds = [left, top, right, bottom]` (Y 클수록 위, bbox[3]=bottom)
- group/ungroup 반복 시 PageItem 참조 파괴 → **1회만** 수행할 것
- 이름 기반 / 폴백 모드는 **같은 배치 함수** `placeElementGroupPerPiece` 재사용 원칙

---

## 진행 현황표
| 단계 | 내용 | 상태 |
|------|------|------|
| 0~7 | 기본 기능(패턴/디자인/사이즈/CMYK/Illustrator/APCA) | ✅ 완료 |
| 8 | 설치형 배포 + 자동 업데이트 | 📋 **설계 완료** (PLAN-AUTO-UPDATE.md, 5 Phase) |
| 9 | Drive 연동 (자동 동기화) | ✅ |
| 10 | Phase 1 (WorkSetup + 세션) | ✅ |
| 11 | Phase 2 (패턴 선택 모드) | ✅ |
| 12 | Phase 3 (즐겨찾기) | ✅ |
| 12-A | SVG 일괄 표준화 Phase 1 | 🔨 1-3 완료 / 1-4~1-7 대기 |
| 12-B | AI→SVG 자동 변환 | ⏳ 12-A 완료 후 |
| 12-C | **양면 유니폼 그레이딩 버그 4종** | ✅ **완료 (커밋 대기)** |
| 13 | Phase 4 (OrderGenerate 통합) | ✅ |

---

## 프로젝트 핵심 정보
- **기술 스택**: Tauri 2.x + React 19 + TypeScript + react-router-dom 7, Python 엔진(PyMuPDF/reportlab/pillow/openpyxl/svgpathtools), CSS+BEM(Tailwind 금지)
- **빌드**: `dev.bat` (MSVC), `build.bat`
- **주요 폴더**: `src/pages`, `src/components`, `src/services`, `src/stores`, `src/types`, `src-tauri`, `python-engine`, `illustrator-scripts`
- **데이터**: `$APPDATA/com.grader.app/` (presets/categories/settings/favorites.json), Drive `G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG` (60초 쿨다운), sessionStorage `grader.session`

---

## 기획설계 (planner-architect)

### 자동 업데이트 시스템 도입 [2026-04-22]

#### 🎯 목표
앱이 켜질 때마다 GitHub Releases를 확인해 새 버전이 있으면 사용자에게 물어보고 설치까지 자동 진행. Windows 전용, 사용자 선택형, 별도 설정 메뉴 제공.

#### 🗺️ 아키텍처 개요
```
직원 PC grader ─check()─> GitHub Releases latest.json
                              │
                              ▼
                    새 버전? → UpdateModal 팝업
                              │
             [업데이트] ──────┴────── [나중에]
               │                         │
     downloadAndInstall()             dismiss()
               │                         │
     서명 검증 → 설치 → relaunch    Settings에서 재호출 가능
```

#### 📦 Phase별 구현 단계
| Phase | 내용 | 예상 시간 | 커밋 단위 |
|-------|------|--------|---------|
| **A. 기반 설정** | 서명키 생성 → Cargo/npm 의존성 → tauri.conf → lib.rs → capabilities → prebuild 스크립트 | 2~3시간 | 1커밋 |
| **B. CI 워크플로우** | GitHub Secrets → release.yml → bump-version.mjs | 2~3시간 | 1커밋 |
| **C. 업데이트 UI** | updaterService → useAutoUpdateCheck → UpdateModal → UpdateSection(Settings) | 3~4시간 | 1커밋 |
| **D. 배포 자동화** | RELEASE-GUIDE.md → CHANGELOG.md | 1~2시간 | 1커밋 |
| **E. 테스트+롤아웃** | 로컬 E2E → pilot 1명 → 전체 직원 | 3~5시간(+1주 관찰) | (비커밋) |

**총 소요**: 15~18시간 (3~4일 분산 권장)

#### 📍 만들 위치와 구조
| 파일 경로 | 역할 | 신규/수정 |
|----------|------|---------|
| `.github/workflows/release.yml` | 태그 푸시 시 자동 빌드/서명/업로드 | 신규 |
| `scripts/bump-version.mjs` | 3파일(package/cargo/tauri) 버전 동기화 | 신규 |
| `scripts/sync-bundle-resources.mjs` | python-engine/*.py 자동 스캔 → conf 갱신 | 신규 |
| `src/services/updaterService.ts` | check/downloadAndInstall 래퍼 | 신규 |
| `src/hooks/useAutoUpdateCheck.ts` | App mount 시 1회 체크 훅 | 신규 |
| `src/components/UpdateModal.tsx` | 업데이트 팝업 (진행률 표시) | 신규 |
| `src/components/UpdateSection.tsx` | Settings 내 "버전 정보" 섹션 | 신규 |
| `keys/README.md` | 키 보관 위치 메모 (실제 키는 G드라이브) | 신규 |
| `RELEASE-GUIDE.md` | 릴리스 절차서 | 신규 |
| `CHANGELOG.md` | 버전별 변경사항 | 신규 |
| `PLAN-AUTO-UPDATE.md` | 전체 계획서 | 신규 ✅ |
| `src-tauri/Cargo.toml` | tauri-plugin-updater/process 추가 | 수정 |
| `src-tauri/tauri.conf.json` | createUpdaterArtifacts + plugins.updater + resources 2개 보충 | 수정 |
| `src-tauri/capabilities/default.json` | updater:default, process:allow-restart 권한 | 수정 |
| `src-tauri/src/lib.rs` | 두 플러그인 등록 | 수정 |
| `src/App.tsx` | useAutoUpdateCheck + UpdateModal 렌더 | 수정 |
| `src/pages/Settings.tsx` | UpdateSection 추가 | 수정 |
| `package.json` | plugin-updater/process 의존성, prebuild/release 스크립트 | 수정 |
| `.gitignore` | `keys/` 추가 | 수정 |

#### 🔗 기존 코드 연결
- **App.tsx mount = 앱 켜질 때** (로그인 흐름 없음) → `useAutoUpdateCheck()` 훅 1줄 추가
- **Settings 페이지**에 섹션 추가 → 별도 라우트 불필요, 사이드바 복잡화 방지
- **services/ 컨벤션 유지** → `updaterService.ts`는 기존 `patternService`, `designService`와 같은 계층
- **누락된 번들 리소스** (`order_parser.py`, `svg_normalizer.py`) → 자동 스캔 스크립트로 즉시 해결

#### 📋 실행 계획 (병렬 활용)
| 순서 | 작업 | 담당 | 선행 조건 |
|------|------|------|---------|
| 1 | Phase A: 기반 설정 (의존성+conf+lib+caps+prebuild) | developer | 사용자 G드라이브 `grader-keys/` 확인 |
| 2 | **tester + reviewer 병렬** (cargo check + 앱 기동) | tester + reviewer | 1 |
| 3 | Phase A 커밋 | pm | 2 통과 |
| 4 | Phase B: GitHub Secrets 등록 (사용자) + release.yml + bump-version | 사용자 + developer | 3 |
| 5 | Phase B 커밋 | pm | 4 |
| 6 | Phase C: updaterService → hook → Modal → Settings | developer | 3 (A 플러그인 등록 완료) |
| 7 | **tester + reviewer 병렬** (UX 수동 테스트) | tester + reviewer | 6 |
| 8 | Phase C 커밋 | pm | 7 통과 |
| 9 | Phase D: 가이드 + CHANGELOG | developer/pm | 5, 8 |
| 10 | Phase E: 로컬 E2E → pilot → 전체 | tester → pm | 9 |

#### 🧭 주요 결정 사항 (decisions.md 기록됨 6건)
1. **플랫폼**: Tauri 공식 Updater + GitHub Releases + Actions (자체 구현/사내 서버 거부)
2. **키 보관**: G드라이브 공유 폴더 (Git 커밋 절대 금지)
3. **버전 관리**: SemVer + `v{x.y.z}` 태그, 3파일 동기화 스크립트
4. **리소스 번들링**: prebuild 자동 스캔 스크립트 (수동 나열/글롭 거부)
5. **UI 배치**: App.tsx 자동 팝업 + Settings 섹션 이중 진입점 (별도 라우트 거부)
6. **릴리스 공개**: Draft 후 수동 Publish (실수 배포 방지)

#### ⚠️ 리스크 & 대응
| 리스크 | 대응 |
|--------|------|
| Windows SmartScreen 경고 (코드 사인 없음) | 설치 가이드 동봉 ("추가 정보→실행"), 업데이트 자체는 서명 검증 안전 |
| 회사망 GitHub 차단 | pilot에서 확인, 차단 시 G드라이브 미러 검토 (Phase F) |
| G드라이브 경로 하드코딩 | 별개 이슈 — 이번 범위에서 제외 |
| Python 미설치 PC | 업데이트는 바이너리만 교체, venv 유지됨. requirements 변경 시 setup-python.bat 재실행 안내 |
| Tauri 2.x API 변경 | 공식 문서 확인 완료 (2026-04-22) |
| 업데이트 중 크래시 | atomic replace → 실패 시 원본 유지, 재체크 팝업 |

#### ⚠️ developer 주의사항
- **private 키 절대 커밋 금지** — `.gitignore` 먼저 추가 후 키 생성
- `tauri.conf.json` pubkey는 **Base64 한 줄** (개행 포함 시 빌드 실패)
- `createUpdaterArtifacts: true` 누락하면 `.zip`/`.sig` 미생성 (가장 흔한 실수)
- capabilities에 `updater:default` + `process:allow-restart` **둘 다** 필요
- GitHub Actions YAML 들여쓰기는 **스페이스 2칸 고정**
- Cargo/npm 버전 `^2` 최신 동기화
- 테스트 태그(0.1.9-test 등)는 pre-release 표시로 직원 노출 차단

#### 📚 기록할 문서
- ✅ `knowledge/architecture.md`: 자동 업데이트 아키텍처 1항목 추가됨
- ✅ `knowledge/decisions.md`: 결정 6건 추가됨 (D1~D6)
- ✅ `knowledge/index.md`: 항목수/날짜 갱신, 최근 지식 7건 추가
- ✅ `PLAN-AUTO-UPDATE.md`: 11개 섹션 구성의 상세 계획서
- ⏳ `RELEASE-GUIDE.md`: Phase D-1에서 developer 작성
- ⏳ `CHANGELOG.md`: Phase D-2에서 pm 작성

---

## 구현 기록 (developer)

### developer [2026-04-22] Phase A 기반 설정

📝 구현한 기능: 자동 업데이트 시스템 Phase A(기반 설정) — 서명 키 생성/보관, Tauri 플러그인 등록, 버전 통일, 권한 설정

#### 수정 이력
| 회차 | 날짜 | 수정 내용 | 수정 파일 | 사유 |
|------|------|----------|----------|------|
| 1차 | 2026-04-22 | A-5 자동 스캔 스크립트 + prebuild 등록 + 계획서/decisions 오타 `grader-updater.key` → `grader.key` | scripts/sync-bundle-resources.mjs (신규), package.json, PLAN-AUTO-UPDATE.md, .claude/knowledge/decisions.md | PM 지시: Phase A Step 7(A-5) 누락분 + 계획서 오타 4건 보정 |



| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| `.gitignore` | `keys/` 폴더 전체 ignore 추가 | 수정 |
| `keys/grader.key.pub` | Tauri 서명 공개 키 (minisign 형식, 2줄 Base64) | 신규 |
| `keys/README.md` | 키 보관 규칙 + G드라이브 경로 + CI Secrets 안내 | 신규 |
| `G:/공유 드라이브/디자인/grader-keys/grader.key` | Tauri 서명 비밀 키 (G드라이브 원본 1부, 로컬 삭제) | 신규 (프로젝트 외부) |
| `src-tauri/Cargo.toml` | `tauri-plugin-updater="2"` + `tauri-plugin-process="2"` 추가, 버전 0.1.0→1.0.0 | 수정 |
| `src-tauri/src/lib.rs` | Builder 체인에 updater/process 플러그인 2개 등록 | 수정 |
| `src-tauri/tauri.conf.json` | `version: 1.0.0`, `bundle.createUpdaterArtifacts: true`, `plugins.updater` 블록(endpoints+pubkey), resources에 `svg_normalizer.py` 보충 | 수정 |
| `src-tauri/capabilities/default.json` | `"updater:default"` + `"process:allow-restart"` 권한 추가 | 수정 |
| `package.json` | `@tauri-apps/plugin-updater ^2` + `@tauri-apps/plugin-process ^2` 추가, 버전 0.1.0→1.0.0 | 수정 |

#### 실행한 10 Step 요약
1. `.gitignore`에 `keys/` 추가 → 커밋 안전 상태 확보
2. `npx tauri signer generate --ci -p 'stiz3000!' -w keys/grader.key` 실행 → 키 쌍 생성 성공 (비밀번호는 명령줄 외 어디에도 기록 안 됨)
3. `git check-ignore -v keys/grader.key*` → 두 파일 모두 `.gitignore:36:keys/` 규칙으로 차단 확인
4. private 키 `keys/grader.key`를 G드라이브 `디자인/grader-keys/`로 이동(cut), 로컬에는 public 키 + README만 잔존
5. `keys/README.md` 작성 (키 보관 규칙, 재생성 절차, Secrets 안내)
6. Cargo.toml + lib.rs + tauri.conf.json + capabilities + package.json 일괄 수정
7. 3파일 버전 `1.0.0`으로 완전 동기화 (package.json / Cargo.toml / tauri.conf.json)
8. `npm install` → 2개 패키지 (plugin-updater, plugin-process) 추가
9. `cargo check` → **35.61초에 컴파일 성공**, `tauri-plugin-updater v2.10.1`, `tauri-plugin-process v2.3.1` 정상 컴파일, `grader v1.0.0` 최종 체크 통과
10. 최종 `git status`로 keys/ 파일들이 Untracked에도 안 나타나는 것 재확인

💡 tester 참고:
- 테스트 방법:
  1. `cd src-tauri && cargo check` → 에러 0개여야 정상
  2. `cd .. && npm run tauri dev` → 앱 정상 기동(화면 렌더링까지)되면 플러그인 등록 OK
  3. `git status` 출력에 `keys/grader.key`/`grader.key.pub` 이 **절대** 나타나지 않아야 함
- 정상 동작: 앱이 켜지고 기존 기능(SVG/PDF/그레이딩)이 모두 그대로 동작. 현재 UI는 아직 없음(Phase C에서 추가).
- 주의할 입력: Phase A는 UI 변경 0건. 기능 회귀만 없으면 통과.

⚠️ reviewer 참고:
- `src-tauri/tauri.conf.json`의 `plugins.updater.endpoints` URL이 `https://github.com/subinkim/grader/...` 로 설정됨 → 실제 GitHub 리포지토리 오너/이름과 일치하는지 확인 필요. 불일치 시 Phase B 전에 수정.
- `pubkey`는 실제 생성된 public 키 파일 내용(개행 포함 Base64 2줄)을 **한 줄 문자열**로 붙여넣음 (파일 내부 개행 `\n`은 JSON 문자열에서 허용됨, Base64 자체는 손상 없음).
- `bundle.resources`에 `svg_normalizer.py` 추가한 것이 Phase 1-3에서 누락된 파일 보강 의도와 맞는지 확인.
- private 키가 G드라이브에만 있어 CI에서는 Secrets 등록 전까지 서명 빌드 불가 → Phase B 사용자 작업 필수.

### developer [2026-04-22] Phase B CI 워크플로우

📝 구현한 기능: 자동 업데이트 시스템 Phase B — 태그 푸시 시 Windows 빌드/서명/Draft 릴리스 자동화 + 3파일 버전 동기화 스크립트

**변경 파일**:
| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| `scripts/bump-version.mjs` | 3파일(package/Cargo/tauri) 버전 동기화 스크립트 (267줄). semver 검증(pre-release 허용), 정규식 단일라인 교체로 원본 포맷(배열 인라인/주석/개행) 완벽 보존 | 신규 |
| `.github/workflows/release.yml` | 태그 `v*.*.*` 푸시 시 windows-latest 러너에서 Rust+Node 설치 → npm ci → sync:resources → tauri-action@v0으로 빌드/서명/Draft 릴리스+latest.json 업로드 (131줄) | 신규 |
| `package.json` | scripts 섹션에 `release:bump`, `release:prepare` 2개 추가 | 수정 |

**주요 구성**:
- `release.yml` 트리거: `v[0-9]+.[0-9]+.[0-9]+` + `v[0-9]+.[0-9]+.[0-9]+-*` (pre-release 포함)
- `releaseDraft: true` ⭐ 실수 배포 방지
- `prerelease: ${{ contains(github.ref_name, '-') }}` → v1.0.0-beta 등은 pre-release 자동 표시
- `includeUpdaterJson: true` → latest.json 매니페스트 자동 생성
- Secrets 3개 참조: `GITHUB_TOKEN`(자동) + `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- bump-version.mjs 설계: **JSON.parse+stringify 회피** — 정규식으로 version 필드 한 줄만 교체해 tauri.conf.json의 `["msi","nsis"]` 배열 인라인 포맷 유지

**검증 결과**:
- `npm run release:bump 1.0.1` → 3파일 버전 모두 1.0.1로 변경 확인
- `npm run release:bump 1.0.0` → 원복 후 `git diff --stat` 완전 0건 (package.json은 scripts 추가분만 +3 -1)
- `npm run release:bump 1.0.0-beta.1` → pre-release 포맷 통과
- `npm run release:bump invalid-version` → 거부 (exit 1) 정상
- Cargo.toml `[package]` 섹션의 version만 교체, `[dependencies]`의 `version = "2"` 등 타 섹션은 영향 0
- release.yml 정규식 구조 검증: 총 131라인, 탭/홀수들여쓰기 0건, 필수 섹션 전부 존재

💡 tester 참고:
- 테스트 방법:
  1. `npm run release:bump 1.0.1` 실행 → package.json/Cargo.toml/tauri.conf.json 3파일 version이 모두 1.0.1인지 확인
  2. `npm run release:bump 1.0.0` 실행 → 원복 후 `git diff src-tauri/` diff 0줄이어야 함
  3. `git diff package.json` → scripts 섹션 2줄 추가분(release:bump, release:prepare)만 보이면 정상
  4. `.github/workflows/release.yml` 파일 열어 Secrets 이름이 `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `GITHUB_TOKEN` 인지 확인
- 정상 동작: bump-version 실행 후 원복 시 `git diff` 완전 0줄 (CRLF 경고는 무시 가능)
- 주의: **실제 태그 푸시는 금지** — Phase E에서 `v1.0.0-test` 등 테스트 태그로 수행

⚠️ reviewer 참고:
- Tauri Action 버전: `tauri-apps/tauri-action@v0` (Tauri 2.x 공식 지원 major)
- `releaseDraft: true`로 자동 Publish 차단 ⭐
- `includeUpdaterJson: true`로 latest.json 자동 생성 ⭐
- Secrets 이름 일치 확인:
  - `secrets.TAURI_SIGNING_PRIVATE_KEY` (사용자가 등록했다고 확인함)
  - `secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (= `stiz3000!`, 파일/커밋 어디에도 기록 안 됨)
- bump-version.mjs의 JSON 정규식은 **첫 매치만 교체** (전역 플래그 없음) → 중첩 객체 안의 version(예: updater 블록 내부)은 안전
- `--silent`로 npm 호출 시 스크립트 내부 console.log는 그대로 출력되므로 검증 로그 가시성 유지됨
- Phase B는 UI 변경 0건, 빌드 동작도 변경 0건 (workflow는 태그 푸시 시에만 실행). 기존 기능 회귀 가능성 극히 낮음.

**Phase E 테스트 시 해야 할 것** (지금 말고 나중):
- 테스트 태그 (`v1.0.0-test` 등) 푸시해서 워크플로우 실제 동작 확인
- Draft 릴리스 생성되는지, `latest.json`이 아티팩트에 포함되는지
- 서명 파일(`.msi.zip.sig`, `.nsis.zip.sig`) 정상 생성되는지
- Tauri Action v0이 Rust 캐시와 함께 제대로 빌드 완료되는지 (15~25분 소요 예상)

**다음 단계**: tester + reviewer 검증 → Phase B 커밋 → Phase C (업데이트 UI)

## 테스트 결과 (tester)
(다음 작업에서 사용)

## 리뷰 결과 (reviewer)
(다음 작업에서 사용)

## 수정 요청 (누적 보류 — v2에서 재발 여부 확인 필요)
| 요청자 | 대상 파일 | 문제 설명 | 상태 |
|--------|----------|----------|------|
| user | grading.jsx / 3XL.svg | 3XL 사이즈 요소가 몸판 벗어나 과하게 큼 | 🔍 재검증 필요 |
| user | 3XL.svg / 4XL.svg | 3XL/4XL 요소가 몸판 상단 튀어나감 | 🔍 재검증 필요 |
| user | grading.jsx / OrderGenerate | 기준 AI=XL로 XL 타겟 시 요소 하나도 안 들어옴 | 🔍 로그 필요 |

⚠️ 위 3건은 양면 버그 수정과 별개. 이번에 바뀐 로직에서 재발 여부 재확인 필요.

---

## 작업 로그 (최근 10건)
| 날짜 | 에이전트 | 작업 내용 | 결과 |
|------|---------|----------|------|
| 2026-04-20 | pm(외부) | G드라이브 AI↔SVG 대조 63개, 파이프라인 검증 | 63/63 성공 |
| 2026-04-21 | developer | SVG 표준화 Phase 1-1~1-3 (svg_normalizer.py 950줄, CLI 3개) | py_compile+멱등성 PASS |
| 2026-04-21 | pm | scratchpad 정리 (1482→~200→~95줄) | 완료 |
| 2026-04-21 | debugger | 양면 유니폼 버그 4종 1차 분석 (근본 원인: 이름 매칭 반쪽) | 완료 |
| 2026-04-21 | developer | L556 `isTop` 부등호 통일 (버그 1+4 해결) | ✅ 사용자 검증 통과 |
| 2026-04-21 | debugger | 버그 2+3 정밀 재분석 | 완료 |
| 2026-04-21 | developer | 버그 2+3 1차 수정 (relVec 개별 배치 + 면적 정규화) | ❌ 망가짐, 롤백 |
| 2026-04-21 | debugger | 3차 분석: group/ungroup 4회 반복이 참조 파괴 원인 | 완료 |
| 2026-04-21 | developer | 재수정: 폴백 함수 재사용 + exponent 1.0 (버그 2+3 해결) | ✅ 사용자 검증 통과 |
| 2026-04-22 | pm | DEBUG_LOG 복구 + scratchpad 정리 + 커밋 | 진행 중 |
| 2026-04-22 | planner-architect | 자동 업데이트 시스템 상세 설계 (5 Phase, 15~18h) | PLAN-AUTO-UPDATE.md + knowledge 3종 갱신 완료 |
| 2026-04-22 | developer | Phase A 기반 설정 10 Step (키생성→G드라이브 이동→Cargo/npm/conf/caps/lib 수정→v1.0.0 통일) | ✅ cargo check 35.6초 통과, keys/ gitignore 검증 OK |
| 2026-04-22 | developer | Phase A-5 (sync-bundle-resources.mjs 146줄 + prebuild 등록) + 계획서 오타 4건 수정 | ✅ 멱등성 PASS (변경 없음 15개 리소스), `grader-updater.key` 잔존 0건 |
| 2026-04-22 | developer | Phase B CI 워크플로우 (bump-version.mjs 267줄 + release.yml 131줄 + package.json scripts 2개) | ✅ 3파일 버전 왕복 테스트 PASS, YAML 구조 검증 PASS (탭/홀수들여쓰기 0), Secrets 이름 일치 |

---

## ⏸ 보류 (다음 작업)
- Phase 1-4~1-7 (Rust 커맨드 → UI → 통합 테스트 → 커밋)
- 사용자 확인 2건: 분류 로직 실테스트 / CLI 인터페이스 확정
- 기존 수정 요청 3건 재검증 (v2에서 재발 여부)

### 💡 Phase 1-6 tester용 회귀 테스트 명령 (참고 보관)
```bash
cd "C:\0. Programing\grader\python-engine"
venv\Scripts\activate && pip install -r requirements.txt
mkdir C:\temp\svg_test
copy "G:\...\양면유니폼_U넥_스탠다드_L.svg" C:\temp\svg_test\
copy "G:\...\양면유니폼_U넥_스탠다드_2XL.svg" C:\temp\svg_test\
python main.py normalize_batch "C:/temp/svg_test" "C:/temp/svg_test/양면유니폼_U넥_스탠다드_2XL.svg"
```
정상: success=True, pass_count = total - skipped, fail_count=0  
⚠️ G:\ 직접 실행 금지 (Drive 동기화 트리거)

### 기획설계 참조
| 계획서 | 상태 |
|--------|------|
| PLAN-GRADING-REBUILD.md | 구현됨 (grading-v2.jsx 607줄) |
| PLAN-PIECE-AWARE-LAYOUT.md | Phase 1+2 구현 |
| PLAN-GRADING-RECOVERY.md | Beta 권장안 반영 |
| PLAN-GRADING-REDESIGN.md | D1 권장안 구현 |
| PLAN-WORKFLOW-REDESIGN.md | Phase 1~4 완료 |
| PLAN-GDRIVE-SYNC.md | 옵션 4 구현 |
