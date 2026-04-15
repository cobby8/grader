# 작업 스크래치패드

## 현재 작업
- **요청**: Drive 연동을 "경량 자동 동기화" 방식(옵션 4)으로 리팩터 — 가져오기 버튼 제거, 자동 스캔/병합
- **상태**: ✅ developer 구현 완료 (tsc/build PASS) → tester 검증 대기
- **현재 담당**: tester
- **사용자 결정 (A-B-B-A-B)**:
  - Q1=자동 동기화 (패턴관리 진입 시)
  - Q2=파일 사라지면 카드 유지 + "파일 없음" 배지
  - Q3=경고는 로그만, 설정에서 최근 경고 보기
  - Q4=meta.json 유지 (안정 식별자)
  - Q5=옵션 4 채택

### 🔜 진행 순서
1. 🔨 Phase A (1일): 가져오기 버튼 즉시 자동 실행 + 경고 alert 제거 + 앱 시작/페이지 진입 자동 동기화
2. 🔨 Phase B (1일): DriveImportModal 파일 삭제 + mergeDriveScanResult 전용 함수 + 쿨다운
3. 🧪 실측 + 검증
4. ✅ 커밋 → 푸시
5. (Phase C는 FS watcher + "파일 없음" 배지, Phase 2에서)

## 진행 현황표
| 단계 | 내용 | 상태 |
|------|------|------|
| 0~6 | 기획/세팅/프리셋/디자인/사이즈/CMYK/통합테스트 | ✅ 완료 |
| 7 | Illustrator ExtendScript + APCA | ✅ 완료 |
| 8 | 설치형 배포 준비 | ⏸ 보류 (eda27b9) |
| 9 | Drive 연동 Phase 1 (가져오기 방식) | ✅ 커밋 bd0f752~4367af0 |
| 10 | Drive 연동 옵션 4 (자동 동기화 리팩터) | 🔨 착수 |
| 11 | Drive 연동 Phase 2 (양방향/watcher/삭제 감지) | ⏳ 대기 |

## 프로젝트 핵심 정보

### 기술 스택
- Tauri 2.x + React 19 + TypeScript + react-router-dom 7
- Python 엔진 (PyMuPDF/reportlab/pillow/openpyxl)
- 빌드: `dev.bat` (MSVC), 배포: `build.bat`
- CSS: 순수 CSS + BEM (Tailwind 금지)

### 주요 파일
```
grader/
├── src/pages/ (PatternManage, DesignUpload, SizeSelect, FileGenerate, Settings)
├── src/components/ (Sidebar, CategoryTree, DriveImportModal)
├── src/services/ (driveSync, svgResolver)
├── src/stores/ (presetStore, designStore, categoryStore, generationStore, svgCacheStore, settingsStore)
├── src/types/ (pattern, design, generation, order)
├── src-tauri/ (Rust: run_python + Illustrator 커맨드 + capabilities)
├── python-engine/ (PDF 분석)
├── illustrator-scripts/grading.jsx (ES3, 1610줄)
└── REPORT*.md, PLAN-GDRIVE-SYNC.md
```

### 데이터 저장
- `$APPDATA/com.grader.app/` 아래 presets.json / categories.json / designs.json / settings.json + designs/*.pdf
- Drive: `G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG`
- Drive 스캔: 최대 깊이 20, 파일명 `{패턴명}_{사이즈}.svg` (구분자 `[\s_\-]+` 허용)

## 기획설계 (planner-architect)

### [2026-04-15] Drive 폴더 직접 표시 방식 재검토 → 옵션 4 채택

**결론**: 사용자 속뜻(가져오기 버튼 귀찮음 + 경고 부담)을 충족하되, 그레이딩 호환성 유지.

**기각된 대안**:
- 옵션 2 (파일 그대로 표시): 사이즈 그룹핑 상실 → 그레이딩 붕괴
- 옵션 3 (실시간 메모리): 치수 데이터 보존 필요 → 샛길 복잡도 증가

**옵션 4 변경 범위 (예상 -450줄/+190줄 = 순 -260줄)**:
- DriveImportModal.tsx 파일 삭제
- PatternManage 진입 시 자동 스캔 + 쿨다운 60초
- 경고 alert 제거 (콘솔 로그)
- mergeDriveScanResult() 전용 함수 (치수 보존 + svgPathBySize 갱신)

**치수 보존 전략**: stableId 매칭 시 기존 presets.json의 사용자 입력 치수 **덮어쓰지 않음**

## 구현 기록 (developer)

### [2026-04-15] Drive 연동 옵션 4 — 자동 동기화 리팩터

📝 구현한 기능: Drive 가져오기 버튼/모달을 제거하고, PatternManage 진입 시 자동으로 스캔·병합하는 경량 동기화.

| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| src/services/driveSync.ts | `mergeDriveScanResult()` 함수 + `MergeResult` 타입 추가 (+180줄) | 수정 |
| src/pages/PatternManage.tsx | DriveImportModal 제거, `runAutoSync` useCallback + 쿨다운 useRef + 자동 트리거 useEffect 추가, 가져오기 버튼 삭제 | 수정 |
| src/components/DriveImportModal.tsx | 파일 전체 삭제 (-388줄) | 삭제 |

**핵심 구현 포인트**:
- **치수 보존 전략**: `mergeDriveScanResult`에서 stableId 매칭 시 `{...existing, pieces: updatedPieces, driveFolder, updatedAt}` 구조로 기존 preset을 유지. `sizes`, `svgData`, `svgBySize`, `name`, `categoryId`는 spread로 이월되어 **덮어쓰지 않음**. 오직 `svgPathBySize`만 최신 스캔 결과로 교체.
- **파일 사라져도 카드 유지**: 이번 스캔에서 매칭되지 않은 기존 프리셋은 `updatedStableIds` 세트를 기준으로 필터링해서 그대로 `mergedPresets`에 포함 (Q2-B 사용자 결정).
- **쿨다운 60초**: `useRef<number>(0)`로 `lastAutoScanRef` 보유, `Date.now() - lastAutoScanRef.current < 60000`이면 스킵 + console.info. 중복 실행 방지용 `autoScanInFlightRef` 별도.
- **경고 alert 제거**: 모든 경고/완료 알림은 `console.info/warn`만 사용 (Q3-B).
- **useEffect 의존성**: `[isLoadSuccess, driveSyncEnabled, drivePatternRoot]` 3개만. presets/categories를 deps에 넣으면 동기화 후 presets 갱신 → useEffect 재실행 → 무한 루프 위험이 있어 의도적으로 제외 (쿨다운이 실제 스캔은 막지만 useEffect 재실행 자체도 피함).

**검증 결과**:
- `npx tsc --noEmit` PASS (에러 0)
- `npm run build` PASS (vite 780ms, 318.70 kB)

💡 tester 참고:
- 테스트 방법:
  1. Settings에서 driveSyncEnabled=true + drivePatternRoot 설정 후 PatternManage 진입 → 자동 스캔 확인 (개발자 도구 콘솔에 `[Drive 자동 동기화] 스캔 시작:` 로그)
  2. 이미 사이즈 치수를 입력해둔 Drive 프리셋이 있는 상태에서 PatternManage 재진입 → 치수 값이 유지되는지 확인
  3. 60초 내 재진입 → `[Drive 자동 동기화] 쿨다운 중 (N초 남음) — 스킵` 로그
  4. Drive 파일을 임의로 삭제 후 60초 경과 후 재진입 → 카드는 남아있지만 svgPathBySize에서 해당 사이즈가 빠졌는지 확인
- 정상 동작:
  - 가져오기 버튼 화면에서 사라짐
  - 신규 프리셋만 있으면 `[Drive 자동 동기화] 완료 — 신규 N, 갱신 0, 카테고리 M` 로그
  - 기존 프리셋 경로만 갱신되면 `신규 0, 갱신 N` 로그
- 주의할 입력:
  - driveSyncEnabled=false인 상태 → runAutoSync가 조기 return (스캔 안 함)
  - drivePatternRoot가 undefined → 조기 return

⚠️ reviewer 참고:
- `mergeDriveScanResult`의 "미매칭 기존 프리셋 보존" 로직(driveSync.ts 안쪽 for 루프). `updatedStableIds`가 Set이므로 O(1)이고, stableId 없는 로컬 업로드 프리셋도 그대로 유지.
- useEffect deps에 `runAutoSync`를 넣지 않은 설계 결정(의존성 경고는 eslint-disable로 처리). 무한 루프 방지 목적.
- DriveImportModal.tsx 삭제했으나 관련 CSS 클래스(`.drive-import-modal*`)는 index.css에 그대로 남아있음(다른 페이지에서 쓰지 않아 dead code). 정리는 reviewer 판단.

## 테스트 결과 (tester)

### [2026-04-15] 옵션 4 정적 검증

| 항목 | 결과 |
|------|------|
| tsc --noEmit | PASS |
| vite build | PASS (779ms, 318.70 kB) |
| 치수 보존 (sizes/svgBySize/svgData 무변경) | PASS |
| 파일 사라진 프리셋 보존 | PASS |
| 쿨다운 60초 + autoScanInFlight | PASS |
| useEffect 무한 루프 방지 | PASS |
| 기존 Drive 프리셋 svgPathBySize만 갱신 | PASS |
| Local 프리셋 무영향 | PASS |
| 경고 alert 제거 | PASS |
| DriveImportModal import 완전 제거 | PASS |
| 가져오기 버튼 JSX 제거 | PASS |

종합: 11/11 통과 — **커밋 가능**

**근거 요약**:
- driveSync.ts L618-639: `{...existing, pieces: updatedPieces, driveFolder, updatedAt}` — sizes/svgData/svgBySize/name/categoryId는 spread로만 이월(덮어쓰기 없음).
- driveSync.ts L676-679: `updatedStableIds` Set 제외 로직으로 미매칭 기존 프리셋 및 stableId 없는 로컬 프리셋 모두 보존.
- driveSync.ts L621: `piece.svgSource === "drive" || !piece.svgSource` + idx===0 가드 — Local 전용 피스는 건드리지 않음.
- PatternManage.tsx L134-136: `lastAutoScanRef`, `autoScanInFlightRef` 2종 방호.
- PatternManage.tsx L249-258: 60초 쿨다운 + 남은 시간 콘솔 로깅.
- PatternManage.tsx L261-262: in-flight 재진입 차단.
- PatternManage.tsx L340-343: deps=[isLoadSuccess, driveSyncEnabled, drivePatternRoot] + eslint-disable — presets/categories 자체가 deps에 없어 자동 동기화로 인한 재진입 폭주 원천 차단.
- runAutoSync 경로에서는 console.info/warn만 사용 (alert 0).
- src/components/ 에 DriveImportModal.tsx 파일 존재하지 않음(삭제 확인). src/ 내 활성 import 0건.
- PatternManage.tsx L868·L997: "제거됨" 주석만 남고 JSX 실체 없음.

**치명 아닌 관찰 사항**:
1. App.css L1726-1854 `.drive-import-modal*` CSS dead code 잔류 (reviewer도 동일 지적).
2. Settings.tsx L306 메시지 `"활성 (PatternManage에 가져오기 버튼 표시)"` — 이제 버튼이 없으므로 "페이지 진입 시 자동 동기화" 등으로 수정 권장.

## 리뷰 결과 (reviewer)

### [2026-04-15] 옵션 4 리뷰

#### 종합 평가
자동 동기화 리팩터는 **커밋 가능** 수준. 치수 보존 전략(sp.svgPathBySize만 교체 + 기존 sizes/svgData 이월)이 의도대로 구현되어 있고, 쿨다운·중복실행·무한루프 방지가 3중으로 안전하게 감싸져 있음. 치명 이슈 없음. DriveImportModal 참조는 완전히 제거되어 데드코드도 깨끗하게 정리됨. UX 피드백(동기화 진행 표시)과 CSS 잔존은 후속 개선 사항으로만 남김.

#### 강점
- **설계**: `mergeDriveScanResult`가 순수 함수로 분리되어 테스트·추론이 쉬움. `{...existing, pieces: updatedPieces, driveFolder, updatedAt}` 스프레드 순서도 올바름(나중 프로퍼티가 덮어쓰므로 `driveFolder/updatedAt`는 의도적 갱신, `sizes/name/categoryId`는 자동 이월).
- **치수 보존**: `piece.svgPathBySize`만 교체, `svgData/svgBySize/width/height`는 그대로. 게다가 `svgSource !== "drive"`인 local 피스는 map에서 원본 그대로 return(driveSync.ts:628) → 사용자 업로드 보호 완벽.
- **카테고리 매핑**: `parentId + name` 조합 중복 체크 + 깊이 오름차순 처리 → 계층 구조 안전.
- **미매칭 프리셋 보존**: Set 기반 O(1) 필터링으로 stableId 없는 local 프리셋도 자동 유지(driveSync.ts:676-679). Q2-B 결정 정확히 구현.
- **에러 방어**: scanResult.success=false, 카테고리 저장 실패, 프리셋 저장 실패, 예외 모두 console.warn으로 조용히 스킵. 실패 시 `lastAutoScanRef` 갱신 안 함 → 재시도 가능.
- **쿨다운 구현**: useRef 선택 적절(리렌더 방지), `autoScanInFlightRef`로 await 사이 재진입 race 차단.
- **useEffect 의존성**: `[isLoadSuccess, driveSyncEnabled, drivePatternRoot]` 3개 + eslint-disable 주석 + 장황한 주석까지 달아둠. Settings 토글 on/off는 정상 재실행됨.
- **롤백 용이성**: `scanDriveRoot`/`ScanResult`는 유지되어 있고 삭제분은 UI(Modal)뿐이라, 버튼 방식 복구 시 mergeDriveScanResult 무시 + Modal 복구만 하면 됨.

#### 치명 이슈
없음.

#### 개선 제안 (배포 후 고려, 우선순위 낮음)
| 우선순위 | 파일:라인 | 제안 |
|---------|----------|------|
| 낮음 | src/App.css:1728-1783 | `.drive-import-modal*` CSS 잔존(56줄). dead code이므로 다음 커밋에서 함께 제거하면 깔끔. 렌더에는 영향 없음. |
| 낮음 | PatternManage.tsx:240-330 | UX 피드백 부재 — 사용자는 콘솔을 안 볼 것이므로 "동기화되고 있음"을 인지하기 어려움. Phase 2에서 상태바나 토스트(예: "동기화 중… / 완료 신규 N 갱신 M") 추가 검토. 지금은 조용히 돌아가는 게 오히려 사용자 결정(A-B-B-A-B)에 부합. |
| 낮음 | PatternManage.tsx:324-330 | `runAutoSync` deps에 `presets/categories`가 있어 매 상태 변경 시 함수 레퍼런스는 재생성됨. useEffect는 이를 deps에 넣지 않아 문제 없지만, 향후 runAutoSync를 다른 곳에서 호출한다면 stale closure를 조심해야 함(현재 호출처가 useEffect 하나뿐이라 OK). |
| 낮음 | driveSync.ts:618-629 | `piece.svgSource`가 undefined인 기존(Phase 1 초기) 프리셋도 `svgSource === "drive"`로 승격됨. 이게 의도라면 OK(대부분 Drive 출처일 것이므로), 아니면 undefined는 건너뛰도록 명시적 분기 권장. 주석 근거 있으니 현재는 문제 없음. |
| 낮음 | driveSync.ts:558-565 | 동일 부모 아래 대소문자만 다른 카테고리 이름("Shirts" vs "shirts")은 다른 것으로 취급됨. Windows 파일시스템은 대소문자 무시라 실제 충돌 가능. 실측에서 문제 없으면 유지. |

결론: **커밋 가능**

## 수정 요청
| 요청자 | 대상 파일 | 문제 설명 | 상태 |
|--------|----------|----------|------|
| reviewer | src/App.css:1728-1783 | `.drive-import-modal*` CSS 잔존(56줄, dead code) — 다음 커밋에서 함께 제거 권장 | 제안 |
| tester | src/pages/Settings.tsx L306 | driveSyncEnabled 활성 안내 문구가 "PatternManage에 가져오기 버튼 표시"로 남아있음 — 버튼 제거됐으므로 "페이지 진입 시 자동 동기화" 등으로 수정 권장 (치명 아님) | 제안 |

### [2026-04-15] 트리 더블클릭 토글 + 앱 내 rename 제거 + Drive 읽기 전용

📝 구현한 기능: CategoryTree 더블클릭이 펼침/접힘 토글로 변경, 앱 내 카테고리 rename 기능 전체 제거, Drive 출처 카테고리/프리셋의 편집·삭제·하위추가 UI를 비활성화 + 읽기 전용 토스트 안내.

| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| src/types/pattern.ts | `PatternCategory.source?: "local" \| "drive"` 필드 추가 | 수정 |
| src/services/driveSync.ts | mergeDriveScanResult 신규 카테고리에 `source: "drive"` 지정 | 수정 |
| src/components/CategoryTree.tsx | rename state/UI/handler 전체 제거, 더블클릭=토글, Drive 카테고리 +/× 비활성화 + 토스트, onRenameCategory prop 제거 | 수정 |
| src/pages/PatternManage.tsx | handleRenameCategory 제거, isDrivePreset/isDriveCategoryById/showDriveReadonlyToast 헬퍼 추가, "+ 새 프리셋 추가"·편집·삭제 버튼 Drive 시 비활성화 | 수정 |

**핵심 구현 포인트**:
- **rename UI 완전 제거**: CategoryTree에서 `editing`, `editName`, `inputRef`, `useEffect`(focus), `commitRename`, `<input>` 분기 모두 삭제. `useState`만 import (`useRef`, `useEffect` 제거).
- **더블클릭 토글**: `onDoubleClick` → `toggleExpanded()` (자식 있을 때만). 화살표 토글과 동일한 동작이 행 더블클릭에서도 작동.
- **isDriveCategory(컴포넌트 내부)**: `category.source === "drive"`로 단순 판정. 자식 prefix 검사는 driveSync가 이미 source 필드를 부여하므로 불필요.
- **토스트 fallback**: 토스트 시스템 부재 → `alert("이 항목은 Google Drive에서만 수정할 수 있습니다.")`로 통일. CategoryTree 내부와 PatternManage 모두 동일 문구.
- **PatternManage 헬퍼**: `isDrivePreset(preset)` = `pieces.some(p => p.svgSource === "drive")`. `isDriveCategoryById(id)` = `categories.find(...).source === "drive"`.
- **+ 새 프리셋 추가**: `selectedCategory.type === "category" && isDriveCategoryById(id)`일 때만 비활성화. 전체/미분류는 영향 없음.
- **편집/삭제 버튼**: `disabled` 속성 + onClick 가드(이중 안전망). title에 비활성화 사유 표시.
- **루트 카테고리 추가 버튼**: 항상 활성화 유지 (사용자가 만드는 Local 루트는 source=undefined → local).

**검증 결과**:
- `npx tsc --noEmit` PASS (에러 0)
- `npm run build` PASS (vite 805ms, 319.07 kB)

💡 tester 참고:
- 테스트 방법:
  1. 카테고리 더블클릭 → 펼침/접힘 토글 동작 확인 (이전엔 입력창 진입했음)
  2. Drive 동기화 후 생성된 카테고리에 마우스 올리기 → +/× 버튼이 disabled 상태로 표시
  3. Drive 카테고리의 +/× 클릭 → "이 항목은 Google Drive에서만 수정할 수 있습니다." alert
  4. Drive 카테고리 선택 → "+ 새 프리셋 추가" 버튼 disabled
  5. Drive 프리셋 카드의 편집/삭제 버튼 disabled, 클릭 시 동일 alert
  6. Local 카테고리/프리셋은 모두 정상 동작 (편집/삭제/추가 다 가능)
- 정상 동작:
  - Local 카테고리: 더블클릭=토글, +/× 정상 동작
  - Drive 카테고리: 더블클릭=토글, +/× 비활성화 + 토스트
  - 루트 "+ 카테고리" 버튼은 항상 활성화 (Local 루트 추가는 가능)
- 주의할 입력:
  - 기존 categories.json에 source 필드가 없는 데이터 → undefined → "local"로 간주(정상)
  - Drive 동기화 전에 만들어진 Local 카테고리에 같은 이름의 Drive 폴더가 매칭될 경우, mergeDriveScanResult가 기존 카테고리 ID를 재사용하므로 그 카테고리는 source가 안 바뀜(Local로 유지됨). 의도 여부는 reviewer 판단.

⚠️ reviewer 참고:
- **알려진 한계**: mergeDriveScanResult가 "기존 카테고리 재사용 시 source를 drive로 승격"하지 않음. 기존 Local 카테고리("농구") 아래 Drive 폴더가 같은 이름이면, 그 카테고리는 Local로 남아 사용자가 rename/삭제 가능. 의도된 동작인지 결정 필요.
- **alert 사용**: 토스트 라이브러리 도입 비용 대비 alert가 가장 단순. 향후 Phase에서 toast UX 도입 시 한 곳(showDriveReadonlyToast 함수)만 교체.
- **CategoryTree IIFE 패턴**: PatternManage에서 `(() => { ... })()`로 buttons 분기를 감쌌음. 가독성 vs JSX 외부 함수 추출 트레이드오프 — 현재는 작아서 인라인 유지.

## 작업 로그 (최근 10건)
| 날짜 | 에이전트 | 작업 내용 | 결과 |
|------|---------|----------|------|
| 2026-04-15 | developer | Drive 연동 Phase 1 MVP (+2458줄, 15파일) | 커밋 bd0f752 |
| 2026-04-15 | developer | Drive 깊이 5→20 완화 (실측 6레벨) | 커밋 341aba6 |
| 2026-04-15 | developer | 파서 유연화(하이픈/공백) + 트리 폭 2배 | 커밋 51533f3 |
| 2026-04-15 | developer | 카테고리 정렬 + 단일 SVG 버그 수정 (원인 C) | 커밋 e289673 |
| 2026-04-15 | developer | 가져오기 버튼 활성화 + 트리 기본 접힘 + 빈 import 처리 | 커밋 4367af0 |
| 2026-04-15 | planner-architect | Drive 폴더 직접 표시 재검토 (4개 옵션 비교, 옵션 4 권장 44점) | 완료 |
| 2026-04-15 | pm | 10개 커밋 push + scratchpad 547→120줄 정리 | 완료 |
| 2026-04-15 | developer | Drive 옵션 4 리팩터 (mergeDriveScanResult + 자동 동기화 + 모달 삭제) tsc/build PASS | 커밋 대기 |
| 2026-04-15 | reviewer | Drive 옵션 4 리뷰 — 치명 이슈 없음, 커밋 가능 (CSS 잔존 개선만 후속) | 통과 |
| 2026-04-15 | tester | Drive 옵션 4 정적 검증 11/11 통과 (tsc/build/치수 보존/쿨다운/무한루프 방지 확인) | 커밋 가능 |
| 2026-04-15 | developer | 트리 더블클릭=토글 + rename 제거 + Drive 카테고리/프리셋 readonly UI (4파일, tsc/build PASS) | 커밋 대기 |
