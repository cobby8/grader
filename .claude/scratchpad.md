# 작업 스크래치패드

## 🎯 다음 세션 시작 가이드
1. **v1.0.0 Release 검증** (빌드 성공 후)
   - GitHub Release 페이지에서 에셋 3종 확인 (`.msi`, `.exe`, `latest.json`)
   - `latest.json` 서명이 새 공개키와 일치하는지 확인
   - 이전 버전 설치 후 v1.0.0으로 자동 업데이트 동작 테스트
2. **SVG 표준화 Phase 1-6, 1-7** 구현 (1-4/1-5 완료, 회귀 테스트 명령 보존됨)
3. **기존 수정 요청 3건 재검증** (v2 로직에서 재발 여부)

---

## 현재 작업
- **요청**: SVG 표준화 Phase 1-7 (knowledge 정리 + 최종 커밋)
- **상태**: ✅ **Phase 1 전체 완료** (Phase 1-6은 실 사용 테스트로 대체 결정)
- **현재 담당**: pm → (다음) 다음 기능 착수 (예: AI→SVG 자동 변환 or SVG 표준화 Phase 2 다형식)

### 🎉 직전 작업 (2026-04-23)
- 서명 키 2차 재생성 (비밀번호 `stiz3000!`) + tauri.conf.json pubkey 갱신
- release.yml에 Secret 길이 진단 step 추가
- v1.0.0 태그 재푸시 → Release (Windows) #6 **성공 완료**

---

## 진행 현황표
| 단계 | 내용 | 상태 |
|------|------|------|
| 0~7 | 기본 기능(패턴/디자인/사이즈/CMYK/Illustrator/APCA) | ✅ 완료 |
| 8 | 설치형 배포 + 자동 업데이트 | ✅ **v1.0.0 릴리스 빌드 성공** (검증 단계) |
| 9 | Drive 연동 (자동 동기화) | ✅ |
| 10 | Phase 1 (WorkSetup + 세션) | ✅ |
| 11 | Phase 2 (패턴 선택 모드) | ✅ |
| 12 | Phase 3 (즐겨찾기) | ✅ |
| 12-A | SVG 일괄 표준화 Phase 1 | ✅ **완료 (v1.0.0 포함)** — Phase 1-6은 실사용 테스트로 대체 |
| 12-B | AI→SVG 자동 변환 | ⏳ 12-A 완료 후 |
| 12-C | 양면 유니폼 그레이딩 버그 4종 | ✅ 완료 |
| 13 | Phase 4 (OrderGenerate 통합) | ✅ |

---

## 프로젝트 핵심 정보
- **기술 스택**: Tauri 2.x + React 19 + TypeScript + react-router-dom 7, Python 엔진(PyMuPDF/reportlab/pillow/openpyxl/svgpathtools), CSS+BEM(Tailwind 금지)
- **빌드**: `dev.bat` (MSVC), `build.bat`
- **주요 폴더**: `src/pages`, `src/components`, `src/services`, `src/stores`, `src/types`, `src-tauri`, `python-engine`, `illustrator-scripts`
- **데이터**: `$APPDATA/com.grader.app/` (presets/categories/settings/favorites.json), Drive `G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG` (60초 쿨다운), sessionStorage `grader.session`

---

## 기획설계 (planner-architect)
(정리됨 — PLAN-AUTO-UPDATE.md, PLAN-SVG-STANDARDIZATION.md 참조)

## 구현 기록 (developer)
(정리됨 — 작업 로그 참조)

## 테스트 결과 (tester)
(해당 없음)

## 리뷰 결과 (reviewer)
(해당 없음)

---

## 수정 요청 (누적 보류 — v2에서 재발 여부 확인 필요)
| 요청자 | 대상 파일 | 문제 설명 | 상태 |
|--------|----------|----------|------|
| user | grading.jsx / 3XL.svg | 3XL 사이즈 요소가 몸판 벗어나 과하게 큼 | 🔍 재검증 필요 |
| user | 3XL.svg / 4XL.svg | 3XL/4XL 요소가 몸판 상단 튀어나감 | 🔍 재검증 필요 |
| user | grading.jsx / OrderGenerate | 기준 AI=XL로 XL 타겟 시 요소 하나도 안 들어옴 | 🔍 로그 필요 |
| user | driveSync.ts / PatternManage.tsx | G드라이브 신규 SVG 미인식 | ✅ 근본 수정 완료, 사용자 실테스트 대기 |

---

## 작업 로그 (최근 10건)
| 날짜 | 에이전트 | 작업 내용 | 결과 |
|------|---------|----------|------|
| 2026-04-22 | developer | SVG 표준화 Phase 1-4 Rust 커맨드 2개 추가 | ✅ cargo check PASS |
| 2026-04-22 | developer | SVG 표준화 Phase 1-5 React UI 통합 (Modal 560줄 + Service 202줄) | ✅ tsc PASS, 6-Phase 머신 |
| 2026-04-22 | developer | Phase 1-5 글로벌 기준 파일 자동화 (드롭다운 제거) | ✅ tsc PASS |
| 2026-04-22 | developer | 자동 업데이트 Phase D 배포 가이드 문서 3종 작성 | ✅ RELEASE-GUIDE/CHANGELOG/INSTALL-GUIDE-STAFF 총 768줄 |
| 2026-04-23 | pm | v1.0.0 태그 생성 + 서명 키 재생성(비밀번호 없음) + pubkey 갱신 | 커밋 27a46eb |
| 2026-04-23 | pm | 서명 키 재생성(stiz3000!) + release.yml Secret 길이 진단 추가 | 커밋 07492dc, 4e51365 |
| 2026-04-23 | pm | GitHub Actions Release (Windows) #6 빌드 성공 (v1.0.0) | ✅ 8분 6초 |
| 2026-04-23 | pm | v1.0.0 Release Notes 작성 + Publish (Draft→Published, 서명 키 ID 매칭 확인) | ✅ 자동 업데이트 활성화 |
| 2026-04-24 | pm | 직원 배포용 공지문 3종 작성 (NOTICE-v1.0.0.md: 카톡/이메일/게시판) | ✅ 복붙용 3개 버전 |
| 2026-04-24 | pm | SVG 표준화 Phase 1-7 문서 정리 (architecture+lessons+index 갱신, 1-6은 실사용 테스트로 대체) | ✅ knowledge 3종 갱신 |

---

## ⏸ 보류 (다음 작업)
- 직원 첫 설치 피드백 수집 → FAQ 갱신 (INSTALL-GUIDE-STAFF.md)
- 자동 업데이트 실제 검증은 다음 v1.0.1 릴리스 시 자연스럽게
- **AI→SVG 자동 변환 기능** 설계 착수 (G드라이브 AI 파일 자동화)
- SVG 표준화 Phase 2 (슬림/V넥/하의 확장, JSON 프리셋 외부화)
- 수정 요청 3건 (3XL/4XL 요소 튀어나감, XL 타겟 요소 누락) v2 로직에서 재검증

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
| PLAN-AUTO-UPDATE.md | Phase A~D 완료, v1.0.0 빌드 성공 |
| PLAN-SVG-STANDARDIZATION.md | Phase 1-1~1-5 완료, 1-6~1-7 대기 |
