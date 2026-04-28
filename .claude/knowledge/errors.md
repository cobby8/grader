# 에러 및 함정 모음
<!-- 담당: debugger, tester | 최대 30항목 -->
<!-- 이 프로젝트에서 반복되는 에러 패턴, 함정, 주의사항을 기록 -->

### [2026-04-28] scripts/bump-version.mjs 의 split('\\n') 이 Windows CRLF에서 Cargo.toml [package] 매칭 실패
- **분류**: error
- **발견자**: pm (v1.0.1 릴리스 직전 `npm run release:bump 1.0.1` 실행 시 "Cargo.toml의 [package] 섹션에서 version 필드를 찾을 수 없음" 에러)
- **내용**: `scripts/bump-version.mjs:94`의 `lines = raw.split('\n')` 이 Windows CRLF 라인 종결을 제대로 안 풀어 라인 끝에 `\r`이 남음. 그 상태에서 version 매칭 정규식 `^(\s*version\s*=\s*)"([^"]+)"(.*)$`이 실패. 원인: ECMAScript 사양상 `(.*)`의 `.`은 line terminator(`\n`/`\r`/U+2028/U+2029)를 매칭하지 않고, multiline 플래그 없는 `$`도 input 끝만 매칭하므로 `\r$` 형태에서 `(.*)$`가 어긋남. 결과: Cargo.toml [package] 섹션은 정상 인식했지만 version 행 매칭 실패 → 스크립트 abort. **해결**: `split(/\r?\n/)`으로 변경 (1줄). `\r`이 split 단계에서 자동 제거되어 정규식 정상 동작. **교훈**: Windows 환경에서 텍스트 라인 단위 처리 시 `split('\n')`은 항상 `\r` 누수 위험이 있다. 표준 패턴은 `split(/\r?\n/)`. **참고**: package.json/tauri.conf.json은 첫 매치 정규식이라 `(.*)$` 같은 줄 끝 캡처가 없어 영향 안 받았음 — Cargo.toml 만 라인별 처리라 결함 노출.
- **참조횟수**: 0

### [2026-04-28] write_file_absolute 부모 폴더 미생성으로 첫 실행 PC에서 settings.json 저장 실패 (os error 3)
- **분류**: error
- **발견자**: pm (사용자 다른 PC에서 Drive 경로 [적용] 시 "지정된 경로를 찾을 수 없습니다 (os error 3)" 저장 실패 화면 캡처)
- **내용**: `src-tauri/src/lib.rs:383~385` `write_file_absolute` 커맨드가 단순히 `std::fs::write(&path, &content)` 만 호출. Rust 표준 `fs::write`는 **부모 폴더가 없으면 즉시 실패**하며 자동 생성하지 않음. 다른 PC(`cobby` 사용자)에서 앱을 처음 실행하면 `%APPDATA%\com.grader.app\` 폴더 자체가 아직 안 만들어진 상태인데, 사용자가 Drive 경로 [적용] 누르면 settings.json 저장 시도 → 부모 폴더 부재 → Windows ERROR_PATH_NOT_FOUND (os error 3) → "저장 실패: failed to open file at path: ... settings.json with error: 지정된 경로를 찾을 수 없습니다." 이전엔 본 PC에서만 테스트해 폴더가 이미 존재해 결함이 안 보였음. **교훈**: 절대 경로 파일 쓰기 커맨드는 반드시 `Path::parent()` + `create_dir_all` 패턴으로 부모 폴더를 보장해야 한다. `create_dir_all`은 이미 존재하면 no-op이라 매 호출 호출해도 안전. 첫 실행 환경(폴더 없음)을 본 PC 테스트만으로 발견 못 한 사례 — 다른 PC/신규 PC 검증의 가치. **임시 우회**: 사용자가 `%APPDATA%\com.grader.app\` 폴더 수동 생성 후 재실행. **근본 처방(v1.0.1)**: `write_file_absolute`에 `create_dir_all` 5줄 추가. read_file_absolute / remove_file_absolute는 부모 폴더 자동 생성 의미 없으므로 미적용.
- **참조횟수**: 0

### [2026-04-28] GitHub Release v1.0.0 빌드에 v0.1.0 하드코딩이 그대로 박혀 배포된 결함
- **분류**: error
- **발견자**: pm (사용자가 v1.0.0 setup.exe 새로 받아 설치해도 화면에 v0.1.0 표시되는 증상 추적)
- **내용**: `src/components/StatusBar.tsx:16`과 `src/pages/Settings.tsx:480`에 `"v0.1.0"` / `"0.1.0"` 문자열이 **하드코딩**되어 있어 빌드 산출물(`dist/assets/index-CuRAnkPY.js`)에 그대로 박힘. `package.json`/`tauri.conf.json`은 `1.0.0`이지만 UI 표시는 `0.1.0`. v1.0.0 setup.exe를 새로 다운로드/설치해도 동일 증상. **추가 발견**: `latest.json`의 `notes` 필드도 `release.yml` `releaseBody` placeholder("자동 생성된 릴리스입니다. 아래 체크 후 Publish 해 주세요" + "(여기에 CHANGELOG 내용을 붙여넣거나 직접 작성)")가 그대로 박힌 채 published — Tauri Updater 자동 업데이트 모달에서 사용자가 그대로 보게 됨. **교훈**: 하드코딩된 버전 문자열은 릴리스마다 자동 갱신되지 않아 표시 불일치를 유발한다. 빌드 산출물에 직접 grep으로 버전 문자열을 확인하는 검증 step을 release.yml에 추가할 가치 있음. `releaseBody`도 placeholder 그대로 두지 말고 CHANGELOG 자동 추출 로직 필수. **해결 방향(v1.0.1)**: (A) StatusBar/Settings에서 `package.json` version을 import하여 동적 표시, (B) `release.yml`에 CHANGELOG.md에서 해당 버전 섹션 추출하여 `releaseBody`에 주입하는 step 추가.
- **참조횟수**: 0

### [2026-04-27] 그레이딩 4건 동시 "알 수 없는 오류" — Tauri String Err이 instanceof Error catch에 마스킹됨 + Illustrator 콜드 스타트 timeout
- **분류**: error
- **발견자**: debugger (1차+2차 분석 + 사용자 답변 5건)
- **내용**: 사용자가 4사이즈 그레이딩 시도 → 4건 모두 "알 수 없는 오류" fallback. **표면 원인**: `src/pages/OrderGenerate.tsx:621`의 `e instanceof Error ? e.message : "알 수 없는 오류"` fallback이 Tauri Rust 커맨드의 `Result<String, String>` Err을 받을 때 `e`가 String 타입이라 Error 인스턴스가 아니어서 fallback 발동 → 진짜 메시지 마스킹. **근본 원인 (가설 P1)**: Illustrator 콜드 스타트 — 4/22 이후 5일 만의 첫 사용으로 Adobe CC 라이선스 캐시/인증 만료 또는 좀비 프로세스 잔존 → spawn 자체는 성공했으나 UI 미출현/result.json 미생성 → `lib.rs:277` 60초 timeout × 4사이즈 = 4분 → string Err 마스킹 → "알 수 없는 오류". 사용자 답변 5건이 부합: (1) Illustrator 작업 표시줄 미출현, (2) 4/22 이후 첫 시도, (3) Adobe 업데이트 없음, (4) 다른 폴더도 동일 실패, (5) 본 PC 재시도하니 정상. 코드 회귀 0건 확인(git log 직접). **교훈**: Tauri 커맨드 시그니처 `Result<T, String>` 사용 시 Err 분기는 catch에서 string으로 받아야 하며 `instanceof Error` 단독 검사는 마스킹 위험. **해결 방향(v1.0.1)**: (A) fallback에 `typeof e === "string" ? e : "알 수 없는 오류"` 분기 추가(가면 벗기기), (B) timeout 60→120초 확장(콜드 스타트 대비, 다른 PC 재현 시 적용), (C) 향후 spawn 후 child PID 로깅 검토.
- **참조횟수**: 0

### [2026-04-24] grading v2 리팩토링에서 누락된 v1 안전장치 3종 (clamp / exponent / piece=null 폴백)
- **분류**: error
- **발견자**: debugger (수정 요청 3건 재검증 정적 분석)
- **내용**: grading.jsx가 v1(2128줄)→v2(1585줄) 재구축되며 **큰 사이즈 요소 과대/튀어나감 방지 안전망**이 여러 개 사라졌다. (1) v1 L1836 `USE_D1_MODE` 블록의 **D1 Step 3 "아트보드 95% 초과 시 scale down(clamp)" 로직** 완전 제거 — `MARGIN_RATIO=0.95`/`clampScale` 기호가 v2에 0건. (2) `ELEMENT_SCALE_EXPONENT = 0.78 → 1.0` 변경(L1172) — 2XS 축소 부족 완화 목적이었으나 **3XL/4XL 방향 상한 부재와 결합해 요소 확대 방지 장치가 전무**. 주석 L1171에 "SVG 자체가 XL의 86% 크기인 근본 문제"를 인지하면서도 대응 없이 방치. (3) 이름 기반 모드의 `findBodyForLayer` L537 `if (!piece || bodies.length === 0) return -1;` — 레이어가 `"요소"`(piece=null, side=null)인 경우 즉시 -1 반환 → L1279 "건너뜀". `hasNamedLayers` 판정(L1163)은 `piece !== null` 레이어가 1개라도 있으면 true이므로 **`"요소"`와 `"요소_표_앞"`이 혼재된 AI 파일에서는 piece=null 레이어 요소가 전부 누락될 수 있음**. **교훈**: 재구축 시 v1의 안전망(clamp/가드/폴백)은 별도 목록으로 뽑아놓고 v2에서 재현/대체됐는지 하나씩 확인해야 한다. "근본 문제는 다른 쪽에서 해결"이라는 주석은 실제로 다른 쪽이 해결될 때까지 안전망을 **빼면 안 된다**. Y 좌표 누적 전가 버그(v1 3XL/4XL 아트보드 초과)는 v2의 "절대 body 기준 재계산"(L683~687)으로 구조적 해결됐으나, clamp 부재로 scale 측면 재발 가능. **재현 조건**: 타겟 3XL/4XL + ELEMENT_SCALE_EXPONENT=1.0 + SVG body가 XL 대비 86% 크기. **해결 후보**: (A) exponent 0.9~0.95 재도입, (B) D1 clamp 로직 이식, (C) `adjustedScale = Math.min(linearScale, 1.0)` 상한, (D) findBodyForLayer에 piece=null 폴백 분기 (유클리드 매칭 위임).
- **참조횟수**: 0

### [2026-04-22] G드라이브 신규 사이즈 SVG가 UI에 반영 안 되는 버그 (driveSync.mergeDriveScanResult) — 해결됨
- **분류**: error
- **발견자**: debugger → developer (근본 수정 완료)
- **내용**: 사용자가 기존 패턴 폴더에 신규 사이즈 SVG(예: `양면유니폼_U넥_스탠다드_5XL.svg`) 추가 후 앱 재스캔해도 주문 생성 페이지 사이즈 체크박스에 5XL이 활성 안 됨. F12 로그에 `신규 0, 갱신 79, 경고 55건`으로 뜨고 5XL은 경고 목록에도 없어 파일명 규칙/경로 문제는 아니었음. **근본 원인**: `src/services/driveSync.ts` L615~643 `mergeDriveScanResult` 함수의 기존 프리셋 갱신 블록이 `svgPathBySize`(경로 맵)는 최신 스캔 결과로 교체하지만 `sizes` 배열 전체는 "사용자 치수 보존 목적"으로 건드리지 않고 유지. 결과적으로 UI 렌더링 기준인 `sizes`에 5XL이 없어 체크박스에 나타나지 않음. **교훈**: "사용자 입력 데이터 보존" 정책을 배열 전체 보존으로 구현하면 "신규 항목 자동 추가까지 차단"하는 안티패턴이 된다. 보존은 **항목 단위**로 해야 함 — "기존 항목의 값은 덮지 않되, 신규 항목은 추가". 데이터 흐름 설계 시 "소스(Drive)에는 있지만 로컬에 없는 것"과 "로컬에만 있고 소스에서 없어진 것"을 구분해 각각의 병합 정책을 명시해야 한다. **해결**: `existingSizeNames: Set<string>` 기반 차집합으로 신규 사이즈만 선별 → 기존 프리셋의 `pieces[0].pieceId` 재사용하며 width/height=0으로 초기화 → `SIZE_LIST.indexOf` 기준 오름차순 정렬 후 저장. 기존 사이즈 치수는 `...existing.sizes`로 원본 객체 복사하므로 값 손실 0.
- **참조횟수**: 0

### [2026-04-21] 양면 유니폼 Y축 부등호 방향 혼용 버그 (findBodyForLayer vs 색상 4분면 매칭)
- **분류**: error
- **발견자**: debugger (커밋 e79959d 양면 유니폼 버그 4종 분석 중)
- **내용**: grading.jsx에서 "상단/하단"을 판정하는 부등호가 함수마다 달랐다. `findBodyForLayer`(L556)는 `isTop = (cy < midY)`로, 색상 4분면 매칭 루프(L1218,1222)는 `(cy > midY)`로 썼다. Illustrator의 `geometricBounds[1]`(top)은 **Y 클수록 위**이므로 후자가 맞다. 전자는 반대 방향이라 "요소_표_앞"이 SVG의 이면 body 위에 배치되고 색상도 엉뚱한 몸판에 들어가 "흰 몸판 + 흰 글자" 같은 색상 반전까지 파생됐다(독립 버그 아닌 파생). **교훈**: 문서 내 "상/하" 판정 기준은 모듈 공통 헬퍼(`isTopInDoc(cy, midY)`)로 통일하자. Illustrator 좌표계는 PostScript와 동일한 "Y 위가 큰 값"이라는 사실을 코멘트로 반복 명시. **해결 방향**: L556 부등호를 `>`로 수정하면 버그1(표/이 스왑)과 버그4(색상 반전)가 동시에 해결됨. 추가로 몸판 path에도 이름("표_앞" 등)을 붙여 bbox 추정을 완전히 제거하는 구조 개선 권장.
- **참조횟수**: 0

### [2026-04-21] 이름 기반 요소 배치 모드에 상대 좌표 누락 (grading.jsx L1304) — 3차 분석으로 포팅 구조 확정
- **분류**: error
- **발견자**: debugger (양면 유니폼 버그 3: 번호/이름/로고 "외측 위 쏠림")
- **내용**: 커밋 e79959d에서 추가된 "이름 기반 모드"(hasNamedLayers 경로)는 요소들을 그룹화한 뒤 "그룹 하단 = body 하단, 그룹 중심x = body 중심x"로 **통째로 한 번만 translate**한다(L1306~1309). 폴백 모드는 `placeElementGroupPerPiece`가 요소별 `relVec.dx/dy`를 사용해 개별 배치하는 것과 대조적. 결과: 번호는 body 상단, 이름은 body 하단 같은 원래 상대 위치가 모두 "body 하단 뭉침" 상태가 된다. **2차 분석(사용자 증상 "외측 위 쏠림")**: 원인은 **디자인AI의 요소 분포 영역 bbox와 SVG body 영역 bbox 형태가 다름**에 있다. 그룹 bbox를 body bbox에 cx+bottom 맞춤하면 요소가 body의 특정 가장자리로 몰림(디자인AI에서 요소가 상반부에 있으면 SVG body 상단에 몰림, 하반부에 있으면 하단에 몰림). **교훈**: 새 매칭 모드를 추가할 때는 기존 모드의 배치 알고리즘을 그대로 계승해야 한다. 공통 함수로 추출해 양쪽에서 공유. **확정된 해결 방향 (3차 분석, 2026-04-21)**: `bbox[3]`은 확실히 Y 하단(더 작은 Y값) — 좌표 규약 오류 아님. 2차 수정본이 망가진 진짜 원인은 **서브그룹 4회 group/ungroup 사이클이 `executeMenuCommand("ungroup")`에서 중첩 GroupItem 참조를 파괴한 것으로 추정**(가설 D). **재수정 구조**: (1) Phase 1에서 모든 요소를 **단일 배열 `allDups`**로 duplicate하며 요소별 `relVec`와 이름 기반 `svgBodyIdx`를 `allElemMeta[{pieceType:"body", pieceIdx, relVec}]`로 동반 수집. (2) Phase 2는 폴백과 동일하게 **1회 group → resize(CENTER) → ungroup** 후 기존 `placeElementGroupPerPiece(allDups, allElemMeta, svgPieces, svgFallback, adjustedScale, bandPositions)` 재사용. **핵심**: group/ungroup이 4회→1회가 되어 PageItem 참조 파괴 가능성 제거 + 폴백과 100% 동일 배치 로직 공유. scratchpad "디버거 3차 분석" 섹션 참조.
- **참조횟수**: 4 (2차 분석 재참조 + 2026-04-21 수정 적용 후 롤백 + 3차 분석 구조 포팅안)

### [2026-04-21] 양면 유니폼 면적비 정규화 필요 (baseArea/targetArea 전체 합산) — 2차 분석으로 가설 수정
- **분류**: error
- **발견자**: debugger (버그 2: 2XS인데 XL 크기 거의 그대로)
- **내용**: `calcLayerArea`는 레이어 내 모든 50pt+ path 면적을 합산한다. **1차 분석 "대칭 상쇄" 가설은 틀렸음** — 2XS 실제 로그에서 baseArea=14,162,144 / targetArea=10,572,110 / 면적비=0.7465 / 선형스케일=0.864 / 보정스케일(^0.78)=0.8922로 정상 계산 경로를 탐. **진짜 문제**: (a) `ELEMENT_SCALE_EXPONENT = 0.78`이 선형 축소를 더 완화해 11% 축소 수준으로 약해짐 (2XS 기대치 30% 축소와 괴리), (b) 면적비가 0.49(√ = 0.7)가 아닌 0.7465가 나온 건 **SVG의 4 body 크기가 XL의 70%가 아닌 86% 정도에 그침**을 시사 — SVG 생성 쪽 또는 디자이너의 body 크기 설정 이슈. **교훈**: 면적 기준은 "조각 1개 단위"로 정규화해야 구조 간(단면 2body vs 양면 4body, 디자인AI의 너치 포함 여부 등) 비교가 안전. **확정된 해결 방향**: (1) `baseAreaPerPiece = baseArea / baseResult.count`, `targetAreaPerPiece = targetArea / filledCount`로 정규화. (2) exponent는 일단 0.78 유지 후 재테스트, 필요 시 0.9~1.0으로 조정. **로그 검증 필요**: 2XS SVG body 개별 width/height 덤프로 실제 선형비 확인 필요 (`DEBUG_LOG=true` + `[진단] path w/h`). **[2026-04-21 롤백됨] 실제 기준 count=4, 타겟 count=4라 `baseArea/count` ÷ `targetArea/count` = `baseArea/targetArea`로 수학적 효과가 0. 비대칭 구조(단면 2body + 양면 4body 섞임) 케이스에서만 의미 있는 수정이었음. 재도입 시 count 비대칭 분기 필요.**
- **참조횟수**: 2 (2차 분석으로 가설 수정 + 2026-04-21 수정 적용 후 롤백)

### [2026-04-21] SVG 분류 로직 4그룹 12 path 누락 버그 (svg_normalizer._extract_pattern_paths)
- **분류**: error
- **발견자**: tester → developer (svg_normalizer Phase 1-3 검증 중)
- **내용**: 초기 `_extract_pattern_paths`는 6 path 한 쌍 구조만 가정하여, 변환된 4그룹 12 path SVG 입력 시 좌측 큰 패턴 2개가 분류에서 누락되고 우측 작은 패턴 위/아래만 인식. 결과: 변환된 SVG를 다시 normalize하면 좌표가 viewBox 밖으로 나가 망가짐(idempotent 실패). **수정**: (1) path를 패턴/절단선으로 분리(높이 < 5 → 절단선), (2) 패턴이 4개(4그룹) → y_min 기준 위쪽 쌍만 채택, (3) 큰/작은 결정 기준을 `x_min` 비교에서 **`width`(폭) 비교 우선**으로 변경(폭이 더 큰 쪽이 큰 패턴=앞판). 검증 결과 6/12 path 모두 정확히 분류됨. **교훈**: SVG 변환 도구의 분류 로직은 변환 전(원본)과 변환 후(결과물) 양쪽 구조 모두 다룰 수 있어야 한다(멱등성 보장).
- **참조횟수**: 0

### [2026-04-21] SVG 패턴 단순 Tx swap 금지 (로컬 좌표계 원점 위치 다름)
- **분류**: error
- **발견자**: developer (U넥 양면유니폼 외부 작업 시행착오)
- **내용**: SVG path들의 좌우 위치를 바꿀 때 transform matrix의 Tx 값을 단순 swap하면 가운데서 겹침 발생(417pt). 원인: 패턴마다 d 속성의 로컬 좌표계 원점(M0 0)이 다른 위치에 있음. 큰 패턴은 원점이 패턴 왼쪽 아래(X 0~1712), 작은 패턴은 원점이 패턴 오른쪽 위(X -365~1347). 단순 Tx swap 시 작은 패턴이 음수 X 영역까지 뻗어서 겹침 발생. **해결**: bbox 정확 측정(svgpathtools cubic bezier 포함) 후 새 좌표 계산(절대 위치 기준 평행이동). 또한 작은 절단선 Y 좌표는 **사이즈 무관 상수**(작은 패턴 따라 이동시키면 큰 절단선과 어긋남). svg_normalizer.py에 두 원칙 모두 반영됨.
- **참조횟수**: 0

### [2026-04-16] ExtendScript clipboard(copy/paste) + svgDoc.close() 간헐 무효화
- **분류**: error
- **발견자**: debugger → developer (버그 B 수정)
- **내용**: grading.jsx STEP 4에서 `app.executeMenuCommand("copy")`로 요소를 clipboard에 담은 뒤, STEP 5~7에서 svgDoc 열고 baseDoc 생성하고 svgDoc.close()하면 AICB 번역기가 간헐적으로 무효화되어 STEP 8의 `paste`가 **paste=0** 결과(요소 0개 붙여짐)를 낸다. 특히 Illustrator는 **단일 인스턴스** 앱이라 이전 실행의 clipboard 상태가 다음 실행과 공유되어 재현성도 간헐적. **해결**: clipboard 경로를 아예 제거하고 `PageItem.duplicate(targetContainer, ElementPlacement.PLACEATEND)`로 문서 간 직접 복제. STEP 7의 `path.duplicate(layerFill)` 패턴과 동일하며 clipboard를 건드리지 않는다. 단 duplicate는 원본 PageItem이 **살아있을 때만** 유효하므로 source document를 duplicate 루프 완료 직후 close해야 한다.
- **참조횟수**: 0

### [2026-04-16] Illustrator 문서 간 geometricBounds 직접 비교 금지 (ruler origin 차이)
- **분류**: error
- **발견자**: planner-architect (PLAN-GRADING-RECOVERY 감사 중)
- **내용**: grading.jsx STEP 8B의 "pasteInPlace 복원 안전망"이 designDoc의 `geometricBounds`([left, top, right, bottom])와 baseDoc의 `geometricBounds`를 **동일 좌표계인 것처럼 빼서** translate 보정했다가 정확히 `dy = -svgHeight`(-3401.57pt)만큼 파괴하는 버그 발생. 원인: 두 문서의 ruler origin이 다르면(설정 또는 새 문서 생성 기본값 차이) 같은 **아트보드 기준 위치**도 **문서 기준 좌표값**은 아트보드 높이만큼 차이가 난다. pasteInPlace는 아트보드 좌표 기준이라 정확히 맞게 붙여넣고, geometricBounds는 문서 좌표라 "어긋나 보이지만 실제로는 맞는" 상태를 만든다. 해결: (1) 서로 다른 문서의 bounds를 직접 비교하지 않는다. (2) 비교가 필요하면 각 문서의 `artboards[0].artboardRect`로 아트보드 기준 상대 좌표로 환산 후 비교. (3) pasteInPlace가 지원되는 Illustrator 버전(CS6+)에서는 안전망을 **두지 않는 편이 안전**.
- **참조횟수**: 0

### [2026-04-10] PyMuPDF doc.close() 이후 len(doc) 사용 금지
- **분류**: error
- **발견자**: tester
- **내용**: PyMuPDF(fitz)의 `fitz.Document` 객체를 `doc.close()` 호출한 후에 `len(doc)`을 호출하면 `is_closed == True` 상태가 되어 신뢰할 수 없는 값(0)이 반환될 수 있다. 반드시 close() 호출 전에 `page_count = len(doc)` 같은 지역 변수로 저장한 뒤 사용해야 한다. pdf_handler.get_pdf_info 최초 구현에서 반환 딕셔너리에 `len(doc) if not doc.is_closed else 0` 형태로 작성했더니 항상 0이 반환되는 버그가 발생했다.
- **참조횟수**: 0

### [2026-04-10] pdf_handler 벡터 CMYK 감지 한계
- **분류**: error
- **발견자**: tester
- **내용**: 현재 pdf_handler.get_pdf_info의 색상 공간 감지는 (1) 페이지 내 이미지 xref의 colorspace 번호 + (2) page 객체 문자열에서 "DeviceCMYK"/"ICCBased"/"DeviceRGB" 키워드 검색의 두 경로에 의존한다. 이로 인해 reportlab `setFillColorCMYK`로 그린 "벡터 전용" CMYK 사각형처럼 내용 스트림 연산자(`k`/`K`)로만 CMYK가 사용된 경우 "Unknown"으로 판정된다. 실제 Adobe Illustrator/InDesign이 출력한 PDF는 대부분 /DeviceCMYK ColorSpace 리소스를 포함하므로 정상 동작할 가능성이 높지만, 사용자가 직접 만든 단순 PDF나 일부 변환 도구 출력물은 오탐될 수 있음. 사용자 실제 작업 파일로 추가 검증 권장.
- **참조횟수**: 0

### [2026-04-08] analyze_color는 Form XObject 내부 스트림을 스캔하지 않음
- **분류**: error
- **발견자**: tester (6단계 E2E)
- **내용**: `pdf_handler.analyze_color_space_detailed`의 `_detect_vector_color_operators`는 `page.read_contents()`로 얻은 **페이지 top-level 콘텐츠 스트림**만 검사한다. 그런데 `pdf_grader.generate_graded_pdf`는 `new_page.show_pdf_page(...)`를 사용해 원본 페이지를 Form XObject로 임베드한다. 결과적으로 그레이딩된 출력 PDF의 top-level content stream은 `/fzFrm0 Do` 1줄뿐이고, 원본의 `k`/`K` 같은 CMYK 연산자는 Form XObject xref 내부에 들어가 있다 (`doc.xref_stream(xref)`로만 접근 가능). 이로 인해 그레이딩 결과 PDF를 `analyze_color`로 재검사하면 `vector_cmyk: false`, `overall: "Unknown"`으로 잘못 판정된다. **실제 CMYK 색상은 보존되어 인쇄 품질에는 영향이 없음** — 감지 로직의 한계일 뿐이다. 개선 방안: `_detect_vector_color_operators`가 페이지 콘텐츠뿐 아니라 `doc.xref_length()` 순회로 `/Subtype /Form` XObject까지 재귀 스캔하도록 확장한다. 이 버그는 사용자가 그레이딩 결과 PDF를 다시 프로그램에 업로드하는 드문 케이스에서만 배지가 잘못 표시되는 제한적 영향만 있어 MVP 범위 바깥으로 분류됨.
- **참조횟수**: 0

### [2026-04-08] loadPresets 에러 시 빈 배열 반환 → 데이터 소실 위험
- **분류**: error
- **발견자**: debugger
- **내용**: presetStore/designStore/categoryStore의 load 함수가 에러 발생 시 빈 배열 `[]`을 그대로 반환했다. 이 상태에서 사용자가 UI 조작(추가/삭제 등)을 하면 `save([])` 또는 `save([새 항목만])` 형태로 기존 데이터를 덮어쓰게 된다. 원인: (1) Tauri AppData 경로가 없거나 권한 문제로 파일 접근 실패, (2) JSON 파싱 에러, (3) Tauri fs 플러그인 초기화 타이밍 문제. **수정**: LoadResult 타입으로 success/failure를 구분하고, 실패 시 UI에서 저장을 차단. 저장 전 백업 파일(.backup.json) 생성. 빈 배열로 기존 데이터를 덮어쓰는 것을 차단.
- **참조횟수**: 0
