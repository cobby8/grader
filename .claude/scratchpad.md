# 작업 스크래치패드

## 현재 작업
- **요청**: 작업 흐름 재설계 Phase 3 — 즐겨찾기 (⭐ 토글 + favorites.json + 필터)
- **상태**: 🔨 developer 착수 예정
- **현재 담당**: developer
- **상세 계획**: `PLAN-WORKFLOW-REDESIGN.md` (865줄)
- **사용자 결정**: A-A-A-A-A-A-A-B (권장안, Q4=A favorites.json 로컬)

### 🔜 남은 Phase
- **Phase 3 (1~2일, 진행 중)**: 즐겨찾기
- Phase 4 (2~3일): OrderGenerate 통합 (MVP 완료)
- Phase 5 (2~3일): PDF 파이프라인 제거 (MVP 후)
- Phase 6 (1일): 문서 정리

## 진행 현황표
| 단계 | 내용 | 상태 |
|------|------|------|
| 0~7 | 기본 기능(패턴/디자인/사이즈/CMYK/Illustrator/APCA) | ✅ 완료 |
| 8 | 설치형 배포 준비 | ⏸ 보류 (커밋 eda27b9) |
| 9 | Drive 연동 Phase 1 → 옵션 4 (자동 동기화) | ✅ 커밋 8ec96a3 외 |
| 10 | 작업 흐름 Phase 1 (WorkSetup + 세션) | ✅ 커밋 3efa370, ad3d073 |
| 11 | Phase 2 (패턴 선택 모드) | ✅ 커밋 3e5a069 |
| 11-Plus | 카드 간소화 + 조각 카운팅 + DRIVE 뱃지 제거 | ✅ 커밋 bc20e24, b01c974 |
| 12 | Phase 3 (즐겨찾기) | 🔨 착수 |
| 13 | Phase 4 (OrderGenerate 통합) | ⏳ 대기 |

## 프로젝트 핵심 정보

### 기술 스택
- Tauri 2.x + React 19 + TypeScript + react-router-dom 7
- Python 엔진 (PyMuPDF/reportlab/pillow/openpyxl)
- 빌드: `dev.bat` (MSVC), 배포: `build.bat`
- CSS: 순수 CSS + BEM (Tailwind 금지)

### 주요 파일
```
grader/
├── src/pages/ (WorkSetup, PatternManage, DesignUpload, SizeSelect, FileGenerate, Settings)
├── src/components/ (Sidebar, CategoryTree)
├── src/services/ (driveSync, svgResolver)
├── src/stores/ (sessionStore, presetStore, categoryStore, designStore, generationStore, svgCacheStore, settingsStore)
├── src/types/ (pattern, design, generation, order, session)
├── src-tauri/ (Rust + capabilities)
├── python-engine/ (PDF 분석 + 주문서 파서)
├── illustrator-scripts/grading.jsx (ES3, ~1610줄)
└── REPORT*.md, PLAN-GDRIVE-SYNC.md, PLAN-WORKFLOW-REDESIGN.md
```

### 데이터 저장
- `$APPDATA/com.grader.app/` presets.json / categories.json / settings.json
- Drive: `G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG` (자동 동기화 60초 쿨다운)
- 세션: sessionStorage key `grader.session` (workFolder, baseAiPath, selectedPresetId)
- (Phase 3 신규) `$APPDATA/com.grader.app/favorites.json`: preset stableId 배열

## 기획설계 (planner-architect)

### 상세 계획: `PLAN-WORKFLOW-REDESIGN.md`
- Phase 1~6 전체 계획 (MVP 5~7일)
- 사용자 결정 Q1~Q8 확정 (권장안 A-A-A-A-A-A-A-B)

### Phase 3 요구사항 (이번 세션)
- `favorites.json` 신규 스토어 (로컬, Drive 동기화 X)
- 프리셋 카드에 ⭐ 토글
- 상단에 "⭐ 즐겨찾기만 보기" 필터
- 즐겨찾기 가상 폴더 (카테고리 트리 최상단)

## 구현 기록 (developer)

### [2026-04-15] 작업 흐름 재설계 Phase 4 (OrderGenerate 통합) — 계획 제안

#### 기존 분석
- **SizeSelect.tsx (518줄)**: 프리셋/디자인 select + 주문서 업로드(`run_python parse_order`) + 사이즈 체크박스 그리드 + baseSize 드롭다운. `saveGenerationRequest`로 sessionStorage에 저장 후 `/generate` 이동.
- **FileGenerate.tsx (663줄)**: `loadGenerationRequest` → `loadPresets`/`loadDesigns` → `handleStart`:
  - `$APPDATA/outputs/{timestamp}/` 생성
  - Illustrator 존재 확인 (`find_illustrator_exe`)
  - 있으면 `handleStartIllustrator` (각 사이즈마다 `resolveSvgContent` → `write_file_absolute`로 temp SVG → config.json 기록 → `run_illustrator_script`)
  - 없으면 `handleStartPythonFallback` (calc_scale + generate_graded PDF)
- **grading.jsx**: config에 `designAiPath` 우선, `designPdfPath` 폴백. `resolveDesignFile()` 이미 분기 처리 중. 따로 baseSize 안 씀(SVG 치수로 자체 계산).
- **WorkSession 타입**: `workFolder`, `baseAiPath`, `selectedPresetId?`, `createdAt`만 있음. 주문서 경로 / baseSize 필드 없음.

#### 변경 계획
| 파일 | 변경 | 예상 라인 |
|------|------|----------|
| `src/pages/OrderGenerate.tsx` | 신규 (SizeSelect + FileGenerate 통합, Illustrator 전용) | ~450 |
| `src/main.tsx` | `/generate` → OrderGenerate로 교체, import 변경 | +2/-2 |
| `src/App.css` | (기존 `.size-section`, `.gen-result` 등 재활용, 신규 스타일 최소) | 선택 |

**유지 (이번 세션 건드리지 않음)**:
- `src/pages/FileGenerate.tsx` / `SizeSelect.tsx` — Phase 5에서 삭제 (지금은 import만 제거)
- `src/stores/designStore.ts`, `generationStore.ts` — Phase 5에서 삭제
- `src/types/session.ts` — 주문서 경로는 OrderGenerate 내부 state로만, session 스키마 수정 불필요
- `grading.jsx`, `pdf_handler.py`, `order_parser.py` — 수정 없음

#### 세부 설계

**세션 가드 (페이지 진입 시 useEffect)**:
```
const s = loadWorkSession();
if (!s?.workFolder || !s?.baseAiPath) { navigate("/work"); return; }
if (!s.selectedPresetId) { navigate("/pattern"); return; }
```

**상태 (useState)**:
- `session: WorkSession` (로드된 세션)
- `preset: PatternPreset | null` (selectedPresetId로 조회)
- `baseAiName: string` (baseAiPath에서 파일명 추출 + 확장자 제거)
- `selectedSizes: Set<string>` (Q7: 수동 체크 허용)
- `sizeQuantities: Map<string, number>` (주문서에서 추출한 수량, 옵션)
- `orderResult: OrderParseResult | null` (주문서 메타)
- `orderLoading: boolean`
- `baseSize: string` (디자인 기준 사이즈, 기본 "L")
- `results: GenerationResult[]`
- `generating: boolean`
- `globalError: string`

**UI 섹션 구성**:
1. **작업 요약 카드** (세션 정보 3줄):
   - 🎨 기준 AI: `{baseAiName.ai}`
   - 📁 작업 폴더: `{workFolder}`
   - ✅ 선택 패턴: `{preset.name}` (조각 N개, 사이즈 M개)
2. **주문서 (선택)** — `handleExcelUpload` (SizeSelect 로직 그대로 이식)
3. **사이즈 선택** — `.size-grid` 체크박스 (프리셋 등록 사이즈만 활성화). 주문서 업로드 시 자동 체크
4. **기준 사이즈 드롭다운** (baseSize 선택, 프리셋 등록 사이즈 중)
5. **생성 시작 버튼** + 진행 상태
6. **결과 목록** (`.gen-result-list` 재활용) + "작업 폴더 열기" 버튼

**핵심 차이 (FileGenerate 대비)**:
| 항목 | 기존 | 신규 OrderGenerate |
|------|------|-------------------|
| 입력 | GenerationRequest + DesignFile | WorkSession + preset |
| 출력 폴더 | `$APPDATA/outputs/{timestamp}/` | **`session.workFolder`** (바로 저장) |
| 출력 파일명 | `{sanitize(design.name)}_{size}.eps` | **`{sanitize(baseAiName)}_{size}.eps`** (Q6) |
| config | `designAiPath=storedPath` or `designPdfPath` | **항상 `designAiPath=session.baseAiPath`** |
| Python 폴백 | `handleStartPythonFallback` 존재 | **제거** (Q5) |
| Illustrator 미설치 | Python으로 대체 | **에러 다이얼로그**: "Illustrator 설치 필요" |

**출력 파일명 규칙 (Q6)**:
```
baseAiPath = "G:\...\V넥\농구_V넥_XL.ai"
baseAiName = "농구_V넥_XL"   // 확장자 제거
out = `{session.workFolder}\\{sanitizeFileName(baseAiName)}_{size}.eps`
```
이미 파일 있으면 덮어쓰기 (Phase 4는 경고 없음, Phase 5에서 다이얼로그 추가).

**config.json 포맷 (grading.jsx 호환)**:
```json
{
  "patternSvgPath": "{scriptsDir}\\temp_pattern_{size}.svg",
  "outputPath": "{workFolder}\\{baseAiName}_{size}.eps",
  "resultJsonPath": "{scriptsDir}\\result.json",
  "patternLineColor": "auto",
  "designAiPath": "{session.baseAiPath}"
}
```
→ grading.jsx는 이미 `designAiPath` 우선 처리. 수정 없음.

**Illustrator 없을 때 처리**:
```
if (!aiExePath) {
  setGlobalError("Adobe Illustrator가 설치되지 않았거나 찾을 수 없습니다. (Q5: Python 폴백 미지원)");
  setGenerating(false);
  return;
}
```

#### 위험/고려
- **세션 가드**: workFolder/baseAiPath 없을 때 `/work`로, selectedPresetId 없을 때 `/pattern`으로 분기. useEffect 1회 실행.
- **기존 FileGenerate 삭제 시점**: Phase 5. 이번 세션은 main.tsx import만 교체 (파일 존치). 동시에 돌리지 않도록 `/generate` 라우트만 새 컴포넌트로.
- **generationStore 참조**: OrderGenerate는 generationStore를 쓰지 않음 (session에서 직접 읽기). 기존 FileGenerate/SizeSelect는 남아있지만 라우트 연결이 끊어지므로 동작 안 함.
- **baseSize**: WorkSession에 저장 안 하고 페이지 로컬 상태로만 (기본 "L"). Phase 5에서 session 확장 검토.
- **주문서 경로 세션 저장**: 계획서 section 3.1엔 `orderFilePath?` 필드 있지만 이번 MVP에선 불필요(세션 재진입 시 다시 업로드해도 OK). 스킵.
- **에러 복원력**: 한 사이즈 실패해도 다음 사이즈 진행 (FileGenerate 패턴 유지).
- **z-index/CSS**: 기존 `.size-section`, `.size-grid`, `.size-cell`, `.gen-result-list`, `.size-footer` 그대로 재활용. 신규 CSS 0 또는 최소.

#### 구현 단계 (사용자 승인 후)
1. `src/pages/OrderGenerate.tsx` 신규 작성 (~450줄)
2. `src/main.tsx` import 교체 (FileGenerate → OrderGenerate)
3. `npx tsc --noEmit` 검증
4. `npm run build` 검증
5. 실제 Illustrator 실행 테스트는 tester가 수동

---

📝 구현한 기능: Phase 3 즐겨찾기 (⭐ 토글 + 필터, 가상 폴더 제외)

| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| `src/stores/favoritesStore.ts` | favorites.json 로드/저장 (presetStore 패턴: LoadResult, .backup.json, 중복 제거). `getFavoriteKey(preset)` 헬퍼로 stableId/id 폴백 | 신규 |
| `src/pages/PatternManage.tsx` | `favoriteKeys`(Set)/`showFavoritesOnly` state, 로드 useEffect, `handleToggleFavorite`(낙관적 업데이트+롤백+stopPropagation), `filteredPresets`에 즐겨찾기 필터 추가, 툴바에 "⭐ 즐겨찾기만 보기" pill 버튼 + 개수 뱃지, 카드 우상단 ⭐ 토글 버튼 | 수정 |
| `src/App.css` | `.preset-card__check` 우상단→좌상단 이동, `.preset-card__fav-toggle`(+`--active`) 신규, `.pattern-toolbar`+`.pattern-toolbar__fav-filter`(+`--active`)+`.pattern-toolbar__fav-icon`+`.pattern-toolbar__fav-count` 신규 | 수정 |

💡 tester 참고:
- **테스트 방법**:
  1. 패턴 페이지 진입 → 카드 우상단에 빈 별(☆) 표시 확인
  2. 별 클릭 → 채워진 별(★, 앰버색)로 변경 + `$APPDATA/com.grader.app/favorites.json`에 stableId/id 저장 확인
  3. 툴바의 "⭐ 즐겨찾기만 보기" 클릭 → ★ 표시된 카드만 노출
  4. 즐겨찾기 개수 뱃지가 ★ 총개수와 일치
  5. **선택 모드(워크세션 있음)**: 카드 클릭 시 좌상단 ✓ / 우상단 ★ 동시 노출되어도 겹치지 않음
  6. ★ 버튼 클릭 시 카드 선택이 같이 일어나지 않음 (stopPropagation 검증)
- **정상 동작**:
  - 앱 재시작 후에도 즐겨찾기 유지
  - Drive 프리셋은 stableId 기반이라 Drive 폴더명이 바뀌어도 즐겨찾기 유지
  - 저장 실패 시 UI 롤백 + alert
- **주의할 입력**:
  - favorites.json 수동 손상(배열이 아님) → 로드 실패 시 빈 Set + 경고만 찍고 앱 정상 동작
  - 같은 키를 중복 저장 시도 → saveFavorites 내부 Set으로 자동 중복 제거
  - "전체 해제"(빈 배열 저장)는 정상 허용 (presetStore와 규칙 다름 — favorites는 비어있는 것도 정상)

⚠️ reviewer 참고:
- ✓(__check)는 `pointer-events: none`인데 ★(__fav-toggle)는 `z-index: 3`로 위에 있음 → 별이 선택 체크를 가리지 않도록 **좌/우로 위치 자체를 분리**함
- 가상 폴더(즐겨찾기 섹션을 CategoryTree 최상단에 추가)는 계획에서 명시적으로 **제외** — Phase 3-후속으로 보류
- Drive 동기화 대상 X: favorites.json은 로컬 개인 취향이라 Drive에 올리지 않음 (사용자 결정 Q4=A)
- `handleToggleFavorite`는 `favoriteKeys` deps로 useCallback 되어 있어 Set 참조가 바뀌면 새 함수 생성 — 낙관적 업데이트 시점에 최신 Set을 참조하기 위함

검증: `npx tsc --noEmit` PASS / `npm run build` PASS (dist 303KB gzip 94KB)

### [2026-04-15] Phase 4 OrderGenerate 통합 (구현)

📝 구현한 기능: SizeSelect + FileGenerate → OrderGenerate 한 페이지 통합 (Illustrator 전용)

| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| `src/pages/OrderGenerate.tsx` | 신규 작성. 세션 가드(workFolder/baseAiPath/selectedPresetId) → 프리셋 로드 → 사이즈 선택(엑셀 주문서 업로드 옵션) → baseSize 드롭다운 → Illustrator 호출 → 결과 목록 → "작업 폴더 열기" / "새 작업 시작". 출력: `{workFolder}\{baseAiName}_{size}.eps`. config.json에 `designAiPath=session.baseAiPath` 고정. ~530줄. | 신규 |
| `src/main.tsx` | import FileGenerate → OrderGenerate 교체, `/generate` 라우트 엘리먼트 교체, 주석 정리 | 수정 |

핵심 로직 요약:
- **세션 가드**: `useEffect` 1회. workFolder/baseAiPath 없으면 /work, selectedPresetId 없으면 /pattern, 프리셋이 삭제돼 있으면 /pattern. 로드 완료까지 `loadingInit`로 placeholder.
- **출력 규칙**: 구 FileGenerate는 AppData/outputs/{timestamp} 밑에 저장했지만, 신규는 `session.workFolder` 루트에 바로 저장. 파일명은 `getFileBaseName(baseAiPath) → sanitizeFileName → {base}_{size}.eps`.
- **config.json**: grading.jsx 호환 포맷 유지. `designAiPath`만 사용(PDF 분기 제거). `patternLineColor: "auto"` 그대로.
- **엔진**: Illustrator 전용. `find_illustrator_exe` 실패 시 한국어 에러 다이얼로그 후 종료. Python 폴백 로직 포팅하지 않음.
- **주문서**: 선택 사항. 업로드 안 해도 수동 체크만으로 진행 가능. SizeSelect의 `handleExcelUpload` 로직 그대로 이식.
- **baseSize**: 페이지 로컬 state. 기본 "L", 프리셋에 "L" 없으면 첫 번째 사이즈. 세션 스키마 수정 X.
- **"새 작업 시작"**: 결과 화면에만 노출. `clearWorkSession() → navigate("/work")`.
- **에러 복원력**: 한 사이즈 실패해도 다음 사이즈 계속 진행(FileGenerate 동일 패턴).

💡 tester 참고:
- **테스트 전 준비**:
  1. Adobe Illustrator 설치된 환경 필요 (미설치 시 에러 메시지만 확인 가능)
  2. /work에서 작업 폴더 + AI 파일 선택 → /pattern에서 프리셋 선택 → /generate 진입
- **테스트 방법**:
  1. 세션 가드: 브라우저 새로고침/URL 직접 입력 시 /work로 리다이렉트되는지
  2. 작업 요약 카드에 "기준 AI / 작업 폴더 / 선택 패턴" 3줄 정확히 표시
  3. 엑셀 주문서 없이 체크박스만으로 "파일 생성 시작" 가능
  4. 엑셀 주문서 업로드 → 사이즈 자동 체크 + 수량 뱃지 표시
  5. 기준 사이즈 드롭다운 → 프리셋 등록 사이즈만 옵션
  6. 실행 중에는 모든 버튼/체크박스 disabled
  7. 생성 완료 → 작업 폴더에 `{baseAiName}_{size}.eps` 파일들이 존재
  8. "작업 폴더 열기" 버튼 → OS 파일 탐색기로 session.workFolder 오픈
  9. "새 작업 시작" 버튼 → 세션 초기화 + /work 진입
- **정상 동작**:
  - Illustrator 미설치 시: "Adobe Illustrator가 설치되지 않았거나 찾을 수 없습니다. 설치 후 재시도해주세요." 다이얼로그만 표시 후 멈춤
  - Drive 프리셋 사용 시에도 svgPathBySize 경유해서 정상 생성 (resolveSvgContent 통합 경로)
  - 한 사이즈 실패해도 나머지 사이즈는 계속 진행
- **주의할 입력**:
  - **반드시 실제 Illustrator 실행 테스트 필요** (자동화 불가)
  - 프리셋이 Phase 이후 삭제된 경우: /pattern으로 리다이렉트되는지
  - 작업 폴더가 Drive 공유 드라이브인 경우 쓰기 권한 확인
  - baseAiPath에 한글/공백/특수문자 포함되어도 sanitizeFileName이 치환

⚠️ reviewer 참고:
- **기존 FileGenerate/SizeSelect/designStore/generationStore는 파일은 남아있지만 라우트 연결이 끊어져 동작하지 않음** (Phase 5에서 삭제 예정). `/size` 리다이렉트가 `/generate`로 가므로 구 SizeSelect도 렌더되지 않음.
- grading.jsx는 수정 없음. 기존 `designAiPath` 우선 분기가 이미 있어 재활용만 함.
- 세션 스키마(`WorkSession`)는 수정 X (baseSize/주문서경로 모두 페이지 로컬로만). Phase 5에서 필요 시 확장 검토.
- 결과 화면에 `gen-result__path` 클래스 사용 — 기존 CSS에 없으면 code 태그 기본 스타일로 표시됨. 문제 있으면 CSS 추가 필요.
- `outputDir`는 session.workFolder 그대로. "폴더 열기"는 openPath 그대로 재활용.
- Python 폴백을 의도적으로 뺐기 때문에, 미설치 환경에서는 테스트 불가 — 이건 Phase 4 요구사항 그대로.

검증: `npx tsc --noEmit` PASS / `npm run build` PASS (dist 304KB gzip 94KB)

---

## 테스트 결과 (tester)
(Phase 3 구현 후 검증)

## 리뷰 결과 (reviewer)
(Phase 3 구현 후)

## 수정 요청
| 요청자 | 대상 파일 | 문제 설명 | 상태 |
|--------|----------|----------|------|

## 작업 로그 (최근 10건)
| 날짜 | 에이전트 | 작업 내용 | 결과 |
|------|---------|----------|------|
| 2026-04-15 | developer | Drive 연동 옵션 4 자동 동기화 리팩터 | 커밋 8ec96a3 |
| 2026-04-15 | developer | 트리 더블클릭 + 앱 내 rename 제거 + Drive 읽기 전용 | 커밋 1b8fa4b |
| 2026-04-15 | developer | 프리셋 카드 사이즈 5XS→5XL 정렬 | 커밋 849a6e5 |
| 2026-04-15 | planner-architect | 작업 흐름 재설계 계획서 865줄 | 커밋 5cb0aaa |
| 2026-04-15 | developer | Phase 1 WorkSetup + 세션 + 라우팅 | 커밋 3efa370 |
| 2026-04-15 | developer | WorkSetup AI 파일 선택 하나로 폴더 자동 | 커밋 ad3d073 |
| 2026-04-15 | developer | Phase 2 패턴 선택 모드 | 커밋 3e5a069 |
| 2026-04-15 | developer | 카드 간소화 + 2열 그리드 + 조각 카운팅 | 커밋 bc20e24 |
| 2026-04-15 | developer | DRIVE 뱃지 제거 + 조각 카운팅 개선 (M 명령어) | 커밋 b01c974 |
| 2026-04-15 | pm | 11개 커밋 push + scratchpad 정리 + Phase 3 착수 | 완료 |
| 2026-04-15 | developer | Phase 3 즐겨찾기 (favoritesStore + ⭐ 토글 + 필터) | tsc/build PASS |
| 2026-04-15 | developer | Phase 4 OrderGenerate 통합 (SizeSelect+FileGenerate → 1페이지) | tsc/build PASS |
