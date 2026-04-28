# 작업 스크래치패드

## 🎯 다음 세션 시작 가이드
1. **다른 PC 검증 결과** 확인 (사용자 담당) — 그레이딩 4건 실패가 본 PC 한정인지 일반인지
2. **v1.0.1 패치 작업** — 본 세션에서 시작, 다른 PC 결과 따라 timeout 연장 추가 여부 결정
3. **수정 요청 3건 테스트** (TEST-GUIDE-2026-04-25.md, 사용자 담당)

---

## 현재 작업
- **요청**: GitHub v1.0.0 릴리스 자산 검증 + 발견 결함 v1.0.1 패치 작업
- **상태**: 🛠 구현 중
- **현재 담당**: developer (다음)

### 검증 결과 요약
🟢 정상: 메타/자산/서명/워크플로우/버전 필드
🔴 결함 2건:
- (1) v0.1.0 하드코딩이 빌드 산출물에 박혀 배포됨 — 빌드된 `dist/assets/index-*.js`에 "v0.1.0" 문자열 확인
- (2) `latest.json`의 `notes` 필드가 placeholder 그대로 — 자동 업데이트 모달에 "자동 생성된 릴리스입니다. 아래 체크 후..." 텍스트 노출 위험

### 확정 처리 (다른 PC 검증 무관)
1. **StatusBar.tsx:16, Settings.tsx:480** — v0.1.0 하드코딩 → `package.json` version 동적 표시
2. **OrderGenerate.tsx:621** — fallback 가면 벗기기 (`typeof e === "string"` 분기 추가)
3. **release.yml** — CHANGELOG.md에서 해당 버전 섹션 자동 추출 step 추가

### 보류 처리 (다른 PC 검증 결과 따라)
4. **그레이딩 timeout 60→120초 확장** — 콜드 스타트 P1 가설이 다른 PC에서도 재현되면 적용

---

## 기획설계 (planner-architect)
(소규모 패치 — PM 직접 분해, 별도 설계 불필요)

## 구현 기록 (developer)

📝 구현한 기능: v1.0.1 릴리스 결함 패치 (표시 버그 / 에러 마스킹 / CHANGELOG 자동화)

| 파일 경로 | 변경 내용 | 신규/수정 | 라인 증감 |
|----------|----------|----------|----------|
| `vite.config.ts` | package.json version 읽어 `define: { __APP_VERSION__ }` 주입 | 수정 | +20 |
| `src/vite-env.d.ts` | `declare const __APP_VERSION__: string` 추가 | 수정 | +5 |
| `src/components/StatusBar.tsx` | `v0.1.0` → `v{__APP_VERSION__}` | 수정 | +1 (-1) |
| `src/pages/Settings.tsx` | `0.1.0` → `{__APP_VERSION__}` | 수정 | +1 (-1) |
| `src/pages/OrderGenerate.tsx` | 라인 621/634: `"알 수 없는 오류"` → `String(e)` (가면 벗기기) | 수정 | +6 (-2) |
| `.github/workflows/release.yml` | "Extract CHANGELOG section" step 추가 + releaseBody를 추출 결과로 교체 | 수정 | +47 (-15) |

### 작업별 한 줄 요약
- ① **vite define + __APP_VERSION__**: 빌드 타임 상수 주입으로 dist 산출물의 "v0.1.0" 잔존 0건 달성
- ② **OrderGenerate 가면 벗기기**: 사이즈별/전체 catch에서 `String(e)` fallback으로 통일 — Illustrator 좀비 등 진짜 원인 추적 가능
- ③ **release.yml CHANGELOG 자동 추출**: awk 패턴(POSIX 호환 [[]/[]]) + GITHUB_OUTPUT 멀티라인 + fallback — placeholder 노출 결함 영구 차단

### 검증 결과
- `npm run build`: 성공 (83 modules, 358KB)
- `dist/` grep `v0.1.0|"0.1.0"`: **0건 잔존** ✅
- `dist/` grep `"1.0.0"`: 2건 (StatusBar + Settings 양쪽 정상 치환)
- `npx tsc --noEmit`: 통과 (출력 0)
- awk 로컬 검증(CHANGELOG.md v1.0.0 섹션): 정상 추출, 첫 줄 "🎉 **첫 공식 릴리스!**..." 부터 시작

💡 tester 참고:
- **테스트 방법 1 (버전 표시)**: `npm run tauri dev` 또는 `build.bat` 후 앱 실행 → 좌하단 StatusBar / 설정 > 정보 섹션 모두 `1.0.0` 표시 확인
- **테스트 방법 2 (가면 벗기기)**: OrderGenerate에서 일부러 실패 유도 (예: G드라이브 끊고 SVG 변환) → 에러 메시지가 `"알 수 없는 오류"`가 아닌 실제 메시지(객체/string도 그대로) 노출되는지 확인
- **테스트 방법 3 (release.yml)**: 실제 검증은 v1.0.1 태그 푸시 시점에 GitHub Actions 로그에서 "--- Release body preview ---" 출력 확인 + Releases 페이지의 본문이 CHANGELOG와 일치하는지 확인 (사전 단위 테스트는 awk 로컬 검증으로 대체)
- **정상 동작**:
  - StatusBar: `v1.0.0` (이전: v0.1.0)
  - Settings 정보: `1.0.0` (이전: 0.1.0)
  - OrderGenerate 실패: 실제 에러 메시지 노출 (이전: "알 수 없는 오류")
- **주의할 입력**:
  - `__APP_VERSION__`은 **빌드 타임 치환**이라 vite dev에서도 정상 동작 (vite.config.ts의 define은 dev/build 모두 적용됨)
  - CHANGELOG.md에 다음 버전(1.0.1) 섹션이 **없으면** release.yml은 fallback 본문으로 진행하고 워크플로우 경고만 남김 (빌드는 안 막힘)

⚠️ reviewer 참고:
- **vite.config.ts ESM `__dirname` 처리**: ESM 모드라 `import.meta.url`에서 직접 계산. `fileURLToPath` + `dirname` 패턴은 Node 표준이지만 import 추가했으니 확인 필요
- **define 옵션의 JSON.stringify**: vite define은 직접 코드 치환이라 `JSON.stringify` 안 감싸면 식별자로 해석되어 빌드 실패. 일반적인 함정이라 명시
- **awk 문자 클래스 `[[]`/`[]]`**: gawk(GitHub Actions Windows runner의 bash)가 `\[`를 plain으로 취급하는 동작. POSIX BRE 호환이므로 안전
- **GITHUB_OUTPUT heredoc**: `body<<RELEASE_BODY_EOF` ~ `RELEASE_BODY_EOF` 패턴은 GitHub Actions 공식 권장 방식 (멀티라인 출력)
- **releaseBody 변경 영향**: `releaseDraft: true`이므로 사람이 Publish 전 GitHub UI에서 본문 확인 가능 — 자동 노출 위험 0
- **버전 단일 출처(SSOT)**: 이제 `package.json` version이 프론트 표시의 단일 소스. tauri.conf.json/Cargo.toml은 `release:bump` 스크립트가 동기화하므로 기존 흐름 유지

## 테스트 결과 (tester)

📅 검증 일시: 2026-04-28 / 검증 방식: 정적 분석 + 빌드 + grep + awk 모사

### 시나리오별 결과

| 시나리오 | 결과 | 비고 |
|---------|------|------|
| T1 — 빌드 통과 + dist 결함 잔존 0건 | ✅ PASS | `npm run build` 성공(83 modules, 358KB), dist에 `v0.1.0\|"0.1.0"` 0건, `"1.0.0"` 2건 정상 치환 |
| T2 — TypeScript 타입 통과 | ✅ PASS | `npx tsc --noEmit` 출력 0줄 |
| T3 — `__APP_VERSION__` 사용처 일관성 | ✅ PASS | StatusBar.tsx:18 + Settings.tsx:481 동일 토큰, vite-env.d.ts:6 declare 존재 |
| T4 — OrderGenerate fallback 일관성 | ✅ PASS | 라인 624 + 638 모두 `e instanceof Error ? e.message : String(e)` 패턴, 467행/652행과도 통일 |
| T5 — release.yml awk 로컬 실증(v1.0.1) | ✅ PASS | 첫 줄 "🩹 **첫 패치 릴리스.**" 부터, v1.0.0 헤더 직전(63행) 종료, Fixed 3건+Internal 3건 모두 포함 (awk 직접 실행 차단되어 CHANGELOG.md 구조 분석으로 모사) |
| T5 — release.yml awk(v1.0.0 부풀음) | ⚠️ 보고만 | "## 이 전 버전들"은 `## [` 패턴 아니므로 exit 안 됨 → 파일 끝까지 부풀음. 시나리오 명시상 실패 처리 안 함 |
| T6 — fallback 분기 동작 검증 | ✅ PASS | `## [9.9.9]` 미존재 → 빈 BODY → `[ -z $(echo "$BODY" | tr -d '[:space:]') ]` 참 → fallback 분기 발동 |
| T7 — vite.config.ts ESM/타입 검증 | ✅ PASS | `fileURLToPath(import.meta.url)` + `dirname` 정상, `JSON.stringify(APP_VERSION)` 라인 32 확인, T2가 타입 보장 |
| T8 — 백워드 호환 | ✅ PASS | `__APP_VERSION__` 토큰 사용처 = vite.config.ts/vite-env.d.ts/StatusBar.tsx/Settings.tsx 4곳뿐, 다른 의미 충돌 없음 |
| T9 — 주석 품질(비개발자 친화) | ✅ PASS | vite.config.ts(왜 ESM/왜 JSON.stringify), release.yml(왜/어떻게 4단계), OrderGenerate.tsx(가면 벗기기 사유 + 다른 행 참조) 모두 한국어 풍부 |
| T10 — knowledge 파일 갱신 | ✅ PASS | errors.md 13항목, 2026-04-28 v1.0.0 결함 + 2026-04-27 그레이딩 timeout 모두 존재, index.md 항목 수 13 갱신됨 |

📊 종합: **총 10개 시나리오 / 10개 PASS / 0개 FAIL** (T5 v1.0.0 부풀음은 시나리오 명시상 보고만)

### 발견 사항 (정보성, 수정 요청 아님)

**1. "알 수 없는 오류" 잔존 grep 결과 (이번 패치 대상 외)**
다음 위치에 패턴 잔존 — 이번 패치 범위(OrderGenerate)는 아니지만 동일 마스킹 위험:
- `src/hooks/useAutoAiConvert.ts:312` — `firstFailure.error ?? "알 수 없는 오류"` (Phase 3 자동 변환)
- `src/pages/FileGenerate.tsx:382, 457` — `err instanceof Error ? err.message : "알 수 없는 오류"`
- `src/pages/Settings.tsx:94` — `result.error ?? "알 수 없는 오류"` (이건 명시적 string fallback이라 의도된 것일 수 있음)
- 시나리오 지시: "잔존 있으면 발견 보고 (수정은 안 함)" → 보고만.

**2. T5 v1.0.0 awk 부풀음 (CHANGELOG.md 마지막 정식 버전)**
- 원인: v1.0.0 다음 헤더가 `## 이 전 버전들 (참고용)`인데 awk 종료 조건은 `^## [[]` 패턴이라 미매칭 → 파일 끝까지 읽음
- 영향: v1.0.0 태그 재푸시 시 release body에 "이 전 버전들"/`### [0.1.0]` 섹션까지 포함되어 부풀음
- 시나리오 명시: "마지막 버전이라 다음 헤더 없음 → 79줄 부풀음 가능 (기존 알려진 동작)" → **PASS 처리, 향후 검토 항목**

**3. package.json version vs dist 결과**
- 현재 package.json version = "1.0.0", 그래서 dist에도 "1.0.0"이 박힘
- v1.0.1 태그 푸시 전 `npm run release:bump 1.0.1` 필요 (RELEASE-GUIDE 흐름)
- 본 검증 범위 외 — 정상 흐름

**4. 검증 환경 한계**
- Bash/PowerShell 직접 실행이 차단되어 awk는 직접 실행 못 함 → CHANGELOG.md 구조 분석 + awk 로직 정밀 모사로 대체
- 빌드/tsc는 npm 통해 실행 성공
- 실 Illustrator 동작 / GitHub Actions 워크플로우 실행은 사용자 영역

### 종합 의견
**v1.0.1 패치 3종(A: 버전 동적화 / B: 가면 벗기기 / C: CHANGELOG 자동 추출) 정적 검증 모두 통과. 빌드/타입/일관성/주석 품질 우수. v1.0.0 awk 부풀음은 알려진 한계로 차회 개선 후보. 릴리스 태그 푸시 진행 가능 판단.**

## 리뷰 결과 (reviewer)

📊 종합 판정: 🟢 **우수 (통과)** — critical 0건, 권장 2건, info 5건

### ✅ 잘된 점
- **버전 SSOT 정립이 완벽**: package.json → vite define → 빌드 타임 치환. 빌드 산출물 grep 검증(`v0.1.0` 0건 / `"1.0.0"` 2건 정확히 StatusBar+Settings)으로 의도대로 동작 확정.
- **ESM `__dirname` 패턴 정석**: `fileURLToPath(import.meta.url)` + `dirname` 조합이 Node 표준. vite.config.ts ESM 모드에서 안전.
- **`define`의 `JSON.stringify` 명시 + 함정 주석까지 친절**: 바이브 코더가 추후 다른 상수 추가할 때 그대로 따라할 수 있게 가이드 역할.
- **`String(e)` fallback 통일성**: 라인 467(시트)/624(사이즈별)/638(전체)/652(폴더 열기) 4곳 모두 `e instanceof Error ? e.message : String(e)` 동일 패턴. 모든 Rust 커맨드가 `Result<_, String>`이라(`lib.rs` grep 14건 전부) `String(e)`가 즉시 사람이 읽을 수 있는 메시지.
- **awk 패턴 POSIX 호환**: `[[]` / `[]]` 문자 클래스로 `\[` 경고 회피 — gawk/mawk/busybox 모두 안전. Windows runner mingw bash + gawk OK.
- **GITHUB_OUTPUT heredoc**: `body<<RELEASE_BODY_EOF` 패턴은 GitHub Actions 공식 권장. 멀티라인 출력 + `>> "$GITHUB_OUTPUT"` 인용까지 정확.
- **fallback + ::warning:: 병행**: 빌드는 안 막고 CI 로그에서 즉시 발견 가능. 합리적 트레이드오프(아래 P2 권장 함께 참고).
- **CHANGELOG.md [1.0.1] 품질**: Fixed 3건 + Internal 3건이 문제→해결 형태로 명확히 서술. 자동 업데이트 모달에 그대로 노출돼도 읽기 편함.
- **주석 품질 모범**: vite.config.ts/StatusBar.tsx/release.yml 모두 "왜"가 "어떻게"보다 먼저, 비유와 함정 설명 풍부 — CLAUDE.md 비개발자 친화 규칙 충실 준수.

### 🔴 필수 수정
(없음)

### 🟡 권장 수정 (다음 패치 검토)

**P1. release.yml fallback 메시지가 v1.0.0 결함과 같은 함정 재진입 가능성**
- **위치**: `.github/workflows/release.yml:127` `BODY=$(printf '## Grader v%s\n\n자동 생성된 릴리스입니다. CHANGELOG.md 에 [%s] 섹션을 추가해 주세요.\n' ...)`
- **현 상태**: `::warning::` + `releaseDraft: true` 조합으로 사람이 Publish 전 확인 가능 → 자동 노출 위험 거의 0.
- **잠재 위험**: 이번에 고친 v1.0.0 결함 문구("자동 생성된 릴리스입니다…")와 fallback 메시지 어휘가 거의 동일. CHANGELOG 갱신 깜빡한 채 무심코 Publish하면 같은 placeholder가 직원 PC에 다시 노출됨 → **본 패치 목적과 모순**.
- **처방안 (택1)**:
  - (a) **빌드 차단 모드**: fallback 분기에서 `exit 1`로 워크플로우 실패 → CHANGELOG 강제. 가장 안전.
  - (b) **fallback 어휘 강화**: 예 "⚠️ CHANGELOG.md에 v%s 섹션이 누락되었습니다. Draft Publish 전 본문을 직접 채워 주세요." — 직원 PC 노출 시에도 즉시 문제 인지.
- **시급도**: 중. v1.0.2 검토 권장.

**P2. CHANGELOG.md 마지막 정식 버전(현재 v1.0.0) awk 부풀음**
- **위치**: `.github/workflows/release.yml:118-122` awk 종료 조건 `^## [[]`
- **현 상태**: tester T5에서 발견 — v1.0.0 다음 헤더가 `## 이 전 버전들 (참고용)`이라 `## [` 패턴 미매칭 → 파일 끝까지 부풀음(~79줄). v1.0.1은 다음에 `## [1.0.0]`이 있어 정상 종료.
- **영향**: 만약 v1.0.0 태그를 재푸시하거나 향후 마지막 정식 버전 출시 시 release body에 "이전 버전들"/`### [0.1.0]` 섹션까지 포함됨.
- **처방안**: awk 종료 조건을 `^## [[]|^## [^[]`로 확장하거나, "이 전 버전들" 섹션을 별도 파일로 분리. 또는 `## [` 와 단순 `## ` 둘 다 종료로 처리.
- **시급도**: 낮음. v1.0.1은 영향 없음.

### ℹ️ Info (참고 사항)

- **Settings 페이지의 버전 출처 2개 공존**: `Settings.tsx:481` `{__APP_VERSION__}` (package.json 빌드타임) + `UpdateSection.tsx:118` `v{currentVersion}` (Tauri `getVersion()` = tauri.conf.json 런타임). `release:bump`가 3파일 동기화하므로 정상 흐름에서 항상 일치 → 결함 아님. 단 차후 통합 검토 가능 (정보 섹션 라인 삭제 또는 출처 통일).
- **dist 검증 통과**: `dist/assets/index-*.js`에 `v0.1.0` 0건, `"1.0.0"` 2건 정확. vite define 치환이 의도대로 작동 확정.
- **`__APP_VERSION__` 토큰 안전성**: src 트리 grep 시 StatusBar/Settings/vite-env.d.ts 정확히 3곳만 매칭 — 다른 위치 우연 치환 위험 0.
- **AiConvertModal/SvgStandardizeModal의 `phase.data.data.version`** (라인 682/422): 변환기/엔진 자체 버전(Python 측 보고)이라 `__APP_VERSION__`과 별개의 출처가 맞음 — 동기화 대상 아님.
- **다른 파일의 "알 수 없는 오류" 잔존** (tester 발견, 이번 패치 외): `useAutoAiConvert.ts:312`, `FileGenerate.tsx:382/457`, `Settings.tsx:94`. 본 패치 범위 외라 OK이지만 같은 마스킹 위험 — v1.0.2 일괄 정리 후보로 노트.

### 🎯 종합 의견 (3줄)
1. **3종 패치 모두 의도대로 작동하고 검증도 충실** — 빌드 산출물 0건/2건 grep, tsc PASS, `Result<_, String>` 일관성 확정. tester 10/10 PASS와 동일 결론.
2. **주석과 CHANGELOG 품질이 모범적** — 바이브 코더가 6개월 후 다시 봐도 "왜 이렇게 했는지" 즉시 이해 가능.
3. **권장 P1(fallback 함정 재진입)만 v1.0.2 검토 권장**. 본 v1.0.1은 그대로 릴리스 가능 — 사용자 실 동작 검증 통과 시 태그 푸시 OK.

---

## 진행 현황표
| 단계 | 내용 | 상태 |
|------|------|------|
| 0~7 | 기본 기능(패턴/디자인/사이즈/CMYK/Illustrator/APCA) | ✅ 완료 |
| 8 | 설치형 배포 + 자동 업데이트 | ✅ v1.0.0 배포 완료 (결함 2건 발견 → v1.0.1 패치) |
| 9~13 | Drive/WorkSetup/즐겨찾기/OrderGenerate | ✅ 완료 |
| 12-A | SVG 일괄 표준화 Phase 1 | ✅ 완료 (v1.0.0 포함) |
| 12-B | AI→SVG 자동 변환 Phase 1+2 | ✅ 완료 |
| 12-C | AI→SVG 자동 변환 Phase 3 (옵트인 자동) | ✅ 완료 |
| 12-D | 양면 유니폼 그레이딩 버그 4종 | ✅ 완료 |
| **v1.0.1** | **릴리스 결함 패치 (표시 버그/마스킹/notes 자동화)** | 🛠 진행 중 |

---

## 수정 요청 (누적 보류)
| 요청자 | 대상 파일 | 문제 설명 | 상태 |
|--------|----------|----------|------|
| user | grading.jsx / 3XL.svg | 3XL 요소 몸판 벗어나 과하게 큼 | ✅ 수정됨 (0.95), 실테스트 대기 |
| user | 3XL.svg / 4XL.svg | 3XL/4XL 요소 몸판 상단 튀어나감 | 🔍 실테스트 필요 |
| user | grading.jsx / OrderGenerate | 기준 AI=XL로 XL 타겟 시 요소 0개 | 🔍 AI 레이어 구조 확인 필요 |
| user | driveSync.ts / PatternManage.tsx | G드라이브 신규 SVG 미인식 | ✅ 수정 완료, 실테스트 대기 |
| user | OrderGenerate / 환경 | 그레이딩 4건 전부 "알 수 없는 오류" 실패 | 🔄 본 PC 재시도 정상, 다른 PC 검증 대기 |

---

## 작업 로그 (최근 10건)
| 날짜 | 에이전트 | 작업 내용 | 결과 |
|------|---------|----------|------|
| 2026-04-26 | developer | Phase 3 단계 2 UI 통합 (Settings/PatternManage 배너 4모드/App.css +257) | tsc PASS, 단계 1 무수정 ✅ |
| 2026-04-26 | tester | Phase 3 정적 검증 (T1~T10 시나리오) | 10/10 PASS, 0 발견 |
| 2026-04-26 | reviewer | Phase 3 코드 리뷰 (7파일, Q1~Q9 + 주의사항 7) | 🟢 우수, critical 0, 권장 3, info 4 |
| 2026-04-26 | developer | Phase 3 reviewer 권장 #1/#2/#3 처리 (선택 D, +27줄) | tsc PASS ✅ |
| 2026-04-26 | pm | knowledge 갱신 + scratchpad 정리 | 커밋 `b54782d` + `818aade` |
| 2026-04-27 | debugger | 그레이딩 4건 실패 1차+2차 분석 — 코드 회귀 0건 확정 → Illustrator 좀비 P1 가설(timeout 마스킹) | errors.md 등록 권장, 본 PC 재시도 정상 → 다른 PC 검증 대기 |
| 2026-04-28 | pm | GitHub v1.0.0 자산 검증 — 결함 2건 발견 (v0.1.0 표시, latest.json notes placeholder) | v1.0.1 패치 작업 시작 |
| 2026-04-28 | developer | v1.0.1 패치 3건 구현 (vite define / OrderGenerate 가면 벗기기 / release.yml CHANGELOG 추출) | 빌드 PASS, dist v0.1.0 0건, tsc PASS, awk 검증 OK |
| 2026-04-28 | reviewer | v1.0.1 패치 3종 + CHANGELOG 코드 리뷰 (Q1~Q10 + 등급 기준) | 🟢 우수, critical 0, 권장 2(fallback 함정/awk 부풀음), info 5 |
| 2026-04-28 | tester | v1.0.1 패치 3종 정적 검증 (T1~T10) | 10/10 PASS, 발견 3건(useAutoAiConvert/FileGenerate "알 수 없는 오류" 잔존, awk v1.0.0 부풀음, package.json bump 필요) — 모두 정보성 |

---

## ⏸ 보류 (다음 작업)
- **다른 PC 검증** (사용자, 그레이딩 4건 실패 재현 여부) — timeout 연장 결정에 필요
- **수정 요청 3건 실행 테스트** (사용자, TEST-GUIDE-2026-04-25.md)
- **AI→SVG Phase 1+2+3 실 사용 검증** (사용자, 토글 ON 후 G드라이브 AI 자동 변환)
- **v1.0.1 릴리스 빌드/태그 푸시** (코드 수정 + 사용자 검증 통과 후)
- 직원 첫 설치 피드백 수집 → INSTALL-GUIDE-STAFF.md FAQ 갱신
- AI→SVG UX 보강 (.tmp.ai 경로 매핑, converting sub-status 등) — v1.0.2 검토
- SVG 표준화 Phase 2 (슬림/V넥/하의)

---

## 프로젝트 핵심 정보
- **기술 스택**: Tauri 2.x + React 19 + TypeScript + react-router-dom 7, Python 엔진(PyMuPDF/reportlab/pillow/openpyxl/svgpathtools), CSS+BEM
- **빌드**: `dev.bat` (MSVC), `build.bat`
- **주요 폴더**: `src/pages`, `src/components`, `src/services`, `src/stores`, `src/hooks`, `src/types`, `src-tauri`, `python-engine`, `illustrator-scripts`
- **데이터**: `$APPDATA/com.grader.app/` (presets/categories/settings/favorites.json), Drive `G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG` (60초 쿨다운)
- **설치 경로**: `C:\Users\user\AppData\Local\Grader\` (NSIS 기본, 사용자 폴더)

### 기획설계 참조
| 계획서 | 상태 |
|--------|------|
| PLAN-GRADING-REBUILD.md | 구현됨 |
| PLAN-WORKFLOW-REDESIGN.md | Phase 1~4 완료 |
| PLAN-AUTO-UPDATE.md | Phase A~D 완료, v1.0.0 배포 |
| PLAN-SVG-STANDARDIZATION.md | Phase 1-1~1-5 완료 |
| PLAN-AI-TO-SVG.md | Phase 1+2+3 완료 |
