# 작업 스크래치패드

## 🎯 다음 세션 시작 가이드
1. **v1.0.4 자동 업데이트 직원 PC 전파 확인** — 본 PC v1.0.1→v1.0.4 자동 업데이트 성공(2026-04-29). 직원 PC들도 모달 받고 적용됐는지
2. **수정 요청 #1/#2/#3 실 테스트** (TEST-GUIDE-2026-04-25.md, 사용자 담당)
3. **AI→SVG Phase 1+2+3 실 사용 검증** (사용자 담당)
4. **v1.0.5 후보 작업** 착수 검토 (수정 요청 누적 + AI→SVG UX 보강 + 그레이딩 timeout 60→120)

---

## 현재 작업
- **요청**: v1.0.0 릴리스 자산 검증 + 발견 결함 v1.0.1 패치
- **상태**: ✅ **정식 배포 완료** (`v1.0.1`, 2026-04-28 publish)
- **현재 담당**: 없음 (다음 작업 대기)

### v1.0.1 최종 산출물
- 태그: `v1.0.1` / 커밋: `8100736` / 미푸시: 0개
- URL: https://github.com/cobby8/grader/releases/tag/v1.0.1
- 자산 5종 + latest.json (notes에 CHANGELOG 정상 추출 ✨)
- 직원 PC 자동 업데이트 모달 전파 시작

### v1.0.2 후보 (이번 작업 외 발견사항)
- "알 수 없는 오류" 잔존 4곳 통일: `useAutoAiConvert.ts:312`, `FileGenerate.tsx:382, 457`, `Settings.tsx:94`
- awk 마지막 정식 버전 추출 시 부풀음 (release.yml P2)
- GitHub Actions Node.js 20 deprecation: `actions/checkout@v4`/`setup-node@v4` → `@v5` 업그레이드 (2026-06 강제 전환 전)
- AI→SVG UX 보강 (.tmp.ai 매핑, converting sub-status 등)
- 그레이딩 timeout 60→120초 (콜드 스타트 재현 시)

---

## 기획설계 (planner-architect)
(대기)

## 구현 기록 (developer)
(대기)

## 테스트 결과 (tester)
(대기)

## 리뷰 결과 (reviewer)
(대기)

---

## 진행 현황표
| 단계 | 내용 | 상태 |
|------|------|------|
| 0~7 | 기본 기능(패턴/디자인/사이즈/CMYK/Illustrator/APCA) | ✅ 완료 |
| 8 | 설치형 배포 + 자동 업데이트 | ✅ v1.0.0 배포 완료 |
| 9~13 | Drive/WorkSetup/즐겨찾기/OrderGenerate | ✅ 완료 |
| 12-A | SVG 일괄 표준화 Phase 1 | ✅ 완료 |
| 12-B | AI→SVG 자동 변환 Phase 1+2 | ✅ 완료 |
| 12-C | AI→SVG 자동 변환 Phase 3 (옵트인 자동) | ✅ 완료 |
| 12-D | 양면 유니폼 그레이딩 버그 4종 | ✅ 완료 |
| **v1.0.1** | **릴리스 결함 패치 (표시/마스킹/notes 자동화 + 첫 실행 폴더 + bump-version CRLF)** | ✅ **정식 배포 완료** (2026-04-28) |

---

## 수정 요청 (누적 보류)
| 요청자 | 대상 파일 | 문제 설명 | 상태 |
|--------|----------|----------|------|
| user | grading.jsx / 3XL.svg | 3XL 요소 몸판 벗어나 과하게 큼 | ✅ 수정됨 (0.95), 실테스트 대기 |
| user | 3XL.svg / 4XL.svg | 3XL/4XL 요소 몸판 상단 튀어나감 | 🔍 실테스트 필요 |
| user | grading.jsx / OrderGenerate | 기준 AI=XL로 XL 타겟 시 요소 0개 | 🔍 AI 레이어 구조 확인 필요 |
| user | driveSync.ts / PatternManage.tsx | G드라이브 신규 SVG 미인식 | ✅ 수정 완료, 실테스트 대기 |
| user | OrderGenerate / 환경 | 그레이딩 4건 전부 "알 수 없는 오류" 실패 | 🔄 본 PC 재시도 정상, 다른 PC 검증 대기 |

---

## 작업 로그 (최근 10건)
| 날짜 | 에이전트 | 작업 내용 | 결과 |
|------|---------|----------|------|
| 2026-04-26 | tester | Phase 3 정적 검증 (T1~T10) | 10/10 PASS |
| 2026-04-26 | reviewer | Phase 3 코드 리뷰 (7파일) | 🟢 우수, critical 0 |
| 2026-04-26 | developer | Phase 3 reviewer 권장 #1/#2/#3 처리 | tsc PASS ✅ |
| 2026-04-26 | pm | knowledge 갱신 + scratchpad 정리 | 커밋 `b54782d` + `818aade` |
| 2026-04-27 | debugger | 그레이딩 4건 실패 1차+2차 분석 — 코드 회귀 0건, Illustrator 콜드 스타트 timeout 마스킹 가설 | errors.md 등록, 다른 PC 검증 대기 |
| 2026-04-28 | pm | GitHub v1.0.0 자산 검증 — 결함 2건 발견 (v0.1.0 표시 / latest.json placeholder) | v1.0.1 패치 시작 |
| 2026-04-28 | developer | v1.0.1 패치 3건 (vite define / OrderGenerate 가면 벗기기 / release.yml CHANGELOG 추출) | 빌드 PASS, dist v0.1.0 0건, tsc PASS |
| 2026-04-28 | tester | v1.0.1 정적 검증 (T1~T10) | 10/10 PASS |
| 2026-04-28 | reviewer | v1.0.1 코드 리뷰 (7파일, Q1~Q10) | 🟢 우수, critical 0, 권장 P1/P2 |
| 2026-04-28 | pm | reviewer P1 반영 (release.yml fallback 어휘 강화) + 커밋 `6ffeb73` | 미푸시 4개 |
| 2026-04-28 | pm | 다른 PC 첫 실행 결함 즉시 처방 (write_file_absolute 부모 폴더 자동 생성) + 커밋 `84a000c` | cargo check PASS, 미푸시 5개 |
| 2026-04-28 | pm | bump-version.mjs CRLF 처리 보강 + 1.0.0→1.0.1 + 정리 커밋 (`8ac3dac`/`8100736`) + 푸시(7) + 태그 v1.0.1 | GitHub Actions 빌드 성공 (8m23s) |
| 2026-04-28 | pm | v1.0.2 핫픽스 (capabilities mkdir $APPDATA + settingsStore 명시 catch) + 직원 안내문 + publish | catch-22 결함 해소, NOTICE-v1.0.2.md 작성 |
| 2026-04-29 | pm | v1.0.3 catch-22 패턴 전수 점검 (store 4종 + capabilities 3종 + FileGenerate 가면 통일) + publish | 사전 차단 + 진단성 강화, NOTICE-v1.0.3.md 작성 |
| 2026-04-29 | pm | v1.0.4 CI 안정화 (Node 24 옵트인 + awk 종료 조건 보강) + publish | Node 24 forced 실행 OK 확인, 2026-06 대비 완료 |
| 2026-04-29 | pm | v1.0.4 직원 배포 공지문 작성 + 카톡 메모 발송 + 자동 업데이트 검증 (v1.0.1→v1.0.4 본 PC 성공) | NOTICE-v1.0.4.md 작성, lessons.md +1 (보수적 안내 유지 결정), 커밋 `11a2bbd`+`18ce181` |

---

## ⏸ 보류 (다음 작업)
- **다른 PC 검증** (사용자, 그레이딩 4건 실패 재현 여부) — timeout 연장 결정에 필요
- **v1.0.1 릴리스 빌드/태그 푸시** (다른 PC 검증 통과 후, 사용자 트리거)
- **수정 요청 3건 실행 테스트** (사용자, TEST-GUIDE-2026-04-25.md)
- **AI→SVG Phase 1+2+3 실 사용 검증** (사용자, 토글 ON 후 G드라이브 AI 자동 변환)
- 직원 첫 설치 피드백 수집 → INSTALL-GUIDE-STAFF.md FAQ 갱신
- v1.0.2 후보: "알 수 없는 오류" 4곳 통일 / awk P2 / AI→SVG UX 보강 / SVG 표준화 Phase 2

---

## 프로젝트 핵심 정보
- **기술 스택**: Tauri 2.x + React 19 + TypeScript + react-router-dom 7, Python 엔진(PyMuPDF/reportlab/pillow/openpyxl/svgpathtools), CSS+BEM
- **빌드**: `dev.bat` (MSVC), `build.bat`
- **주요 폴더**: `src/pages`, `src/components`, `src/services`, `src/stores`, `src/hooks`, `src/types`, `src-tauri`, `python-engine`, `illustrator-scripts`
- **데이터**: `$APPDATA/com.grader.app/`, Drive `G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG` (60초 쿨다운)
- **설치 경로**: `C:\Users\user\AppData\Local\Grader\` (NSIS 기본)

### 기획설계 참조
| 계획서 | 상태 |
|--------|------|
| PLAN-GRADING-REBUILD.md | 구현됨 |
| PLAN-WORKFLOW-REDESIGN.md | Phase 1~4 완료 |
| PLAN-AUTO-UPDATE.md | Phase A~D 완료, v1.0.0 배포 |
| PLAN-SVG-STANDARDIZATION.md | Phase 1-1~1-5 완료 |
| PLAN-AI-TO-SVG.md | Phase 1+2+3 완료 |
