# RELEASE-GUIDE.md — Grader 앱 릴리스 절차서

> 대상: 개발자(PM/본인)
> 최종 업데이트: 2026-04-22
> 현재 버전: v1.0.0

---

## 0. 이 문서가 뭔가요?

새 버전을 직원들에게 배포할 때 **"어떤 순서로 뭘 눌러야 하는지"** 적어둔 절차서입니다.
자동 업데이트가 걸려 있으므로, 태그 하나 푸시하면 GitHub가 알아서 빌드하고,
직원 앱이 다음 실행 때 "새 버전 있어요" 팝업을 띄웁니다.

**비유로 말하면**:
- 새 버전 릴리스 = 음식점 새 메뉴 출시
- CHANGELOG = 새 메뉴 설명서
- `git tag` 푸시 = "오늘부터 이 메뉴 팝니다" 벨 울리기
- GitHub Actions = 자동으로 재료 손질하고 플레이팅 해주는 주방 로봇
- GitHub Releases Draft = 점장이 검수(한 번 더 확인) 후 손님(직원)에게 공개

---

## 1. 사전 준비 (최초 1회만 확인)

아래 3개는 **이미 설정 완료**라서 건드릴 필요 없습니다. 다만 문제 생겼을 때 참고용으로 어디 있는지는 알아두세요.

### 1-1. GitHub Secrets 확인

저장소: `https://github.com/cobby8/grader`
경로: `Settings` → `Secrets and variables` → `Actions`

등록되어 있어야 하는 항목:

| Secret 이름 | 용도 | 상태 |
|------------|------|------|
| `TAURI_SIGNING_PRIVATE_KEY` | 빌드 산출물 서명용 private 키 | 등록 완료 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 위 키의 잠금 해제 비밀번호 | 등록 완료 |

> `GITHUB_TOKEN`은 GitHub가 자동 주입하므로 등록하지 마세요.

### 1-2. 서명 키 파일 백업 위치

- **원본 private key**: `G:\공유 드라이브\디자인\grader-keys\grader.key`
- **잠금 비밀번호**: 1Password 또는 구두 공유
- **public key**: `src-tauri/tauri.conf.json`의 `plugins.updater.pubkey`에 이미 박혀있음

⚠️ **절대 금지**: `grader.key` (private 키)를 Git에 커밋하는 것.
`.gitignore`에 `keys/`가 이미 등록되어 있으므로 실수로 커밋될 일은 없지만,
혹시 프로젝트 어딘가에 복사해서 가지고 있으면 **즉시 삭제**하세요.

### 1-3. GitHub Actions 활성화 확인

저장소 `Actions` 탭에서 **"Release (Windows)"** 워크플로우가 보여야 합니다.
보이지 않으면 `.github/workflows/release.yml` 파일이 main 브랜치에 있는지 확인.

---

## 2. 릴리스 절차 (매번 반복)

새 버전을 내보낼 때마다 아래 순서를 **그대로** 따릅니다. 각 단계 대략 몇 분 걸리는지도 적어뒀어요.

### 순서 개요 (체크리스트)

```
[1] 변경사항 정리 → CHANGELOG.md 수정          (5~15분)
[2] 새 버전 번호 정하기                         (1분)
[3] npm run release:bump <버전>                (10초)
[4] 3파일 버전 확인                             (1분)
[5] 커밋                                       (1분)
[6] 태그 생성 + 푸시                           (1분)
[7] GitHub Actions 빌드 대기                   (15~25분)
[8] Release Draft 확인 + 편집                  (5~10분)
[9] Publish 클릭                               (10초)
[10] 직원 앱에서 업데이트 팝업 확인             (5분)
```

---

### [1] 변경사항 정리 → `CHANGELOG.md` 수정

**왜**: 직원들이 "이번에 뭐 바뀌었지?" 궁금할 때 보는 파일. Publish 단계에서 이 내용을 복붙해서 GitHub Release 노트에 올립니다.

**방법**:

1. `CHANGELOG.md` 파일을 엽니다.
2. 가장 위의 `## [Unreleased]` 섹션에 오늘 작업한 내용을 정리해 넣으세요. 분류는 4개:
   - `### Added` — 신규 기능
   - `### Changed` — 기존 기능 변경/개선
   - `### Fixed` — 버그 수정
   - `### Removed` — 없어진 기능 (드묾)
3. `## [Unreleased]`를 `## [새버전] — YYYY-MM-DD`로 바꾸고, 빈 `## [Unreleased]` 섹션을 맨 위에 다시 추가하세요.

**예시**:

```markdown
## [Unreleased]

## [1.1.0] — 2026-05-10

### Added
- V넥 양면유니폼 SVG 표준화 지원

### Fixed
- 3XL 사이즈 SVG 읽기 오류

## [1.0.0] — 2026-04-22
...
```

---

### [2] 새 버전 번호 정하기

**버전 규칙** (SemVer, "major.minor.patch"):

| 상황 | 어떤 자리 올리나? | 예시 |
|-----|----------------|------|
| 기존 데이터 형식이 바뀌어 구버전과 호환 안 됨 | **major** | 1.0.0 → 2.0.0 |
| 새 기능 추가 (구버전 데이터는 그대로 읽힘) | **minor** | 1.0.0 → 1.1.0 |
| 버그 수정만 | **patch** | 1.0.0 → 1.0.1 |

**pre-release(베타/RC)**: 태그 이름에 `-beta`, `-rc.1` 등 하이픈 뒤 문자열 붙이면 GitHub에서 자동으로 "Pre-release" 뱃지가 붙습니다. 예: `v1.1.0-beta`, `v1.1.0-rc.1`.
pre-release는 `latest.json`(직원들이 받는 업데이트 메뉴판)에 포함되지 않으므로, 테스트용으로 안전하게 쓸 수 있습니다.

---

### [3] `npm run release:bump <버전>` 실행

**왜**: Grader는 버전을 **3곳**에 저장합니다 (`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`). 사람이 손으로 3곳 다 고치면 하나 까먹기 쉬운데, 이 스크립트가 한 번에 동기화해줍니다.

**명령**:
```bash
npm run release:bump 1.1.0
```

**실행 결과 예시**:
```
버전 동기화 완료
  package.json         : 1.0.0  →  1.1.0
  src-tauri/Cargo.toml : 1.0.0  →  1.1.0
  src-tauri/tauri.conf : 1.0.0  →  1.1.0
```

---

### [4] 3파일 버전 확인

**왜**: 혹시 스크립트가 놓친 곳이 있나 눈으로 한번 확인. 특히 `Cargo.toml`은 `[dependencies]` 섹션에 다른 버전 표시가 많아서 가끔 헷갈립니다.

**확인할 파일 3개**:

```bash
# package.json
grep '"version"' package.json
# 결과: "version": "1.1.0"

# src-tauri/Cargo.toml (안 뜨면 [package] 섹션 version만 확인)
grep '^version' src-tauri/Cargo.toml
# 결과: version = "1.1.0"

# src-tauri/tauri.conf.json
grep '"version"' src-tauri/tauri.conf.json
# 결과: "version": "1.1.0",
```

셋 다 같은 버전이어야 합니다. 다르면 `npm run release:bump`를 다시 실행하세요.

---

### [5] 커밋

**왜**: 버전 변경도 프로젝트 역사의 일부. Git에 기록으로 남겨야 합니다.

**명령**:
```bash
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json CHANGELOG.md
git commit -m "chore: bump to v1.1.0"
```

> **주의**: `git add .`나 `git add -A`를 쓰지 마세요. 잘못해서 `keys/`나 `.env` 같은 파일이 커밋되면 큰일.

---

### [6] 태그 생성 + 푸시

**왜**: 태그(tag)는 "이 커밋이 바로 v1.1.0 릴리스 지점"이라고 깃발 꽂는 행위. 이 깃발을 GitHub에 올리면 자동으로 `release.yml` 워크플로우가 깨어납니다.

**명령**:
```bash
git tag v1.1.0
git push
git push --tags
```

> 태그 이름은 **반드시 `v` 접두사 + SemVer**. 예: `v1.1.0`, `v1.1.0-beta`. `release.yml`의 트리거 조건(`v[0-9]+.[0-9]+.[0-9]+`)에 맞춰야 합니다.

---

### [7] GitHub Actions 빌드 대기 (15~25분)

**왜**: 태그가 푸시되는 순간, GitHub의 Windows 빌드 머신이 깨어나 `npm ci`, `cargo build`, `tauri build`, 서명, 업로드까지 자동으로 진행합니다. 사람이 빌드 PC를 켤 필요 없어요.

**모니터링**:
1. 브라우저로 `https://github.com/cobby8/grader/actions` 접속
2. 방금 푸시한 태그에 해당하는 워크플로우 실행(run)이 실행 중(노란 동그라미)으로 보일 것
3. 클릭하면 실시간 로그가 보입니다
4. 완료되면 초록 체크 (실패하면 빨간 X)

**빌드 실패 시**:
- 로그에서 에러 메시지 확인
- 주로 겪는 원인:
  - npm 의존성 설치 실패 (`npm ci` 단계) → `package-lock.json`이 커밋됐는지 확인
  - 서명 실패 → Secrets에 등록된 `TAURI_SIGNING_PRIVATE_KEY`가 올바른지 확인
  - cargo 컴파일 에러 → 로컬에서 `cargo check` 먼저 돌려볼 것
- 실패한 태그를 지우고 수정 후 다시 푸시: **[롤백 절차](#3-롤백-절차)** 참고

---

### [8] Release Draft 확인 + 편집

**왜**: `releaseDraft: true` 옵션 때문에 GitHub는 자동으로 공개하지 않고 **Draft(초안)** 상태로 만들어둡니다. 사람이 릴리스 노트를 다듬고 "Publish" 눌러야 비로소 직원들에게 전파됩니다. (실수 방지 안전장치)

**방법**:
1. `https://github.com/cobby8/grader/releases` 접속
2. 최상단에 `v1.1.0` Draft가 보일 것
3. 제목 옆 연필 아이콘(편집) 클릭
4. **"Release notes"** 영역에:
   - `CHANGELOG.md`에 적어둔 해당 버전 섹션 내용을 복붙
   - 스크린샷, GIF 있으면 드래그 앤 드롭으로 첨부
5. **첨부된 아티팩트 확인**: 아래 목록에 이 파일들이 있어야 합니다.
   - `Grader_1.1.0_x64_en-US.msi`
   - `Grader_1.1.0_x64_en-US.msi.zip`
   - `Grader_1.1.0_x64_en-US.msi.zip.sig`
   - `Grader_1.1.0_x64-setup.exe`
   - `Grader_1.1.0_x64-setup.nsis.zip`
   - `Grader_1.1.0_x64-setup.nsis.zip.sig`
   - `latest.json`  **가장 중요** (자동 업데이트 매니페스트)
6. 부족한 파일이 있으면 빌드 단계에서 문제가 있었던 것 — 태그 지우고 다시 시작

---

### [9] Publish 클릭

준비 끝났으면 페이지 하단 **"Publish release"** 버튼 클릭.

이 순간부터:
- 저장소 방문자가 다운로드 링크를 볼 수 있음
- `latest.json`이 공개되어, 직원 앱이 다음 실행 시 "새 버전 있어요" 팝업을 띄움

---

### [10] 직원 앱에서 업데이트 팝업 확인

**왜**: 방금 올린 릴리스가 실제로 직원 앱에 전파되는지 확인.

**방법**:
1. 이미 v1.0.0(이전 버전)이 설치된 PC에서 Grader 실행
2. 앱이 켜지면 자동으로 `latest.json`을 확인함
3. "새 버전 v1.1.0이 있습니다" 모달이 뜨는지 확인
4. [업데이트] 버튼 → 다운로드 진행률 → 자동 재시작 → 버전이 v1.1.0으로 올라갔는지 `설정 → 버전 정보`에서 확인

---

## 3. 롤백 절차

배포했는데 **치명적인 버그**가 발견된 경우. 예: 앱이 켜지자마자 죽음, 데이터가 손상됨 등.

### 3-1. 태그 및 릴리스 삭제 (잘못 푸시한 경우)

```bash
# 로컬 태그 삭제
git tag -d v1.1.0

# 원격 태그 삭제 (GitHub에서 제거)
git push origin --delete v1.1.0
```

GitHub Releases 페이지에서도 해당 릴리스를 **"Delete"** 또는 **"Unpublish"** 해주세요.

- **Unpublish**: 링크는 살아있지만 Releases 목록에서 숨김. `latest.json`이 이전 버전을 가리키게 됨 (자동 업데이트는 이전 안정 버전으로 복구됨).
- **Delete**: 릴리스와 모든 아티팩트를 영구 삭제. 기존 다운로드 링크 깨짐.

> **Tauri Updater는 다운그레이드를 지원하지 않습니다.** 이미 v1.1.0을 설치한 직원 PC는 "스스로 v1.0.0으로 돌아가지" 않습니다. 해당 직원 PC에서 v1.0.0 MSI를 수동 재설치해야 합니다.

### 3-2. hotfix 배포 (수정 버전 내기)

가장 권장되는 방식. 문제를 고친 새 버전 (v1.1.1)을 빠르게 내서 자동 업데이트로 덮어씌웁니다.

```bash
# 1. 버그 수정 커밋
git commit -m "fix: 앱 실행 시 크래시 해결"

# 2. patch 버전 올리기
npm run release:bump 1.1.1

# 3. 커밋/태그/푸시 (일반 릴리스 절차와 동일)
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json CHANGELOG.md
git commit -m "chore: bump to v1.1.1"
git tag v1.1.1
git push && git push --tags
```

---

## 4. pre-release (베타/RC) 사용법

**왜 필요한가**: 대규모 변경을 전 직원에게 바로 뿌리기 전에, 1~2명에게 먼저 테스트받고 싶을 때.

**방법**:

1. 버전 번호 뒤에 `-beta`, `-rc.1` 등을 붙임
   ```bash
   npm run release:bump 1.2.0-beta
   git add ...
   git commit -m "chore: bump to v1.2.0-beta"
   git tag v1.2.0-beta
   git push && git push --tags
   ```

2. GitHub Actions가 **자동으로 pre-release로 표시**합니다 (태그에 `-` 있으면)

3. pre-release는 `latest.json`에 포함되지 않으므로, **일반 직원 앱은 업데이트 팝업이 뜨지 않음**

4. 테스터에게 **직접 MSI 다운로드 링크**를 전달해서 수동 설치시킵니다

5. 테스트 통과하면 정식 버전 `v1.2.0`을 별도로 릴리스

---

## 5. 자주 묻는 질문 (FAQ)

### Q1. 태그를 잘못 푸시했어요. 어떻게 지우나요?

**A**: 위 [3-1. 태그 및 릴리스 삭제](#3-1-태그-및-릴리스-삭제-잘못-푸시한-경우) 참고.
이미 GitHub Actions가 빌드를 시작했다면, 빌드는 완료되지만 태그+릴리스만 지우면 됩니다.

### Q2. CHANGELOG 적는 거 깜빡했어요. 지금 바로 올려도 되나요?

**A**: 네, 됩니다. 릴리스 후 따로 PR로 `CHANGELOG.md`만 업데이트하고 커밋하세요. 다만 다음부터는 릴리스 전에 하는 걸 권장.

### Q3. 빌드가 15분 넘어도 끝나지 않아요.

**A**: 첫 빌드 또는 의존성이 크게 바뀐 경우 20~30분까지 걸립니다. 30분 넘으면 `Actions` 탭에서 "cancel" 하고, 로그에서 어디서 멈췄는지 확인하세요.

### Q4. 직원 PC가 업데이트 팝업을 못 봐요.

**A**: 아래 순서로 확인:
1. 인터넷 연결 (회사망이 `github.com`을 차단하지 않는지)
2. 앱을 완전히 껐다가 다시 켰는지 (앱은 **시작할 때만** 체크함)
3. GitHub Releases에서 해당 버전이 **Published** 상태인지 (Draft면 안 보임)
4. `latest.json` 파일이 릴리스에 첨부됐는지
5. 그래도 안 되면 앱 내 `설정 → 버전 정보 → [지금 확인]` 수동 버튼 누르게 안내

### Q5. Python 모듈 추가했는데 빌드 후에도 앱이 못 찾아요.

**A**: `src-tauri/tauri.conf.json`의 `bundle.resources`에 새 `.py` 파일을 등록해야 합니다.
단, `npm run prebuild`가 `python-engine/*.py`를 **자동 스캔해서 등록**하므로 대부분의 경우 그냥 커밋만 하면 됩니다.
`test_*.py`, `__pycache__`, `venv`는 자동 제외됨.

---

## 6. 체크리스트 (프린트해서 붙여두기용)

릴리스 하나 할 때마다 이 10개 스텝 순서대로:

```
[ ] 1. CHANGELOG.md에 이번 버전 변경사항 정리
[ ] 2. 새 버전 번호 결정 (major/minor/patch)
[ ] 3. npm run release:bump <버전>
[ ] 4. 3파일 (package.json, Cargo.toml, tauri.conf.json) 버전 확인
[ ] 5. git add 필요 파일 + git commit -m "chore: bump to vX.Y.Z"
[ ] 6. git tag vX.Y.Z && git push && git push --tags
[ ] 7. GitHub Actions 빌드 완료 대기 (녹색 체크)
[ ] 8. Releases 페이지에서 Draft 편집 (릴리스 노트 + 아티팩트 7개 확인)
[ ] 9. "Publish release" 클릭
[ ] 10. 설치된 앱에서 업데이트 팝업 확인
```

---

## 7. 관련 문서

- [`CHANGELOG.md`](./CHANGELOG.md) — 버전별 변경사항 이력
- [`INSTALL-GUIDE-STAFF.md`](./INSTALL-GUIDE-STAFF.md) — 직원용 설치 안내 (처음 설치 시 전달)
- [`PLAN-AUTO-UPDATE.md`](./PLAN-AUTO-UPDATE.md) — 자동 업데이트 시스템 전체 설계 문서
- `.github/workflows/release.yml` — 자동 빌드/서명/업로드 워크플로우
- `scripts/bump-version.mjs` — 3파일 버전 동기화 스크립트

---

_이 가이드는 작업하면서 놓친 부분이 발견되면 업데이트하세요. 한 번 쓰고 끝나는 문서가 아니라 **살아있는 문서**입니다._
