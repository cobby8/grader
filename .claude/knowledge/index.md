# 프로젝트 지식 목차

## 파일별 요약
| 파일 | 항목 수 | 최종 업데이트 |
|------|--------|------------|
| architecture.md | 12 | 2026-04-22 (자동 업데이트 Phase C 구현 완료 추가) |
| errors.md | 10 | 2026-04-22 (driveSync sizes 병합 버그 해결됨 추가) |
| conventions.md | 13 | 2026-04-22 (Tauri 래퍼 서비스 패턴 + 모듈 상태 공유 패턴 2건 추가) |
| decisions.md | 26 | 2026-04-22 (Drive 사이즈 병합 정책 1건 추가) |
| lessons.md | 6 | 2026-04-21 |

## 최근 추가된 지식 (최근 15건)
1. [2026-04-22] error: G드라이브 신규 사이즈 SVG가 UI에 반영 안 되는 버그 (driveSync.mergeDriveScanResult `sizes` 전체 보존 → 신규 차단 안티패턴) **[해결됨: 차집합 기반 신규만 추가 + SIZE_LIST 정렬]**
2. [2026-04-22] decision: Drive 스캔 `sizes` 병합 정책 = "기존 치수 보존 + 신규 사이즈 자동 추가 + SIZE_LIST 순 정렬" — 사용자 입력 보호는 항목 단위로 적용
3. [2026-04-22] architecture: 자동 업데이트 Phase C 업데이트 UI 구현 완료 (updaterService+useAutoUpdateCheck+UpdateModal+UpdateSection 4파일 신규, App/Settings/App.css 3파일 수정, tsc 통과, 모듈 상태+구독자 패턴)
4. [2026-04-22] convention: Tauri 플러그인 래퍼 서비스 패턴 — discriminated union으로 조용한 실패, throw 금지(앱 기동 방해 방지)
5. [2026-04-22] convention: React 전역 상태 공유는 모듈 상태 + listener Set 패턴 (Zustand/Context 없는 프로젝트의 가장 얇은 방법)
6. [2026-04-22] architecture: 자동 업데이트 Phase B CI 워크플로우 구현 완료 (release.yml 131줄 tauri-action@v0 Draft 모드 + bump-version.mjs 267줄 3파일 동기화 포맷 보존 정규식 교체)
7. [2026-04-22] architecture: 자동 업데이트 Phase A 기반 설정 구현 완료 (cargo check 통과, 3파일 v1.0.0 통일, keys/ gitignore 차단 검증)
8. [2026-04-22] architecture: 자동 업데이트 시스템(Tauri Updater + GitHub Releases + Actions) 아키텍처 전체
9. [2026-04-22] decision: 자동 업데이트 플랫폼으로 Tauri Updater + GitHub Releases + Actions 조합 채택(self-hosted/자체구현 거부)
10. [2026-04-22] decision: 서명 private 키는 G드라이브 공유 폴더 보관(.gitignore로 리포 차단)
11. [2026-04-22] decision: Semantic Versioning + 태그 기반 릴리스(v{x.y.z}), 3파일 동기화 스크립트 사용
12. [2026-04-22] decision: bundle.resources는 prebuild 자동 스캔 스크립트로 관리(수동 나열/글롭 거부)
13. [2026-04-22] decision: 업데이트 UI는 App.tsx 자동 팝업 + Settings 섹션 이중 진입점
14. [2026-04-22] decision: 릴리스는 Draft 생성 후 수동 Publish (실수 배포 방지 안전장치)
15. [2026-04-21] convention: 요소 배치는 "relVec 개별 translate" 패턴으로 통일 (이름모드/폴백/band 3곳 공통) **[복구됨: 폴백 함수 재사용 방식, group/ungroup 1회 구조]**
