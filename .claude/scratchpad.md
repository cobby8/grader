# 작업 스크래치패드

## 현재 작업
- **요청**: Drive 연동을 "경량 자동 동기화" 방식(옵션 4)으로 리팩터 — 가져오기 버튼 제거, 자동 스캔/병합
- **상태**: 🔨 developer 착수 예정 (Phase A → B 순서)
- **현재 담당**: developer
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
(옵션 4 착수 대기)

## 테스트 결과 (tester)
(옵션 4 구현 후 검증 예정)

## 리뷰 결과 (reviewer)
(옵션 4 구현 후 리뷰 예정)

## 수정 요청
| 요청자 | 대상 파일 | 문제 설명 | 상태 |
|--------|----------|----------|------|

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
