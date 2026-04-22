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
- **요청**: 양면 유니폼 그레이딩 버그 4종 수정
- **상태**: ✅ **완료** (단면 회귀 테스트 통과, 커밋 대기)
- **현재 담당**: pm (커밋 + 정리)

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
| 8 | 설치형 배포 준비 | ⏸ 보류 |
| 9 | Drive 연동 (자동 동기화) | ✅ |
| 10 | Phase 1 (WorkSetup + 세션) | ✅ |
| 11 | Phase 2 (패턴 선택 모드) | ✅ |
| 12 | Phase 3 (즐겨찾기) | ✅ |
| 12-A | SVG 일괄 표준화 Phase 1 | 🔨 1-3 완료 / 1-4~1-7 대기 |
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

⚠️ 위 3건은 양면 버그 수정과 별개. 이번에 바뀐 로직에서 재발 여부 재확인 필요.

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

---

## ⏸ 보류 (다음 작업)
- Phase 1-4~1-7 (Rust 커맨드 → UI → 통합 테스트 → 커밋)
- 사용자 확인 2건: 분류 로직 실테스트 / CLI 인터페이스 확정
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
