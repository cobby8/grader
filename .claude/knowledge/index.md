# 프로젝트 지식 목차

## 파일별 요약
| 파일 | 항목 수 | 최종 업데이트 |
|------|--------|------------|
| architecture.md | 8 | 2026-04-21 |
| errors.md | 9 | 2026-04-21 (3차 분석 포팅 구조 반영) |
| conventions.md | 11 | 2026-04-21 (relVec 패턴 복구됨으로 갱신) |
| decisions.md | 19 | 2026-04-21 |
| lessons.md | 6 | 2026-04-21 |

## 최근 추가된 지식 (최근 12건)
0. [2026-04-21] convention: 요소 배치는 "relVec 개별 translate" 패턴으로 통일 (이름모드/폴백/band 3곳 공통) **[복구됨: 폴백 함수 재사용 방식, group/ungroup 1회 구조]**
1. [2026-04-21] convention: Illustrator ExtendScript 좌표계 규칙 — `isTop = (cy > midY)` 로 3곳 통일
2. [2026-04-21] error: 양면 유니폼 Y축 부등호 방향 혼용 (findBodyForLayer `<` vs 색상매칭 `>`) — 버그1,4 근원 **[해결됨: L556 `>`로 통일]**
3. [2026-04-21] error: 이름 기반 요소 배치 모드에 relVec 누락 **[재수정 완료: 폴백 `placeElementGroupPerPiece` 재사용 + group/ungroup 1회 구조. DEBUG_LOG=true 임시 ON으로 실행 검증 대기]**
4. [2026-04-21] error: 양면 유니폼 면적비 정규화 필요 **[수정 롤백됨: count 대칭 케이스라 효과 0, 비대칭 분기 필요]**
5. [2026-04-21] decision: AI→SVG 자동 변환 — JSX 방식 + 별도 페이지 (grader 내장 예정)
6. [2026-04-21] decision: AI 파일 처리는 헤더 바이트 기반 하이브리드 파이프라인 (PyMuPDF 89% + JSX 11%)
7. [2026-04-21] lesson: SVG path 분류는 x_min(위치)보다 width(크기)가 더 안정적 — 변환 불변량 우선
8. [2026-04-21] lesson: AI 파일은 헤더로 변환 도구 분기 (PDF 호환 vs PostScript 원본)
9. [2026-04-21] lesson: SVG 변환 파이프라인 검증 = Idempotent 테스트 + 시각 확인 단계
10. [2026-04-21] error: SVG 분류 로직 4그룹 12 path 누락 버그 → 폭 비교 우선으로 해결
11. [2026-04-21] error: SVG 패턴 단순 Tx swap 금지 (로컬 원점 다름)
12. [2026-04-21] architecture: svg_normalizer.py 모듈 추가 (950줄, 11함수, U넥 양면유니폼 전용 Phase 1)
