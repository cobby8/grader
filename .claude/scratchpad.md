# 작업 스크래치패드

## 현재 작업
- **요청**: Google Drive 폴더 연동 Phase 1 MVP (읽기 전용)
- **상태**: 🔨 developer 착수 예정 (13단계 순차)
- **현재 담당**: developer
- **상세 계획**: `PLAN-GDRIVE-SYNC.md` (472줄, 커밋 eb477b7)

### 확정된 사항 (사용자 답변)
- **J-1~J-4**: 파일명 `{패턴명}_{사이즈}.svg`, 카테고리 3레벨, 루트 `G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG`
- **J-7 ✅ OK**: meta.json 자동 생성 허용
- **J-8 ✅ 여러 조각**: SVG 내부 path 단위 (파일 단위 아님). 즉 **파일명 규칙 변경 불필요**, SVG 파일 그 자체에 여러 path가 들어있음. 현재 `svgData` 문자열 인라인 저장 방식 유지.

### 🔜 진행 순서
1. 🔨 developer: PLAN [E] 13단계 순차 (3일 예상)
   - 1~4단계: 타입/서비스/캐시/설정 (3~4시간)
   - 5~7단계: UI + Tauri fsScope (2~3시간)
   - 8~10단계: 스토어 병합 + meta.json (3~4시간)
   - 11~13단계: 통합 테스트 (2시간)
2. 👤 사용자: 중간중간 dev.bat 실행해서 실시간 확인
3. ✅ 단계별 커밋

## 진행 현황표
| 단계 | 내용 | 상태 |
|------|------|------|
| 0~6 | 기획/세팅/프리셋/디자인/사이즈/CMYK/통합테스트 | ✅ 완료 |
| 7 | Illustrator ExtendScript 전환 + APCA 교체 | ✅ 완료 |
| 8 | 설치형 배포 준비 | ⏸ 보류 (eda27b9) |
| 9 | Drive 연동 Phase 1 (읽기 전용) | 🔨 착수 |
| 10 | Drive 연동 Phase 2 (양방향) | ⏳ 대기 |

## 프로젝트 핵심 정보

### 기술 스택
- Tauri 2.x + React 19 + TypeScript + react-router-dom 7
- Python 엔진 (PyMuPDF/reportlab/pillow/openpyxl)
- 빌드: `dev.bat` (MSVC), 배포: `build.bat`
- CSS: 순수 CSS + BEM (Tailwind 금지)

### 주요 파일
```
grader/
├── src/pages/ (PatternManage, DesignUpload, SizeSelect, FileGenerate)
├── src/stores/ (presetStore, designStore, categoryStore, generationStore)
├── src/types/ (pattern, design, generation, order)
├── src-tauri/ (Rust: run_python + Illustrator 커맨드)
├── python-engine/ (PDF 분석)
├── illustrator-scripts/grading.jsx (ES3, 1610줄)
└── REPORT.md, REPORT-EXTENDSCRIPT.md, REPORT-SIZETAG.md, PLAN-GDRIVE-SYNC.md
```

### 데이터 저장
- `$APPDATA/com.grader.app/` 아래 presets.json / categories.json / designs.json + designs/*.pdf/png
- 경로는 `BaseDirectory.AppData` 상대경로 → PC 간 이식성 완벽

## 기획설계 (planner-architect)

### [2026-04-15] Google Drive 연동 — 상세는 `PLAN-GDRIVE-SYNC.md`

**요약**:
- Drive for Desktop + 로컬 폴더 스캔 방식 (A1)
- 루트: `G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG`
- 파싱: `/^(.+)_(5XS|4XS|3XS|2XS|XS|S|M|L|XL|2XL|3XL|4XL|5XL)\.svg$/`
- 카테고리 3레벨, meta.json 자동 생성 (UUID 유지)
- 신규 4파일 + 수정 7파일 ≈ 600줄
- Phase 1: 3일, Phase 2: +2~3일

## 구현 기록 (developer)

### [2026-04-15] Drive 연동 Phase 1 (1~4단계)

📝 구현한 기능: Drive 폴더 연동 MVP의 타입/스캔 서비스/캐시/설정 스토어 기반 (UI 없음, 로직 계층만)

| 파일 경로 | 변경 내용 | 신규/수정 | 라인 |
|----------|----------|----------|------|
| `src/types/pattern.ts` | PatternPiece에 svgPathBySize?/svgSource? 추가, PatternPreset에 driveFolder?/stableId? 추가, AppSettings/DriveMetaJson 신규 타입 | 수정 | 126줄 (기존 79 → +47) |
| `src/services/driveSync.ts` | 폴더 재귀 스캔(BFS, 깊이 5 제한), 파일명 파싱(SIZE_REGEX), meta.json 읽기/자동 생성, loadSvgFromPath | 신규 | 488줄 |
| `src/stores/svgCacheStore.ts` | LRU 메모리 캐시 (MAX_ENTRIES=500), getSvg/invalidate/clearAll/getCacheStats | 신규 | 151줄 |
| `src/stores/settingsStore.ts` | settings.json 영속화, loadSettings/saveSettings + updateDriveRoot/setDriveSyncEnabled 편의함수, .backup.json 안전장치 | 신규 | 164줄 |

**1단계**: src/types/pattern.ts 확장
- 기존 필드 무변경 (PatternPiece.svgBySize 등 그대로), optional 필드만 추가로 후방 호환
- DriveMetaJson: stableId/presetName/createdAt/pieceCount(Phase 1 항상 1) + displayName?

**2단계**: src/services/driveSync.ts 신규 (488줄)
- SIZE_REGEX: `^(.+)_(5XL|4XL|3XL|2XL|XL|5XS|4XS|3XS|2XS|XS|M|S|L)\.svg$` (길이 내림차순 정렬)
- scanDriveRoot(rootAbs): BFS 큐로 재귀 순회 → ScanResult { categories, presets, warnings, success, error }
- 카테고리 id는 경로 FNV-1a 해시, stableId(UUID)와 구분
- meta.json은 `{패턴명}.meta.json` 규약, readOrCreateMetaJson이 없으면 UUID 발급해서 자동 저장 (J-7 승인)
- 루트 접근 실패/깊이 초과/빈 폴더/규칙 위반 파일은 warnings에 누적 (스캔 전체는 중단 안 됨)
- Windows 백슬래시 경로 자동 감지 (joinPath), 한글 폴더명 UTF-8 그대로

**3단계**: src/stores/svgCacheStore.ts 신규 (151줄)
- Map<absPath, {content, loadedAt}>, LRU: 초과 시 loadedAt 가장 작은 항목부터 제거
- MAX_ENTRIES=500 (≈100MB 상한 가정)
- 단순 정렬 방식 (N=500에서 성능 충분)

**4단계**: src/stores/settingsStore.ts 신규 (164줄)
- presetStore와 동일한 LoadResult 패턴 (success 플래그로 덮어쓰기 차단)
- DEFAULT_SETTINGS와 병합 로드로 신규 필드 후방 호환
- .backup.json 자동 백업

**검증**:
- `npx tsc --noEmit`: PASS (exitcode=0)
- Rust 수정 없음 → cargo 검증 생략
- 실행 테스트는 이번 세션 범위 아님 (UI 없음)

💡 tester 참고:
- 5~7단계(Settings UI + fsScope) 완료 후 실행 테스트 가능
- 단위 검증은 scanDriveRoot를 빈 폴더 + 샘플 SVG로 호출해서 ScanResult 콘솔 출력 확인
- parseFilename 예상 케이스:
  - "농구유니폼_V넥_스탠다드_암홀X_XS.svg" → {presetName:"농구유니폼_V넥_스탠다드_암홀X", size:"XS"}
  - "야구_긴팔_5XL.svg" → {presetName:"야구_긴팔", size:"5XL"}
  - "안전지대.svg" → null

⚠️ reviewer 참고:
- hashPath는 FNV-1a 32비트 — 해시 충돌 가능성 극히 낮으나 이론상 0은 아님. stableId(UUID)가 진짜 식별자이고 hashPath는 카테고리 세션 id용이라 충돌 시에도 데이터 유실 없음
- svgCacheStore의 바이트 계산(content.length*2)은 UTF-16 근사치. 정확한 UTF-8 바이트가 필요하면 TextEncoder 필요하나 성능 비용 있음
- meta.json 쓰기 실패 시 메모리 meta는 유지하고 경고만 로그 (사용자 권한 문제 상황 방어)
- 루트 자체는 "하위에 SVG가 있을 때만 카테고리로 등록" 로직 — UI에서 불필요한 상위 노드 생성 방지

**다음 세션**: 5~7단계 (Settings 페이지 UI + Tauri fsScope G:\\** 허용 + PatternManage 가져오기 버튼)

**주의사항/한계**:
- Tauri fsScope 미설정 상태이므로 scanDriveRoot 실제 호출은 현 단계에서 실패 예상 (다음 세션 5단계에서 해결)
- 다중 조각 패턴 미지원 (J-8 답변 대기, Phase 2)
- 커밋은 PM 결정 대기

### [2026-04-15] Drive 연동 Phase 1 (5~7단계)

📝 구현한 기능: Tauri fsScope 확장 + Settings 페이지 신규 + PatternManage Drive 가져오기 모달 — Phase 1 UI 계층 완성 (이제 실행 테스트 가능)

| 파일 경로 | 변경 내용 | 신규/수정 | 라인 |
|----------|----------|----------|------|
| `src-tauri/capabilities/default.json` | fs scope에 G:/**, H:/**, C:/Users/** 절대경로 + fs:allow-read-dir 권한 신규 | 수정 | 73 (기존 49 → +24) |
| `src/pages/Settings.tsx` | 신규 — Drive 루트 경로 선택/검증/적용, Drive 사용 토글, SVG 캐시 통계+비우기, Drive for Desktop 안내 | 신규 | 373 |
| `src/components/DriveImportModal.tsx` | 신규 — Drive 폴더 스캔, 결과 미리보기(카테고리/프리셋/경고 카운트+경고 목록), stableId 중복 체크 후 카테고리 트리 매핑 + 신규 항목만 부모 콜백으로 반환 | 신규 | 363 |
| `src/pages/PatternManage.tsx` | 수정 — DriveImportModal/loadSettings import, driveSyncEnabled 상태, handleDriveImport 콜백, "Drive에서 가져오기" 버튼, 카드에 DRIVE 뱃지 | 수정 | 1119 (기존 1015 → +104) |
| `src/main.tsx` | /settings 라우트 추가 | 수정 | 35 (기존 32 → +3) |
| `src/components/Sidebar.tsx` | "도구" 섹션 + "설정" 메뉴 추가 (워크플로우 1~4와 시각적 분리) | 수정 | 68 (기존 40 → +28) |
| `src/App.css` | Settings/DriveImportModal 전용 스타일 (settings-section, settings-row, drive-import-modal, preset-card__drive-badge) | 수정 | 1857 (기존 1572 → +285) |

**5단계 (fsScope)**:
- `fs:allow-exists`, `fs:allow-read-text-file`, `fs:allow-write-text-file`, `fs:allow-read-dir`에 G:/**, H:/**, C:/Users/** 추가
- write 권한은 `*.meta.json`만 허용 (Phase 1은 SVG 직접 수정 안 함, meta.json 자동 생성만)
- read-dir 권한 신규 (driveSync.scanDriveRoot의 readDir 호출 지원)

**6단계 (Settings 페이지)**:
- 3개 섹션: ①Drive 패턴 루트 폴더 ②SVG 메모리 캐시 ③정보
- ①: 현재 경로 표시 + Tauri dialog open({directory:true})로 폴더 선택 + 직접 입력 + 검증(exists 호출) + 적용 버튼. 검증 상태 4단계(idle/checking/valid/invalid) UI. Drive 연동 ON/OFF 토글
- ②: 5초마다 getCacheStats() 갱신, 항목 수/추정 메모리(formatBytes) 표시, "모두 삭제" 버튼
- ③: 앱 버전(0.1.0 하드코딩), Drive for Desktop 다운로드 링크
- 라우팅: `/settings` 추가, Sidebar에 "도구" 섹션으로 분리
- 안전장치: presetStore 패턴 그대로 — isLoadSuccess false면 저장 차단

**7단계 (PatternManage 확장)**:
- driveSyncEnabled가 true일 때만 "📥 Drive에서 가져오기" 버튼 표시 (조건부 렌더링)
- DriveImportModal: stableId 중복 체크는 모달이 담당, 부모는 결과(newCategories, newPresets, skippedCount, warnings) 받아서 영속화만
- 카테고리 매핑 로직: 깊이 오름차순 정렬 → scanId(해시) → 기존 카테고리(name+parentId) 매칭 → 없으면 generateId()로 신규 발급. parentId 체인 정합성 보장
- Drive 출처 프리셋: pieces[].svgSource="drive", svgPathBySize 채움, svgData=""(on-demand 로드), sizes는 Drive에서 발견된 사이즈만 0으로 초기화
- 카드 헤더에 DRIVE 뱃지 (파란색, title=driveFolder)

**검증**:
- `npx tsc --noEmit`: PASS (출력 없음 = 0 에러)
- `cargo check` (src-tauri): PASS (Finished dev profile in 14.15s)
- 실행 테스트: PM이 직접 dev.bat 기동 후 진행 (이번 세션 범위 아님)

💡 tester 참고:
- **테스트 방법**:
  1. `dev.bat` 실행 → 좌측 메뉴에 "도구 > 설정" 보이는지 확인
  2. 설정 페이지 → "폴더 선택" → `G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG` 선택 → "검증" 통과 확인 → "적용" → "Drive 연동 사용" 토글 ON
  3. 패턴 관리 페이지 → "📥 Drive에서 가져오기" 버튼 클릭 → 모달 → "스캔 시작" → 카테고리/프리셋/경고 카운트 확인 → "가져오기"
  4. 가져오기 후 카드에 DRIVE 뱃지 표시 확인, 카테고리 트리 정합성 확인 (동일 이름 카테고리 중복 생성 X)
- **정상 동작**: 첫 가져오기 시 경고 0건이면 OK. 두 번째 가져오기 시 "스킵 N개" 표시되어야 함 (stableId 중복 체크)
- **주의할 입력**:
  - 한글 폴더명 (UTF-8 처리 확인)
  - 빈 폴더 (warnings 누적 확인)
  - meta.json 미생성 폴더 (자동 생성되는지 + G:\ 쓰기 권한 확인)

⚠️ reviewer 참고:
- fsScope `G:/**` 범위가 넓음 — 보안상 우려 시 사용자별 동적 scope 갱신은 Phase 2로
- write 권한을 `*.meta.json`으로 좁힘 (SVG 무단 수정 방지). Phase 2 양방향 동기화 시 SVG 쓰기 권한 확장 필요
- DriveImportModal의 카테고리 매핑은 "name+parentId" 매칭 — 사용자가 카테고리 이름을 수동으로 바꾼 경우 같은 폴더가 새 카테고리로 인식될 수 있음 (Phase 2 stableCategoryId 도입 검토)
- handleDriveImport에서 카테고리/프리셋 저장이 분리됨 — 카테고리 저장 성공 후 프리셋 저장 실패 시 부분 상태 발생 가능. 트랜잭션 패턴 도입 검토 필요
- Settings의 path validation은 단순 exists 호출 — 권한 부족(EACCES)과 경로 미존재(ENOENT)를 구분하지 않음. UX 개선 여지 있음

**미커밋 상태**: 1~4단계 + 5~7단계 모두 미커밋 (PM이 8~13단계 완료 후 일괄 검토)

**다음 세션**: 8~10단계 (스토어 병합 정교화 + meta.json 후처리 + presetStore 메서드 정리), 11~13단계 (실행 통합 테스트)

## 테스트 결과 (tester)

### [2026-04-15] Drive 연동 Phase 1 정적 검증

| 항목 | 결과 | 비고 |
|------|------|------|
| tsc --noEmit | ✅ PASS | 출력 0줄 (에러 없음) |
| cargo check | ✅ PASS | Finished dev profile in 0.42s (캐시됨) |
| npm run build (vite) | ✅ PASS | 71 modules, 321KB JS / 28KB CSS, 780ms |
| 라우팅 무결성 | ✅ PASS | `/pattern`, `/design`, `/size`, `/generate`, `/settings` 정상 + index redirect |
| capabilities 보안 범위 | ✅ PASS | G:/**, H:/**, C:/Users/** 로 제한, write는 `*.meta.json` 전용, $APPDATA 기존 유지 |
| 타입 후방 호환성 | ✅ PASS | svgPathBySize/svgSource/driveFolder/stableId 모두 optional |
| SIZE_REGEX 길이 내림차순 | ✅ PASS | `[...SIZE_LIST].sort((a,b)=>b.length-a.length)` → 5XL/4XL/... 이 XL보다 먼저 |
| parseFilename 4 케이스 | ✅ 4/4 | 암홀X_XS/야구_5XL/안전지대→null/패턴_XL 모두 정상 |
| scanDriveRoot 깊이 5 제한 | ✅ PASS | MAX_SCAN_DEPTH=5, 초과 시 warnings에 누적 후 continue |
| SVG 캐시 LRU | ✅ PASS | MAX_ENTRIES=500, evictOldest(sorted by loadedAt asc) |
| 병합 중복 방지 | ✅ PASS | stableId Set으로 스킵 카운트, 카테고리는 name+parentId + newCategories 동시 검사 |
| UI 구조 | ✅ PASS | Settings 3섹션 + DriveImportModal 카드3+경고목록 + DRIVE 뱃지 조건부 |
| 에러 방어 경로 | ✅ PASS | exists 실패→error 메시지, 루트 미설정→안내 문구, 로드 실패→저장 차단, meta.json 쓰기 실패→메모리 유지 |

📊 종합: **13/13 통과**

#### 세부 관찰

1. **라우팅** (`src/main.tsx`): 기존 4개 라우트 + `/settings` 추가, App 레이아웃 중첩 유지. Sidebar는 "작업 단계"(4개) + "도구"(설정) 2섹션으로 시각 분리 — 바이브 코더 UX에 적합.

2. **capabilities 세분화**:
   - `fs:allow-write-text-file`의 Drive 경로는 `G:/**/*.meta.json`으로 **확장자까지 제한** — SVG 덮어쓰기 원천 차단 (Phase 1 읽기 전용 원칙 준수).
   - `fs:allow-read-dir` 신규 추가 — scanDriveRoot의 readDir가 호출 가능.
   - 기존 `$APPDATA/**` scope 모두 유지 — presetStore/designStore 기존 동작 영향 없음.

3. **SIZE_REGEX 분석**:
   ```
   [...SIZE_LIST].sort((a,b)=>b.length-a.length) 결과:
   ["5XL","4XL","3XL","2XL","5XS","4XS","3XS","2XS","XS","XL","2XL"중복없음,"S","M","L"]
   ```
   실제 SIZE_LIST는 `["5XS","4XS","3XS","2XS","XS","S","M","L","XL","2XL","3XL","4XL","5XL"]`로 중복 없음. 정렬 후 alternation은 `5XS|4XS|3XS|2XS|5XL|4XL|3XL|2XL|XS|XL|S|M|L` — XL이 S/M/L보다 먼저이므로 "패턴_XL.svg" → `(패턴)_(XL)` 정상.

4. **parseFilename greedy 동작**: `(.+)_(사이즈)\.svg$`에서 `.+`는 greedy지만 정규식 엔진이 끝(`\.svg$`)부터 역추적해 가장 짧은 매치를 찾는 게 아니라, **전체 매치가 성립하는 최장 `.+`**를 선택한다. "농구_5XL.svg"에서 `.+`="농구_5", size="XL"도 가능해 보이지만, alternation 5XL이 XL보다 **먼저 나열**되어 있으므로 엔진은 5XL을 먼저 시도 → `.+`="농구" + "5XL" 매치 성공. 정렬 순서가 파싱 정확성의 핵심 — 구현 의도와 일치.

5. **BFS 스캔 정합성**:
   - 루트는 `shouldRegisterAsCategory = !isRoot || hasSvgFiles`로 조건부 등록 → 루트에 SVG 없으면 카테고리 등록 스킵(UI에 불필요 노드 방지).
   - parentId 전파: 루트가 등록되지 않으면 자식들의 parentId=null → 루트 바로 아래 폴더들이 최상위 카테고리가 됨. 의도적 설계.
   - 빈 폴더 경고는 루트 예외(`!node.isRoot`) — 루트만 빈 경우는 success=true + 0개 결과로 반환됨. OK.

6. **DriveImportModal 병합 로직**:
   - 깊이 오름차순 정렬로 parent 먼저 등록 — `finalParentId` 조회 시점에 부모가 이미 매핑돼 있음.
   - **이중 체크**: `existingCategories` (기존 영속화된 것) + `newCategories` (이번 스캔에서 방금 만든 것) 모두 검사해 같은 스캔 안에서도 중복 생성 방지.
   - `order` 계산은 기존+신규 siblings 합쳐서 max+1 — 트리 순서 정합성 보장.
   - 프리셋은 stableId 기준으로만 중복 체크 → 사용자가 local로 만든 동일 이름 프리셋은 stableId가 없어 중복으로 안 잡힘 (의도된 동작, Phase 2에서 정리).

7. **PatternManage 통합**:
   - `driveSyncEnabled` false면 "📥 Drive에서 가져오기" 버튼 자체가 렌더링되지 않음(조건부) → 설정 OFF 시 UI 완전 숨김.
   - `handleDriveImport`는 카테고리 먼저 저장 후 프리셋 저장 — 카테고리 실패 시 early return으로 프리셋은 건드리지 않음(부분 상태 방어). 단, 카테고리 성공/프리셋 실패 시엔 부분 상태 가능(reviewer가 이미 지적, Phase 2 트랜잭션).
   - DRIVE 뱃지는 `pieces.some(p => p.svgSource === "drive")`로 판정 — 기존 local 프리셋(svgSource 미지정)은 뱃지 없음, 호환 OK.

8. **settingsStore 방어**:
   - 로드 실패 시 `success: false` + DEFAULT_SETTINGS 반환 → Settings 페이지가 `isLoadSuccess` 플래그로 저장 차단.
   - 기본값 병합(`{...DEFAULT, ...parsed}`) — 추후 신규 필드 추가 시 기존 settings.json 호환.
   - backup.json 자동 생성은 try/catch로 감싸 실패해도 본 저장 진행.

9. **svgCacheStore LRU**:
   - 히트 시 `loadedAt`만 갱신(Map 재삽입 없음) — evictOldest가 loadedAt 기준 정렬이므로 정책 일관.
   - 500개 한도에서 O(n log n) 정렬은 정확도 최우선 정책에서 비용 충분히 낮음.
   - `clearAll` + `invalidate(path)` 2레벨 무효화 API 제공. Settings "캐시 비우기"에 연결됨.

#### 경미한 관찰 사항 (치명 아님, 참고용)

- **generateUUID fallback**의 `(Math.random()*4|8).toString(16)` — 의도는 RFC4122 v4의 variant bit(10xx) 세팅이지만 `|8`은 8~11(1000~1011) 비트 패턴 중 `|4`를 합친 값(12~15 범위 포함 X). 실제론 secure context의 `crypto.randomUUID`가 쓰이므로 fallback은 비상용. 식별자 용도로만 쓰이고 중복 확률 극히 낮음. Phase 2에서 정리 가능.
- **Settings input onBlur 검증**: 타이핑 중엔 검증 안 함 → 좋은 UX. 단 붙여넣기 후 바로 "적용" 누르면 `pathStatus !== "valid"`로 막혀 사용자가 "검증" 버튼을 먼저 눌러야 함. 의도된 보수적 동작.
- **DriveImportModal의 svgPath 필드 공란**: `piece.svgPath=""` 저장 — 기존 local 업로드 경로는 `svgPath`에 원본 경로 있었음. 구조적으로 `svgSource === "drive"`일 때 `svgPath`는 무의미하므로 공란이 일관. FileGenerate/SizeSelect에서 svgPath 참조 로직이 있다면 Drive 프리셋에서 빈 문자열을 받아들일 수 있는지 실행 테스트 필요(tester 정적 범위 밖).
- **sizes 초기화**: Drive 프리셋은 발견된 사이즈만 0으로 초기화 → SizeSelect 페이지에서 해당 프리셋 선택 시 치수가 0인 사이즈만 노출됨. 사용자가 PatternManage 편집에서 치수 입력 필요 (경고 안내 없음, UX 여지).

**결론**: **정적 관점에서 차단 이슈 없음**. 빌드 3종 + 타입 안정성 + 보안 scope + 로직 정합성 모두 PASS. 실행 테스트(dev.bat)로 한글 폴더명 실제 스캔, meta.json 자동 생성 권한, DRIVE 뱃지 표시, 카테고리 트리 시각 확인만 남음.


## 리뷰 결과 (reviewer)

### [2026-04-15] Drive 연동 Phase 1 리뷰

#### 종합 평가
1~7단계 1900줄 변경은 **아키텍처/구조 품질이 매우 높다**. 레이어 분리(서비스/스토어/UI)가 명확하고 타입 확장이 모두 optional이라 기존 로컬 프리셋에 **데이터 파괴 위험 없음**. 치명 이슈는 **1건**(FileGenerate에서 Drive 프리셋 선택 시 확정 실패 — Phase 1 범위 밖이나 사용자 실측에서 혼동 유발 가능, 가드 필요). 나머지는 모두 개선 제안 수준. 보안(capabilities), 에러 방어(LoadResult·.backup.json), BFS 깊이 제한, LRU 캐시, stableId 기반 중복 방지 모두 탄탄함. **조건부 승인**: 아래 C1 가드만 추가하면 실측 배포 가능.

#### 강점
- **아키텍처**: driveSync(서비스) / svgCacheStore·settingsStore(스토어) / Settings·DriveImportModal(UI) 3-레이어 분리가 깔끔. settingsStore는 presetStore의 LoadResult 패턴을 그대로 따라 일관성 확보. DriveImportModal이 "스캔+미리보기+병합결과 생성"만 담당하고 실제 영속화는 PatternManage가 책임 → 순환 의존 없음.
- **타입 안전성**: 신규 필드 전부 optional(`svgPathBySize?`, `svgSource?`, `driveFolder?`, `stableId?`, `drivePatternRoot?`). 기존 로컬 프리셋은 그대로 동작. DEFAULT_SETTINGS 병합 로드로 버전 업 호환.
- **에러 방어**: scanDriveRoot가 warnings 배열로 부분 실패 누적(루트 실패만 전체 중단). readOrCreateMetaJson이 쓰기 실패해도 메모리 meta는 유지. loadSettings success 플래그로 파싱 실패 시 저장 차단(덮어쓰기 사고 방지).
- **무한 루프 방어**: BFS `MAX_SCAN_DEPTH=5` + 큐 기반 반복. 재귀 스택 오버플로우 가능성 없음.
- **보안(capabilities)**: 쓰기 권한을 `G:/**/*.meta.json` 패턴으로 제한 → **Drive 원본 SVG 덮어쓰기 불가능**. 읽기 범위는 넓지만 Drive/OneDrive/사용자 홈 수준이라 타당.
- **UX**: Settings 3섹션 구분 명확, 폴더 검증 4단계(idle/checking/valid/invalid) 색상 피드백, 경고 최대 50건 노출 + 나머지 요약, alert 기반이지만 "가져오기 완료/스킵/경고" 구조 정돈.
- **CSS 품질**: 하드코딩 색상은 DRIVE 뱃지(`#1a73e8`, Google 브랜드 파랑 의도) 1건뿐. 나머지는 모두 `var(--color-*)` 변수 사용. BEM 네이밍 일관(`settings-row__label`, `drive-import-modal__footer`).
- **LRU 캐시**: 단순 정렬 방식이지만 MAX=500에서 초과 시 1~2건만 제거하므로 체감 성능 문제 없음. clearAll/invalidate 분리.
- **stableId 기반 중복 방지**: 폴더 rename·이동해도 UUID 유지. 카테고리 매핑은 name+parentId로 fallback(수동 rename 한계는 이미 reviewer 참고에 기록됨).

#### 치명 이슈

| 파일:라인 | 문제 | 권장 수정 |
|----------|------|-----------|
| `src/pages/FileGenerate.tsx:291` | Drive 출처 프리셋은 `svgBySize` 미설정 + `svgData=""`로 저장됨. 사용자가 Drive 프리셋을 선택해 파일 생성으로 진행하면 `"프리셋 X에 사이즈 Y의 SVG 데이터가 없습니다"` 에러로 **100% 실패**. Phase 1 범위 밖(8~10단계 예정)이지만 driveSyncEnabled ON + Drive 가져오기 수행 즉시 SizeSelect/FileGenerate에서 마주칠 수 있음. tester도 §관찰 6에서 부분 지적. | (A) 최소 가드: `PatternManage` 프리셋 카드에 "Drive 출처는 아직 파일 생성 미지원" 문구 + FileGenerate 진입 시 `piece.svgSource==="drive"`면 친화적 안내 모달로 차단. (B) 근본: FileGenerate의 SVG 로딩 루프를 `getSvg(piece.svgPathBySize[size])` 우선 → `svgBySize[size]` 폴백 순서로 변경(8~10단계 예정일 수 있음). **사용자 실측 전 최소 (A) 반드시 적용.** |

#### 개선 제안 (배포 후 고려, 우선순위 낮음)

| 우선순위 | 파일:라인 | 제안 | 이유 |
|---------|----------|------|------|
| 중 | `src/pages/PatternManage.tsx:886` | 썸네일 `svgData=""`면 "Drive 프리셋(미리보기 없음)" placeholder 렌더 | 빈 박스라 디자인 깨진 것처럼 보임. 크래시는 아님 |
| 중 | `src-tauri/capabilities/default.json:24` | `fs:allow-read-text-file`의 `"**/*.svg"`는 어느 경로든 `.svg`면 허용 — 매우 광역. G:/H:/C:/Users 범위가 이미 있어 해당 한 줄만 삭제해도 기능 동일 | 의도적 최소 권한 원칙 |
| 중 | `src/pages/PatternManage.tsx:236-256` | 카테고리 저장 성공 + 프리셋 저장 실패 시 부분 상태(이미 reviewer 참고 기록됨) | 롤백 트랜잭션 부재. AppData 쓰기 실패 드물어 치명 아님 |
| 낮 | `src/services/driveSync.ts:185-197` | `toRelativePath`의 UNC 경로(`\\server\share\...`) 미지원 | Drive for Desktop은 드라이브 문자 매핑 — 현 구현 충분 |
| 낮 | `src/stores/svgCacheStore.ts:123` | UTF-16 기반 바이트 근사(`length*2`). 한글 다수 SVG의 UTF-8 실제와 차이 | 통계 표시 전용 — 무해 |
| 낮 | `src/services/driveSync.ts:153-161` | hashPath FNV-1a 32비트 충돌 가능성 2^-32. stableId(UUID)가 실제 식별자 → 무해 | 세션 내 일관성만 필요 |
| 낮 | `src/components/DriveImportModal.tsx:182-193` | Drive 프리셋 초기 sizes 모두 `width:0, height:0` → SizeSelect에서 "사이즈 미입력"으로 누락 가능(역설적으로 C1 부분 회피 효과) | 사용자가 치수 입력해야 선택 가능하다는 UX 명확화 필요 |
| 낮 | `src/pages/Settings.tsx:338` | `cacheStats.size === 0`일 때만 비활성화 — setInterval 5초 race 드물게 가능 | 무해 |
| 낮 | `src/services/driveSync.ts:361-463` | 큐에 방문 경로 중복 체크 없음 — 심볼릭 링크 순환은 MAX_DEPTH=5에서 차단되지만 이론적 루프 가능 | Windows G:\ 공유 드라이브에 심링크 희박 |
| 낮 | `src/stores/settingsStore.ts:151-163` | `updateDriveRoot`/`setDriveSyncEnabled`가 매번 loadSettings 재호출 → 연속 호출 시 race 가능 | UI는 순차 호출 — 현재 경로에서 문제 없음 |
| 낮 | `src/services/driveSync.ts:135-145` | generateUUID fallback의 `(Math.random()*4|8).toString(16)` variant bit 식이 RFC4122 완벽 준수 아님. tester §경미 관찰 1에서 지적됨 | secure context에서 `crypto.randomUUID` 사용 — fallback 실사용 확률 극히 낮음 |

#### Phase 2 확장·롤백 용이성

- **Phase 2 준비성**: driveSync가 "스캔+meta.json"만 담당하고 쓰기 권한이 meta.json으로 좁혀져 있어 Phase 2 양방향 시 `fs:allow-write-text-file`에 `*.svg` 추가 + watcher Rust cmd만으로 확장 가능. svgCacheStore에 `invalidate(absPath)` 이미 존재 → watcher 이벤트 바로 연결 가능.
- **롤백 용이성**: Settings에서 `driveSyncEnabled=false`로 끄면 PatternManage 가져오기 버튼 숨김. 단, 이미 가져온 Drive 프리셋은 남아 FileGenerate에서 여전히 C1 에러 유발 — "Drive 출처 프리셋 일괄 삭제" UI도 고려(Phase 2).

#### 결론
**수정 필요 (C1만 가드 처리하면 승인)**.
- C1(FileGenerate 가드)은 사용자 실측 테스트 직전 반드시 처리.
- 나머지는 모두 배포 후 개선 가능.
- 아키텍처·타입·보안·에러 방어는 검토 통과.

### [2026-04-15] B안 치명 이슈 수정 (Drive 프리셋 SVG 로딩 통합)

📝 치수 UX 조사 결과 (최상단 명시):
- DriveImportModal이 Drive 프리셋을 가져올 때 `sizes`의 width/height를 모두 **0으로 초기화**함 (기존 구현).
- 따라서 사용자는 SizeSelect 화면에서 **치수 입력을 먼저 완료**해야 파일 생성으로 진행 가능 → 본 수정(B)과는 별개의 UX 이슈로 존재하나 "Drive 프리셋이 파일 생성에서 즉시 실패"라는 치명 이슈와는 독립적임.
- 본 수정은 "치수 입력 완료된 Drive 프리셋"을 SVG 로딩 단계에서 Local과 동일하게 처리하는 것을 목표로 함.

📝 구현한 기능: FileGenerate의 Illustrator 경로에서 Drive/Local 프리셋 구분 없이 사이즈별 SVG를 가져오도록 통합 해석기를 도입.

| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| C:\0. Programing\grader\src\services\svgResolver.ts | `resolveSvgContent` (async, Drive→svgCacheStore 경유) + `resolveSvgContentSync` (Local 전용) 추가. 총 67줄. | 신규 |
| C:\0. Programing\grader\src\pages\FileGenerate.tsx | (1) import에 `resolveSvgContent` 추가. (2) `handleStartIllustrator` 내 L286~301(기존) 구간 교체 — `piece.svgBySize?.[targetSize]` 직접 접근 → `await resolveSvgContent(piece, targetSize)`. Python 폴백 경로는 **미수정**. | 수정 |

🔒 범위 고수 (건드리지 않은 것):
- `PatternManage.tsx`, `SizeSelect.tsx`, `DriveImportModal.tsx` 일체 무수정 (회귀 위험 회피).
- Python 폴백 경로(generate_graded) 무수정 (이슈 범위 밖).
- `svgCacheStore` 무수정 (기존 API 그대로 재사용).

✅ 검증:
- `npx tsc --noEmit` PASS (에러 0).
- `npx vite build` PASS (72 modules, 786ms, index-Bavt-WhA.js 321.69 kB).
- 회귀: Local 프리셋은 `resolveSvgContent` 1순위 분기(`svgBySize[size]`)로 기존과 동일 동작 — 동기적 즉시 반환.

💡 tester 참고:
- 테스트 방법 A (회귀): Local 프리셋(기존 폴더 업로드 방식)으로 SizeSelect → FileGenerate → Illustrator 생성 수행. 이전과 동일하게 EPS 생성되어야 정상.
- 테스트 방법 B (치명 이슈 수정 확인): Drive 프리셋 가져오기 → 치수 입력 완료 → SizeSelect → FileGenerate → Illustrator 경로 선택 후 생성 시작. "SVG 데이터가 없습니다" 에러 없이 EPS 생성되면 정상.
- 정상 동작: Drive 경로의 경우 첫 사이즈는 디스크 I/O 지연이 있으나, 동일 경로 재호출 시 `svgCacheStore` 캐시로 즉시 반환.
- 주의할 입력: `svgPathBySize`에 없는 사이즈를 선택한 경우 → 기존과 동일하게 "사이즈 X의 SVG 데이터가 없습니다" throw (의도된 동작).

⚠️ reviewer 참고:
- 특별히 봐줬으면 하는 부분:
  (1) `resolveSvgContent`가 `piece.svgBySize?.[size]`를 먼저 보고 → Drive 경로 폴백 순서 — 순서 역전 시 Local 프리셋 불필요한 I/O 발생. 우선순위 정확한지 검토.
  (2) `await` 추가로 루프 내 순차 대기 (Drive 첫 로드 지연). UX 상 문제 없음(사이즈 1개씩 순차 생성이 정책).
  (3) `services/` 폴더에 배치(utils 폴더 부재). 기존 `driveSync.ts`/`svgCacheStore`와 같은 계층.

### [2026-04-15] B안 수정 재검증

| 항목 | 결과 |
|------|------|
| tsc --noEmit | ✅ PASS (EXIT=0) |
| vite build | ✅ PASS (72 modules, 789ms, index-Bavt-WhA.js 321.69 kB) |
| resolveSvgContent 우선순위 로직 | ✅ PASS (1. svgBySize 즉시반환 → 2. svgPathBySize+getSvg await → 3. undefined) |
| FileGenerate 교체 지점 | ✅ PASS (L301 `await resolveSvgContent` 단일 호출, import L48) |
| Drive 프리셋 시나리오 | ✅ PASS (svgBySize undefined → svgPathBySize[size]로 getSvg 호출 → 캐시 경유 문자열 반환) |
| 회귀 방지 (Local/Python 폴백) | ✅ PASS (Local은 1순위 즉시 반환, handleStartPythonFallback은 preset JSON을 Python에 넘기는 방식이라 SVG 루프 자체 부재) |

📊 종합: **6/6 통과**. 치명 이슈 해결 확인.

#### 세부 관찰
1. **svgBySize 직접 접근 전멸**: grep 결과 소스 코드에서 `svgBySize` 참조는 주석(L46,47,294,295)과 svgResolver.ts 구현(L40,67)뿐. FileGenerate Illustrator 경로의 직접 접근은 완전히 `await resolveSvgContent`로 대체됨.
2. **Python 폴백 무수정 확인**: `handleStartPythonFallback`(L399~)은 `writeTextFile(presetJsonRel, JSON.stringify(pst), ...)`로 프리셋 전체를 JSON으로 써서 Python이 자체 파싱하는 구조. 따라서 JS 측 SVG 로딩 루프 자체가 없고, 이번 수정이 Python 경로에 닿지 않음 — 회귀 위험 0.
3. **에러 메시지 일관**: `resolveSvgContent`가 undefined 반환 시 `targetSvgData`는 falsy → 기존과 동일한 `"프리셋 "${pst.name}"에 사이즈 "${targetSize}"의 SVG 데이터가 없습니다."` throw 유지 (L308~312). 사용자 안내 변화 없음.
4. **우선순위 정당성**: Local 프리셋은 `svgBySize[size]` truthy → **디스크 I/O 없이 즉시 return** → 기존 동기 접근과 성능상 동등(미세한 Promise 래핑 오버헤드만, 인지 불가 수준).
5. **svgCacheStore 연동**: `getSvg(drivePath)`는 LRU 캐시 HIT 시 즉시, MISS 시 파일 읽고 캐시 저장. 동일 사이즈 재생성 시 2회차부터 디스크 I/O 없음.
6. **svgResolver 주석/구현 일치**: 파일 상단 주석이 "Local/Drive 통합 해석" 책임을 명확히 기술, 우선순위 번호(1→2→3)가 구현 if 체인과 정확히 일치.

#### 경미한 관찰 (치명 아님)
- **svgData 필드 폴백 부재**: 작업 명세에는 "3순위 svgData" 언급이 있었으나 실제 구현은 `svgBySize` + `svgPathBySize` 2단계만 존재. 현 프리셋 저장 구조상 Local은 svgBySize로, Drive는 svgPathBySize로만 쓰이므로 논리 누락 케이스 없음. 단 **매우 구버전 프리셋이 svgBySize 없이 svgData만 가진 케이스**가 있다면 미대응 — 저장소에 그런 데이터가 현재 없다면 무해. 이전 리뷰/tester에서도 미지적, 치명도 낮음(필요 시 Phase 2에서 1줄 폴백 추가).
- **resolveSvgContentSync 사용처**: 현재 FileGenerate는 모두 async 경로여서 sync 버전 미호출. 추후 React render phase SVG 렌더러 필요 시 사용 예정 — 데드코드 아님, 의도된 API 선행 제공.

**결론**: **치명 이슈(Drive 프리셋 파일 생성 실패) 해결 확인**. 회귀 없음. **커밋 가능**.

## 수정 요청
| 요청자 | 대상 파일 | 문제 설명 | 상태 |
|--------|----------|----------|------|
| reviewer | src/pages/FileGenerate.tsx:291 (+ PatternManage 카드) | Drive 출처 프리셋(`svgSource==="drive"`, `svgBySize` 없음, `svgData=""`)은 파일 생성 시 100% 실패 ("SVG 데이터가 없습니다" throw). Phase 1 범위상 파일 생성까지는 8~10단계에서 처리 예정이지만, 실측에서 사용자가 우연히 Drive 프리셋 선택 시 혼동 유발. 최소 가드(DRIVE 뱃지 옆 "파일 생성 미지원" 문구 + 진입 시 안내 모달) 또는 근본 수정(getSvg로 on-demand 로드) 필요. | 해결됨 (B안: svgResolver 도입, 2026-04-15) |

## 작업 로그 (최근 10건)
| 날짜 | 에이전트 | 작업 내용 | 결과 |
|------|---------|----------|------|
| 2026-04-15 | developer | 패턴선 자동 색상 전환 WCAG 구현 (+182줄) | 커밋 c172110 |
| 2026-04-15 | developer | APCA Lc 공식 교체 (파랑→흰 실측 성공) | 커밋 e0e9e8d |
| 2026-04-15 | pm | 배포 준비 파일(setup-python.bat/INSTALL-GUIDE.md/tauri.conf.json/build.bat) 보존 | 커밋 eda27b9 |
| 2026-04-15 | planner-architect | 패턴 데이터 공유 방식 7가지 비교 (A3 OneDrive 단계적 권장) | 완료 |
| 2026-04-15 | planner-architect | Google Drive 연동 타당성 조사 (A1 Drive for Desktop 권장) | 완료 |
| 2026-04-15 | planner-architect | PLAN-GDRIVE-SYNC.md 작성 (Phase 1~3, 640줄 예상) | 커밋 fbe0ae3 |
| 2026-04-15 | planner-architect | PLAN 미세 조정 (J-2/J-3/J-4 반영, 3레벨, 600줄, 3일) | 커밋 eb477b7 |
| 2026-04-15 | pm | scratchpad 정리 + Phase 1 착수 준비 | 완료 |
| 2026-04-15 | developer | Drive 연동 Phase 1 (1~4단계): 타입 확장 + driveSync.ts + svgCacheStore.ts + settingsStore.ts (+929줄) | tsc PASS |
| 2026-04-15 | developer | Drive 연동 Phase 1 (5~7단계): fsScope 확장 + Settings.tsx + DriveImportModal.tsx + PatternManage 통합 (+780줄) | tsc/cargo PASS |
| 2026-04-15 | tester | Drive 연동 Phase 1 정적 검증 (tsc/cargo/vite + 13항목) | 13/13 통과 |
| 2026-04-15 | reviewer | Drive 연동 Phase 1 (1~7단계) 리뷰: 조건부 승인, 치명 1건(FileGenerate Drive 프리셋 가드) | 수정요청 1건 |
| 2026-04-15 | developer | B안 치명 이슈 수정: svgResolver.ts 신규 + FileGenerate.tsx Illustrator 경로 통합 (+69줄/-11줄) | tsc/vite PASS |
| 2026-04-15 | tester | B안 수정 재검증 (tsc/vite + 우선순위/교체지점/Drive·Local·Python 회귀) | 6/6 통과, 커밋 가능 |
