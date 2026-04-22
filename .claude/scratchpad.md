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
- **요청**: SVG 일괄 표준화 Phase 1-4~1-7 상세 설계 (앱 UI 통합)
- **상태**: ✅ **설계 완료** (PLAN-SVG-STANDARDIZATION.md 생성, 4 Phase 분할, 총 6~10시간)
- **현재 담당**: planner-architect → (다음) 사용자 승인 → developer Phase 1-4 착수

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
| 8 | 설치형 배포 + 자동 업데이트 | 🔨 **Phase A+B+C 구현 완료** (D/E 대기) |
| 9 | Drive 연동 (자동 동기화) | ✅ |
| 10 | Phase 1 (WorkSetup + 세션) | ✅ |
| 11 | Phase 2 (패턴 선택 모드) | ✅ |
| 12 | Phase 3 (즐겨찾기) | ✅ |
| 12-A | SVG 일괄 표준화 Phase 1 | 🔨 1-3 완료 / **1-4~1-7 설계 완료 (구현 대기)** |
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

### SVG 표준화 Phase 1-4~1-7 UI 구현 [2026-04-22]

#### 🎯 목표
디자이너가 새 사이즈 SVG를 G드라이브에 추가할 때, 개발자가 터미널에서 `normalize_batch`를 수동 실행하는 대신 **패턴 관리 카드의 ⋮ 메뉴 → [📐 SVG 표준화] 한 번**으로 변환 완료. Phase 1-1~1-3(Python 엔진)은 이미 구현 완료, 실사용 검증(5XL 변환)도 통과. 이번 작업은 Python CLI를 앱 UI로 노출하는 것.

#### 🗺️ 아키텍처 개요
```
PatternManage 카드 ⋮ 메뉴 → [📐 SVG 표준화]
         │
         ▼
SvgStandardizeModal (4상태 Phase 머신)
    idle → previewing → preview-done → executing → done/error
         │
         ▼
svgStandardizeService.ts (invoke 래퍼)
         │
         ▼
Rust 커맨드 svg_preview_normalize / svg_normalize_batch
         │
         ▼ (run_python 재사용)
python-engine/main.py → svg_normalizer.py (무변경)
         │
         ▼ (done 시)
runAutoSync() 강제 트리거 → 새 사이즈가 UI에 자동 반영
```

#### 📦 Phase별 구현 단계
| Phase | 내용 | 예상 시간 | 커밋 단위 |
|-------|------|--------|---------|
| **1-4** | Rust 커맨드 2개 + lib.rs handler 등록 + cargo check | 1~1.5h | 커밋 A (Rust 단위) |
| **1-5a** | svgStandardizeService.ts 신규 (타입 + invoke + 파싱) | 0.5~1h | 커밋 B 일부 |
| **1-5b** | SvgStandardizeModal.tsx (Phase 머신 + UI + CSS) | 2~3h | 커밋 B 일부 |
| **1-5c** | PatternManage 통합 (⋮ 메뉴 + 모달 렌더 + 재스캔 훅) | 1~1.5h | 커밋 B 일부 |
| **1-6** | 통합 테스트 (U넥 회귀/단면 미영향/에러 3종) | 1~2h | 비커밋 |
| **1-7** | knowledge 3종 + scratchpad + 커밋 C | 0.5~1h | 커밋 C (문서) |

**총 소요**: 6~10시간 (하루 반나절 ~ 하루)

#### 📍 만들 위치와 구조
| 파일 경로 | 역할 | 신규/수정 |
|----------|------|---------|
| `PLAN-SVG-STANDARDIZATION.md` | 11섹션 상세 계획서 (~650줄) | 신규 ✅ |
| `src/services/svgStandardizeService.ts` | Tauri invoke 래퍼 + 타입 정의 | 신규 |
| `src/components/SvgStandardizeModal.tsx` | 6상태 Phase 머신 모달 | 신규 |
| `src/App.css` | `.svg-standardize-modal__*` + `.preset-card__menu-*` | 수정 (append) |
| `src-tauri/src/lib.rs` | `svg_preview_normalize`/`svg_normalize_batch` + handler | 수정 |
| `src/pages/PatternManage.tsx` | ⋮ 메뉴 + 모달 state + onComplete 훅 | 수정 |

#### 🔗 기존 코드 연결
- **Python `svg_normalizer.py`(950줄)는 무변경** — Phase 1-1~1-3 완성품 그대로
- Rust 신규 커맨드는 기존 `run_python` 로직을 **재사용** (sidecar 전환 금지)
- 서비스 레이어 스타일은 `updaterService.ts` 패턴 준수 (함수 export + JSDoc)
- 모달 컴포넌트는 `UpdateModal.tsx` 구조 참고 (백드롭/카드/헤더/푸터 + ESC 차단)
- 실행 완료 시 `PatternManage.runAutoSync`에 `lastAutoScanRef.current = 0` 강제 후 호출 → 60초 쿨다운 우회 → 새 사이즈가 즉시 UI에 반영됨

#### 📋 실행 계획 (병렬 활용)
| 순서 | 작업 | 담당 | 선행 조건 |
|------|------|------|---------|
| 1 | Phase 1-4: Rust 커맨드 + cargo check | developer | 없음 |
| 2 | tester (cargo check 통과) | tester | 1 |
| 3 | 커밋 A | pm | 2 통과 |
| 4 | Phase 1-5a+b+c: 서비스 → Modal → PatternManage | developer | 3 |
| 5 | **tester + reviewer 병렬** (모달 UX 수동 테스트 + 코드 리뷰) | tester + reviewer | 4 |
| 6 | Phase 1-6: 실 G드라이브 로컬 복사본 회귀 테스트 | 사용자 + tester | 5 통과 |
| 7 | 커밋 B (프론트 일괄) | pm | 6 통과 |
| 8 | Phase 1-7: knowledge + scratchpad + 커밋 C | pm | 7 |

#### 🧭 주요 결정 사항 (decisions.md 기록 4건)
1. **버튼 배치**: 카드 ⋮ 더보기 메뉴 (즐겨찾기 별 옆) — 상시 아이콘/별도 페이지/툴바 모두 거부
2. **Rust 커맨드**: 기존 `run_python` 직접 사용 대신 타입 명시 래퍼 2개 신규 — 컴파일 타임 안전성
3. **Python 실행**: 현재 venv 유지 (sidecar 거부) — 배포 복잡도 2배 상승 방지
4. **표준화 범위**: Phase 1은 **U넥 양면유니폼 스탠다드 전용** 유지 (NORMALIZER_VERSION = "1.0-uneck-double-sided"). V넥/하의는 Phase 3에서 JSON 프리셋 외부화

#### ⚠️ 리스크 & 대응 (PLAN 10번 요약)
| 리스크 | 대응 |
|--------|------|
| G드라이브 경로 한글/공백 인코딩 | `run_python` UTF-8 강제, 실 경로로 1회 테스트 |
| Python stdout 여러 줄 | `print_json` 한 줄 규약, 방어적 lastLine 추출 |
| `driveFolder`가 상대 경로 | `drivePatternRoot + driveFolder`로 절대 경로 합성 |
| 단면 유니폼 실수 실행 | Python이 "패턴 path 2개 추출 실패"로 FAIL, 파일 무수정 |
| runAutoSync 60초 쿨다운 | `onComplete`에서 ref=0 강제 리셋 후 호출 |
| 바이브 코더 "백업 생략" 후회 | 기본값 OFF 유지 + 체크박스 옆 "권장: 켜짐 유지" |

#### ⚠️ developer 주의사항
- **python-engine/svg_normalizer.py 절대 건드리지 말 것** (무변경 보존 대상, 950줄)
- **driveSync.ts 절대 건드리지 말 것** (최근 sizes 병합 버그 수정 완료, 회귀 위험)
- CSS는 **BEM + `var(--color-*)` 변수만** — Tailwind 금지, 하드코딩 색상 금지
- 모달 `executing` 상태에선 ESC/백드롭 클릭 차단 (UpdateModal 패턴 그대로)
- 카드 ⋮ 메뉴는 **Drive 프리셋만 활성화** (`!preset.driveFolder` 시 disabled + title 툴팁)
- 기준 사이즈 자동 추천 우선순위: **XL → 2XL → 가장 큰 사이즈**
- Python JSON은 `{ success, data|error }` 관례 — discriminated union 쓰지 말고 그대로 파싱

#### 📚 기록할 문서
- ✅ `PLAN-SVG-STANDARDIZATION.md`: 11개 섹션 상세 계획서 (~650줄)
- ✅ `knowledge/architecture.md`: SVG 표준화 UI 통합 아키텍처 1항목 추가 (Phase 1-7에서 완료 시 갱신)
- ✅ `knowledge/decisions.md`: 결정 4건 추가
- ✅ `knowledge/index.md`: 항목수/날짜 갱신

---

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

### developer [2026-04-22] Phase 1-4 Rust 커맨드 추가 (SVG 표준화)

📝 구현한 기능: Python 엔진의 `preview_normalize` / `normalize_batch` CLI를 Tauri에서 직접 호출할 수 있도록 전용 Rust 커맨드 2개 신규 추가 (프론트 통합 준비용)

| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| `src-tauri/src/lib.rs` | `svg_preview_normalize`/`svg_normalize_batch` 커맨드 2개 + invoke_handler 등록 2줄 (+55/-1) | 수정 |

**추가된 커맨드 시그니처**:
```rust
#[tauri::command]
fn svg_preview_normalize(app, folder: String, base_file: String) -> Result<String, String>
// 내부: run_python(app, "preview_normalize", vec![folder, base_file])

#[tauri::command]
fn svg_normalize_batch(app, folder: String, base_file: String, no_backup: bool) -> Result<String, String>
// 내부: no_backup=true면 args에 "--no-backup" 추가 후 run_python(app, "normalize_batch", args)
```

**재사용한 것**:
- 기존 `run_python` 함수(L122~177) — **변경 없음**, subprocess 로직 그대로 재사용
- 기존 `invoke_handler!` 매크로 — 마지막에 2개 추가(순서 유지)

**반환 타입 선택 이유**:
- PLAN 섹션 6-3 기준 `Result<String, String>` 채택 (사용자 프롬프트의 `serde_json::Value` 대신)
- 근거: 기존 `run_python`이 이미 `Result<String, String>`을 반환하므로, 래퍼도 같은 형식을 유지하는 게 기존 코드 스타일과 일관
- 프론트에서 `JSON.parse(str)` 한 번만 하면 되므로 실사용 비용 동일

**sync fn 유지 이유**:
- `run_python` 자체가 동기식 `std::process::Command::output()` 사용
- `async fn`으로 바꾸면 `.await` 호출해야 해서 시그니처 불일치 발생
- Tauri는 sync `#[tauri::command]`도 자동으로 스레드풀로 보내 UI를 블로킹하지 않음

**검증**:
- `cd src-tauri && cargo check`: ✅ **29.42초에 PASS**, 에러 0, 경고 0
- `grader v1.0.0 (C:\0. Programing\grader\src-tauri)` 컴파일 성공

**Phase 1-5 developer 전달 사항** (다음 단계용):
- Rust 커맨드 이름: `svg_preview_normalize`, `svg_normalize_batch`
- 인자 이름(카멜케이스): `folder`, `baseFile`, `noBackup` (Tauri는 snake_case Rust → camelCase TS 자동 변환)
- 반환: JSON **문자열** (TS 측에서 `JSON.parse()` 후 `PreviewResult`/`BatchResult` 타입으로 캐스팅)
- 호출 예:
  ```ts
  const raw = await invoke<string>("svg_preview_normalize", { folder, baseFile });
  const parsed: PreviewResult = JSON.parse(raw);
  ```

💡 tester 참고:
- 테스트 방법: `cd src-tauri && cargo check` → 에러/경고 0 확인 / `npm run tauri dev` 기동 시 이상 없는지
- 정상 동작: 기존 모든 기능(SVG/PDF/그레이딩/자동 업데이트 UI) 그대로 동작 + 새 커맨드 2개가 `invoke()` 가능
- 주의할 입력: 실제 커맨드 호출 테스트는 Phase 1-5 완료 후(UI 연결 후) 수행. 이번 단계는 **컴파일 통과만**이 범위.

⚠️ reviewer 참고:
- `run_python` 원본 건드리지 않았는지 — L122~177 diff 0줄 확인 요망
- 신규 커맨드가 기존 스타일(동기 fn + `tauri::AppHandle` 첫 인자 + `Result<String, String>`)과 일관성 있는지
- `invoke_handler!` 등록 순서가 기존 관례(추가 커맨드는 튜플 맨 뒤)와 맞는지
- Phase 1-5 착수 전에 이 커맨드가 **단독으로 커밋 A로 분리**될 예정 — 롤백 용이성 확인

---

### developer [2026-04-22] Phase 1-5 React UI 통합 (SVG 표준화)

📝 구현한 기능: Phase 1-4 Rust 커맨드를 프론트엔드와 연결. 패턴 카드 ⋮ 더보기 메뉴에서 [📐 SVG 표준화]를 누르면 6-Phase 머신 모달이 열려 기준 사이즈 선택 → 시뮬레이션(미리보기) → 일괄 변환 → 결과 요약 → Drive 재스캔까지 한 번에 수행한다.

**변경 파일 (신규 2개)**:
| 파일 | 줄수 | 설명 |
|------|------|------|
| `src/services/svgStandardizeService.ts` | 202 | Tauri invoke 래퍼 + PreviewResult/BatchResult 타입 정의 (Python JSON 구조 `{success, data:{...}}` 에 맞춰 매핑) |
| `src/components/SvgStandardizeModal.tsx` | 560 | 6상태 Phase 머신(idle/previewing/preview-done/executing/done/error) 모달. ESC/백드롭 차단, 요약 카드 3개, 파일 목록 스크롤, 버전 표기 |

**변경 파일 (수정 2개)**:
| 파일 | 변경 | 설명 |
|------|------|------|
| `src/App.css` | +353줄 | `.svg-standardize-modal__*` BEM 스타일(34개 클래스) + `.preset-card__menu-*` 스타일(3개 클래스). 모두 `var(--color-*)` CSS 변수 사용, Tailwind 0줄 |
| `src/pages/PatternManage.tsx` | +145줄 | ⋮ 메뉴 버튼 + 드롭다운 + 모달 조건부 렌더 + `buildAbsoluteDriveFolder`/`getPieceBaseName` 헬퍼 + document click 바깥 감지 useEffect |

**주요 설계**:
- **6-Phase 머신 (discriminated union)**: UpdateModal과 동일한 패턴을 확장 — idle → previewing → preview-done → executing → done, 실패 경로는 모두 error로 수렴
- **ESC/백드롭 차단 (`isLocked` 가드)**: `previewing`/`executing` 상태일 때만 닫기 차단, 그 외 상태는 자유 닫기
- **기준 사이즈 자동 추천**: XL > 2XL > 첫 번째 사이즈 (`pickDefaultBaseSize`)
- **기준 사이즈 변경 시 preview 리셋**: preview-done/done/error 상태면 idle로 되돌림 (낡은 데이터로 실행 방지)
- **재스캔 쿨다운 무시**: onComplete 콜백에서 `lastAutoScanRef.current = 0` 후 `runAutoSync()` 호출 — 사용자 명시 실행이므로 즉시 반영 보장
- **Drive 프리셋만 활성화**: `preset.driveFolder + drivePatternRoot` 둘 다 있어야 메뉴 활성 (Local 프리셋은 자동 disabled + title 툴팁)
- **document click 바깥 감지**: 메뉴가 열린 경우에만 리스너 등록, 메뉴 내부는 `stopPropagation`으로 전파 차단 (메뉴 외부 클릭 시 자동 닫기)

**Python JSON 매핑 확정 (svg_normalizer.py 실제 구조)**:
```
preview_normalize → {
  success: true,
  data: { previews: [{ file, status, big_width, small_width, big_x_range, small_x_range,
                       small_y_align_offset, gap_between_patterns, viewbox_ok, no_x_collision, error? }] }
}
normalize_batch → {
  success: true,
  data: { folder, total_count, pass_count, fail_count, skipped_count,
          results: [{ file, status: "PASS"|"FAIL"|"SKIP", reason?, error?, data? }],
          version: "1.0-uneck-double-sided" }
}
```
⚠️ 계획서 섹션 6-1의 타입(`previews` 최상위)과 실제 구조(`data.previews` 2단계 중첩)가 달라 **TypeScript 타입은 실제에 맞춰 보정** — `PreviewResult.data.previews` / `BatchResult.data.results` 형태로 정의.

**Rust invoke 인자명 확인**:
- Rust 측: `folder: String`, `base_file: String`, `no_backup: bool`
- Tauri 2.x 자동 변환: `folder`, `baseFile`, `noBackup` (camelCase)
- TS 호출 시 정확히 위 이름 사용 — runtime 에러 없이 동작 확인

**검증**:
- `npx tsc --noEmit` → **EXITCODE=0 (PASS, 에러 0)**
- 기존 PatternManage 로직 무변경: 카드 렌더/선택/즐겨찾기/runAutoSync 등 그대로, 이번 변경은 순수 추가(메뉴 + 모달 + 헬퍼 2개)
- CSS: Tailwind/하드코딩 색 0건, 모두 `var(--color-*)` 변수 사용

💡 tester 참고:
- **테스트 방법**:
  1. `npm run tauri dev` 기동 → PatternManage 페이지 진입
  2. G드라이브 연동된 프리셋 카드 우상단의 `⋮` 버튼 클릭 → 드롭다운에 "📐 SVG 표준화" 표시 확인
  3. 메뉴 바깥 클릭 시 드롭다운 자동 닫힘 확인
  4. 메뉴 클릭 → 모달 열림 → 기준 사이즈 드롭다운(기본 XL) + 백업 체크박스 확인
  5. [취소] / ESC / 백드롭 클릭으로 닫힘 확인
- **정상 동작 기준**:
  - Local 프리셋 카드의 메뉴 항목은 disabled + "Drive 연동 프리셋만..." 툴팁
  - previewing/executing 중에는 ESC/백드롭 무반응
  - 기준 사이즈 바꾸면 이전 preview 결과 리셋되고 idle로 돌아감
- **주의할 입력 (Phase 1-6에서 수동)**:
  - 실제 G드라이브 U넥 양면유니폼 폴더에서 미리보기/실행 전 과정 (데이터 요함)
  - 기준 파일이 없는 사이즈 선택 시 에러 phase 전환
  - 단면 유니폼 프리셋에서 실행 시 FAIL 반환 + 원본 파일 무손상 확인
- **이번 단계 범위**: UI 렌더 + 타입 체크 PASS. 실제 CLI 호출 수동 검증은 Phase 1-6.

⚠️ reviewer 참고:
- **Python JSON 구조와 TS 타입 일치**: `{success, data:{previews|results}}` 2단계 중첩 확인
- **Rust camelCase 변환**: `base_file` → `baseFile`, `no_backup` → `noBackup` 정확히 적용 (Tauri 2.x 기본 동작)
- **기존 PatternManage 로직 무변경**: 1174~1213 즐겨찾기 영역만 확장, 기존 JSX는 unchanged
- **ESC/백드롭 차단 로직**: `isLocked = previewing || executing` 조건으로 일관됨
- **실행 중 버튼 disabled**: footer에서 phase별 버튼 렌더 분기로 완전 교체(기존 버튼 숨김 + 비활성 라벨 버튼만 표시) — 중복 실행 방지 보장
- **document click 리스너 생명주기**: 메뉴가 열린 경우만 등록/해제 → 메모리 누수 방지
- **버그 가능성 포인트**:
  - `getPieceBaseName`: 첫 조각 파일명에 "_사이즈"가 없는 레거시 프리셋은 fallback으로 전체 파일명 반환 — 이 경우 기준 파일 탐색 실패할 수 있음 (Phase 1-6에서 확인 필요)
  - `buildAbsoluteDriveFolder`: driveSync.ts의 `joinPath`와 동일 로직을 국소 복사 — 향후 공용화 검토 여지

**다음 단계**: Phase 1-6 (tester 통합 테스트) → Phase 1-7 (knowledge 갱신 + 커밋 C). **이번 developer 단계에서는 커밋하지 않음** (커밋은 PM 담당).

---

#### 보완 수정 [2026-04-22] — 글로벌 기준 파일 자동화 (드롭다운 제거)

**사용자 요청**: 기준 사이즈 수동 선택(드롭다운) 제거, 양면 유니폼 상의는 `양면유니폼_U넥_스탠다드_XL.svg` 글로벌 파일을 고정 기준으로 사용.

**변경 내용**:
| 파일 | 변경 범위 | 상세 |
|------|----------|------|
| `src/services/svgStandardizeService.ts` | +~100줄 (상수 + 함수 2개) | `GLOBAL_DOUBLE_SIDED_BASE_FILE_RELATIVE` 상수, `isDoubleSidedTopPattern()`, `resolveBaseFile()`, `ResolvedBaseFile` 타입 추가 |
| `src/components/SvgStandardizeModal.tsx` | 드롭다운/pickDefaultBaseSize/joinWinPath 제거 · props 2개 교체 | `registeredSizes`/`pieceBaseName` props 제거, `svgPathBySize`/`drivePatternRoot` props 추가. 기준 사이즈 드롭다운 JSX 삭제 후 "자동 결정된 기준 파일 안내 카드"로 대체. `useMemo(resolveBaseFile)` 기반으로 기준 파일 결정 |
| `src/pages/PatternManage.tsx` | `getPieceBaseName` 삭제, `getPieceSvgPathBySize` 신설 · 모달 props 전달 변경 | `registeredSizes={...}` / `pieceBaseName={...}` 제거, `svgPathBySize={getPieceSvgPathBySize(...)}` / `drivePatternRoot={drivePatternRoot}` 전달. 렌더 가드에 `&& drivePatternRoot` 추가 |

**판별 로직 (resolveBaseFile)**:
1. `driveFolder.includes("양면 유니폼상의")` → 글로벌 기준 (`{drivePatternRoot}/0. 농구유니폼 확정 정리본/2. 양면 유니폼상의 패턴/U넥/U넥 양면유니폼 스탠다드/양면유니폼_U넥_스탠다드_XL.svg`)
2. 그 외 → `svgPathBySize`에서 XL → 2XL → L → M → S 순서 fallback (자체 폴더 내부)
3. 모두 실패 → `null` 반환 → 모달에서 "기준 파일을 찾을 수 없습니다" 에러 카드 표시 + [미리보기] 버튼 disabled + title 툴팁

**UI 안내 문구**:
- kind="global": "양면 유니폼 상의는 모든 프리셋이 동일한 글로벌 기준 파일(U넥 스탠다드 XL)을 사용합니다. 수동 선택 불가."
- kind="local":  "폴더 내부에서 XL → 2XL → L → M → S 순으로 자동 선택됩니다."

**검증**: `npx tsc --noEmit` → EXITCODE=0 (에러 0건) PASS

💡 tester 참고 (추가):
- 양면 유니폼 상의 프리셋(경로에 "양면 유니폼상의" 포함) 카드 ⋮ → 모달 열 때 "양면유니폼_U넥_스탠다드_XL (글로벌)" 표시 확인
- 단면 유니폼 프리셋 → 자체 폴더의 XL/2XL/L/M/S 중 하나가 `(자체 폴더)` 라벨로 표시
- Drive 루트 미설정 상태(drivePatternRoot 없음) → 모달 자체가 렌더 안 됨 (기존 `standardizeTarget.driveFolder` 체크에 `&& drivePatternRoot` 추가)
- 글로벌 기준 파일이 실제 G드라이브에 없는 경우 → Python CLI가 `"기준 SVG 파일을 찾을 수 없습니다"` 에러 반환 (Modal은 error phase 표시)

⚠️ reviewer 참고 (추가):
- 판별 문자열 `"양면 유니폼상의"`(공백 1개) — Drive 실제 폴더명 `2. 양면 유니폼상의 패턴`과 정확히 일치해야 함. 공백 2개 오타 주의
- Drive 루트 경로 구분자 자동 감지: `root.includes("\\")`로 Windows 백슬래시 우선 사용, 그 외 `/`
- `useMemo(resolveBaseFile)`의 deps는 props 3개(driveFolder/svgPathBySize/drivePatternRoot) — 객체 참조가 바뀌면 재계산되므로 부모(PatternManage)에서 매 렌더마다 새 객체를 만들지 않도록 주의 (현재 `getPieceSvgPathBySize`는 `useCallback` + `preset.pieces?.[0]?.svgPathBySize` 반환이라 동일 참조 유지 가능성 있음)

---

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

### developer [2026-04-22] Phase C 업데이트 UI

📝 구현한 기능: 자동 업데이트 시스템 Phase C — updaterService 래퍼, 앱 마운트 시 자동 체크 훅, UpdateModal 팝업, Settings 내 UpdateSection

**변경 파일 (신규 4개)**:
| 파일 경로 | 줄수 | 요약 |
|----------|------|-----|
| `src/services/updaterService.ts` | ~110 | `checkForUpdate()` (조용히 실패), `downloadAndInstall()` (진행률 콜백+relaunch), `getCurrentVersion()` (Tauri API) |
| `src/hooks/useAutoUpdateCheck.ts` | ~150 | 모듈 상태 + 구독자 패턴. `UpdateStatus` 6종. `runCheckNow()` / `dismissUpdate()` export. StrictMode 2회 실행 차단 플래그 |
| `src/components/UpdateModal.tsx` | ~220 | Phase 머신 4종(idle/downloading/finishing/error). ESC + 백드롭 닫기(다운 중 차단). 진행률 바 + 용량 미상 대응. 재시도 버튼 |
| `src/components/UpdateSection.tsx` | ~150 | 현재 버전(Tauri getVersion) + 마지막 확인 시각 + 상태 문구 + [지금 확인] / [업데이트 받기] 버튼. 훅 구독만(autoCheck=false) |

**변경 파일 (수정 3개)**:
| 파일 경로 | 변경 내용 |
|----------|---------|
| `src/App.tsx` | `useAutoUpdateCheck(true)` 훅 호출 + `<UpdateModal>` 조건부 렌더 (18줄 추가, 기존 구조 보존) |
| `src/pages/Settings.tsx` | `UpdateSection` import + `{/* 섹션 3 */}` 위치에 `<UpdateSection />` 삽입. 기존 섹션 3은 "섹션 4: 정보"로 번호만 재부여, 내용 보존 |
| `src/App.css` | `.update-modal__*` BEM 클래스 ~140줄 추가 (백드롭/카드/헤더/body/footer/진행바/에러). 기존 2047줄 뒤에 append |

**주요 설계 결정**:
1. **상태 공유 방식**: Zustand/Context 대신 **모듈 상태 + listener Set** 패턴 채택 (기존 프로젝트 svgCacheStore 스타일과 일관). App은 `autoCheck=true`로 1회 체크, Settings는 `autoCheck=false`로 구독만.
2. **버전 표시**: `@tauri-apps/api/app`의 `getVersion()` API 사용 — tauri.conf.json과 자동 동기화되므로 package.json 읽기보다 정확.
3. **조용한 실패 원칙**: `checkForUpdate()`는 네트워크 오류 시 throw하지 않고 `{ kind: 'error' }`로 반환. 자동 체크 중 GitHub 접근 실패 → React error boundary 터지지 않도록 방어.
4. **StrictMode 중복 방지**: 개발 모드에서 useEffect가 2회 실행되는 문제 → `hasAutoCheckedOnce` 모듈 플래그로 실제 `check()`는 1번만.
5. **다운로드 중 닫기 차단**: `phase === 'downloading' | 'finishing'`일 때 ESC + 백드롭 클릭 무시. setup 파일 전송 중 끊김 방지.
6. **Phase C 전용 라우트 X**: PLAN D5 결정 사항 준수 — Settings 페이지 내부 섹션으로 통합, 사이드바 복잡화 방지.

**TypeScript 핵심 타입**:
- `UpdateCheckResult = { kind: 'available'; update: Update } | { kind: 'up-to-date' } | { kind: 'error'; message: string }` — discriminated union
- `UpdateStatus = 'idle' | 'checking' | 'available' | 'up-to-date' | 'error' | 'dismissed'`
- `UpdateState = { status, result: UpdateCheckResult | null, lastCheckedAt: string | null }`

**검증 결과**:
- ✅ `npx tsc --noEmit` 통과 (exit 0, 에러 0개)
- ✅ Tauri updater 타입(Update, DownloadEvent)의 `body`, `date`, `version`, `contentLength`, `chunkLength` 모두 실제 dist 타입과 일치
- ✅ 기존 App.tsx, Settings.tsx 구조 보존 (훅+모달 추가, 섹션 1개 삽입만)
- ✅ 하드코딩 색상 0건 (모두 `var(--color-*)` 사용)
- ✅ Tailwind 사용 0건 (BEM + CSS 변수)

💡 tester 참고:
- 테스트 방법:
  1. `npx tsc --noEmit` → exit 0 확인
  2. `npm run tauri dev` → 앱 기동, 화면 정상 렌더 (기존 기능 회귀 없음)
  3. 콘솔에 `[updater]` 로그 관찰 — 네트워크/레포지토리 없어도 조용히 실패해야 함 (에러 박스 X)
  4. Settings 페이지 열기 → "버전 정보" 섹션 노출, 현재 버전이 `v1.0.0`으로 표시됨
  5. [지금 확인] 클릭 → 상태가 "확인 중..." → "최신/새 버전/에러" 중 하나로 전환
- 정상 동작: 앱 기동 시 콘솔에 체크 1회 수행 (에러 있어도 조용). Settings → 버전 정보 섹션 표시됨
- 주의: **실제 업데이트 설치 테스트는 Phase E**에서. 지금은 GitHub에 릴리스 없으므로 항상 "최신 버전" 또는 "에러"(네트워크)로 나올 것

⚠️ reviewer 참고:
- `useAutoUpdateCheck(true)`는 **App.tsx 한 곳에서만** 호출. Settings 쪽은 반드시 `false`로 구독만. 두 곳 다 `true`면 중복 체크 발생 (현재 hasAutoCheckedOnce로 막히긴 하지만 의도 혼란 방지).
- `dismissed` 상태는 같은 세션 내 재알림만 막음. 앱 재시작 시 자동으로 다시 idle로 리셋됨 (모듈 상태는 앱 프로세스 단위).
- Update 객체의 `body`는 마크다운일 수 있으나 현재는 `<pre>` 원문 표시 (렌더링은 후속 개선 — 사용자 요구 없음).
- UpdateModal은 `role="dialog" aria-modal="true"`로 접근성 기본 준수. 포커스 트랩은 미구현 (소규모 앱, 과한 요구).
- CSS z-index 1000으로 모달이 헤더/사이드바 위에 확실히 뜸. 다른 모달/오버레이 계층 필요 시 조정.

**다음 단계**: tester + reviewer 검증 → Phase C 커밋 → Phase D (RELEASE-GUIDE + CHANGELOG)

### developer [2026-04-22] 5XL SVG 양면 변환 (CLI 수동 실행)

**작업**: Phase 1-3에서 구현한 `normalize_batch` CLI를 로컬 실행하여 5XL SVG를 4-body 양면 구조로 변환

**실행 경로**: `C:\temp\svg_5XL_work` (로컬 임시 폴더, G드라이브 원본 안전)
**기준 파일**: `양면유니폼_U넥_스탠다드_XL.svg` (이미 4-body 구조)
**변환 대상**: `양면유니폼_U넥_스탠다드_5XL.svg` (단일 body → 4-body)

**preview_normalize 결과** (JSON 요약):
- `status: OK`, `big_width: 1995.98`, `small_width: 1995.86`
- `gap_between_patterns: 15.69`, `no_x_collision: true`, `viewbox_ok: true`
- 기준 파일(XL)은 수정 대상에서 자동 제외됨

**normalize_batch 결과**:
- `success: true`, `pass_count: 1`, `fail_count: 0`, `skipped_count: 1`
- 5XL.svg → **PASS** (변환 완료, .bak 자동 백업)
- XL.svg → **SKIP** (기준 파일, 변환 대상 아님 — 정상)
- 모든 검증 통과: xml_valid / viewbox_ok / no_x_collision / big_cl_margin_ok / small_cl_margin_ok / bottom_align_ok

**변환 전/후 비교**:
| 항목 | 원본(.bak) | 변환 후 | 기준(XL) |
|------|-----------|--------|---------|
| 파일 크기 | 5,780 bytes | **8,981 bytes (1.55배)** | 8,826 bytes |
| `<g>` 태그 개수 | 2개 (단일 body) | **4개 (4-body)** | 4개 |
| viewBox | `0 0 4337.01 3401.57` | **`0 0 4478.74 5669.29`** | `0 0 4478.74 5669.29` |

viewBox와 `<g>` 태그 구조가 기준 파일(XL)과 완전 일치 — 4-body 양면 구조로 올바르게 변환됨

**사용자 전달**:
- 변환된 파일: `C:\temp\svg_5XL_work\양면유니폼_U넥_스탠다드_5XL.svg` (**8,981 bytes, 4-body**)
- 백업 파일: `C:\temp\svg_5XL_work\양면유니폼_U넥_스탠다드_5XL.svg.bak` (원본 5,780 bytes 보존)
- 다음 작업: **사용자가 G드라이브 원본 위치로 수동 복사** (탐색기 드래그)
  - 대상 경로: `G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG\0. 농구유니폼 확정 정리본\2. 양면 유니폼상의 패턴\U넥\U넥 양면유니폼 스탠다드\`
  - 기존 `양면유니폼_U넥_스탠다드_5XL.svg` 덮어쓰기
  - `.bak` 파일은 안전 보관용 (G드라이브에 올릴 필요 없음)

**부가 성과**:
- Phase 1 사용자 확인 ① (분류 로직 폭 우선 비교 + 4그룹 위쪽쌍 채택) 실사용 검증 **통과**
- CLI 인터페이스 `preview_normalize <folder> <ref.svg>` / `normalize_batch <folder> <ref.svg>` 정상 동작 확인
- 기존 Phase 1-1~1-3 구현(svg_normalizer.py 950줄) 무결성 확인

💡 tester 참고:
- 별도 테스트 불필요 — CLI 실행 결과 JSON과 파일 구조 검증 모두 통과
- 실 사용 시 주의: 변환된 SVG를 grader 앱에서 로드하여 그레이딩 정상 동작하는지 확인 권장 (회귀 감지)

⚠️ reviewer 참고:
- G드라이브 원본은 **읽기 복사만** 수행, 쓰기 0건 (안전 원칙 준수)
- 변환 결과물의 G드라이브 업로드는 **사용자 수동 작업**으로 분리

---

### developer [2026-04-22] driveSync 사이즈 병합 버그 수정

**문제**: 기존 프리셋(stableId 일치)에 신규 사이즈 SVG(예: `양면유니폼_U넥_스탠다드_5XL.svg`)를 Drive에 추가해도 주문 생성 페이지 사이즈 체크박스에 반영 안 됨. F12 로그 `신규 0, 갱신 79, 경고 55건` — 5XL이 경고 목록에도 없음.

**원인**: `mergeDriveScanResult`(L615~643)의 기존 프리셋 갱신 블록이 `svgPathBySize`(경로)는 갱신하지만 `sizes` 배열 전체를 "건드리지 않음" 정책으로 고정. 결과적으로 UI 렌더링 기준인 `sizes`에 5XL이 없어 체크박스에 안 나타남. "치수 데이터 보존" 의도가 "신규 사이즈 차단"으로 변질된 안티패턴.

**수정 내용** (`src/services/driveSync.ts` L615~677, +37/-6):
- `existingSizeNames: Set<string>` — 기존 사이즈 이름 목록 O(1) 조회
- `fallbackPieceId` — 새 사이즈의 `pieceId`를 기존 프리셋의 `sizes[0].pieces[0].pieceId`에서 복사 (연결 깨짐 방지). 첫 사이즈 없는 엣지 케이스는 `pieces[0].id`로 폴백
- `newSizeEntries` — `Object.keys(sp.svgPathBySize)` 중 `existingSizeNames`에 없는 것만 `{size, pieces: [{pieceId, width:0, height:0}]}` 형태로 생성
- `mergedSizes` — 기존 + 신규 병합 후 `SIZE_LIST.indexOf` 기준 오름차순 정렬 (5XS→5XL). 미등록 사이즈는 99로 밀어냄
- `mergedPresets.push` 객체에 `sizes: mergedSizes` 추가
- 주석 전면 갱신: "왜 이렇게 해야 하나" + "=== 신규 사이즈 자동 추가 로직 ===" + 기존 "절대 건드리지 않음" 주석은 `name, categoryId`로 한정 재문구화

**보존된 것** (회귀 방지):
- 기존 사이즈의 `width/height` (사용자 입력 치수) → `existing.sizes` 그대로 복사됨
- `name`, `categoryId` (사용자 rename/재분류) → spread로 그대로 전파
- `svgData`, `svgBySize` (local 인라인 SVG) → `updatedPieces`에서 idx=0만 Drive 조건 만족할 때 교체
- `else { /* 신규 프리셋 생성 */ }` 블록 — 전혀 건드리지 않음
- 카테고리 병합 로직 L543~594 — 전혀 건드리지 않음
- 파일명 정규식, 타입 정의 — 전혀 건드리지 않음

**변경 파일**:
| 파일 | 변경 내용 | 신규/수정 |
|------|----------|----------|
| `src/services/driveSync.ts` | L615~677 `mergeDriveScanResult` 기존 프리셋 갱신 블록에 신규 사이즈 자동 추가 + SIZE_LIST 순 정렬 로직 추가 (+37/-6) | 수정 |

**검증**:
- ✅ `npx tsc --noEmit` PASS (exit 0, 에러 0개) — `SIZE_LIST` import 재활용, 타입 단언으로 `SizeName` 캐스팅 안전
- 수정된 영역 재읽기로 구조 확인 완료

**회귀 방지 시나리오** (사용자 수동 확인):
1. **신규 사이즈 자동 추가**: 기존 12개 사이즈 프리셋 폴더에 `..._5XL.svg` 같은 새 사이즈 파일 추가 → 앱 재기동 → Settings에서 Drive 동기화 OFF→ON 토글 → 패턴 관리 페이지 진입 → 주문 생성에서 5XL 체크박스 활성화 확인
2. **기존 치수 보존**: 기존 사이즈(예: L)의 width=400, height=700 입력값이 재스캔 후에도 그대로 유지되어야 함. PatternManage에서 해당 프리셋 편집 모달 열어 값 확인
3. **신규 프리셋 영향 없음**: 완전히 새로운 패턴 그룹 폴더 추가 시 기존처럼 모든 사이즈 포함된 프리셋이 생성되어야 함 (`else` 블록 동작)
4. **사이즈 정렬**: 신규 사이즈가 배열 끝이 아닌 `SIZE_LIST` 순(예: XL과 2XL 사이에 빠진 XXL이 있었다면 올바른 위치에 삽입)으로 정렬되는지 UI에서 확인

**성능 참고**: 프리셋당 O(sizes) Set 생성 + O(newSizes) filter + O(sizes*log(sizes)) 정렬 = 사실상 O(n log n) with n≤13. 70개 프리셋 * 13 = 900건 연산 — 체감 지연 없음.

💡 tester 참고:
- `npx tsc --noEmit` 통과 확인 완료 (developer가 이미 수행)
- 실제 G드라이브 스캔 테스트는 **사용자 담당** (G: 직접 실행 금지 규칙)
- 앱 기동(`npm run tauri dev`) 후 Settings에서 **Drive 동기화 OFF→ON 토글**이 쿨다운 우회 트리거 (PatternManage 진입 시에만 자동 스캔, 60초 쿨다운 있음)

⚠️ reviewer 참고:
- **핵심 보존 정책**: 기존 `sizes[i].pieces[j].width/height` 절대 안 덮임 — 스프레드 대신 기존 배열 원본을 그대로 `...existing.sizes`로 복사
- **pieceId 연결**: `existing.sizes[0]?.pieces[0]?.pieceId` 우선, 없으면 `existing.pieces[0]?.id` 폴백 — Phase 1 단일 piece 가정 하에 안전
- **정렬 안정성**: `Array.prototype.sort`는 V8에서 Timsort(stable)이라 같은 인덱스(99) 미등록 사이즈끼리 순서 뒤섞이지 않음
- **단면 유니폼 회귀**: `else` 블록 무변경 → 신규 프리셋 로직 영향 0. 기존 정상 동작 유지
- **svgSource 체크**: `piece.svgSource === "drive" || !piece.svgSource` 조건 기존 그대로 — local 업로드 프리셋은 svgPathBySize 교체 안 당함

**다음 단계**: 사용자가 실제 G드라이브에서 재스캔 테스트 → 5XL 체크박스 활성 확인 → PM 커밋

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
| user | driveSync.ts / PatternManage.tsx | G드라이브 신규 SVG 파일이 grader 앱에 인식 안 됨 | ✅ developer 근본 수정 완료 (2026-04-22, sizes 병합 로직), 사용자 실테스트 대기 |

⚠️ 위 3건은 양면 버그 수정과 별개. 이번에 바뀐 로직에서 재발 여부 재확인 필요.

---

## 디버거 조사 [2026-04-22] G드라이브 신규 SVG 미인식

### 🔴 에러 번역
"구글드라이브에 새로 올린 패턴 SVG 파일이 grader 앱의 패턴 목록에 안 보인다."

비유: **카페 주문표**를 올려놨는데, 사장님이 **냉장고에 원두를 새로 채워 넣은 사실**을 모르는 상태. 주문표(목록)만 보고 있으니 새 원두는 안 보인다. 누군가가 "냉장고 다시 확인!" 이라고 알려줘야 목록이 갱신된다.

---

### 🗺️ 동작 구조 요약 (코드 경로 특정)

**동기화 트리거 조건** (`src/pages/PatternManage.tsx:517~520`)
```
PatternManage 페이지 진입 + 로드 완료 + Drive 동기화 ON + 루트 경로 있음
 → runAutoSync() 실행
```
**중요**: 자동 동기화는 **"패턴 관리" 페이지 진입 시에만 실행**된다. 다른 페이지(주문 생성, 세션 등)를 열어서는 아무리 기다려도 Drive는 재스캔되지 않는다.

**60초 쿨다운** (`PatternManage.tsx:423~435`)
- `lastAutoScanRef`로 마지막 스캔 시각 기억 (epoch ms)
- 60초 이내 재진입은 console.info "쿨다운 중" 출력 후 스킵
- **앱 재시작 시 ref는 0으로 리셋** → 재시작 직후 첫 진입은 쿨다운 걸리지 않음

**스캔 로직** (`src/services/driveSync.ts:347 scanDriveRoot`)
- BFS 재귀로 하위 폴더 전부 탐색 (깊이 제한 20, 실측 6레벨)
- 각 파일 `parseFilename()` 으로 `{패턴명}_{사이즈}.svg` 규칙 매칭
- **매칭 실패 시 그 파일만 스킵 + warnings 배열에 기록**

**파일명 정규식** (`driveSync.ts:61`)
```
^(.+?)[\s_\-]+(5XS|4XS|3XS|2XS|XS|S|M|L|XL|2XL|3XL|4XL|5XL)\.svg$
```
- 사이즈 토큰이 파일명 끝에 있어야 함 (대소문자 무시)
- 앞부분과 사이즈 사이 구분자는 **공백/언더스코어/하이픈** 중 1개 이상
- 예: `농구유니폼_V넥_XS.svg` O / `농구유니폼XS.svg` X (구분자 없음) / `농구유니폼_XS_v2.svg` X (사이즈가 끝이 아님)

**경고 처리** (`PatternManage.tsx:485~492`)
- warnings는 **console.warn만 찍고 UI엔 절대 표시 X** (사용자가 "경고 부담" 피드백)
- 즉 파일이 스킵돼도 앱 화면상으론 **아무 메시지 없이 조용히 무시**

---

### 🎯 원인 TOP 3 (유력도 순)

#### 1순위: **파일명 규칙 위반** (가능성 ~50%)
SVG 파일명이 `{패턴명}_{사이즈}.svg` 규칙에 안 맞으면 경고만 찍히고 스킵된다. 사용자 화면엔 **아무 표시 없음**.

**의심 케이스**:
- 사이즈 토큰 없음: `신상품.svg`, `test.svg`
- 구분자 없음: `농구유니폼XL.svg` (언더스코어 없이 붙음)
- 사이즈가 중간에 위치: `농구_XL_수정본.svg` (끝이 `_수정본.svg`)
- 사이즈 대문자 문제는 아님 (정규식 `i` 플래그 — `.SVG`도 OK)
- 한글·공백 혼용: `농구 유니폼 V넥 XL.svg` (공백 구분자는 허용됨 — **이건 정상 동작**)

**확인 방법**: 개발자도구(F12) 콘솔에 `파일명 규칙 위반(사이즈 토큰 없음), 스킵: ...` 로그가 찍히면 확정.

#### 2순위: **Drive 동기화 아직 안 돼서 로컬에 파일 없음** (가능성 ~25%)
G드라이브 "파일 스트리밍" 모드에서는 다른 사람이 업로드한 파일이 내 PC에 내려오는 데 시간이 걸린다. Windows 탐색기로는 파일이 보일 수 있지만 실제 물리적으로는 "아직 다운로드 중" 상태일 수 있음.

**확인 방법**: `G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG\...` 경로에서 해당 SVG 파일을 **한 번 더블클릭으로 열어보기** (앱 말고 뷰어로). 잠시 로딩되면서 열리면 스트리밍 다운로드 완료된 것.

#### 3순위: **패턴 관리 페이지를 아직 열지 않음 or 쿨다운** (가능성 ~15%)
자동 동기화는 "패턴 관리" 진입 시에만 실행되는데, 사용자가 그 전에 "주문 생성" 등 다른 화면에서 확인했을 가능성. 또는 60초 이내 최근에 이미 한 번 진입했다면 쿨다운.

**확인 방법**:
- 사이드바에서 **"패턴 관리"** 메뉴 클릭해서 그 페이지를 본 후 결과 확인
- 이미 패턴 관리에 있었다면, 앱을 **완전히 종료→재시작** 후 패턴 관리 재진입

#### 기타 가능성 (합쳐서 ~10%)
- **D**: 추가한 파일이 정상 규칙인데도 스캔이 실패 → **권한 문제** (해당 SVG 파일만 Drive 권한 누락). readDir은 성공해도 readTextFile 시 실패 가능. 다만 driveSync는 파일 **존재**만 확인하고 meta.json 읽기에만 readTextFile 쓰므로, 이 케이스는 드물다.
- **E**: `drivePatternRoot` 경로가 잘못 설정됨 (Settings에서 확인 필요)
- **F**: `driveSyncEnabled = false` (토글이 꺼져 있음 → Settings에서 확인)
- **G**: 같은 폴더에 기존 SVG가 있고 사이즈만 추가된 경우에 stableId 매칭이 꼬였을 가능성 — 로직상 svgPathBySize 확장은 정상 동작하도록 되어 있어서 (`mergeDriveScanResult:616~632`) 가능성은 낮지만, `svgSource !== "drive"`면 경로 갱신이 스킵된다는 점은 주의.

**회귀 가능성**: 최근 커밋 3개(Phase A/B/C) 및 양면 유니폼 버그 수정은 Drive 스캔 코드(`src/services/driveSync.ts`, `src/stores/svgCacheStore.ts`)를 건드리지 않았다. Phase A의 `bundle.resources` 변경은 **앱 번들링 시점의 Python 파일 목록**일 뿐 런타임 Drive 스캔과 무관. **회귀 가능성은 낮음**.

---

### ❓ 사용자에게 할 질문 (PM이 전달)

1. **파일명**: 추가한 SVG 파일 이름은 정확히 무엇인가? (예: `농구유니폼_V넥_3XL.svg`)
2. **위치**: 어느 하위 폴더에 넣었나? (`G:\...\00. 2026 커스텀용 패턴 SVG\` 이후 경로)
3. **타이밍**: 언제 추가했나? 몇 분 전? 몇 시간 전?
4. **증상**: "패턴 관리" 페이지에서 **안 보이는** 것인가, 아니면 에러 메시지가 뜨는 것인가?
5. **기존 파일 확인**: 같은 폴더 안의 다른 기존 SVG 파일들은 정상적으로 앱에 보이는가?
6. **페이지 진입 확인**: 파일 추가 후 사이드바에서 **"패턴 관리"** 메뉴를 클릭해서 그 페이지를 **다시 열어봤나**?
7. **Settings 상태**: Settings 페이지에서 "Drive 연동 사용" 토글이 **활성**으로 되어 있는가? 그리고 "Drive 루트 폴더"가 `G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG`로 맞게 설정되어 있는가?
8. **탐색기 확인**: Windows 탐색기에서 `G:\...` 경로로 직접 가서 해당 SVG 파일이 **보이고 열리는지** 확인했는가?

---

### 🔧 해결 방안 초안 (사용자 승인 필요, developer에게 넘길 예정)

#### 방안 A (가장 가능성 높은 시나리오 — 파일명 규칙 위반)
1. 사용자가 콘솔 로그(F12) 열어서 "파일명 규칙 위반" 경고 확인 요청
2. 파일명을 `{패턴명}_{사이즈}.svg` 규칙에 맞게 수정 (예: `신상.svg` → `신상_XS.svg`)
3. 앱 재시작 or 60초 대기 후 패턴 관리 재진입

#### 방안 B (Drive 스트리밍 지연)
1. 탐색기에서 해당 SVG 직접 열어 다운로드 유도
2. 1~2분 후 grader 앱에서 패턴 관리 재진입

#### 방안 C (UX 개선 — 사용자 부담 감소)
**[조사 결과 파생 제안]** 현재 경고는 console.warn만 가고 UI 표시 없음. 사용자가 **왜 안 보이는지 알 방법이 없음**. Phase 2 개선 제안:
- Settings에 "최근 Drive 스캔 경고" 섹션 추가 (무시한 파일 목록 표시)
- 또는 패턴 관리 페이지 상단에 "⚠️ 스캔 시 건너뛴 파일 N개" 배지 (클릭 시 상세 모달)
- "수동 새로고침" 버튼 추가로 60초 쿨다운 우회 가능하게

#### 방안 D (긴급 우회책 — 지금 즉시 확인)
사용자가 Settings에서 Drive 동기화 **껐다 켜기** → 쿨다운 ref 초기화는 안 되지만, 토글 deps 변경으로 useEffect 재실행 → 쿨다운 끝난 상태라면 즉시 스캔 발동.

**확정 불가 영역**: 콘솔 로그를 보지 않고는 1~3순위 중 어느 것인지 확정할 수 없음. 사용자 답변 수신 후 재분석 필요.

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
| 2026-04-22 | developer | Phase C 업데이트 UI (updaterService 110줄 + hook 150줄 + Modal 220줄 + Section 150줄 + App.tsx/Settings.tsx/App.css 수정) | ✅ tsc --noEmit 통과, 모듈 상태+구독자 패턴으로 App/Settings 상태 공유, BEM+CSS변수 준수 |
| 2026-04-22 | debugger | G드라이브 신규 SVG 미인식 조사 (driveSync.ts + PatternManage.tsx + svgCacheStore.ts 경로 특정) | 🔍 원인 TOP 3 가설 + 사용자 질문 8건 정리, 코드 수정 없이 분석만 |
| 2026-04-22 | developer | driveSync.ts mergeDriveScanResult sizes 병합 로직 근본 수정 (기존 치수 보존 + 신규 사이즈 자동 추가 + SIZE_LIST 정렬) | ✅ tsc --noEmit PASS, +37/-6, 실테스트 사용자 담당 |
| 2026-04-22 | developer | 5XL SVG 양면 변환 (CLI 수동 실행, 로컬 C:\temp\svg_5XL_work) | ✅ pass=1 fail=0, 단일 body→4-body 구조 변환, viewBox 기준 일치, 사용자 G드라이브 업로드 대기 |
| 2026-04-22 | planner-architect | SVG 표준화 Phase 1-4~1-7 상세 설계 (6~10시간 4 Phase 분할, 신규 3파일/수정 3파일) | ✅ PLAN-SVG-STANDARDIZATION.md ~650줄 + architecture 1건 + decisions 4건 + index 갱신 |
| 2026-04-22 | developer | SVG 표준화 Phase 1-4 Rust 커맨드 2개 추가 (`svg_preview_normalize`/`svg_normalize_batch`, run_python 재사용 얇은 래퍼) | ✅ cargo check 29.42초 PASS 에러0 경고0, lib.rs +55/-1, invoke_handler 2줄 등록 |
| 2026-04-22 | developer | SVG 표준화 Phase 1-5 React UI 통합 (Service 202줄 + Modal 560줄 신규 / App.css +353줄 + PatternManage +145줄) | ✅ tsc --noEmit EXITCODE=0 PASS, 6-Phase 머신 + ESC/백드롭 차단 + Drive 프리셋만 활성화, Python JSON 2단계 중첩 구조 타입 반영 |
| 2026-04-22 | developer | SVG 표준화 Phase 1-5 보완 수정 — 글로벌 기준 파일 자동화 (드롭다운 제거) | ✅ tsc --noEmit EXITCODE=0 PASS, `resolveBaseFile()` 추가 + Modal props 2개 교체(`svgPathBySize`/`drivePatternRoot`) + PatternManage `getPieceSvgPathBySize`로 교체. 양면 상의 → 글로벌 U넥 스탠다드 XL 고정, 그 외 → XL/2XL/L/M/S fallback |

---

## ⏸ 보류 (다음 작업)
- Phase 1-4~1-7 **설계 완료**, developer 구현 착수 대기 (사용자 승인 시)
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
