# 프로젝트 지식 목차

## 파일별 요약
| 파일 | 항목 수 | 최종 업데이트 |
|------|--------|------------|
| architecture.md | 15 | 2026-04-24 (SVG 표준화 Phase 1-5 + v1.0.0 릴리스 포함 추가) |
| errors.md | 11 | 2026-04-24 (grading v2 리팩토링 안전장치 3종 누락 패턴 추가) |
| conventions.md | 13 | 2026-04-22 (Tauri 래퍼 서비스 패턴 + 모듈 상태 공유 패턴 2건 추가) |
| decisions.md | 31 | 2026-04-22 (SVG 표준화 기준 파일 글로벌 고정 1건 추가) |
| lessons.md | 7 | 2026-04-23 (v1.0.0 첫 릴리스 교훈 — 서명 키 + Secret + draft 추가) |

## 최근 추가된 지식 (최근 15건)
1. [2026-04-24] error: grading v2 리팩토링에서 누락된 v1 안전장치 3종 — (a) D1 Step 3 아트보드 95% clamp 완전 제거 (b) ELEMENT_SCALE_EXPONENT 0.78→1.0 변경 + 상한 부재 (c) findBodyForLayer의 piece=null 즉시 실패로 `"요소"`+`"요소_표_앞"` 혼재 AI에서 요소 누락 가능
2. [2026-04-24] architecture: SVG 표준화 Phase 1-5 구현 완료 + v1.0.0 릴리스 포함 — Service 202줄/Modal 560줄/App.css +353줄/PatternManage +145줄, Phase 1-6/1-7은 실 사용 테스트로 대체
3. [2026-04-23] lesson: v1.0.0 첫 릴리스 교훈 — 서명 키 재생성 사이클 + Release draft→published 분리 + Actions Secret 길이 진단(`${#VAR}`)
4. [2026-04-22] decision: SVG 표준화 기준 파일 = 양면 상의는 글로벌 `양면유니폼_U넥_스탠다드_XL.svg` 고정 (드롭다운 제거), 그 외는 XL→2XL→L→M→S fallback — `resolveBaseFile()` 추가
5. [2026-04-22] architecture: SVG 표준화 Phase 1-4 구현 완료 — Rust 커맨드 2개(`svg_preview_normalize`/`svg_normalize_batch`) `run_python` 재사용 얇은 래퍼, cargo check 29.42초 PASS 에러/경고 0, sync fn 유지
6. [2026-04-22] architecture: SVG 표준화 앱 UI 통합 아키텍처 — Rust 커맨드 2개 + Modal 6상태 Phase 머신 + PatternManage ⋮ 메뉴 + 완료 시 Drive 재스캔 자동 트리거 (Phase 1-4~1-7)
7. [2026-04-22] decision: SVG 표준화 UI 버튼 배치 = 카드 ⋮ 더보기 메뉴 채택 — 즐겨찾기 별 옆, 상시 아이콘/별도 페이지/툴바 모두 거부
8. [2026-04-22] decision: SVG 표준화 Rust 커맨드 = `run_python` 재사용하는 전용 래퍼 2개 신규 — 타입 안전성 우선, 동적 문자열 직접 사용 거부
9. [2026-04-22] decision: SVG 표준화 Python 실행 = 기존 venv 유지 — sidecar 전환 거부(배포 복잡도 2배 + MSI 50MB+ 증가)
10. [2026-04-22] decision: SVG 표준화 Phase 1 범위 = U넥 양면유니폼 스탠다드 전용 유지 — V넥/하의는 Phase 3에서 JSON 프리셋 외부화
11. [2026-04-22] error: G드라이브 신규 사이즈 SVG가 UI에 반영 안 되는 버그 (driveSync.mergeDriveScanResult `sizes` 전체 보존 → 신규 차단 안티패턴) **[해결됨: 차집합 기반 신규만 추가 + SIZE_LIST 정렬]**
12. [2026-04-22] decision: Drive 스캔 `sizes` 병합 정책 = "기존 치수 보존 + 신규 사이즈 자동 추가 + SIZE_LIST 순 정렬" — 사용자 입력 보호는 항목 단위로 적용
13. [2026-04-22] architecture: 자동 업데이트 Phase C 업데이트 UI 구현 완료 (updaterService+useAutoUpdateCheck+UpdateModal+UpdateSection 4파일 신규, App/Settings/App.css 3파일 수정, tsc 통과, 모듈 상태+구독자 패턴)
14. [2026-04-22] convention: Tauri 플러그인 래퍼 서비스 패턴 — discriminated union으로 조용한 실패, throw 금지(앱 기동 방해 방지)
15. [2026-04-22] convention: React 전역 상태 공유는 모듈 상태 + listener Set 패턴 (Zustand/Context 없는 프로젝트의 가장 얇은 방법)
