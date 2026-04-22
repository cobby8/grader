# 프로젝트 지식 목차

## 파일별 요약
| 파일 | 항목 수 | 최종 업데이트 |
|------|--------|------------|
| architecture.md | 14 | 2026-04-22 (Phase 1-4 Rust 커맨드 2개 구현 완료 추가) |
| errors.md | 10 | 2026-04-22 (driveSync sizes 병합 버그 해결됨 추가) |
| conventions.md | 13 | 2026-04-22 (Tauri 래퍼 서비스 패턴 + 모듈 상태 공유 패턴 2건 추가) |
| decisions.md | 30 | 2026-04-22 (SVG 표준화 결정 4건 추가) |
| lessons.md | 6 | 2026-04-21 |

## 최근 추가된 지식 (최근 15건)
1. [2026-04-22] architecture: SVG 표준화 Phase 1-4 구현 완료 — Rust 커맨드 2개(`svg_preview_normalize`/`svg_normalize_batch`) `run_python` 재사용 얇은 래퍼, cargo check 29.42초 PASS 에러/경고 0, sync fn 유지
2. [2026-04-22] architecture: SVG 표준화 앱 UI 통합 아키텍처 — Rust 커맨드 2개 + Modal 6상태 Phase 머신 + PatternManage ⋮ 메뉴 + 완료 시 Drive 재스캔 자동 트리거 (Phase 1-4~1-7)
3. [2026-04-22] decision: SVG 표준화 UI 버튼 배치 = 카드 ⋮ 더보기 메뉴 채택 — 즐겨찾기 별 옆, 상시 아이콘/별도 페이지/툴바 모두 거부
4. [2026-04-22] decision: SVG 표준화 Rust 커맨드 = `run_python` 재사용하는 전용 래퍼 2개 신규 — 타입 안전성 우선, 동적 문자열 직접 사용 거부
5. [2026-04-22] decision: SVG 표준화 Python 실행 = 기존 venv 유지 — sidecar 전환 거부(배포 복잡도 2배 + MSI 50MB+ 증가)
6. [2026-04-22] decision: SVG 표준화 Phase 1 범위 = U넥 양면유니폼 스탠다드 전용 유지 — V넥/하의는 Phase 3에서 JSON 프리셋 외부화
7. [2026-04-22] error: G드라이브 신규 사이즈 SVG가 UI에 반영 안 되는 버그 (driveSync.mergeDriveScanResult `sizes` 전체 보존 → 신규 차단 안티패턴) **[해결됨: 차집합 기반 신규만 추가 + SIZE_LIST 정렬]**
8. [2026-04-22] decision: Drive 스캔 `sizes` 병합 정책 = "기존 치수 보존 + 신규 사이즈 자동 추가 + SIZE_LIST 순 정렬" — 사용자 입력 보호는 항목 단위로 적용
9. [2026-04-22] architecture: 자동 업데이트 Phase C 업데이트 UI 구현 완료 (updaterService+useAutoUpdateCheck+UpdateModal+UpdateSection 4파일 신규, App/Settings/App.css 3파일 수정, tsc 통과, 모듈 상태+구독자 패턴)
10. [2026-04-22] convention: Tauri 플러그인 래퍼 서비스 패턴 — discriminated union으로 조용한 실패, throw 금지(앱 기동 방해 방지)
11. [2026-04-22] convention: React 전역 상태 공유는 모듈 상태 + listener Set 패턴 (Zustand/Context 없는 프로젝트의 가장 얇은 방법)
12. [2026-04-22] architecture: 자동 업데이트 Phase B CI 워크플로우 구현 완료 (release.yml 131줄 tauri-action@v0 Draft 모드 + bump-version.mjs 267줄 3파일 동기화 포맷 보존 정규식 교체)
13. [2026-04-22] architecture: 자동 업데이트 Phase A 기반 설정 구현 완료 (cargo check 통과, 3파일 v1.0.0 통일, keys/ gitignore 차단 검증)
14. [2026-04-22] architecture: 자동 업데이트 시스템(Tauri Updater + GitHub Releases + Actions) 아키텍처 전체
15. [2026-04-22] decision: 자동 업데이트 플랫폼으로 Tauri Updater + GitHub Releases + Actions 조합 채택(self-hosted/자체구현 거부)
