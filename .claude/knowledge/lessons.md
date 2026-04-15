# 배운 교훈
<!-- 담당: 전체 에이전트 | 최대 30항목 -->
<!-- 삽질 경험, 다음에 피해야 할 것, 효과적이었던 접근법을 기록 -->

### [2026-04-16] ExtendScript 문서 간 이동은 clipboard 대신 duplicate가 기본
- **분류**: lesson
- **발견자**: developer (버그 B 수정)
- **내용**: Illustrator ExtendScript에서 source document의 아이템을 target document로 옮길 때 가장 직관적인 `copy/paste` 패턴은 Illustrator 앱 전역 상태(AICB clipboard)에 의존하기 때문에, 중간에 다른 문서를 열거나 닫으면 간헐적으로 clipboard가 무효화되는 위험이 있다. 특히 Illustrator는 **단일 인스턴스** 앱이라 이전 실행의 clipboard까지 섞이면서 재현도 불규칙하다. **대안**: `PageItem.duplicate(targetContainer, ElementPlacement.PLACEATEND)`는 clipboard를 거치지 않고 문서 간 직접 복제를 수행하며, 이미 grading.jsx STEP 7의 `path.duplicate(layerFill)`에서 검증된 방식이다. 제약: source document가 duplicate 호출 시점에 **열려 있어야** 원본 PageItem 참조가 유효. 교훈: 문서 간 이동 로직은 **처음부터 duplicate 패턴을 기본으로** 설계하고, clipboard는 "선택 복원이 필요한 경우에만" 제한적으로 사용한다.
- **참조횟수**: 0

### [2026-04-16] 회귀 누적 상태는 revert로 "기저점 확보 → 한 걸음씩 재도입"이 정답
- **분류**: lesson
- **발견자**: planner-architect (grading.jsx 4커밋 누적 회귀 감사)
- **내용**: grading.jsx에 c52d80f~06b16fa 4개 커밋이 누적되며 **3개 독립 버그**(STEP 8B 문서좌표 오비교, paste=0 격번, D1 아트보드 초과)가 동시 존재. 단일 hotfix(3개 동시 수정) 대신 **4커밋 전체 revert → 베이스라인 실측 → 기능 1개씩 재도입** 방식을 권장안으로 채택. 이유: (1) 버그 간 의존 구분 불가 → 한 번에 고치면 어느 수정이 효과냈는지 인과 격리 불가, (2) 사용자의 "차근차근" 원칙과 정합, (3) revert는 Git 이력 보존되므로 이전 코드 참조 가능, (4) 각 재도입 단계마다 실측하면 "기능↔회귀" 1:1 매핑 가능. 교훈: **여러 기능이 누적되며 동시다발적 회귀가 발생한 경우, "어디까지 고장났는지" 보다 "어디부터 다시 쌓을지" 관점이 더 효율적**. 앞으로 회귀 3개 이상이 얽힌 상태에서는 hotfix 대신 revert+재도입을 기본 옵션으로 고려한다.
- **참조횟수**: 0

### [2026-04-08] E2E 테스트는 파이프라인 출력물을 다시 입력에 넣어보는 방식이 가장 효과적
- **분류**: lesson
- **발견자**: tester (6단계)
- **내용**: 개별 단위 테스트에서는 `analyze_color`가 CMYK PDF(원본)를 정확히 판정하고, `generate_graded`가 CMYK를 보존하는 것도 각각 확인되었다. 그런데 6단계 E2E에서 "그레이딩 결과 PDF를 다시 analyze_color에 넣어보기"를 실행하자 `show_pdf_page` → Form XObject 래핑 → top-level content stream에서 감지 실패라는 연결 버그가 드러났다. 교훈: 파이프라인 끝 단계의 출력물을 파이프라인 초기 단계의 입력으로 "루프백"시켜 테스트하면, 단위 테스트로는 안 보이는 데이터 변환 누락이 드러난다. 앞으로 그레이딩 프로그램의 출력물을 다시 업로드하는 시나리오는 항상 테스트 체크리스트에 포함할 것.
- **참조횟수**: 0

### [2026-04-08] show_pdf_page는 CMYK를 "물리적으로" 보존하지만 "메타데이터 관점"에서는 숨길 수 있다
- **분류**: lesson
- **발견자**: tester (6단계)
- **내용**: PyMuPDF `show_pdf_page`는 원본 페이지를 Form XObject로 캡슐화해 새 페이지에 Do 연산자로 호출한다. 이 방식은 원본의 벡터/색상 정보를 있는 그대로 유지하므로 **인쇄 결과물은 정확히 CMYK**다. 하지만 상위 페이지 콘텐츠 스트림에서는 색상 연산자가 직접 보이지 않으므로, 콘텐츠 스트림만 검사하는 도구는 "색상 공간 불명"으로 오판한다. PDF 색상 분석 도구를 만들 때는 항상 (1) 페이지 콘텐츠 (2) Form XObject 스트림 (3) 리소스 딕셔너리의 ColorSpace 엔트리 세 곳을 모두 확인해야 완전하다.
- **참조횟수**: 0
