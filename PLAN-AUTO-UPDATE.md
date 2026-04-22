# PLAN-AUTO-UPDATE.md — grader 자동 업데이트 시스템 도입 계획서

> 작성일: 2026-04-22  
> 작성자: planner-architect  
> 대상: grader 앱 (Tauri 2.x + React 19 + TypeScript)  
> 저장소: `cobby8/grader` (Public)  
> 플랫폼: **Windows만** (MSI + NSIS)

---

## 0. 왜 이게 필요한지 (바이브 코더용 요약)

지금은 새 버전이 나오면 직원마다 setup.exe를 다시 받아 깔아야 합니다.  
이 작업이 끝나면 **앱이 스스로 새 버전을 찾고, 물어보고, 설치**까지 해줍니다. 마치 카톡이나 크롬이 "새 버전 있어요 → 업데이트" 하는 그 기능입니다.

### 핵심 구조 비유

| 조각 | 비유 | 실제 역할 |
|-----|------|---------|
| **Tauri Updater 플러그인** | "앱 안에 달린 감지 센서" | 앱 실행 시 서버에 "나보다 최신 있어?" 물어봄 |
| **서명 키 (private/public)** | "편지 봉투 + 도장" | 가짜 업데이트가 설치되지 못하게 막는 인감 |
| **GitHub Releases** | "파일 보관 창고" | 새 버전 설치 파일을 인터넷에 올려두는 곳 |
| **GitHub Actions (워크플로우)** | "자동화 로봇 팔" | 태그 달리면 빌드→서명→업로드를 자동 수행 |
| **latest.json** | "메뉴판" | 최신 버전 번호, 다운로드 주소, 서명이 적힌 한 페이지짜리 파일 |

### 전체 흐름 (한 줄)

```
개발자가 v0.2.0 태그 푸시
  → GitHub Actions 로봇이 깨어남
  → Windows 빌드 머신에서 MSI + NSIS 빌드 + 서명
  → Releases에 업로드 + latest.json 자동 생성
  → 직원 PC의 grader 앱이 켜질 때 latest.json 확인
  → "새 버전 있어요" 팝업
  → 직원이 "업데이트" 클릭
  → 다운로드 → 서명 검증 → 설치 → 재시작
```

---

## 1. 사용자 확정 조건 (변경 불가)

| 항목 | 결정 |
|------|------|
| GitHub 저장소 | **Public** (`cobby8/grader`) |
| 코드 사인 인증서 | **없음** (Windows SmartScreen 경고 감수) |
| 업데이트 체크 타이밍 | **앱 켤 때마다** 자동 체크 |
| 업데이트 방식 | **모든 업데이트는 선택형** (사용자가 "나중에" 가능) |
| 업데이트 UI | **별도 메뉴** (설정 페이지 내 "버전 정보" 섹션 + 자동 팝업) |
| 배포 플랫폼 | **Windows만** (MSI + NSIS) |
| 릴리스 플랫폼 | **GitHub Releases + Tauri Updater** |

---

## 2. 현재 프로젝트 상태 (파악 완료)

- **Tauri**: 2.x, 이미 MSI+NSIS 빌드 중
- **현재 버전**: 0.1.0 (package.json / Cargo.toml / tauri.conf.json 3곳)
- **번들 리소스**: python-engine/*.py, illustrator-scripts/*.jsx, *.bat, INSTALL-GUIDE.md
- **누락 1**: `svg_normalizer.py` bundle resources에 미등록 (최근 추가)
- **누락 2**: `order_parser.py` bundle resources에 미등록 (현황 확인됨)
- **Git remote**: `https://github.com/cobby8/grader.git`
- **현재 브랜치**: `phase2/double-sided-grading`
- **기존 의존성**: `@tauri-apps/api ^2`, `plugin-dialog`, `plugin-fs`, `plugin-opener`

---

## 3. 아키텍처 개요

### 3.1 구성 요소 다이어그램

```
┌─────────────────────────────────────────────────────────────┐
│                    직원 PC (grader 앱)                        │
│                                                              │
│  [App.tsx] ─start─> useAutoUpdateCheck (신규 훅)              │
│                          │                                   │
│                          ▼                                   │
│                   @tauri-apps/plugin-updater::check()        │
│                          │                                   │
│  [Settings.tsx] ─수동─> UpdateSection (신규 컴포넌트)          │
│                                                              │
└─────────────────┬───────────────────────────────────────────┘
                  │ HTTPS GET
                  ▼
┌─────────────────────────────────────────────────────────────┐
│           GitHub Releases (Public · cobby8/grader)           │
│                                                              │
│  /latest/download/latest.json       ← 매니페스트              │
│  /download/v0.2.0/Grader_0.2.0_x64-setup.nsis.zip           │
│  /download/v0.2.0/Grader_0.2.0_x64-setup.nsis.zip.sig       │
│  /download/v0.2.0/Grader_0.2.0_x64_en-US.msi.zip            │
│  /download/v0.2.0/Grader_0.2.0_x64_en-US.msi.zip.sig        │
│                                                              │
└─────────────────┬───────────────────────────────────────────┘
                  │ 태그 푸시로 업로드
                  ▲
┌─────────────────────────────────────────────────────────────┐
│     GitHub Actions (Windows runner, tauri-action@v0)        │
│                                                              │
│  on: push tags v*.*.*                                        │
│  env: TAURI_SIGNING_PRIVATE_KEY (Secrets)                    │
│       TAURI_SIGNING_PRIVATE_KEY_PASSWORD (Secrets)           │
│                                                              │
│  steps: checkout → node/rust setup → npm ci →                │
│         tauri-action (build + sign + upload + latest.json)   │
└─────────────────────────────────────────────────────────────┘
                  ▲
                  │ git tag v0.2.0 && git push --tags
┌─────────────────────────────────────────────────────────────┐
│                  개발자 PC (Windows + Claude Code)           │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 신규 파일/폴더

```
grader/
├─ .github/
│  └─ workflows/
│     └─ release.yml                    ← [신규] 자동 빌드/릴리스 워크플로우
├─ scripts/
│  ├─ bump-version.mjs                  ← [신규] 3곳 버전 동기화
│  └─ sync-bundle-resources.mjs         ← [신규] python-engine/*.py 자동 스캔 후 conf 갱신
├─ src/
│  ├─ hooks/
│  │  └─ useAutoUpdateCheck.ts          ← [신규] 앱 시작 시 자동 체크 훅
│  ├─ components/
│  │  └─ UpdateModal.tsx                ← [신규] 업데이트 팝업 (다운로드 진행률)
│  ├─ pages/
│  │  └─ Settings.tsx                   ← [수정] UpdateSection 추가
│  └─ services/
│     └─ updaterService.ts              ← [신규] check/download/install 래퍼
├─ src-tauri/
│  ├─ Cargo.toml                        ← [수정] tauri-plugin-updater, tauri-plugin-process 추가
│  ├─ tauri.conf.json                   ← [수정] plugins.updater + createUpdaterArtifacts
│  ├─ capabilities/default.json         ← [수정] updater:default, process:allow-restart 권한
│  └─ src/lib.rs                        ← [수정] .plugin(tauri_plugin_updater::...) .plugin(tauri_plugin_process::...)
├─ keys/                                ← [신규 폴더, .gitignore]
│  └─ README.md                         ← 키 보관 안내만 (키 자체는 G드라이브)
└─ .gitignore                           ← [수정] keys/*.key, keys/*.key.pub 제외
```

### 3.3 기존 코드와의 연결 지점

| 기존 | 변경 | 이유 |
|------|-----|------|
| `App.tsx` | `useAutoUpdateCheck()` 1줄 추가 | 앱 mount 시 체크 (로그인 없음) |
| `Settings.tsx` | 하단에 `<UpdateSection />` 추가 | 기존 설정 메뉴 안에 배치 — 별도 라우트 불필요 |
| `package.json` | scripts 추가 (`bump-version`, `sync-resources`) | 릴리스 전 1커맨드 실행 |
| `tauri.conf.json bundle.resources` | `order_parser.py`, `svg_normalizer.py` 추가 | 누락분 보충 |

---

## 4. Phase 구분 (총 5개, 각 2~4시간)

> 각 Phase는 **독립 커밋 가능 단위**. tester 통과 시 PM이 커밋한다.

### Phase A — 기반 설정 (2~3시간)

앱이 "업데이트 센서"를 달게 하는 단계. 실제 업데이트는 아직 안 일어남.

#### A-1. Updater 서명 키 생성 및 보관 (30분)

**왜**: 가짜 업데이트가 설치되면 멀웨어가 퍼지는 위험. Tauri Updater는 **모든 업데이트 파일이 서명되어야만** 설치. 서명은 "도장"이고 public key는 "도장이 진짜인지 비교할 참조표"다.

**어떻게**:
```bash
npx tauri signer generate --ci -p '<password>' -w keys/grader.key
```
- 입력: 패스워드 (빈 값 가능, 하지만 설정 권장 — 현재 `stiz3000!`)
- 출력: `keys/grader.key` (private, 직후 G드라이브로 이동), `keys/grader.key.pub` (public, Git 커밋)

**보관 위치 결정 (decision)**:
| 후보 | 채택 여부 | 이유 |
|------|---------|------|
| Git 커밋 | ❌ 금지 | private 키 노출 = 멀웨어 배포 위험 |
| 로컬 PC만 | ❌ | 개발자 PC 고장 시 복구 불가 |
| **G드라이브 공유 폴더** | ✅ 채택 | 기존 G드라이브 활용, 접근 권한 통제 가능 |
| 1Password/Vault | △ | 오버킬, 바이브 코더에겐 과함 |

**산출물**:
- `G:/공유 드라이브/디자인/grader-keys/grader.key` (private, 절대 Git 금지)
- `G:/공유 드라이브/디자인/grader-keys/grader.key.pub` (public)
- `.gitignore`에 `keys/` 추가
- `keys/README.md`에 "키는 G드라이브에 있음 — 경로 메모" 작성

**에이전트**: developer (키 생성 명령 실행 + 사용자 확인)

---

#### A-2. Cargo + npm 의존성 추가 (30분)

**왜**: Updater는 Tauri 기본 기능이 아닌 **플러그인**. crate와 npm 패키지를 둘 다 설치해야 함. Rust가 다운로드/서명검증/설치를 맡고, JS API는 Rust에게 "해줘"라고 요청하는 중개자.

**어떻게 (Cargo.toml)**:
```toml
[dependencies]
# 기존 ...
tauri-plugin-updater = "2"
tauri-plugin-process = "2"   # relaunch() 위해 필요 (설치 후 재시작)
```

**어떻게 (package.json)**:
```bash
npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process
```

**에이전트**: developer  
**검증**: `cargo check` + `npm install` 성공 + `cargo tauri dev` 기동 확인

---

#### A-3. tauri.conf.json 업데이터 설정 (30분)

**왜**: public 키와 "최신 버전 메뉴판(latest.json)"의 URL을 앱에 심어두는 단계. 없으면 앱이 어디에 물어봐야 할지 모름.

**변경 사항**:
```json
{
  "bundle": {
    "active": true,
    "targets": ["msi", "nsis"],
    "createUpdaterArtifacts": true,       // ← 신규: .zip + .sig 생성
    "resources": {
      "../python-engine/main.py": "...",
      "../python-engine/order_parser.py": "python-engine/order_parser.py",    // ← 누락 보충
      "../python-engine/svg_normalizer.py": "python-engine/svg_normalizer.py", // ← 누락 보충
      ...
    }
  },
  "plugins": {
    "updater": {
      "pubkey": "dW50cnVzdGVk...(grader.key.pub 내용 붙여넣기)",
      "endpoints": [
        "https://github.com/cobby8/grader/releases/latest/download/latest.json"
      ]
    }
  }
}
```

**주의**: pubkey는 `.pub` 파일 **내용 전체 한 줄**로 붙여넣음 (Base64 문자열).

**에이전트**: developer

---

#### A-4. lib.rs 플러그인 등록 + Capability 권한 (30분)

**왜**: Rust 측에서 플러그인을 "앱에 꽂는" 코드와, "프론트가 이 플러그인을 호출해도 된다"는 허가증이 둘 다 필요. 비유: 플러그인 설치 = 가전제품 콘센트에 꽂기, capability = 아이에게 "이 가전제품 써도 돼" 허락하는 것.

**lib.rs 변경**:
```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())   // ← 신규
        .plugin(tauri_plugin_process::init())                    // ← 신규 (relaunch용)
        .invoke_handler(...)
        .run(...)
        .expect(...)
}
```

**capabilities/default.json 변경**:
```json
{
  "permissions": [
    "core:default",
    "opener:default",
    "dialog:default",
    "fs:default",
    "updater:default",           // ← 신규
    "process:allow-restart",     // ← 신규 (앱 재시작 권한)
    ...(기존 fs 세부 권한들)
  ]
}
```

**에이전트**: developer  
**검증**: `cargo tauri dev` 기동 시 콘솔에 updater 플러그인 등록 로그

---

#### A-5. bundle resources 자동 스캔 스크립트 (30분)

**왜**: 지금은 `python-engine/*.py`가 새로 추가될 때마다 사람이 `tauri.conf.json`에 한 줄 수동 추가해야 함. 까먹으면 **배포판에 최신 .py가 없어** 런타임 에러. 자동 스캔 스크립트가 있으면 실수 방지.

**옵션 비교**:
| 옵션 | 장점 | 단점 | 채택 |
|------|------|------|------|
| A. 빌드 전 스크립트 (자동 생성) | 실수 불가 | 스크립트 한 번 작성 필요 | ✅ |
| B. 수동 나열 (현행) | 추가 스크립트 없음 | 까먹음 | ❌ |
| C. `["../python-engine/*"]` 글롭 | 간단 | tauri v2가 resources 객체 매핑 요구 + __pycache__/venv 제외 불가 | ❌ |

**구현 (scripts/sync-bundle-resources.mjs)**:
- `python-engine/*.py` 스캔 (test*.py, __pycache__, venv 제외)
- `illustrator-scripts/*.jsx` + `config.json` + `README.md` 스캔 (grading-*-backup.jsx 제외)
- `tauri.conf.json`의 `bundle.resources`를 업데이트 (다른 키는 보존)
- `npm run prebuild` hook에 등록 → `npm run build` 전에 자동 실행

**package.json 변경**:
```json
{
  "scripts": {
    "prebuild": "node scripts/sync-bundle-resources.mjs",
    "build": "tsc && vite build",
    "release:bump": "node scripts/bump-version.mjs",
    "release:prepare": "npm run release:bump && npm run prebuild"
  }
}
```

**에이전트**: developer

---

### Phase B — GitHub Actions 워크플로우 (2~3시간)

태그를 푸시하면 클라우드 로봇이 자동으로 빌드/서명/업로드하게 하는 단계.

#### B-1. GitHub Secrets 등록 (20분)

**왜**: private 키와 패스워드를 워크플로우에서 쓰려면 GitHub 저장소에 암호화 보관해야 함. 공개 저장소라도 Secrets는 절대 외부 노출되지 않음.

**등록 항목** (Settings → Secrets and variables → Actions → New repository secret):
| 이름 | 값 |
|------|-----|
| `TAURI_SIGNING_PRIVATE_KEY` | `grader.key` 파일 **내용 전체** 복붙 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 키 생성 시 입력한 패스워드 (빈 값이면 빈 문자열) |

**에이전트**: 사용자 (Claude는 시크릿 입력 불가, 사용자가 직접 등록)

---

#### B-2. .github/workflows/release.yml 작성 (1~1.5시간)

**왜**: 태그 `v0.2.0`을 푸시하면 이 파일이 "로봇 행동 지침서" 역할. 개발자가 빌드 노트북을 켤 필요 없음.

**설계 결정**:
- **트리거**: 태그 `v*.*.*` 푸시 시에만 (브랜치 push는 아님 — 실수 배포 방지)
- **runner**: `windows-latest` 1종 (Windows만 타겟)
- **tauri-action**: `tauri-apps/tauri-action@v0` (공식, 업데이터 매니페스트 자동 생성)
- **releaseDraft**: `true` → 자동 공개 안 되고 draft로 생성 → 사람이 "Publish" 눌러야 공개 (안전장치)

**파일 내용** (`.github/workflows/release.yml`):
```yaml
name: Release (Windows)

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  build:
    runs-on: windows-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Rust cache
        uses: swatinem/rust-cache@v2
        with:
          workspaces: './src-tauri -> target'

      - name: Install frontend dependencies
        run: npm ci

      - name: Build + Release
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'Grader ${{ github.ref_name }}'
          releaseBody: |
            ## 변경 사항
            (배포 전 GitHub에서 직접 채우거나 CHANGELOG에서 자동 주입 — 초기에는 수동)
          releaseDraft: true
          prerelease: false
          args: --target x86_64-pc-windows-msvc
```

**이 워크플로우가 자동으로 해주는 것**:
1. npm ci → 프론트 의존성 설치
2. cargo build → Rust 빌드
3. vite build → 프론트 번들
4. tauri build → MSI + NSIS 생성
5. `*.msi.zip`, `*.msi.zip.sig`, `*.nsis.zip`, `*.nsis.zip.sig` 생성
6. `latest.json` 생성 (버전/URL/서명 자동 기입)
7. GitHub Release draft 생성 + 자산 업로드

**주의 (Python 엔진 빌드 오염 방지)**:
- `python-engine/venv/`, `__pycache__/`는 Git 추적 안 됨 (이미 .gitignore) → 문제 없음
- runner에는 venv가 없으므로 **앱 설치 후 최초 실행 시 setup-python.bat 실행 필요** (기존 동일)

**에이전트**: developer

---

#### B-3. 버전 동기화 스크립트 (30분)

**왜**: 현재는 버전이 `package.json`, `tauri.conf.json`, `Cargo.toml` **3곳**에 있음. 사람이 하나 까먹으면 빌드는 되는데 업데이트 체크가 이상해짐. 스크립트 하나로 3곳 동시 갱신.

**구현 (scripts/bump-version.mjs)**:
- 인자로 새 버전 받음 (예: `node scripts/bump-version.mjs 0.2.0`)
- 3파일 버전 필드 정규식 교체
- `git tag v0.2.0` 생성 (사용자가 최종 확인 후 push)

**사용법**:
```bash
npm run release:prepare 0.2.0   # 버전 동기화 + resources 갱신
git add -A && git commit -m "chore: bump version to 0.2.0"
git tag v0.2.0
git push && git push --tags     # 태그 push → 워크플로우 트리거
```

**에이전트**: developer

---

### Phase C — 업데이트 UI (3~4시간)

앱이 "새 버전 있어요" 물어보고, 사용자가 "업데이트" 누르면 설치되는 UX 만드는 단계.

#### C-1. updaterService.ts 래퍼 (30분)

**왜**: 컴포넌트가 직접 Tauri API를 호출하면 코드가 지저분. 얇은 서비스 레이어로 "비즈니스 로직(로그, 에러 처리)"만 담고 컴포넌트는 UI만 신경쓰게 함. 기존 프로젝트의 `services/` 컨벤션과 일치.

**`src/services/updaterService.ts`**:
```ts
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

/** 업데이트가 있는지 조용히 확인. 네트워크 오류 시 null 반환 (앱 동작 방해 금지). */
export async function checkForUpdateSilent(): Promise<Update | null> {
  try {
    const update = await check();
    return update; // null이면 최신 상태
  } catch (err) {
    console.warn('[updater] 체크 실패 (무시):', err);
    return null;
  }
}

/** 다운로드 진행률을 콜백으로 받으며 설치 후 자동 재시작. */
export async function downloadAndInstall(
  update: Update,
  onProgress: (received: number, total: number | undefined) => void
): Promise<void> {
  let received = 0;
  let total: number | undefined = undefined;

  await update.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? undefined;
      onProgress(0, total);
    } else if (event.event === 'Progress') {
      received += event.data.chunkLength;
      onProgress(received, total);
    } else if (event.event === 'Finished') {
      onProgress(total ?? received, total);
    }
  });

  await relaunch();
}
```

**에이전트**: developer

---

#### C-2. useAutoUpdateCheck 훅 + App.tsx 연결 (30분)

**왜**: React에서 "앱 켜질 때 딱 한 번"을 표현하는 표준 방법이 훅. 로그인 흐름이 없는 앱이므로 `App.tsx` mount 지점이 "앱 켜질 때"와 동일.

**`src/hooks/useAutoUpdateCheck.ts`**:
```ts
import { useEffect, useState } from 'react';
import type { Update } from '@tauri-apps/plugin-updater';
import { checkForUpdateSilent } from '../services/updaterService';

/** App 시작 시 업데이트 체크. 있으면 Update 객체 리턴. */
export function useAutoUpdateCheck() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkForUpdateSilent().then(setUpdate);
  }, []);

  const dismiss = () => setDismissed(true);

  return {
    update: dismissed ? null : update,
    dismiss,
  };
}
```

**App.tsx 변경**:
```tsx
import { useAutoUpdateCheck } from './hooks/useAutoUpdateCheck';
import UpdateModal from './components/UpdateModal';

function App() {
  const { update, dismiss } = useAutoUpdateCheck();

  return (
    <div className="app-layout">
      <Header />
      <Sidebar />
      <main className="content"><Outlet /></main>
      <StatusBar />
      {update && <UpdateModal update={update} onDismiss={dismiss} />}
    </div>
  );
}
```

**에이전트**: developer

---

#### C-3. UpdateModal 컴포넌트 (1시간)

**왜**: 업데이트가 감지되면 사용자에게 **명확하게 선택지**를 주는 UI. 조건: "나중에" 버튼 필수(선택형 원칙), 다운로드 진행률 표시, 재시작 안내.

**`src/components/UpdateModal.tsx`** 구조:
- Props: `update: Update`, `onDismiss: () => void`
- 상태: `downloading: boolean`, `progress: { received, total }`, `error: string | null`
- 표시 내용:
  - 제목: "새 버전 v{update.version}이 있습니다"
  - 본문: `update.body` (릴리스 노트, 줄바꿈 유지)
  - 하단 1: 다운로드 전 → [나중에] [업데이트]
  - 하단 2: 다운로드 중 → progress bar + "{received_MB} / {total_MB} MB"
  - 하단 3: 완료 직전 → "설치 중… 잠시 후 앱이 재시작됩니다"
  - 하단 4: 에러 → 에러 메시지 + [재시도] [나중에]

**스타일 규칙** (프로젝트 컨벤션 준수):
- Tailwind 금지, CSS+BEM (`.update-modal__title`, `.update-modal__progress-bar`)
- 하드코딩 색상 금지, `var(--color-*)` 사용

**에이전트**: developer

---

#### C-4. Settings 페이지에 UpdateSection 추가 (1시간)

**왜**: 자동 팝업을 "나중에"로 닫았을 때도 사용자가 **다시 열 수 있어야** 함. 설정 페이지에 "버전 정보" 섹션 추가가 가장 자연스러움 (새 라우트 불필요, 사이드바 복잡화 방지).

**`src/pages/Settings.tsx`에 추가**:
```tsx
// Settings.tsx 하단에 섹션 추가
<section className="settings__section">
  <h2 className="settings__section-title">버전 정보</h2>
  <UpdateSection />
</section>
```

**`src/components/UpdateSection.tsx`** (신규) 표시 내용:
| 필드 | 값 |
|------|-----|
| 현재 버전 | `0.2.0` (package.json에서 가져옴) |
| 최신 확인 상태 | "확인 중…" / "최신 버전입니다" / "새 버전 v0.3.0 사용 가능" |
| 마지막 체크 시각 | `2026-04-22 14:30` |
| 버튼 | [지금 확인] / [업데이트 받기] (최신 있을 때만) |

**"지금 확인" 버튼 동작**:
1. `checkForUpdateSilent()` 재실행
2. 결과에 따라 UpdateModal 열거나 "최신 버전입니다" 토스트

**에이전트**: developer

---

### Phase D — 버전 관리 + 배포 자동화 (1~2시간)

개발자가 릴리스할 때 쉽게 쓰도록 편의 도구 갖추는 단계.

#### D-1. 릴리스 가이드 문서 (30분)

**왜**: 나중에 까먹지 않게 절차를 README급으로 명문화. 바이브 코더도 가이드만 보고 릴리스 가능해야 함.

**`RELEASE-GUIDE.md`** (신규) 목차:
1. 사전 준비 (최초 1회)
   - G드라이브 키 파일 위치 확인
   - GitHub Secrets 등록 확인
2. 릴리스 절차 (매번)
   - `npm run release:prepare 0.2.0`
   - `git commit -am "chore: bump version to 0.2.0"`
   - `git tag v0.2.0`
   - `git push origin <branch> && git push --tags`
   - GitHub Actions 진행 모니터링
   - Release draft에서 release notes 작성 후 **Publish**
3. 직원 배포 (최초 1회)
   - NSIS setup.exe 배포 → 설치 안내
   - 이후는 앱이 자동 업데이트
4. 롤백 방법
   - 문제 있는 릴리스는 **"Unpublish"** 하면 latest.json이 이전 버전을 가리킴
   - 직원 PC는 이전 설치 상태 유지 (Tauri updater는 다운그레이드 안 함)

**에이전트**: developer (또는 pm)

---

#### D-2. 첫 릴리스용 CHANGELOG 시드 (30분)

**왜**: release notes를 매번 처음부터 쓰면 귀찮고 누락됨. `CHANGELOG.md`를 Keep a Changelog 형식으로 시작해두면 복붙 용이.

**`CHANGELOG.md`** (신규):
```markdown
# Changelog

## [0.2.0] — 2026-04-22
### Added
- 자동 업데이트 시스템 (Tauri Updater + GitHub Releases)
- 설정 페이지에 버전 정보 섹션 추가

### Fixed
- 양면 유니폼 그레이딩 버그 4종 (표/이 스왑, 색상 반전, 스케일링, 외측 쏠림)

### Internal
- svg_normalizer.py 모듈 추가 (SVG 표준화 Phase 1)
- python-engine bundle resources 자동 스캔

## [0.1.0] — 2026-04-XX
- 최초 내부 배포
```

**에이전트**: pm

---

### Phase E — 테스트 + 단계적 롤아웃 (3~5시간, 여러 날 분산)

실제로 "새 버전 설치" 흐름을 검증하는 단계.

#### E-1. 로컬 엔드투엔드 리허설 (1~2시간)

**단계**:
1. `v0.1.9-test` 태그로 **테스트 빌드** 한 번 수동 진행
   - `createUpdaterArtifacts: true`가 `.zip`과 `.sig`를 만드는지 확인
2. 개발자 PC에 NSIS로 v0.1.9-test **설치**
3. `v0.2.0-test` 태그 푸시 → Actions 빌드 → Release draft → **Publish**
4. 설치된 grader 실행 → **자동 체크 팝업 확인**
5. [업데이트] 클릭 → 다운로드 → 서명 검증 → 재시작
6. 설치된 버전이 0.2.0으로 바뀌었는지 확인
7. 설정 페이지 → 버전 정보 → "지금 확인" 동작 확인

**성공 기준**:
- 팝업 1회 표시
- "나중에"로 닫으면 Settings에서 다시 호출 가능
- 설치 후 재시작 시 Python 엔진/Illustrator 연동 정상
- 네트워크 끊은 상태에서 앱 실행 시 **에러 없이 기동** (조용히 실패)

**에이전트**: tester

---

#### E-2. pilot 배포 (1명) (1시간 + 1주 관찰)

**단계**:
1. 직원 1명 선정 (친밀도 높은 사람 추천)
2. NSIS setup.exe 배포 → 설치 가이드 동봉
   - "SmartScreen 경고 나오면 '추가 정보' → '실행' 누르세요"
   - "최초 실행 시 setup-python.bat 자동 실행되니 기다리세요"
3. 정상 사용 확인 후 **다음 버전 릴리스**로 자동 업데이트 트리거
4. 업데이트 성공 여부 확인 (직원에게 "팝업 떴어요?" 문의)

**체크 포인트**:
- Windows Defender가 차단하지 않는가
- 회사망에서 GitHub releases 접근 가능한가
- 업데이트 팝업 UX가 혼란스럽지 않은가

**에이전트**: pm (사용자와 함께)

---

#### E-3. 전체 직원 배포 (30분 + 지속 모니터링)

pilot에서 문제 없으면 전체 직원 대상:
1. 공지 (Slack/카톡): "새로운 grader가 자동 업데이트 됩니다. 앱 켜면 '업데이트' 누르세요"
2. 최초 설치가 안 된 직원에게 NSIS setup.exe 배포
3. 이후 릴리스는 자동 전파

**모니터링 방법** (간이):
- 직원들이 업데이트 받았는지 구두 확인 (소규모 인원이라 가능)
- GitHub Releases 페이지 "Downloads" 수치 체크 (latest.json 호출 수로 체크 가능한 활성 사용자 추정)

**에이전트**: pm

---

## 5. 실행 계획 순서 (병렬/직렬)

| 순서 | Phase | 작업 | 담당 | 선행 조건 | 예상 시간 |
|------|-------|-----|------|---------|---------|
| 1 | A-1 | 서명 키 생성 + G드라이브 보관 | developer | 사용자 G드라이브 확인 | 30분 |
| 2 | A-2, A-3, A-4 | 의존성 + conf + lib.rs + capabilities | developer | A-1 | 1.5시간 |
| 3 | A-5 | bundle resources 자동 스캔 스크립트 | developer | (병렬 가능) | 30분 |
| 4 | **tester + reviewer (병렬)** | A 전체 검증 (cargo check / 앱 기동) | tester + reviewer | 2, 3 | 30분 |
| 5 | A 커밋 | "feat: tauri updater 기반 설정" | pm | 4 통과 | 10분 |
| 6 | B-1 | GitHub Secrets 등록 | 사용자 | — | 20분 |
| 7 | B-2 | release.yml 작성 | developer | A 완료 | 1.5시간 |
| 8 | B-3 | bump-version 스크립트 | developer | (병렬 가능) | 30분 |
| 9 | B 커밋 | "ci: github actions 릴리스 워크플로우" | pm | 7, 8 | 10분 |
| 10 | C-1 | updaterService.ts | developer | A 완료 | 30분 |
| 11 | C-2 | useAutoUpdateCheck + App.tsx 연결 | developer | 10 | 30분 |
| 12 | C-3 | UpdateModal | developer | 10 | 1시간 |
| 13 | C-4 | UpdateSection (Settings) | developer | 10 | 1시간 |
| 14 | **tester + reviewer (병렬)** | C 전체 UX 검증 | tester + reviewer | 11, 12, 13 | 1시간 |
| 15 | C 커밋 | "feat: 업데이트 UI (자동 체크 + 수동 메뉴)" | pm | 14 통과 | 10분 |
| 16 | D-1, D-2 | 릴리스 가이드 + CHANGELOG | developer/pm | B 완료 | 1시간 |
| 17 | E-1 | 로컬 E2E 리허설 | tester | C, D 완료 | 2시간 |
| 18 | E-2 | pilot 배포 (1명) | pm | E-1 통과 | 1시간 + 1주 관찰 |
| 19 | E-3 | 전체 직원 배포 | pm | E-2 통과 | 30분 |

**총 소요 (E-2 관찰 제외)**: 약 15~18시간, 3~4일 분산 진행 권장.

---

## 6. 주요 결정 사항 (decisions.md에도 기록)

### D1. 버전 관리 전략: Semantic Versioning
- 현재 0.1.0 → 자동 업데이트 최초 릴리스는 **0.2.0**
- 1.0.0은 정식 출시(모든 피드백 반영 후) 예약
- 태그 규약: `v{major}.{minor}.{patch}`
- major 증가는 breaking change일 때만 (데이터 마이그레이션 필요 등)

### D2. Python 엔진 리소스: 자동 스캔 스크립트
- `scripts/sync-bundle-resources.mjs`가 `python-engine/*.py`, `illustrator-scripts/*.jsx` 자동 스캔
- `npm run prebuild`에서 빌드 전 자동 실행
- 제외 대상: `test*.py`, `__pycache__`, `venv`, `grading-*-backup.jsx`

### D3. 서명 키 보관: G드라이브 공유 폴더
- `G:/공유 드라이브/디자인/grader-keys/grader.key`
- Git 절대 금지 (`.gitignore`에 `keys/` 추가)
- 공유 범위: 릴리스 권한 있는 개발자/디자이너

### D4. 업데이트 체크 타이밍: App.tsx mount (로그인 없음)
- 앱에 로그인 흐름 없음 → `App.tsx` mount가 곧 "앱 켜질 때"
- 네트워크 오류 시 조용히 무시 (`console.warn`만, 앱 동작 방해 금지)
- 체크 빈도 제한 없음 (앱 재시작마다 1회)

### D5. 업데이트 UI: 자동 팝업 + 설정 페이지 진입점
- 별도 라우트(`/update`)는 만들지 않음
- Settings 페이지 내 "버전 정보" 섹션으로 통합
- 사이드바 복잡화 방지

### D6. 릴리스 자동 공개 금지: Draft 우선
- `releaseDraft: true` → 사람이 release notes 확인 후 수동 Publish
- 실수로 태그 푸시해도 직원에게 전파 안 됨 (안전장치)

### D7. Windows만 빌드
- runner: `windows-latest` 1종
- args: `--target x86_64-pc-windows-msvc`
- 향후 macOS/Linux 필요 시 matrix 추가 (쉬운 확장)

---

## 7. 리스크 & 대응

### R1. 코드 사인 없음 → Windows SmartScreen 경고
**증상**: 최초 설치/업데이트 시 "Windows가 PC를 보호했습니다" 파란 창.  
**대응**:
- 직원 배포 시 **설치 가이드 첨부**: "추가 정보 → 실행" 2단계 안내
- Tauri Updater의 **서명 검증**은 SmartScreen과 별개 → 업데이트 자체는 안전
- 자동 업데이트 시에는 SmartScreen 안 뜸 (이미 설치된 앱이 교체하는 흐름)
- 장기: 예산 되면 EV 인증서 구매 검토 (연 30~40만원)

### R2. 회사망 GitHub 차단
**증상**: 일부 회사 네트워크가 `github.com` 또는 `*.githubusercontent.com` 차단.  
**대응 1**: 차단 여부 pilot에서 확인  
**대응 2**: 차단 시 **폴백 endpoint** 추가 (G드라이브 공유 링크에 latest.json 미러 배치 검토 — Phase F로 별도)  
**대응 3**: 최악의 경우 수동 배포 복귀 (기존 방식 유지)

### R3. G드라이브 경로 하드코딩
**증상**: 현재 Drive 연동이 `G:` 드라이브 가정. 직원 PC가 다른 드라이브 문자 쓰면 실패.  
**대응**: 자동 업데이트와 **별개 이슈** (이미 진행 중 — Phase 9 Drive 연동 이슈). 업데이트 도입과 동시에 대응 금지 (범위 폭발). 기존 Settings에 경로 커스터마이징 UI 추가는 후속 작업.

### R4. Python 미설치 PC 자동 업데이트 실패
**증상**: 업데이트 후 setup-python.bat 재실행 필요할 수 있음.  
**대응 1**: Tauri Updater는 바이너리/리소스만 교체 → venv는 그대로 유지됨  
**대응 2**: `requirements.txt` 변경 시 직원에게 "setup-python.bat 다시 실행" 안내 (CHANGELOG에 명시)  
**대응 3**: 장기적으로 Python sidecar 번들링 검토 (Phase F+)

### R5. Tauri 2.x Updater API 변경
**증상**: Tauri 2.x는 v1과 API 다름. Claude 학습 데이터 이후 변경이 있을 수 있음.  
**대응**:
- 공식 문서 확인 완료 (2026-04-22 기준)
- `@tauri-apps/plugin-updater` 최신 npm 버전 확인 후 설치
- API 호환성 이슈 발생 시 공식 Discord/GitHub Issues에서 확인

### R6. tauri-action이 리포지토리 찾지 못함
**증상**: 드물게 workflow 시 "repository not found" 에러.  
**대응**: `GITHUB_TOKEN`은 자동 주입되지만, Private가 아닌 Public 저장소이므로 문제 없음. 발생 시 토큰 권한(`contents: write`) 명시:
```yaml
permissions:
  contents: write
```

### R7. 업데이트 중 앱 크래시
**증상**: 다운로드 중 네트워크 끊김, 설치 중 PC 종료.  
**대응**: Tauri Updater는 atomic replace → **실패 시 원본 유지**. 재실행 시 다시 체크 팝업. 손상 가능성 낮음.

### R8. 데이터 마이그레이션 필요 시
**증상**: AppData 구조가 버전 간 바뀌면 업데이트 후 설정 손실.  
**대응**: 현재는 단순 JSON 저장이라 후방 호환 유지 쉬움. breaking change 시 앱 내 마이그레이션 루틴 추가 (별도 이슈).

---

## 8. 체크리스트 (Phase 시작 전 확인)

### Phase A 전
- [ ] `npm outdated @tauri-apps/api` 실행하여 최신 확인
- [ ] G드라이브 `grader-keys/` 폴더 존재 확인 (없으면 생성)
- [ ] 현재 0.1.0 버전이 `git status` 깨끗한지 확인

### Phase B 전
- [ ] GitHub 저장소가 Public인지 확인 (`https://github.com/cobby8/grader`)
- [ ] Secrets 2개 등록 (사용자 직접)
- [ ] `main` 브랜치에 병합 기준이 정해져 있는지 확인

### Phase C 전
- [ ] Settings 페이지 기존 구조 읽기 (`src/pages/Settings.tsx`)
- [ ] CSS 변수(`--color-*`) 존재 확인

### Phase E 전
- [ ] pilot 대상자 동의 확보
- [ ] 네트워크 테스트 PC 준비
- [ ] 롤백 계획 숙지

---

## 9. 기록할 문서

| 문서 | 추가 내용 |
|------|---------|
| `knowledge/architecture.md` | 자동 업데이트 아키텍처 1항목 |
| `knowledge/decisions.md` | D1~D7 결정 7항목 |
| `scratchpad.md` | "기획설계 (planner-architect)" 섹션 |
| `PLAN-AUTO-UPDATE.md` | (본 문서) 전체 계획 |
| `RELEASE-GUIDE.md` | Phase D-1에서 생성 |
| `CHANGELOG.md` | Phase D-2에서 생성 |

---

## 10. developer 주의사항

- **Phase A-1에서 생성한 private 키는 절대 커밋 금지**. `.gitignore` 먼저 추가 후 키 생성.
- Cargo 버전(2.x)과 npm 패키지 버전이 맞지 않으면 런타임 에러. 둘 다 `^2` 최신으로.
- `tauri.conf.json`의 `pubkey`는 **Base64 한 줄**. 개행 문자 포함 시 빌드 실패.
- `capabilities/default.json`에 `updater:default`와 `process:allow-restart` **둘 다** 필요.
- GitHub Actions workflow 파일 YAML 들여쓰기는 **스페이스 2칸 고정**. 탭 섞이면 파싱 실패.
- `createUpdaterArtifacts: true`를 안 넣으면 `.zip`/`.sig`가 안 생성되고 업데이트 작동 안 함 (가장 흔한 실수).
- 테스트용 버전(0.1.9-test, 0.2.0-test)은 **pre-release**로 표시 → 실 직원에게 노출 금지.
- `App.tsx`의 `useAutoUpdateCheck` 호출은 **React 18+ StrictMode**에서 개발 중 2회 실행됨 → 네트워크 호출이 2번 나가는 건 정상 (프로덕션 1회).

---

## 11. 후속 작업 (이 계획에서 제외 — Phase F 이후)

- macOS/Linux 빌드 추가
- 코드 사인 인증서 적용
- Python 엔진 sidecar 번들링 (시스템 Python 의존 제거)
- G드라이브 경로 커스터마이징 UI
- 업데이트 이력 로그 (언제 어느 버전으로 올라갔는지)
- 회사망 차단 대비 미러 endpoint

— 끝 —
