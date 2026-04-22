# 프로젝트 지식 목차

## 파일별 요약
| 파일 | 항목 수 | 최종 업데이트 |
|------|--------|------------|
| architecture.md | 10 | 2026-04-22 (자동 업데이트 Phase A 구현 완료 추가) |
| errors.md | 9 | 2026-04-21 (3차 분석 포팅 구조 반영) |
| conventions.md | 11 | 2026-04-21 (relVec 패턴 복구됨으로 갱신) |
| decisions.md | 25 | 2026-04-22 (자동 업데이트 결정 6건 추가) |
| lessons.md | 6 | 2026-04-21 |

## 최근 추가된 지식 (최근 15건)
1. [2026-04-22] architecture: 자동 업데이트 Phase A 기반 설정 구현 완료 (cargo check 통과, 3파일 v1.0.0 통일, keys/ gitignore 차단 검증)
2. [2026-04-22] architecture: 자동 업데이트 시스템(Tauri Updater + GitHub Releases + Actions) 아키텍처 전체
3. [2026-04-22] decision: 자동 업데이트 플랫폼으로 Tauri Updater + GitHub Releases + Actions 조합 채택(self-hosted/자체구현 거부)
3. [2026-04-22] decision: 서명 private 키는 G드라이브 공유 폴더 보관(.gitignore로 리포 차단)
4. [2026-04-22] decision: Semantic Versioning + 태그 기반 릴리스(v{x.y.z}), 3파일 동기화 스크립트 사용
5. [2026-04-22] decision: bundle.resources는 prebuild 자동 스캔 스크립트로 관리(수동 나열/글롭 거부)
6. [2026-04-22] decision: 업데이트 UI는 App.tsx 자동 팝업 + Settings 섹션 이중 진입점
7. [2026-04-22] decision: 릴리스는 Draft 생성 후 수동 Publish (실수 배포 방지 안전장치)
8. [2026-04-21] convention: 요소 배치는 "relVec 개별 translate" 패턴으로 통일 (이름모드/폴백/band 3곳 공통) **[복구됨: 폴백 함수 재사용 방식, group/ungroup 1회 구조]**
9. [2026-04-21] convention: Illustrator ExtendScript 좌표계 규칙 — `isTop = (cy > midY)` 로 3곳 통일
10. [2026-04-21] error: 양면 유니폼 Y축 부등호 방향 혼용 (findBodyForLayer `<` vs 색상매칭 `>`) — 버그1,4 근원 **[해결됨: L556 `>`로 통일]**
11. [2026-04-21] error: 이름 기반 요소 배치 모드에 relVec 누락 **[재수정 완료: 폴백 `placeElementGroupPerPiece` 재사용 + group/ungroup 1회 구조]**
12. [2026-04-21] error: 양면 유니폼 면적비 정규화 필요 **[수정 롤백됨: count 대칭 케이스라 효과 0, 비대칭 분기 필요]**
13. [2026-04-21] decision: AI→SVG 자동 변환 — JSX 방식 + 별도 페이지 (grader 내장 예정)
14. [2026-04-21] decision: AI 파일 처리는 헤더 바이트 기반 하이브리드 파이프라인 (PyMuPDF 89% + JSX 11%)
15. [2026-04-21] architecture: svg_normalizer.py 모듈 추가 (950줄, 11함수, U넥 양면유니폼 전용 Phase 1)
