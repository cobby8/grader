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

### [2026-04-15] grading.jsx 디버그 로그 파일 추가

📝 구현한 기능: ExtendScript Toolkit 없이 사이즈별 이상 원인을 파악할 수 있도록 `grading.jsx`에 파일 기반 디버그 로그 추가 (원인 확정용 임시 조치).

| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| `illustrator-scripts/grading.jsx` | writeLog/flushLog 헬퍼 + 주요 계산값 로깅 (~161줄 증가) | 수정 |

**변경 포인트**:
- 상단 헬퍼: `_logFilePath`, `_logBuffer`, `writeLog()`, `flushLog()` (ES3 호환, try/catch로 실패 무시)
- main() 초반: `config.resultJsonPath` 기반으로 `grading-log.txt` 경로 결정 + 시작 로그 (config 전체 기록)
- STEP 2A: baseArea + basePieceCount 로깅
- `importSvgPathsToDoc()`: SVG 문서 요약, 50pt 이상 각 path (w/h/area/bounds), 합산 결과 로깅
- STEP 8 paste 직후: pageItems/selection/layerDesign 개수 로깅
- STEP 9 스케일: areaRatio, linearScale, 적용 후 bounds 로깅
- STEP 10 개별 정렬: 배치/스킵/총 개수 + 최종 요소 전체 bounds 로깅
- catch 블록 + 정상 종료: [ERROR] + 종료 마커 + flushLog 호출
- 파일 저장 모드: **append** ("a") — 사이즈별 실행 누적

**로그 파일 위치**: `resultJsonPath`와 같은 폴더에 `grading-log.txt`
- 예: `C:\0. Programing\grader\illustrator-scripts\grading-log.txt`
- 사용자가 이 파일 한 개만 공유하면 모든 사이즈 실행 정보 확인 가능

💡 tester 참고:
- **테스트 방법**: 문제 사이즈(S, 3XL, 4XL)를 포함해 3~4개 사이즈를 OrderGenerate로 연속 실행
- **정상 동작**: `illustrator-scripts/grading-log.txt`가 생성되고, 각 실행마다 시작~종료 블록이 누적됨
- **확인 지표**:
  - S: STEP 8 "붙여넣은 요소 없음" 경고 + selection=0/null 여부
  - 3XL/4XL: STEP 7 targetArea가 XL/2XL 대비 과도하게 큰지, STEP 9 linearScale이 1.3+ 인지
  - path별 area 목록에서 "아트보드 전체 덮는 사각형" 의심 path 찾기
- **주의**: 한글/공백 경로에서 File("UTF-8", "a") 동작 여부 확인

⚠️ reviewer 참고:
- ES3 호환 유지 (var, 함수 선언만, toISOString은 try/catch로 폴백)
- 기존 `$.writeln`은 모두 유지, writeLog는 **추가**만 함 (로직 무변경)
- writeLog 자체가 실패해도 스크립트는 계속 진행 (바깥 try/catch)
- **추후 제거**: 원인 확정 후 이 디버그 로그 전체 제거 (Phase 5+ 또는 원인 커밋 후 별도 revert)

#### 수정 이력
| 회차 | 날짜 | 수정 내용 | 수정 파일 | 사유 |
|------|------|----------|----------|------|
| 1차 | 2026-04-15 | 로그 파일 경로 기준을 `resultJsonPath` → `outputPath` 우선으로 변경 (폴백: resultJsonPath) | `illustrator-scripts/grading.jsx` | 사용자 요청: 결과물(.ai) 바로 옆에 로그가 있어야 추적/공유가 쉬움. ES3 호환 유지 (var/try-catch만 사용) |

### [2026-04-15] 3XL 좌표 문제 조사

**증상**: 13개 사이즈 중 3XL만 요소(숫자 "1234"/"7890"/로고/라벨 등)가 몸판 범위 밖으로 과도하게 크게 튀어나옴. 몸판(파란 영역)은 3XL 크기로 정상. 4XL/5XL은 정상 추정.

**스케일 로직 흐름 (grading.jsx)**:
1. STEP 2A: 디자인 AI "패턴선" 레이어 50pt 이상 path들의 `path.area` 절대값 합산 → `baseArea` (단 한 번, 사이즈 무관)
2. STEP 7 `importSvgPathsToDoc`: 타겟 SVG의 50pt 이상 path `area` 합산 → `targetArea` + `basePieces` bbox 수집
3. STEP 9: `linearScale = sqrt(targetArea / baseArea)` → `pastedGroup.resize(linearScale*100, ..., true,true,true,true)`
4. STEP 10: 요소 그룹 해제 → 각 요소를 `basePieces[pieceIdx].center + (origRelOffset * linearScale)` 위치로 translate

**3XL 특수 조건 없음**: 코드에 사이즈 이름에 따른 분기 전혀 없음. `SIZE_LIST` 인덱스도 grading.jsx 내부에서 쓰지 않음. 3XL.svg 파일 하나를 config.patternSvgPath로 받아서 그대로 처리.

**원인 후보 (우선순위)**:

1. **3XL.svg 파일 자체의 이상** (최고 확률)
   - 원본 SVG viewBox 또는 path 좌표가 다른 사이즈보다 **엄청 큰 숫자 단위**를 쓰고 있을 가능성
   - `svgDoc.artboards[0].artboardRect`로 베이스 문서 크기가 결정되므로 viewBox가 이상하면 몸판 실측치는 맞지만 path 내부 좌표가 엉뚱할 수 있음
   - 예: 다른 사이즈는 mm 단위, 3XL만 inch 단위로 export 됐거나, Illustrator export 시 scale factor가 다르게 들어감
   - `targetArea`가 비정상적으로 커지면 `linearScale = sqrt(targetArea/baseArea)`가 과도하게 커져 → 요소가 과하게 확대됨
   - **몸판은 정상 크기로 보이는데 요소만 크다**는 것이 결정적 단서 → 몸판 path는 `area` 계산만 문제, 렌더링은 정상일 가능성 (벡터는 좌표계 스케일만 다를 수 있음)

2. **3XL.svg의 path 하나가 비정상적으로 크거나 열린 경로**
   - `importSvgPathsToDoc`는 50pt 이상 path 모두 `targetArea`에 합산
   - 만약 3XL.svg에 "전체 아트보드를 덮는 배경 사각형" 같은 path가 하나 들어있다면, 또는 path가 닫히지 않아서 `path.closed = true`로 강제 닫을 때 면적이 폭발적으로 커질 수 있음
   - `calcLayerArea`/`importSvgPathsToDoc` 모두 `if (!path.closed) { path.closed = true; }` 강제 처리 → 복잡한 열린 경로는 예기치 않은 area 발생

3. **basePieces와 designPieces 매핑 실패 + 폴백 비활성화**
   - 만약 3XL.svg의 조각 수가 디자인 AI와 같으면(S1 통과) 개별 정렬 경로로 진입하는데, 인덱스 매핑이 엉뚱하면 엉뚱한 조각 중심으로 이동
   - 하지만 "요소가 몸판 위로 튀어나간다"는 것은 `linearScale`이 과도하다는 신호에 더 가까움 (매핑 오류라면 엉뚱한 조각에 붙긴 해도 크기는 맞을 것)

4. **3XL의 Drive SVG 파일과 디자인 AI 패턴선 레이어의 "기준 사이즈" 불일치** (희박)
   - `baseArea`는 한 번만 계산되고 모든 사이즈 공용 → 여기선 영향 없음 (사이즈마다 재계산 안 함)

**3XL을 의심할 수밖에 없는 이유**:
- grading.jsx는 3XL 이름을 한 번도 사용하지 않음 → 코드 분기에서 3XL만 다르게 취급할 수 없음
- config.json의 `patternSvgPath`만 다르게 들어감 → **Drive의 3XL SVG 파일 자체**가 유일한 독립 변수
- 사용자가 직접 3XL.svg를 다른 사이즈와 비교하는 것이 가장 빠른 확인법

**사용자 확인 요청**:
1. 어떤 프리셋(패턴)에서 발생? 모든 프리셋? 특정 디자인(V넥 등)?
2. 3XL.svg를 Illustrator나 브라우저로 직접 열어서 아트보드 크기가 다른 사이즈(2XL/4XL)와 비슷한지
3. 3XL.svg의 path 수가 다른 사이즈와 동일한지 (조각 수)
4. Illustrator 콘솔(`$.writeln` 로그) 중 3XL 실행 시:
   - `[grading.jsx] 기준 패턴 면적: X pt² (N개 조각)` (baseArea)
   - `[grading.jsx] 타겟 패턴 면적: Y pt² (M개 조각)` (targetArea)
   - `[grading.jsx] 면적 비율: Z`
   - `[grading.jsx] 선형 스케일: W (W*100%)`
   - → 2XL 실행 때 값과 비교하면 3XL의 `면적 비율`이 돌발적으로 튈 것으로 추정

**수정 방향 (원인 확정 후)**:
- 원인 1/2 (SVG 파일 자체): 디자이너가 3XL.svg를 재 export / 또는 코드에 "이상치 방어 로직" 추가 — `linearScale`이 이웃 사이즈 대비 이상하게 튀면 경고 + 수동 확인 요청
- `linearScale` clamp (예: 2.0 초과 시 경고/차단)는 방어적 패치로 유용하지만 근본 원인 규명이 먼저

**코드 수정 없음 — 조사만 진행.**

---

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

### [2026-04-15] OrderGenerate 버그 수정 + 기준 사이즈 자동 + 구글 시트

📝 구현한 기능:
1. Python 엔진 경로 탐색 버그 수정 (dev 모드에서 엉뚱한 폴더 매칭 방지)
2. AI 파일명에서 사이즈 자동 추출 → OrderGenerate의 기준 사이즈 드롭다운 초기값으로 반영
3. OrderGenerate에 구글 시트 URL 입력 → CSV fetch → 간단 휴리스틱으로 사이즈/수량 추출

| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| `src-tauri/src/lib.rs` | `get_python_engine_dir` 개선: ①환경변수 `GRADER_PYTHON_ENGINE_DIR` 오버라이드 ②`#[cfg(debug_assertions)]`에서 `CARGO_MANIFEST_DIR`의 상위 기준 1순위 탐색 ③기존 exe 역추적/resource_dir 폴백 유지 | 수정 |
| `src/types/session.ts` | `WorkSession.baseSize?: string` 추가 (파일명 파싱 힌트) | 수정 |
| `src/types/pattern.ts` | `extractSizeFromFilename(fileName)` 신규 — 확장자/경로 제거 후 토큰화, 뒤에서부터 SIZE_LIST 매칭 | 수정 |
| `src/pages/WorkSetup.tsx` | `handleNext`에서 `extractSizeFromFilename(baseAiPath)` 호출 → session.baseSize 저장 | 수정 |
| `src/pages/OrderGenerate.tsx` | ①세션 로드 시 `s.baseSize`를 baseSize 초기값으로 사용 ②`toCsvExportUrl()` + `parseCsvSizes()` 순수 헬퍼 추가 ③`sheetUrl/sheetLoading` 상태 + `handleSheetImport()` 추가 ④`.sheet-url-row` input + 가져오기 버튼 UI ⑤`resetOrderToManual`에 sheetUrl 초기화 추가 | 수정 |
| `src/App.css` | `.sheet-url-row` + `.sheet-url-input` 스타일 추가 | 수정 |

핵심 로직:
- **Rust 경로 탐색 우선순위**: ENV 오버라이드 → dev: `CARGO_MANIFEST_DIR/../python-engine` → exe 역추적 → resource_dir. dev 빌드에서는 컴파일 타임에 src-tauri 절대 경로가 박히므로, target/debug 위치에 관계없이 프로젝트 루트를 정확히 찾는다.
- **사이즈 파싱**: `"농구_V넥_XL.ai"` → 확장자 제거 → `_`/공백/`-`/`.`로 토큰 분해 → 뒤에서부터 SIZE_LIST 매칭(대소문자 무시) → `"XL"`. 관습상 사이즈가 뒤쪽에 있어 뒤→앞 스캔. 실패 시 null → 세션 저장 안 하고 OrderGenerate가 기본 "L"로 보정.
- **구글 시트 URL 처리**:
  - `toCsvExportUrl`: `/spreadsheets/d/{KEY}/edit?gid={GID}` → `/spreadsheets/d/{KEY}/export?format=csv&gid={GID}`. gid 없으면 0.
  - `parseCsvSizes`: 2D 그리드 스캔 → 각 셀이 SIZE_LIST 매칭되면 우측 같은 행 → 없으면 아래 같은 열에서 "가장 가까운 양의 정수"를 수량으로. 중복 매칭은 합산.
  - 프리셋에 없는 사이즈는 경고 메시지만 출력 후 제외.
  - CORS: docs.google.com 공개 시트 export는 공유 설정이 "링크가 있는 모든 사용자 뷰어"일 때만 동작.

💡 tester 참고:
- **⚠️ dev.bat 재시작 필수** (lib.rs 수정 → Rust 재컴파일)
- **작업 1 (Rust) 테스트**:
  - `dev.bat` 재시작 후 파이썬 호출이 필요한 기능(엑셀 주문서 업로드 등)을 실행 → 정상 동작해야 함
  - 환경변수 테스트(선택): `set GRADER_PYTHON_ENGINE_DIR=C:/other/python-engine` 후 재시작 시 그 경로가 우선됨
- **작업 2 (기준 사이즈 자동) 테스트**:
  - `/work`에서 파일명이 `..._XL.ai`, `..._M.ai`, `..._2XL.ai` 같은 AI 파일 선택
  - `/pattern` → 프리셋 선택 → `/generate` 진입 시 기준 사이즈 드롭다운 초기값이 파일명 토큰과 일치해야 함
  - 파일명에 사이즈 토큰이 없으면(예: `농구유니폼.ai`) 기존대로 "L"(또는 프리셋 첫 사이즈)로 보정
  - 프리셋에 등록되지 않은 사이즈가 추출되면 자동 보정 useEffect가 다른 값으로 대체 (깜빡임 가능)
- **작업 3 (구글 시트) 테스트**:
  - 테스트 시트 예: S=3, M=5, L=7, XL=2 같은 단순 표
  - 공유 설정을 "링크가 있는 모든 사용자 뷰어"로 변경
  - 시트 URL 붙여넣기 → "시트에서 가져오기" → 체크박스 자동 체크 + 수량 뱃지 표시
  - "총 N장" 요약이 시트 합계와 일치해야 함
  - 잘못된 URL: 에러 메시지 "유효한 구글 시트 URL이 아닙니다..."
  - 권한 없는 시트: "HTTP 403/401..." 에러 → 공유 설정 안내 메시지
  - 사이즈가 없는 시트: "시트에서 사이즈를 찾지 못했습니다..." → 엑셀 업로드 권장 안내
- **정상 동작**:
  - 구글 시트와 엑셀은 상호 배타 아님 — 둘 중 마지막으로 사용한 것이 덮어씀
  - "주문서 초기화" 클릭 시 sheetUrl input까지 비워짐
- **주의할 입력**:
  - 숫자 셀에 따옴표가 있거나 `"1,234"` 같은 천단위 쉼표가 들어있으면 `parsePositiveInt`가 제거 후 파싱 (소수점은 거부)
  - 같은 사이즈가 여러 셀에 있으면 합산됨 (분산 입력 대응이지만, 사용자에게는 "왜 합쳐졌지" 혼란 가능 — Phase 5+에서 재검토)
  - 비공개 시트는 HTML 로그인 페이지가 돌아와서 사이즈 0건으로 끝남

⚠️ reviewer 참고:
- **production 경로 로직(exe 역추적/resource_dir)은 건드리지 않음** — Phase 5 번들 배포 준비 때 재검토
- `parseCsvSizes`는 MVP용 간단 휴리스틱 — Python order_parser의 가로/세로/표형 자동감지를 JS로 포팅하지 않음. Phase 5+에서 필요 시 확장.
- `OrderParseResult.detectedFormat`에 `"auto"` 값이 없어 `"unknown"`으로 매핑했음. 요약 바에는 "자동감지"로 표시됨.
- 시트 fetch는 Tauri의 브라우저 fetch를 그대로 사용 — 별도 Rust 커맨드 추가 없음(CORS 문제는 공개 시트면 docs.google.com이 허용)
- `extractSizeFromFilename`은 pattern.ts에 위치 — SIZE_LIST 상수와 같은 파일이라 응집도 높음. svgResolver는 SVG 전용 유지.

검증: `npx tsc --noEmit` PASS / `cargo check` PASS / `npm run build` PASS (dist 308KB gzip 95.5KB)

### [2026-04-15] 3XL/4XL 좌표 + XL 요소 누락 조사

#### 증상 요약 (사용자 실측)
- **증상 A**: 3XL, 4XL 출력물에서 요소(숫자 1234/7890/20/로고/라벨)가 몸판 상단/좌우로 튀어나가고 과도하게 큼. 몸판(파란 영역) 크기는 정상. 5XL은 언급 없음.
- **증상 B**: 기준 AI = XL, 타겟 = XL 그레이딩 시 결과 EPS에 **몸판만 있고 요소가 전혀 없음**.

#### 조사한 파일
- `src/pages/OrderGenerate.tsx` (955줄): 사이즈 루프 + config.json 생성 로직 (라인 543~624)
- `illustrator-scripts/grading.jsx` (1636줄): STEP 1~11-D 전체 흐름
  - `calcLayerArea` (663~680)
  - `importSvgPathsToDoc` (772~853)
  - `extractPatternPieces` (866~904)
  - `alignElementToPiece` (993~1013)
  - STEP 2A baseArea 계산 (1137~1154)
  - STEP 4 요소 copy + 매핑 사전 수집 (1184~1255)
  - STEP 5 SVG 열기 (1257~1278)
  - STEP 7 importSvgPathsToDoc 호출 (1296~1308)
  - STEP 8 paste (1333~1339)
  - STEP 9 linearScale 적용 (1368~1387)
  - STEP 10 개별 정렬 / 폴백 (1389~1478)

#### OrderGenerate의 config.json 구성 (증상 B 단서)

루프 (라인 543~590):
```
for targetSize in selectedSizes:
  targetSvgData = resolveSvgContent(piece, targetSize)   // Drive SVG 또는 Local 인라인
  tempSvgPath = scriptsDir\temp_pattern_{targetSize}.svg
  write(tempSvgPath, targetSvgData)
  config = {
    patternSvgPath: tempSvgPath,
    outputPath: workFolder\{baseAiName}_{targetSize}.eps,
    resultJsonPath,
    patternLineColor: "auto",
    designAiPath: session.baseAiPath,   // ← 항상 같은 AI 파일
  }
```

**결정적 관찰**: OrderGenerate의 사이즈 루프는 **baseSize를 config.json에 전달하지 않는다**. designAiPath는 사용자가 /work에서 고른 단 하나의 AI 파일 고정. `baseSize` state는 드롭다운 UI용으로만 존재하고, config에도 grading.jsx에도 **전혀 쓰이지 않는다**.

→ **"기준 사이즈"는 실질적으로 baseAiPath 파일의 패턴선 레이어 면적으로 결정된다** (grading.jsx STEP 2A). baseSize 드롭다운은 현재 의미 없는 UI.

#### 증상 B (XL = XL에서 요소 누락) — 원인 후보

grading.jsx는 `basePieces == designAiPath` 동일성 체크 없음. 그래도 실패할 수 있는 경로:

**가설 B1 (최유력): STEP 2A가 "요소"를 "패턴선"으로 오인 포함 — X**
- calcLayerArea는 layer.pathItems만 순회. "패턴선" 레이어에 있는 path만 대상.
- 만약 XL AI 파일이 "요소"까지 모두 "패턴선" 레이어에 들어있다면? → 가능성 있음
- 하지만 이건 증상 B와 직접 연결되지 않음 (요소 누락 원인은 따로)

**가설 B2 (최유력): STEP 4의 designPieces 매핑 안전장치 S1/S3가 모든 요소를 스킵**
- XL AI 파일의 "패턴선" 조각 수 vs 타겟 XL SVG 조각 수가 다르면 useFallback=true → alignToBodyCenter 경로로 가서 요소가 "몸판 중앙"으로 이동만 함 (요소 누락 아님)
- 폴백이 요소를 "몸판 중앙" 한 곳에 모아놓기만 할 뿐이라 **요소는 보여야 함**
- 그런데 사용자 증상은 "아예 없음"

**가설 B3 (매우 유력): baseAiPath가 실제로 Drive의 XL SVG와 다른 파일**
- OrderGenerate에서 `designAiPath = session.baseAiPath` (AI 파일)
- `patternSvgPath = temp_pattern_XL.svg` (Drive에서 해석된 SVG)
- 두 파일은 **원천적으로 다른 파일**이므로 "same file" 이슈 아님
- 하지만 사용자가 /work에서 **AI 파일로 Drive에 있는 SVG 파일을 잘못 선택**했다면? — 타입은 .ai여야 하므로 확장자 필터에서 차단됨. 가능성 낮음.

**가설 B4 (가장 유력): AI 파일의 "요소" 레이어가 비어있거나 다른 이름**
- STEP 4 (1200~1248): `elemLayer = designDoc.layers.getByName("요소")`. 없으면 throw.
- **있는데 pageItems.length === 0이면 copy 실패** → clipboard 비어있음 → STEP 8 paste에서 baseDoc.selection이 null → "붙여넣은 요소가 없음" 로그
- 이러면 **몸판만 보존되고 요소는 정말 아무것도 안 들어감** = 증상 B와 완전 일치
- XL AI가 "기준" 파일이라면 디자이너가 요소를 아직 안 그렸거나, 레이어 이름이 한글 "요소"가 아니라 다른 이름(예: "Elements", "디자인요소")일 수 있음

**가설 B5 (가능): XL SVG의 조각 수가 요소 매핑을 모두 -1로 만들고, 스킵 카운트=전체**
- `findBestMatchingPiece`는 (1) 교집합 면적 최대 (2) 중심 거리 최소 폴백
- 중심 거리 폴백은 pieces가 1개 이상이면 반드시 0 이상 인덱스를 반환 → -1 가능성 낮음
- 그래도 `elementPieceIndex[i] === -1` 조건이 모든 요소에 맞으면 전부 스킵되긴 함
- **하지만 이 경우도 "요소가 아예 없다"가 아니라 "요소는 paste되지만 위치만 엉뚱"이라 증상 B와는 다름**

**가설 B6 (가능): XL.ai 파일 자체가 손상 또는 열기 실패**
- 에러는 catch → result.json에 기록 → OrderGenerate가 "에러"로 표시
- 사용자가 "에러"로 보였는지 "성공인데 요소 없음"인지 확인 필요

→ **가설 B4가 가장 설명력 높음**. 사용자 확인 필수.

#### 증상 A (3XL/4XL 요소 과대) — 원인 후보

**가설 A1 (최유력): 3XL.svg/4XL.svg viewBox 단위가 다른 사이즈와 다름**
- 사용자가 3XL.svg 파일을 새로 추가했다고 함 → 새 파일만 단위/좌표계가 다를 가능성
- STEP 5에서 `svgDoc.artboards[0].artboardRect`로 아트보드 크기 측정 → **CMYK 베이스 문서 크기는 SVG 아트보드 기준**
- STEP 7 `importSvgPathsToDoc`는 path.area를 누적 → **path 좌표 단위가 비정상이면 targetArea가 비정상**
- 몸판이 정상 크기인 이유: `path.duplicate`는 원본 좌표 그대로 복제. 아트보드가 커도 path 좌표가 같이 커졌으면 몸판은 시각적으로 맞게 보임
- 요소가 과대한 이유: `linearScale = sqrt(targetArea / baseArea)`에서 targetArea가 과대하면 linearScale 폭발 → STEP 9의 `pastedGroup.resize(linearScale*100)`이 요소를 크게 확대
- 위치가 상단으로 튀어나가는 이유: `alignElementToPiece`에서 `relX * linearScale`이 과대하면 요소 중심이 basePiece 중심에서 멀어짐. linearScale=2~3배면 요소가 조각 밖 원래 조각 중심 반경 × 스케일만큼 멀어짐

**가설 A2 (유력): 3XL/4XL SVG에 "배경 사각형 path"가 하나 들어있어 targetArea 폭발**
- importSvgPathsToDoc는 50pt 이상 path를 모두 targetArea에 누적
- 아트보드 전체를 덮는 보이지 않는 path 하나만 있어도 targetArea가 실제보다 2~3배 커짐
- 3XL.svg를 Illustrator로 열어 "숨겨진 path"가 있는지 육안 확인 필요

**가설 A3 (가능): 열린 경로 강제 닫기로 인한 면적 폭발**
- `if (!path.closed) { path.closed = true; }` 강제 처리
- 3XL/4XL SVG에 복잡한 열린 경로(예: 시접선, 가이드선)가 있으면 엉뚱한 면적이 합산될 수 있음
- path.width/height 50pt 필터를 통과한 열린 path가 있으면 합산됨

**가설 A4 (배제): 5XL은 정상**
- 가설 A1/A2가 맞다면 5XL도 같이 문제일 가능성이 높은데, 5XL은 "언급 없음" → 진짜 정상인지 미확인 상태
- 사용자에게 5XL 결과 확인 요청 필요

#### 추가 발견 (부수적)

**부수 이슈 1**: OrderGenerate의 `baseSize` 드롭다운은 실제로 아무 동작도 하지 않음
- config에도 안 들어가고, grading.jsx도 baseSize를 모름
- grading.jsx의 "기준"은 `designAiPath`의 "패턴선" 레이어 → 사용자가 /work에서 고른 AI 파일이 곧 기준
- **이건 UX 버그**: 사용자가 "기준 사이즈를 XL로" 드롭다운을 바꿔도 실제 결과에 아무 영향 없음. 기준 사이즈를 바꾸려면 /work에서 AI 파일 자체를 바꿔야 함.
- 이번 조사 범위 밖이지만 PM에게 보고하여 Phase 5+에서 설계 재검토 권장

**부수 이슈 2**: `calcLayerArea`의 path.area 계산은 복잡한 복합 path(여러 subpath)에서도 호출됨
- SVG에서 `<path d="M10,10... M200,200...">`처럼 여러 subpath가 한 path로 묶이면 path.area는 전체 합
- 조각 수 카운트와 면적 합이 어긋날 수 있음 (지금은 증상과 관련 없어 보임)

#### 수정 방향 (원인 확정 후)

**증상 B (가설 B4 확인 시)**:
- `/work`에서 AI 파일 선택 시 "요소" 레이어 존재/비어있음 미리 검증 (Rust/Python 유틸 또는 사전 열기)
- 아니면 grading.jsx에서 "요소" 레이어 비어있을 때 명확한 에러 메시지로 종료 (현재는 경고만 찍고 진행 → 요소 없는 EPS 저장)

**증상 A (가설 A1/A2 확인 시)**:
- 단기: 디자이너에게 3XL/4XL.svg 재 export 요청 (viewBox 단위 통일)
- 중기: grading.jsx에 linearScale clamp 추가 (예: 이웃 사이즈 대비 ±30% 초과 시 경고 + 원본 크기 유지)
- 장기: 사이즈 그룹 전체의 linearScale 분포를 먼저 계산하고 이상치 탐지

**부수 이슈 1 (별건)**:
- baseSize를 config에 전달해서 grading.jsx가 쓰도록 스키마 확장
- 아니면 baseSize UI를 제거하고 "AI 파일의 사이즈를 자동 감지"만 표시

#### 사용자에게 요청 (로그/스크린샷 수집)

1. **증상 A 범위 확정 (결정적)**: 13개 사이즈를 모두 XL 기준으로 돌려 결과물을 한 줄로 나열 — "XS/S/M/L 정상, XL/2XL 정상, 3XL/4XL 이상, 5XL ??"
2. **3XL.svg 와 XL.svg 비교** (결정적):
   - Illustrator로 각각 열어 "파일 > 문서 설정" 또는 "아트보드 옵션"에서 폭/높이(pt) 기록
   - "창 > 레이어" 패널에서 레이어 구조와 path 개수 비교
   - 3XL.svg만 아트보드 전체 크기 path(보이지 않는 사각형)가 있는지 육안 확인
3. **Illustrator 콘솔 로그 수집** (결정적):
   - 3XL 그레이딩 1회 실행 후 Illustrator 콘솔에서 `[grading.jsx]` 시작 라인 전체 복사
   - 핵심: `기준 패턴 면적 / 타겟 패턴 면적 / 면적 비율 / 선형 스케일` 숫자 4개
   - 같은 로그를 XL 그레이딩에서도 수집 → 비교
4. **증상 B의 XL EPS 파일 열기** (결정적):
   - Illustrator에서 `{baseAiName}_XL.eps` 열기 → 레이어 패널 확인
   - "디자인 요소" 레이어가 **비어있는지** / **숨겨져 있는지** / **범위 밖으로 나가있는지** 3가지 중 어느 것인지
   - 그레이딩 결과 로그의 `붙여넣은 요소 수:` 값 확인
5. **XL AI 파일 레이어 확인** (증상 B 최종 확인):
   - /work에서 선택한 기준 AI 파일을 Illustrator로 직접 열기
   - 레이어 패널에 **정확히 "요소"라는 이름**의 레이어가 있는지
   - "요소" 레이어에 path/text/group이 실제로 들어있는지

#### 결론

- **코드 수정 없음** (요청대로 조사만)
- 증상 A와 B는 서로 다른 원인 가능성이 높음 → 가설 A1/A2 + 가설 B4가 가장 설명력 있음
- 결정적 판단에는 사용자 Illustrator 콘솔 로그 + AI/SVG 파일 육안 확인 필수

---

## 테스트 결과 (tester)
(Phase 3 구현 후 검증)

## 리뷰 결과 (reviewer)
(Phase 3 구현 후)

## 수정 요청
| 요청자 | 대상 파일 | 문제 설명 | 상태 |
|--------|----------|----------|------|
| user | grading.jsx / 3XL.svg | 3XL 사이즈 1개에서 요소가 몸판 벗어나 과하게 큼. 다른 12개 사이즈는 정상 추정 | 🔍 조사 중 (원인 후보 수집, 추가 정보 대기) |
| user | 3XL.svg / 4XL.svg | 3XL.svg 추가 후에도 3XL·4XL 요소(숫자/로고/라벨)가 몸판 상단으로 튀어나가고 과하게 큼. 5XL은 언급 없음 | 🔍 조사 중 (SVG 파일 자체 검증 대기) |
| user | grading.jsx / OrderGenerate | 기준 AI = XL로 XL 타겟 그레이딩 시 요소가 하나도 안 들어옴 (몸판만 있음) | 🔍 조사 중 (Illustrator 로그 필요) |

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
| 2026-04-15 | developer | OrderGenerate 버그수정(Rust path) + 기준사이즈 자동 + 구글시트 URL 지원 | tsc/cargo/build PASS |
| 2026-04-15 | debugger | 3XL/4XL 좌표 + XL 요소 누락 조사 (코드 수정 없음, 사용자 로그 요청) | 조사 보고 |
| 2026-04-15 | developer | grading.jsx 디버그 로그 파일 기록 추가 (임시, 원인 확정용) | 구현 완료 |
| 2026-04-15 | developer | grading.jsx 로그 경로 outputPath 기준 변경 (폴백 resultJsonPath) | 구현 완료 |
