# 프로젝트 지식 목차

## 파일별 요약
| 파일 | 항목 수 | 최종 업데이트 |
|------|--------|------------|
| architecture.md | 8 | 2026-04-21 |
| errors.md | 6 | 2026-04-21 |
| conventions.md | 9 | 2026-04-10 |
| decisions.md | 17 | 2026-04-21 |
| lessons.md | 6 | 2026-04-21 |

## 최근 추가된 지식 (최근 7건)
1. [2026-04-21] lesson: SVG path 분류는 x_min(위치)보다 width(크기)가 더 안정적 — 변환 불변량 우선
2. [2026-04-21] lesson: AI 파일은 헤더로 변환 도구 분기 (PDF 호환 vs PostScript 원본)
3. [2026-04-21] lesson: SVG 변환 파이프라인 검증 = Idempotent 테스트 + 시각 확인 단계
4. [2026-04-21] error: SVG 분류 로직 4그룹 12 path 누락 버그 → 폭 비교 우선으로 해결
5. [2026-04-21] error: SVG 패턴 단순 Tx swap 금지 (로컬 원점 다름)
6. [2026-04-21] decision: SVG 일괄 표준화 모듈은 svg_parser.py 확장 대신 신규 svg_normalizer.py 분리
7. [2026-04-21] architecture: svg_normalizer.py 모듈 추가 (950줄, 11함수, U넥 양면유니폼 전용 Phase 1)
