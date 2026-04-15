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
