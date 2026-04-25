# 프로젝트 지식 목차

## 파일별 요약
| 파일 | 항목 수 | 최종 업데이트 |
|------|--------|------------|
| architecture.md | 17 | 2026-04-25 (AI→SVG Phase 1 구현 완료 항목 추가) |
| errors.md | 11 | 2026-04-24 (grading v2 리팩토링 안전장치 3종 누락 패턴 추가) |
| conventions.md | 13 | 2026-04-22 (Tauri 래퍼 서비스 패턴 + 모듈 상태 공유 패턴 2건 추가) |
| decisions.md | 37 | 2026-04-25 (AI→SVG Phase 1 설계 결정 6건 추가) |
| lessons.md | 7 | 2026-04-23 (v1.0.0 첫 릴리스 교훈 — 서명 키 + Secret + draft 추가) |

## 최근 추가된 지식 (최근 15건)
1. [2026-04-25] architecture: AI→SVG Phase 1 **구현 완료** — 437/239/680줄 신규(ai_converter/Service/Modal), reviewer 🟢 우수(critical 0, 권장 3건 모두 처리: typing.Any 삭제/--unknown→--ps/invokeAndParse 헬퍼). PLAN 차이점 1건: ScanResult 평면 구조(data 경유 X). 커밋 A `63668d4` + B `629d805` + C 예정
2. [2026-04-25] architecture: AI→SVG 자동 변환 Phase 1 통합 아키텍처 — Python ai_converter(~300줄, 헤더 10B 검사+PyMuPDF text_as_path)/Rust 커맨드 2개(run_python 재사용)/aiConvertService(~130줄)/AiConvertModal(~450줄, 6상태 Phase 머신)/driveSync.ts 확장(unconvertedAiFiles 수집)/PatternManage 배너. SVG 표준화 3층 구조 완전 미러. PLAN-AI-TO-SVG.md 1017줄
2. [2026-04-25] decision: AI→SVG Phase 1 분기 로직 = 헤더 첫 10바이트 바이너리 검사(%PDF- vs %!PS-Adobe vs unknown) — 외부 63개 실증 100%, 확장자+try/except 거부
3. [2026-04-25] decision: AI→SVG 실행 방식 = 반자동(배너+사용자 클릭) — 완전 자동 거부(Phase 3에서 옵트인), 투명성 우선
4. [2026-04-25] decision: AI→SVG 저장 위치 = G드라이브 동일 폴더(XL.ai 옆 XL.svg) — 별도 폴더/다운로드/AppData 거부, Drive 스캔이 자연 인식
5. [2026-04-25] decision: AI→SVG 충돌 처리 = 기본 skip + 옵션 덮어쓰기(.bak 백업) — SVG 표준화 UX 패턴 재사용, Phase 1 배너 경로에선 사실상 엣지 케이스
6. [2026-04-25] decision: AI→SVG 미변환 알림 = PatternManage 상단 배너 — 전역 헤더/토스트/Settings 거부, 도메인 일치 + 재진입 가능
7. [2026-04-25] decision: AI→SVG Rust 커맨드 = 신규 2개 추가(ai_convert_preview/ai_convert_batch), run_python 얇은 래퍼 — SVG 표준화와 동일 논리(타입 안전성)
8. [2026-04-24] error: grading v2 리팩토링에서 누락된 v1 안전장치 3종 — (a) D1 Step 3 아트보드 95% clamp 완전 제거 (b) ELEMENT_SCALE_EXPONENT 0.78→1.0 변경 + 상한 부재 (c) findBodyForLayer의 piece=null 즉시 실패로 `"요소"`+`"요소_표_앞"` 혼재 AI에서 요소 누락 가능
9. [2026-04-24] architecture: SVG 표준화 Phase 1-5 구현 완료 + v1.0.0 릴리스 포함 — Service 202줄/Modal 560줄/App.css +353줄/PatternManage +145줄, Phase 1-6/1-7은 실 사용 테스트로 대체
10. [2026-04-23] lesson: v1.0.0 첫 릴리스 교훈 — 서명 키 재생성 사이클 + Release draft→published 분리 + Actions Secret 길이 진단(`${#VAR}`)
11. [2026-04-22] decision: SVG 표준화 기준 파일 = 양면 상의는 글로벌 `양면유니폼_U넥_스탠다드_XL.svg` 고정 (드롭다운 제거), 그 외는 XL→2XL→L→M→S fallback — `resolveBaseFile()` 추가
12. [2026-04-22] architecture: SVG 표준화 앱 UI 통합 아키텍처 — Rust 커맨드 2개 + Modal 6상태 Phase 머신 + PatternManage ⋮ 메뉴 + 완료 시 Drive 재스캔 자동 트리거 (Phase 1-4~1-7)
13. [2026-04-22] decision: SVG 표준화 UI 버튼 배치 = 카드 ⋮ 더보기 메뉴 채택 — 즐겨찾기 별 옆, 상시 아이콘/별도 페이지/툴바 모두 거부
14. [2026-04-22] decision: SVG 표준화 Rust 커맨드 = `run_python` 재사용하는 전용 래퍼 2개 신규 — 타입 안전성 우선, 동적 문자열 직접 사용 거부
15. [2026-04-22] architecture: 자동 업데이트 Phase C 업데이트 UI 구현 완료 (updaterService+useAutoUpdateCheck+UpdateModal+UpdateSection 4파일 신규, App/Settings/App.css 3파일 수정, tsc 통과, 모듈 상태+구독자 패턴)
