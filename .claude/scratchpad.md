# 작업 스크래치패드

## 현재 작업
- **요청**: grading.jsx 누적 회귀 감사 + 롤백 지점 식별 + 재건 계획
- **상태**: ✅ 감사 완료, 사용자 의사결정 대기 (Q1~Q5)
- **현재 담당**: 사용자 의사결정 → 그 후 developer 착수
- **산출물**: `PLAN-GRADING-RECOVERY.md` (신규, 350줄)
- **권장안**: **옵션 Beta** (c52d80f~06b16fa 4커밋 revert → 베이스라인 실측 → 한 걸음씩 재도입)

### 🔜 남은 Phase
- **Phase 3 (1~2일, 진행 중)**: 즐겨찾기
- Phase 4 (2~3일): OrderGenerate 통합 (MVP 완료)
- Phase 5 (2~3일): PDF 파이프라인 제거 (MVP 후)
- Phase 6 (1일): 문서 정리

## 진행 현황표
| 단계 | 내용 | 상태 |
|------|------|------|
| 0~7 | 기본 기능(패턴/디자인/사이즈/CMYK/Illustrator/APCA) | ✅ 완료 |
| 8 | 설치형 배포 준비 | ⏸ 보류 (커밋 eda27b9) |
| 9 | Drive 연동 Phase 1 → 옵션 4 (자동 동기화) | ✅ 커밋 8ec96a3 외 |
| 10 | 작업 흐름 Phase 1 (WorkSetup + 세션) | ✅ 커밋 3efa370, ad3d073 |
| 11 | Phase 2 (패턴 선택 모드) | ✅ 커밋 3e5a069 |
| 11-Plus | 카드 간소화 + 조각 카운팅 + DRIVE 뱃지 제거 | ✅ 커밋 bc20e24, b01c974 |
| 12 | Phase 3 (즐겨찾기) | 🔨 착수 |
| 13 | Phase 4 (OrderGenerate 통합) | ⏳ 대기 |

## 프로젝트 핵심 정보

### 기술 스택
- Tauri 2.x + React 19 + TypeScript + react-router-dom 7
- Python 엔진 (PyMuPDF/reportlab/pillow/openpyxl)
- 빌드: `dev.bat` (MSVC), 배포: `build.bat`
- CSS: 순수 CSS + BEM (Tailwind 금지)

### 주요 파일
```
grader/
├── src/pages/ (WorkSetup, PatternManage, DesignUpload, SizeSelect, FileGenerate, Settings)
├── src/components/ (Sidebar, CategoryTree)
├── src/services/ (driveSync, svgResolver)
├── src/stores/ (sessionStore, presetStore, categoryStore, designStore, generationStore, svgCacheStore, settingsStore)
├── src/types/ (pattern, design, generation, order, session)
├── src-tauri/ (Rust + capabilities)
├── python-engine/ (PDF 분석 + 주문서 파서)
├── illustrator-scripts/grading.jsx (ES3, ~1610줄)
└── REPORT*.md, PLAN-GDRIVE-SYNC.md, PLAN-WORKFLOW-REDESIGN.md
```

### 데이터 저장
- `$APPDATA/com.grader.app/` presets.json / categories.json / settings.json
- Drive: `G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG` (자동 동기화 60초 쿨다운)
- 세션: sessionStorage key `grader.session` (workFolder, baseAiPath, selectedPresetId)
- (Phase 3 신규) `$APPDATA/com.grader.app/favorites.json`: preset stableId 배열

## 기획설계 (planner-architect)

### [2026-04-15] grading.jsx 원점 재구축 (접근 B 권장) ★최신
- **상세**: `PLAN-GRADING-REBUILD.md` (신규)
- **발단**: 사용자 "거의 망해가는 것 같다... 초기 순서 복기해서 원점에서 재진행" + "불필요한 코드와 규칙 모두 제거"
- **현재**: grading.jsx 2128줄 (dd51cc5 1073줄 대비 +1055줄 누적 회귀)
- **참조 베이스 커밋**: `dd51cc5` (1073줄, "CMYK 시작점 + 몸판 우선 플로우") — 사용자 초기 7단계가 가장 깨끗하게 완성된 시점
- **권장 접근 B**: `grading-v2.jsx` 신규 500~800줄, dd51cc5 구조 인용 + 버그 B duplicate 필수 반영
- **제거 도입 안 함**: Phase 2(D1/D2), 교체용요소, APCA 자동색, writeLog 파일로깅, 사후 CMYK 안전망, 방어 try/catch
- **Phase A~D 4~6h**: A(해석 확인) → B(뼈대) → C(3사이즈 실측) → D(튜닝)
- **롤백 경로**: v1 그대로 보존, v2 실패 시 즉시 복귀
- **사용자 의사결정 Q1~Q5**: (Q1 접근 B/A/C, Q2 배치 정밀도 a/b/c, Q3 duplicate 유지 예/아니오, Q4 Drive 별건 예/아니오, Q5 APCA 제거 예/아니오)
- ⚠️ 코드 수정 없음 — 계획서만

### [2026-04-16] 조각 인식 기반 요소 배치 재설계 (Piece-Aware Layout)
- **상세**: `PLAN-PIECE-AWARE-LAYOUT.md` (신규, 검토 보고서 + 옵션 5개 + Q1~Q5)
- **현재 D1 한계**: 조각 정보는 이미 수집(Phase 2) 되는데 STEP 10에서 **미사용** — 전체 중심+clamp만 수행
- **진단**: `importSvgPathsToDoc` L851 / `extractPatternPieces` L952에 **fill 체크 없음** → 장식선도 조각으로 오인 가능
- **권장안 B+A 단계적**: Phase 1(filled path 필터, 1~2h) → Phase 2(조각 내부 rx/ry 상대좌표 매핑, 3~4h)
- **핵심 변경**: 신규 `alignElementByRelativeCoord(item, rx, ry, targetPiece)` — 각 요소를 "원래 조각 내부의 정규화 좌표"로 타겟 조각에 재투영
- **Q2 재확인 필수**: 이전 D1은 Q1=A(간격 고정) 전제. 이번 요청은 "조각 따라감" = 벌어짐 허용 전제 → 사용자 선호 변경 여부 확인
- ⚠️ 코드 수정 없음 — 검토/계획서만

### [2026-04-16] grading.jsx 누적 회귀 감사 + 재건 계획
- **상세**: `PLAN-GRADING-RECOVERY.md` (신규, 커밋 감사/버그 가설/3옵션 비교/Phase별 계획)
- **핵심 진단**: 3개 독립 버그 — (A) STEP 8B 복원 안전망이 **문서 간 ruler origin 차이**를 인식 못해 `dy=-3401.57`(=svgHeight)로 파괴, (B) S/4XL paste=0 격번 실패는 designDoc.selection getter 타이밍 또는 clipboard 재번역 의심, (C) D1 CENTER 스케일은 건전하지만 원본 bounds가 아트보드 경계 근접 시 확대로 구조적 초과
- **회귀 시점**: c52d80f(교체용요소) → 38933f9(pasteInPlace+안전망) → 06b16fa(D1) 4개 커밋 누적. 마지막 "대체로 정상"은 7091831(디버그 로그 추가)
- **권장안 Beta**: `git revert c52d80f..06b16fa` 4커밋 롤백 → 베이스라인 실측 → 교체용요소/D1을 **한 번씩** 재도입(총 2.5시간)
- **거부된 옵션**: Alpha(06b16fa만 롤백, 원래 문제 복귀) / Gamma(3개 동시 hotfix, 인과 격리 불가)
- **사용자 의사결정 5개** (Q1~Q5) — PM이 대화로 수렴 → 확정 후 developer 착수
- ⚠️ 코드 수정 없음 — 감사/계획서만

### [2026-04-16] 패턴/요소 배치 로직 전면 재검토
- **상세**: `PLAN-GRADING-REDESIGN.md` (신규, 옵션 5개 비교 + 권장안 D1)
- **핵심 원인**: STEP 10 `newCenter = basePiece.center + relOffset * scale` 공식이 사이즈 커질 때 조각 간격 벌어짐을 요소에 1:1 전가 → XL 대비 4XL 요소 세로 +17% (scale은 +8%)
- **기준 baseArea**: XL=7,468,498 pt², 4XL ratio 1.163, scale 1.08, bounds 3992×4331 (아트보드 +930 초과)
- **권장 D1 (몸판 전체 중심 고정, 스케일만)**: STEP 10 정상 경로 제거 + 폴백 `alignToBodyCenter` 단일화 → 2시간 내 구현, 아트보드 초과 원천 차단
- **차선 D3 (몸판 bbox 비율 배치)**: 요소 3개+ 분산 디자인이면 전환
- **사용자 의사결정 5개** (Q1~Q5) — PM이 대화로 수렴 → 확정 후 developer 착수
- ⚠️ 코드 수정 없음 — 조사/계획서만

### 이전 기획설계 (유지)
- `PLAN-WORKFLOW-REDESIGN.md` Phase 1~6 (Phase 3 진행 중)

## 구현 기록 (developer)

### [2026-04-16] 조각 인식 Phase 1+2 구현 (B-A-A-A-A)

📝 구현한 기능: 조각 인식 기반 요소 배치 (Phase 1 filled 체크 + Phase 2 rx/ry 정규화 D2 모드)

| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| illustrator-scripts/grading.jsx | Phase 1 filled 체크 (importSvgPathsToDoc + extractPatternPieces) + Phase 2 STEP 4 rx/ry 사전 수집 + STEP 10 D2 모드 분기 + 레거시 alignElementToPiece 블록 제거 | 수정 |

#### Phase 1 (path.filled 체크)
- **importSvgPathsToDoc L851~869**: `path.filled + fillColor + typename !== "NoColor"` 3중 체크. 실패 시 장식선으로 간주 → 패턴선 레이어로만 복제 후 continue. `[SKIP] path[layer=N,idx=M] filled=X fillColor=Y` 로그.
- **extractPatternPieces L962~977**: 동일 조건. 실패 시 `[SKIP] designPath idx=N ...` 로그 후 continue.
- **효과**: basePieces/designPieces에 실제 색 채운 몸판 조각만 포함. 큰 장식선/보조선 제외.

#### Phase 2 (rx/ry 정규화 D2 모드)
- **STEP 4 L1370~1436**: `elementOriginalCenters[i]`에 `{cx, cy, rx, ry}` 저장 (기존 `{cx, cy}` 확장).
  - designPieces 중 요소와 매칭된 조각의 bbox 기반으로 `rx = (cx - left) / width`, `ry = (cy - bottom) / height` 계산
  - clamp(0~1) 적용 (경계선 위 요소 안전망)
  - Q4=A: findBestMatchingPiece가 -1 반환 시 가장 가까운 조각 중심까지 거리로 fallback 매핑
  - 로그: `[Phase2-D2] 요소 N → piece M rx= ry= origCenter=(,)`
- **STEP 10 L1746~1825**: `USE_D2_MODE = true, USE_D1_MODE = false` 초기값.
  - Q3=A: `basePieces.length !== designPieces.length` 또는 `basePieces.length === 0` 시 D2 off + D1 on (`[WARN] 조각 수 불일치 → D1 fallback`)
  - D2 경로: 각 요소 → `basePieces[pieceIdx].bbox`의 rx/ry 지점으로 translate (scale 없음, 위치만)
  - D2 실패 시: 기존 D1 clamp + 아트보드 중심 정렬 경로 실행
  - 최종 bounds 로그: `STEP 10 D2 최종 요소 bounds=[...] size= placed= skipped=`
- **레거시 제거**: 구 `alignElementToPiece` else 블록(구 L1929~1961)은 문법 균형상 불필요 → 주석으로 대체.

#### 건드리지 않은 것 (요청대로 보존)
- STEP 4 duplicate 기반 elemItems 수집 (버그 B 픽스)
- STEP 8 duplicate 기반 paste 로직
- STEP 10 D1 clamp 로직 (버그 C 픽스) — D2 실패 시 fallback으로 작동
- STEP 9 linearScale, mainColor 추출, CMYK 변환 등 모든 기존 로직
- alignElementToPiece / alignToBodyCenter 함수 정의 (호출부만 제거됨)

#### 검증
- ES3 호환 PASS (var, for, push, continue, try/catch, Math.abs/sqrt — 모두 ES3)
- 중괄호 균형 PASS (node 스크립트로 검증 완료, final depth=0)
- `npx tsc --noEmit`은 jsx 대상 아님 (무관)

💡 tester 참고:
- **Phase 1 검증**: `grading-log.txt`에서 `[SKIP] path ... filled=false` 또는 `fillColor=NoColor` 항목 확인 → 장식선 제외 증거. basePieces/designPieces 개수가 이전보다 줄었는지 확인.
- **Phase 2 검증 (3사이즈 2XS/L/4XL)**:
  - 로그에 `[Phase2-D2] 요소 N → piece M rx= ry=` 확인
  - `STEP 10 D2 시작` / `STEP 10 D2 최종 요소 bounds=` 확인
  - 조각 수 불일치 시 `[WARN] 조각 수 불일치 → D1 fallback` 자동 작동
  - 앞판 요소는 앞판 조각 안, 뒷판 요소는 뒷판 조각 안에 위치
  - 3XL/4XL에서 조각이 벌어지면 요소도 따라감 (Q2=A 반영)
- **폴백 테스트**: `USE_D2_MODE = false`로 바꾸면 기존 D1 경로 그대로 작동 (즉시 롤백 가능)

⚠️ reviewer 참고:
- D2 모드에서 scale이 없음 (위치만). 크기 조정은 STEP 9의 linearScale에서 이미 적용됨.
- rx/ry = -1이면 스킵 (요소 paste 위치 유지). 이 경우 `[D2 SKIP]` 로그로 가시화.
- duplicate 기반 버그 B 픽스와 충돌 없음 (STEP 4/8는 건드리지 않음).
- target/debug/illustrator-scripts/grading.jsx 동기화는 PM이 수동 처리 필요.

### [2026-04-16] 버그 B 수정: duplicate 기반 전환

#### 원인
- svgDoc.close가 AICB clipboard 간헐적 무효화
- Illustrator 단일 인스턴스가 이전 실행 상태 공유
- 2XS/4XL에서 paste=0 재현 → 요소 0개 배치

#### 변경 (grading.jsx)
| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| illustrator-scripts/grading.jsx | STEP 4: elemItems 배열로 레퍼런스 보관 (app.copy 제거) + STEP 8: paste 대신 elemItems[i].duplicate(layerDesign, PLACEATEND) | 수정 |
| .claude/knowledge/errors.md | clipboard+svgDoc.close 간헐 무효화 에러 패턴 추가 | 수정 |
| .claude/knowledge/lessons.md | 문서 간 이동은 duplicate가 기본 교훈 추가 | 수정 |

#### 구현 세부
- **STEP 4** (line 1295~1370 근방): 기존 `designDoc.selection = null` + `selected=true` 루프 + `app.executeMenuCommand("copy")` → `elemItems.push(elemLayer.pageItems[ei])` 루프로 대체. for 루프 순서가 pageItems[0..N]과 동일해서 elementPieceIndex 매핑 영향 0.
- **STEP 8** (line 1448~1515 근방): `app.executeMenuCommand("paste")` 제거 → `elemItems[di].duplicate(layerDesign, ElementPlacement.PLACEATEND)` 루프로 pastedItems 배열 구축. 이후 기존 group/scale/align 로직이 selection 기반이므로 pastedItems를 baseDoc.selection에 재주입 (selected=true 루프).
- **designDoc close 타이밍**: duplicate 완료 후 즉시 close — elemItems 레퍼런스가 원본 PageItem을 가리키므로 close는 반드시 duplicate 루프 이후.
- **PDF 폴백**: 기존 clipboard paste 유지 (AI 경로만 duplicate 전환). 사용자 Q1=A로 어차피 제거 예정이라 최소 변경.
- **elemItems.length === 0 방어**: writeLog 경고 + 복제 스킵.
- **디버그 로그**:
  - `STEP 4 (duplicate 모드): 요소 N개 레퍼런스 보관`
  - `STEP 8 duplicate 완료: N개 복제됨`
  - `STEP 8 paste 직후: baseDoc.pageItems=..., pastedItems.length=..., layerDesign.pageItems=...`

#### 건드리지 않은 것
- STEP 7 importSvgPathsToDoc (동일 duplicate 패턴, 그대로 유지)
- STEP 8B 교체용요소 paste 로직 (별개 블록)
- STEP 9 scale / STEP 10 Phase 2 조각별 정렬 / D1 모드
- Phase 2 사전 수집(designPieces/basePieces/elementPieceIndex/elementOriginalCenters)
- alignElementToPiece, alignToBodyCenter 함수

#### 검증
- ES3 호환 PASS (var, for, push, ElementPlacement.PLACEATEND, try/catch — 모두 CS5+ 지원)
- writeLog 3종 추가/교체, 기존 STEP 8 paste 직후 로그는 pastedItems.length 기준으로 의미 교체
- 중괄호 균형: isAiFile / !isAiFile / else 3분기 닫힘 확인
- target/debug/illustrator-scripts/grading.jsx 복사는 PM 담당

💡 tester 참고:
- **테스트 방법**: 기준 AI로 전체 사이즈(최소 4XS/2XS/S/3XL/4XL) 연속 실행 — 이전 재현 케이스 2XS/4XL 포함 필수
- **정상 동작**: 모든 사이즈에서 `STEP 8 paste 직후: ... layerDesign.pageItems=N (N>0)` 로그 나옴 + 결과 EPS에 요소 정상 배치
- **로그 확인 포인트** (grading.log):
  - `STEP 4 (duplicate 모드): 요소 N개 레퍼런스 보관`
  - `STEP 8 duplicate 완료: N개 복제됨`
  - `STEP 8 paste 직후: layerDesign.pageItems=N` (0이 아님)
- **주의할 입력**: PDF 파일은 AI 경로와 다른 분기 — clipboard paste 유지라 이번 수정 영향 없음 (회귀 확인만)
- **별건**: 3XL/4XL 아트보드 초과 문제는 **버그 C**로 이번 수정 범위 밖

⚠️ reviewer 참고:
- duplicate 경로가 `isAiFile`에서만 동작 → PDF 폴백은 여전히 clipboard paste 사용. 경로 분기가 명확한지 확인
- `baseDoc.selection = null` + selected=true 루프 후 `executeMenuCommand("group")` 체인이 기존과 동일하게 동작하는지 (그룹화는 selection 기반이라 pastedItems 배열 순서와 무관)
- 기존 `var pastedItems = baseDoc.selection` 구문 제거 → pastedItems는 이제 duplicate 결과 배열. `pastedItems.length > 0` 체크는 배열 length이므로 기존 로직 호환

#### 다음
- 버그 C (3XL/4XL 아트보드 초과) 별건 처리
- 이후 교체용요소 재도입 검토 (안전망 설계 필요)

### [2026-04-16] 버그 C 해결: D1 재도입 + 아트보드 clamp 강화

#### 원인
- 실측: XL bottom -117pt, 3XL size 3953x4290 (top +632, bottom -256), 4XL 3992x4331 (top +662, bottom -268)
- `alignElementToPiece`가 조각별 이동 → 사이즈 커지면 basePieces 벌어짐이 요소 위치에 누적 전가
- 이전 D1 (커밋 06b16fa)은 중심 복원만 있고 "요소 전체가 아트보드보다 큰" 케이스 처리 없었음

#### 변경 (grading.jsx)
| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| illustrator-scripts/grading.jsx | 헬퍼 `calculateUnionBoundsOfItems` 신설 + STEP 10에 `USE_D1_MODE` 플래그 도입 (3단계 안전망: clamp + 중심 복원 + 최종 bounds 로그) | 수정 |

#### 구현 세부
- **헬퍼 함수 추가** (alignToBodyCenter 뒤, 1134행 직후): `calculateUnionBoundsOfItems(items)` — pageItem 배열 합집합 geometricBounds 계산 (Illustrator 좌표계, top > bottom)
- **STEP 10 분기** (기존 alignElementToPiece 호출 블록을 `USE_D1_MODE=true/false`로 감쌈):
  - **D1 경로 (기본)**:
    1. `calculateUnionBoundsOfItems(individualItems)`로 요소 전체 bounds 측정
    2. `baseDoc.artboards[0].artboardRect`에서 아트보드 bounds 취득
    3. **Clamp 판정**: 요소가 아트보드 95%(MARGIN_RATIO=0.95) 초과 시 `clampScale = min(width비, height비)` 계산
    4. **Clamp 적용**: 그룹 중심 기준 각 요소 재배치 (상대 거리 × clampScale) + 자기 중심 기준 `item.resize(clampPct, clampPct, true,true,true,true, clampPct, Transformation.CENTER)`
    5. **중심 복원**: 재계산된 요소 중심을 아트보드 중심으로 translate (dx/dy > 1pt일 때만)
    6. **최종 bounds 로그** 출력
  - **레거시 경로 (USE_D1_MODE=false, 롤백 대비)**: 기존 `alignElementToPiece` 조각별 정렬 그대로 보존
- **alignElementToPiece 함수 자체는 삭제 X** — 롤백 즉시 가능
- **건드리지 않은 것**:
  - STEP 8 duplicate 로직 (버그 B 해결분)
  - STEP 9 pastedGroup.resize (면적 제곱근 스케일)
  - 그룹 해제 → individualItems 생성 로직 (D1이 이것에 의존)
  - 사전 수집 데이터(designPieces/basePieces/elementPieceIndex) — 레거시 경로용 유지
- **디버그 로그**:
  - `STEP 10 D1 시작: 요소 WxH, 아트보드 WxH, individualItems=N`
  - `STEP 10 D1 clamp: 요소 WxH > 허용 WxH -> 추가 scale XX.X%` (또는 `STEP 10 D1 clamp 생략`)
  - `STEP 10 D1 중심 정렬: dx=... dy=...` (또는 생략)
  - `STEP 10 D1 최종 요소 bounds=[L,T,R,B] size=WxH`

#### 검증
- ES3 호환 PASS (var, 함수 선언, Math.min/abs, toFixed, Transformation.CENTER, item.resize/translate/geometricBounds 전부 ExtendScript 표준)
- 중괄호 균형 0 (node 스크립트로 재확인)
- target/debug/illustrator-scripts/grading.jsx 복사는 PM 담당

💡 tester 참고:
- **테스트 방법**: 기준 AI로 6사이즈 연속 실행 (4XS/2XS/S/XL/3XL/4XL 필수)
- **정상 동작**:
  - 3XL/4XL: `STEP 10 D1 clamp: ... -> 추가 scale XX%` 로그 + 최종 요소 bounds가 아트보드 내
  - 작은 사이즈(4XS/2XS/S): `STEP 10 D1 clamp 생략` 로그 + 기존 배치 유지 (회귀 없음)
- **로그 확인 포인트** (grading.log):
  - `STEP 10 D1 시작` → 요소/아트보드 크기 출력
  - `STEP 10 D1 clamp` 또는 `clamp 생략`
  - `STEP 10 D1 최종 요소 bounds` size가 아트보드 (abW × MARGIN_RATIO) 이내
- **주의할 입력**: 버그 B 회귀 확인 (paste=0 재발 없어야 함)

⚠️ reviewer 참고:
- **3단계 안전망 순서 주의**: (1) translate로 상대 거리 축소 → (2) 자기 중심 resize. 순서가 반대면 스케일 후 거리가 이미 줄어있어 이중 축소됨
- **MARGIN_RATIO=0.95**: 완전 경계 맞춤 시 stroke/outline 겹침 위험 회피용. 필요 시 조정 가능한 상수
- **`Transformation.CENTER`**: ExtendScript 전역 상수 — baseDoc 활성 상태에서 동작 보장
- **레거시 경로 롤백**: `USE_D1_MODE = false`로 바꾸면 즉시 alignElementToPiece 경로 복귀

#### 다음
- 사용자 6사이즈 실측
- tester가 로그 검증 후 PM 커밋

### [2026-04-16] 버그 B (paste=0) 집중 조사 (debugger, 코드 수정 없음)

#### 전제 확정
- grading.jsx는 롤백 상태(커밋 3b7e3af, 1808줄) — 교체용요소/pasteInPlace/D1 블록 **전부 없음**
- 그럼에도 사용자 베이스라인 실측: 4XS ✅ / 2XS ❌(paste=0) / S ✅ / 3XL ✅ / 4XL ❌(paste=0)
- → **버그 B는 c52d80f 이전부터 존재하던 선행 버그**. 교체용요소와 무관.

#### 코드 트레이싱 (STEP 4 → STEP 8 전체 경로)

| 라인 | 동작 | activeDocument | clipboard 상태 |
|------|-----|---------------|---------------|
| 1234 | `app.open(designFile)` → designDoc | designDoc | (이전 실행 잔여물) |
| 1350 | `designDoc.selection = null` | designDoc | — |
| 1351~1353 | 요소 pageItems 개별 `selected=true` | designDoc | — |
| 1355 | `app.executeMenuCommand("copy")` | designDoc | **요소 N개 적재** |
| 1378 | `svgDoc = app.open(patternFile)` | **svgDoc** (전환!) | 유지 |
| 1388 | `baseDoc = createCmykBaseDoc(...)` → `app.documents.addDocument` | **baseDoc** (전환!) | 유지 |
| 1412 | `importSvgPathsToDoc` 내부 `path.duplicate(layerFill)` 반복 | baseDoc | **유지** (duplicate는 clipboard 미사용) |
| 1427 | `svgDoc.close(DONOTSAVECHANGES)` | baseDoc | **⚠️ 불안정 구간** |
| 1442 | `app.activeDocument = baseDoc` (재확인) | baseDoc | — |
| 1449 | `app.executeMenuCommand("paste")` | baseDoc | **paste 시도** |

#### 가설별 코드 증거 검증

**가설 1 (clipboard 무효화)** — 🟥 **유력**
- 근거: STEP 4에서 designDoc 기준 copy → **svgDoc open + baseDoc addDocument + svgDoc close** 세 번의 문서 전환이 STEP 8 paste 사이에 끼임
- 특히 **svgDoc.close()** 시점 — Illustrator는 close되는 문서가 clipboard 소스가 아니어도 내부적으로 clipboard 번역기(AICB/PDF 형식)를 재평가함. 여러 문서 열린 상태에서 close가 연쇄되면 AICB 스풀이 일시적으로 비는 타이밍 윈도우가 존재
- 증상 일치: paste 자체는 호출되지만 `baseDoc.pageItems=6`(패턴만 그대로) + `selection.length=0` — clipboard가 실제로 **비어 있었다는** 뜻
- designDoc은 살아있지만 그건 무관 — clipboard는 Illustrator 앱 단위로 관리되고 문서 close가 AICB 번역을 건드림

**가설 2 (designDoc.selection getter 타이밍)** — 🟨 **부분 유력**
- 근거: 1354 `designDoc.selection && designDoc.selection.length > 0` 체크 통과 후 copy. getter는 내부 배열 재구성이라 ExtendScript 동기 실행 환경에선 안정적
- 하지만 **연속 실행 시** Illustrator 내부 idle queue가 이전 실행의 선택 변경 이벤트를 처리 중일 수 있음 — selection.length > 0을 통과해도 copy 시점엔 빈 selection
- 로그로 `selection.length=N (N≥1)` 나오는데 실제 clipboard는 비어있으면 이 가설 확정

**가설 3 (STEP 8B activeDocument 전환)** — ⬜ **배제**
- 현재 롤백 상태엔 STEP 8B 블록 **없음**. 그럼에도 재현 → 이 가설은 이번 버그와 무관

#### 실패 패턴 상관관계

| # | 사이즈 | 결과 | 직전 대비 targetArea |
|---|-------|------|------|
| 1 | 4XS | ✅ | (최초) |
| 2 | 2XS | ❌ | 증가 (4XS→2XS는 사이즈업) |
| 3 | S | ✅ | 증가 |
| 4 | 3XL | ✅ | 증가 |
| 5 | 4XL | ❌ | 증가 |

- 격번/짝홀 패턴 **아님** (1/3/4 성공, 2/5 실패). 사용자 가설 "area 증가 시 실패"도 성립 안 함 (3/4도 증가인데 성공)
- **실행 간격** 변수가 더 유력 — 2XS/4XL 둘 다 "직전 사이즈와 연속 실행 간격이 짧았을 때" 실패했을 가능성 (timing 윈도우)
- → 간헐적 타이밍 버그 성격. Illustrator의 idle queue flushing이 불안정한 ms 범위에서 발생

#### Rust 실행 구조 (src-tauri/src/lib.rs L263)

```rust
let _child = Command::new(&illustrator_exe)
    .arg("/run")
    .arg(&script_path)
    .spawn()
```

- **매 실행마다 새로운 `Illustrator.exe /run` 프로세스 스폰** 시도
- 하지만 Illustrator는 단일 인스턴스 앱 — 이미 실행 중이면 **기존 인스턴스에 script 메시지만 IPC로 전달**
- 따라서 **clipboard/문서/메모리 상태 전부 이전 실행과 공유**. 이전 실행의 designDoc이 이번 실행과 섞임
- 이게 "2번째 실행부터 간헐 실패" 구조적 원인 (첫 실행은 깨끗한 상태)

#### 수정안 비교표

| # | 수정안 | 효과 추정 | 부작용 | 구현 복잡도 | 권장 |
|---|-------|---------|-------|-----------|------|
| A | copy 직후 `$.sleep(200)` 1줄 추가 | 🟨 30~50% (타이밍만 커버, clipboard 무효화 자체는 방지 못함) | ES3 지원(ExtendScript $.sleep OK), 실행 시간 +200ms/사이즈 | ⭐ 최저 | 🟨 |
| B | duplicate 기반 (copy/paste 제거) | 🟥 90%+ (근본 해결) | 문서 간 `item.duplicate(baseDoc.layers[x])` Illustrator CS5+ 지원 확인됨. 단 레이어 직접 참조라 기존 PageItem 순서·그룹 구조 보존 가능. 레거시 Phase 2 로직(elementPieceIndex) 영향 없음 | ⭐⭐⭐ | 🟩 **권장** |
| C | activeDocument 명시 관리 + `app.redraw()` 강제 | 🟨 40% (redraw는 화면 갱신, clipboard 상태 갱신 아님) | redraw는 cosmetic, 실제 내부 큐 flush 효과는 약함 | ⭐⭐ | ⬜ |
| D | paste 후 selection=0이면 재시도 (루프) | 🟨 60% (1차 실패 시 2차 성공 확률 있음) | 재시도 중에도 clipboard가 계속 비어있으면 무한루프 가드 필요, 불확실 | ⭐⭐ | ⬜ |
| E | 매 사이즈마다 Illustrator 재시작 | 🟥 95%+ (상태 완전 격리) | 사이즈당 5~10초 추가 (13사이즈 실행 시 +2분), 사용자 UX 나빠짐, Rust 변경 필요 | ⭐⭐⭐⭐ | ⬜ |

#### 권장 수정안 = **B (duplicate 기반)**

**핵심 아이디어**: clipboard(copy/paste)는 Illustrator 앱 전역 상태라 문서 여러 개 여닫는 과정에서 간섭 많음. **`PageItem.duplicate(targetContainer)`는 문서 간 복제를 clipboard 없이 직접 수행**. STEP 7의 `path.duplicate(layerFill)` 로직과 동일 패턴이고 이미 현재 grading.jsx 내부에서 정상 동작 중.

**구현 스펙 (STEP 4 + STEP 8)**:

1. **STEP 4 변경** (line 1350~1359)
   - `designDoc.selection = null` 이후 copy 대신 `elemItems` 배열에 요소 레퍼런스만 저장
   - `executeMenuCommand("copy")` 호출 제거
   - `elemItems.push(elemLayer.pageItems[ei])` (Array 축적)
   - 단, **designDoc을 STEP 8까지 살려둬야 함** (이미 그렇게 구현됨)

2. **STEP 8 변경** (line 1448~1479)
   - `app.executeMenuCommand("paste")` 제거
   - 대신 loop:
     ```
     var pastedItems = [];
     for (var i = 0; i < elemItems.length; i++) {
         var dup = elemItems[i].duplicate(layerDesign, ElementPlacement.PLACEATEND);
         pastedItems.push(dup);
     }
     baseDoc.selection = null;
     for (var i = 0; i < pastedItems.length; i++) {
         pastedItems[i].selected = true;
     }
     ```
   - `app.executeMenuCommand("group")`는 그대로 유지 (selection 기반 그룹화는 clipboard와 무관)

3. **부수 변경**
   - PDF 폴백(line 1362~1364)은 `selectObjectsOnActiveArtboard + copy` 방식 유지 또는 별도 loop로 변환
   - **STEP 11-D close 순서 주의**: designDoc close가 STEP 8 이후로 이동 (현재 위치 1459~1467 유지 OK)
   - elemItems 배열이 살아있으려면 designDoc이 **duplicate 직전까지** 열려 있어야 함. 이건 현재 코드 그대로 가능 (STEP 8 paste 직후 close → duplicate 직후 close로 순서 조정)

#### 위험 분석

| 위험 | 가능성 | 완화책 |
|-----|------|-------|
| duplicate 시점에 designDoc active가 아니면 실패 | 🟨 중 | duplicate 호출 전 `app.activeDocument = designDoc` 명시 후 baseDoc 복원 — 사실 duplicate는 source 컨테이너/target 컨테이너 모두 명시라 activeDocument 의존성 약함 |
| 색상 잔존 RGB 문제 | 🟩 낮 | 기존 STEP 9 "RGB 잔존 안전망" 루프가 커버 |
| elemItems 순서가 기존 copy/paste와 다르게 나옴 | 🟨 중 | for 루프 순서가 pageItems[0..N]와 동일하게 유지됨 → elementPieceIndex 매핑 **정확히 동일** |
| Phase 2 layerDesign.pageItems 순서 영향 | 🟩 낮 | duplicate(PLACEATEND)로 순서 보존 |
| ExtendScript duplicate cross-document 버그 | 🟩 낮 | STEP 7 importSvgPathsToDoc이 이미 동일 방식 사용 → 실전 검증됨 |

#### 회귀 유발 가능성
- 기존 copy/paste 경로와 완전히 대체되므로 **STEP 8 진단 로그 라인 1453 (paste 직후 검증)는 의미 바뀜** — pastedItems.length로 로그 교체 필요
- PDF 폴백 경로는 별개 처리 필요 (또는 그대로 copy/paste 유지)

#### 대안 fallback 설계 (안전망)
- 가설 1이 100% 확정은 아니므로 duplicate 실패 시 copy/paste로 폴백하는 2중 안전망도 가능. 다만 duplicate가 실패하는 케이스는 매우 드물어 **불필요하게 복잡** — 1차 시도 duplicate만으로 충분

#### 대상 파일 (수정 안 함, 참고만)
- `C:\0. Programing\grader\illustrator-scripts\grading.jsx`
  - line 1295~1365: STEP 4 (copy 블록)
  - line 1444~1479: STEP 8 (paste 블록)
  - line 825~920: importSvgPathsToDoc (duplicate 레퍼런스 구현)

---

### [2026-04-16] D1 몸판중심 고정 배치 구현 (재설계)

#### 배경
- 사용자 Q1~Q5 확정: **A-10개이상-A-B-B** → D1 채택
- 기존 STEP 10: 각 요소를 `basePiece.center + relOffset × scale`로 이동 → 조각 간격 벌어짐이 요소에 1:1 전가 → 3XL/4XL 아트보드 +900pt 초과
- D1 원칙: 요소는 제자리에서 **스케일만** (중심점 기준), 조각별 개별 이동 **제거**

#### 변경 (grading.jsx STEP 9/10)
| 위치 | 변경 내용 |
|------|----------|
| STEP 9 line 1671~1690 | `pastedGroup.resize(...)` 8번째 인자 `Transformation.CENTER` 추가 (그룹 자기 중심 기준 스케일, 위치 유지) |
| STEP 9 | `writeLog("STEP 9 D1 resize: Transformation.CENTER, scale=...")` 신규 |
| STEP 10 line 1742~1923 | `if (USE_D1_MODE) { ... } else { ... }` 분기로 전체 감쌈. 레거시 Phase 2 코드(alignElementToPiece 루프 포함)는 else 분기에 **전량 보존** (롤백용) |
| STEP 10 D1 모드 | 조각별 정렬 skip + 그룹 해제(d1Items 배열) + 최종 bounds 로그 |
| STEP 10 D1 안전망 | 요소 전체 bbox 중심 vs 아트보드 중심 오차 \|dx\|>50 또는 \|dy\|>50 초과 시 translate 복원 (50pt 이하는 무시) |

#### 보존 (건드리지 않음)
- `alignElementToPiece` 함수 (line 1071~1091) — 레거시 분기에서 여전히 호출
- `alignToBodyCenter` 함수 (line 1102~1134) — 레거시 폴백에서 호출
- STEP 8/8B/9B 전체
- Phase 2 사전 수집(designPieces/basePieces/elementPieceIndex/elementOriginalCenters) — 레거시에서 사용

#### 롤백 방법
- `var USE_D1_MODE = true;` (line 1750) → `false`로 한 줄 변경 → 기존 조각별 정렬 복구

#### 검증
- ES3 호환 PASS (var, if/else, try/catch, Math.abs, for 루프)
- 중괄호 균형 확인: 1752 `if (USE_D1_MODE) {` ↔ 1819 `} else {` ↔ 1923 `}` (+ 1924 기존 `}`)
- writeLog 전부 유지 (STEP 9 D1 resize, STEP 10 D1 모드/bounds/중심 복원)
- target/debug/illustrator-scripts/grading.jsx 복사는 PM 담당

💡 tester 참고:
- **테스트 방법**: 기준 AI(XL)로 전체 사이즈 13개(4XS ~ 4XL) 그레이딩 실행
- **로그 확인 포인트** (grading.log):
  - `STEP 9 D1 resize: Transformation.CENTER, scale=X.XXXX`
  - `STEP 10 D1 모드: 조각별 정렬 건너뜀, 요소 중심점 기준 스케일만 유지`
  - `STEP 10 D1 최종 요소 전체 bounds=[...] size=WxH` — **W/H가 아트보드 4337×3401 이내여야 정상**
  - `STEP 10 D1 중심 복원: dx=..., dy=...` 또는 `중심 복원 불필요 (오차 50pt 미만)`
- **정상 동작**:
  - 모든 사이즈에서 요소 bounds가 아트보드 크기 이내
  - 3XL/4XL의 "위쪽 리본 분리" 증상 해결
  - 4XS처럼 기존에 정상이던 사이즈도 영향 없음 (scale 동일, 위치만 원점 대신 CENTER)
- **주의할 입력**:
  - 교체용요소 레이어가 있는 AI (STEP 9B와 충돌 없는지 → 건드리지 않았으므로 정상이어야 함)
  - PDF 파일 (레거시 분기에만 영향, D1 모드는 isAiFile 무관하게 동작 → 검증 필요)

⚠️ reviewer 참고:
- STEP 10 전체 블록이 `if (USE_D1_MODE) {...} else {...}` 이중 들여쓰기 없이 단일 들여쓰기 유지(레거시 블록) — 의도된 것 (diff 최소화 + 롤백 시 다시 풀기 쉬움)
- `linearScaleApplied` 변수는 D1 모드에서 미사용이지만 STEP 11 이후 로그/폴백에서 쓸 수 있어 계산은 유지
- D1 안전망의 50pt 임계값은 경험치 — 필요 시 config로 이동 고려 (현재는 하드코딩)

---

### [2026-04-16] 교체용요소 pasteInPlace 교체

#### 원인
- `app.paste()` / `executeMenuCommand("paste")` 기본이 **화면 중앙 paste** → 교체용요소가 아트보드 중앙으로 이동
- 원본 아트보드 밖(위쪽) 위치 손실 → 사용자 실측 이미지에서 "1234567890" 백넘버가 아트보드 중앙에 출력

#### 수정 (grading.jsx STEP 8B, line 1488~1602)
| 위치 | 변경 내용 |
|------|----------|
| copy 직전 루프 | refLayer 전체 pageItems의 **합집합 bounding box**(left/top/right/bottom) 기록 |
| paste 지점 | `executeMenuCommand("paste")` → `executeMenuCommand("pasteInPlace")` try/catch |
| 폴백 체인 | pasteInPlace 실패 시 `executeMenuCommand("paste")` → `app.paste()` 순차 폴백 |
| paste 후 안전망 | baseRefLayer 새 bounds와 원본 diff(dx, dy) 계산, 0.01pt 초과 시 `translate(dx, dy)`로 복원 (상대 위치 유지 위해 모든 pageItem 동일 벡터 이동) |
| 로그 | pasteMethod(pasteInPlace/paste(fallback)/app.paste(fallback)) + 복원 diff writeLog 기록 |

#### 왜 bounds 안전망도 병행하나
- `pasteInPlace` 명령 이름이 Illustrator 버전/언어에 따라 다를 수 있어 1순위로 시도하되, 성공해도 만일을 대비해 **항상 bounds 검사** → 어긋나면 translate로 강제 복원
- 오차 0.01pt 임계로 불필요한 미세 이동 방지

#### 건드리지 않은 것
- STEP 8 "요소" paste 로직 (기존 그대로)
- STEP 8B 종료 후 activeLayer/selection 복원 방어선
- STEP 9/9B scale 로직

#### 검증
- ES3 호환 PASS (var, try/catch, Math.abs, 삼중등호 null 비교)
- writeLog 유지 (pasteMethod, 복원 diff, 원본 bounds 모두 기록)
- target/debug/illustrator-scripts/grading.jsx 복사는 PM 담당

💡 tester 참고:
- **테스트 방법**: "교체용요소" 레이어를 포함한 AI 파일로 grading.jsx 실행 → 결과 AI/EPS에서 "1234567890" 백넘버 위치 확인
- **정상 동작**: 백넘버가 아트보드 **위쪽 밖**(원본 위치)에 그대로 나타남 (중앙 X)
- **로그 확인**: grading.log에 `STEP 8B 교체용요소 pasteInPlace 성공` + `위치 일치(복원 불필요)` 또는 `위치 복원: dx=..., dy=...` 메시지
- **주의할 입력**: 교체용요소 레이어가 없는 AI는 기존대로 스킵(영향 없음)

⚠️ reviewer 참고:
- pasteInPlace 실패 폴백 체인이 3단계(executeMenuCommand → paste → app.paste)로 과한지 확인
- bounds 합집합에서 top/bottom 대소 관계(Illustrator 좌표: top이 큰 값) 제대로 적용됐는지
- translate는 pageItem 단위로 적용 → 그룹 내 구조 보존 확인

---

### [2026-04-16] selection 오염 수정 (pastedItems layerDesign 직접 참조)

#### 원인 (debugger 조사 확정)
- STEP 8B 교체용요소 paste가 `baseDoc.selection`을 [교체용요소]로 덮어씀
- STEP 9 직전 `var pastedItems = baseDoc.selection`이 디자인 요소 대신 교체용요소를 받음
- STEP 9/10이 잘못된 대상(교체용요소)에 작용 → pastedGroup bounds 과소, STEP 10 폴백 진입, 결과 EPS 공통 오류

#### 수정 (grading.jsx)
| 위치 | 변경 내용 | 순위 |
|------|----------|------|
| line ~1540 (pastedItems 획득 지점) | `baseDoc.selection` → `layerDesign.pageItems` 직접 순회 + selected=true | 1순위 (필수) |
| STEP 8B 블록 끝 (designDoc close 전) | `baseDoc.activeLayer = layerDesign; baseDoc.selection = null` 방어적 복원 | 2순위 (안전장치) |
| STEP 8 paste 직후 진단 | `selection=0` 시 designDoc alive/activeDoc 로깅 | 3순위 (3XL 별건) |

#### 구현 포인트
- `pastedItems`를 plain Array로 축적 → `.length`, `[i]` 접근 호환
- 각 item에 `selected = true` → 후속 `app.executeMenuCommand("group")` 메뉴 작동 유지
- ES3 호환 (var, for, try/catch만)
- STEP 9/10 본문 로직은 손대지 않음

#### 검증
- ES3 문법 PASS
- `layerDesign` 스코프 유효 (line 1421 생성 → 1540 내부 동일 try 블록)
- target/debug/illustrator-scripts/grading.jsx 복사는 경로 부재로 스킵 — PM이 기존대로 수동 복사

#### tester 참고
- 테스트 방법: XL/2XL/3XL 사이즈 grading 실행 후 결과 EPS 열어보기
- 정상 동작:
  - STEP 10 로그 부활 (이전엔 폴백 분기로 누락됨)
  - pastedGroup bounds가 아트보드 근접 수천 pt 크기
  - 결과 EPS에서 디자인 요소 정상 배치 (사이즈별 스케일 적용)
  - 교체용요소는 아트보드 밖에 scale만 적용된 상태로 유지
- 주의할 입력: 3XL은 paste=0 진단 로그가 뜰 수도 있음 (별건 추적 대상)

#### reviewer 참고
- selection 오염 방지를 위해 selection 사용하는 후속 코드가 있는지 추가 점검 필요
- `itemLd.selected = true` 반복문이 ES3에서 안전한지 (Illustrator PageItems 특성상 안전)

---

### [2026-04-16] 교체용요소 레이어 지원 (백넘버 참조 유지)

#### 배경
- 디자이너가 기준 AI에 "교체용요소" 레이어 신설 (아트보드 밖 위쪽, 백넘버 편집용 참조 숫자)
- 기존 "요소" 레이어와 분리: 위치 이동 없이 **스케일만** 적용
- 이전 로그에서 XL 기준 요소 bounds 상단이 아트보드 196pt 초과 원인 = 이 참조 숫자 → 레이어 분리로 근본 해결

#### 변경 (grading.jsx 1개 파일)
| 위치 | 변경 내용 | 신규/수정 |
|------|----------|----------|
| STEP 4B (isAiFile 블록 끝) | `refLayer` 선택적 탐색 (getByName try/catch) | 신규 |
| STEP 8B (paste 직후, designDoc close 전) | 교체용요소 copy → baseDoc "교체용요소" 레이어 paste | 신규 |
| STEP 9B (STEP 9 직후) | `baseRefLayer.pageItems` 개별 `Transformation.CENTER` scale | 신규 |
| STEP 10 정렬 | 수정 없음 (pastedGroup/layerDesign만 참조 → 자연 제외) | - |
| STEP 11-B 통합 | 수정 없음 (layerFill/layerDesign/layerPattern만 명시적 이동 → baseRefLayer 별도 유지) | - |

#### 핵심 설계 이유
- **왜 STEP 8B 시점에 copy/paste**: designDoc은 STEP 8 끝에서 close됨. STEP 4에서 clipboard에 "요소"가 이미 담겨 있으므로, 덮어쓰기를 피하려면 "요소" paste 완료 후에 "교체용요소" copy/paste 해야 함
- **왜 Transformation.CENTER**: 기본값 DOCUMENTORIGIN은 원점 기준이라 위치 이동 발생. CENTER는 각 객체 자기 중심 기준 → 위치 유지 + 크기만 변경
- **왜 개별 아이템 순회**: 레이어 전체 한 번에 resize하면 묶음 중심 기준이라 아이템 간 상대 위치가 변함. 개별 순회로 각자 제자리 유지

#### 폴백 (에러 삼킴, 기존 흐름 방해 X)
- "교체용요소" 레이어 없음 → 스킵 + 로그 ("STEP 4B 교체용요소 레이어 없음")
- 빈 레이어 → 스킵
- `linearScaleApplied === 1.0` → scale 생략 (위치도 이동 없음)
- copy/paste 중 에러 → 경고 로그 + 활성 문서 복원 후 계속

#### 대상 파일
- `C:/0. Programing/grader/illustrator-scripts/grading.jsx` (원본)
- `C:/0. Programing/grader/src-tauri/target/debug/illustrator-scripts/grading.jsx` (수동 복사 완료, 1911줄)

💡 tester 참고:
- 테스트 방법: "교체용요소" 레이어가 있는 기준 AI로 XL/3XL/4XL 그레이딩 실행
- 정상 동작 로그:
  - `STEP 4B 교체용요소 레이어 발견: pageItems=N`
  - `STEP 4B 교체용요소 paste 완료: baseRefLayer.pageItems=N`
  - `STEP 9B 교체용요소 scale 적용: X% (중심점 기준, N개)`
- 결과 EPS 확인:
  - 아트보드 안 요소는 기존과 동일 (조각별 정상 배치)
  - 교체용요소(백넘버 숫자)는 아트보드 위쪽 원본 위치에 scale만 반영되어 유지
  - XL/3XL/4XL에서 "요소 전체 bounds" 상단이 아트보드 안으로 축소되었는지
- 주의 입력: "교체용요소" 레이어 없는 구버전 AI도 정상 동작해야 함 (폴백 스킵 로그)

⚠️ reviewer 참고:
- STEP 8B copy/paste 실패 시 `app.activeDocument = baseDoc` 복원 로직 필요성 검토 (designDoc이 활성 상태로 남으면 아래 close 로직이 문제없는지)
- Transformation.CENTER가 모든 pageItem 타입(PathItem/GroupItem/TextItem)에서 정상 동작하는지
- baseRefLayer를 STEP 11-B 통합에서 자연 제외하는 로직이 z-order에 영향 없는지 (별도 레이어로 남음)

---

### [2026-04-16] 교체용요소 도입 후 회귀 조사 (debugger, 코드 수정 없음)

#### 증상 (사용자 실측 로그)
1. STEP 10 로그가 writeLog 파일에서 통째로 사라짐 — STEP 9B 직후 바로 `=== grading.jsx 종료 ===`
2. STEP 9 스케일 적용 후 pastedGroup bounds가 이전 height 3442 → 현재 약 552 (폭 3425 유지) — 모든 사이즈 동일 양상
3. 3XL만 STEP 8 직후 baseDoc.selection=0, layerDesign.pageItems=0 (다른 사이즈는 3)
4. 결과 EPS가 모든 사이즈 거의 동일 (요소가 원본 크기 그대로 꽂힘 → 비정상)

#### 핵심 원인 (단일)
**STEP 8B paste 직후 `baseDoc.selection`이 "교체용요소 paste 결과"로 덮어써진 상태에서, line 1540 `var pastedItems = baseDoc.selection;`이 그걸 그대로 받는다. 따라서 STEP 9의 group/resize 대상이 "디자인 요소"가 아닌 "교체용요소(백넘버 숫자)"로 뒤바뀐다.**

- line 1471 STEP 8 paste → selection = 디자인 요소 (정답)
- line 1491 `app.activeDocument = designDoc` + line 1492 `designDoc.selection = null`
- line 1498 교체용요소 copy → clipboard 덮어쓰기 (디자인 요소 clipboard는 이미 소모됐으므로 OK)
- line 1502 `app.activeDocument = baseDoc` + line 1509 `baseDoc.activeLayer = baseRefLayer` + line 1510 paste → **baseDoc.selection이 교체용요소로 덮어써짐**
- line 1540 `pastedItems = baseDoc.selection` ← **여기서 대상 뒤바뀜**

#### 증상 → 원인 귀착
- **증상 1 (STEP 10 로그 사라짐)**: pastedGroup.pageItems.length (교체용요소 개수) ≠ elementCountAtCopy (디자인 요소 개수, STEP 4 시점 기록) → line 1657 폴백 경로 진입 → `alignToBodyCenter` 호출 후 끝 → STEP 10 writeLog (line 1712)는 else 분기에만 있어 실행되지 않음. `$.writeln`으로 찍히는 "[Phase 2] 폴백 사용" 메시지는 writeLog 파일에 안 남음
- **증상 2 (bounds 과소)**: 로그 `[456.3, 1977.6, 3881.4, 1424.9]` (폭 3425, 높이 552)는 **교체용요소 그룹(아트보드 밖 위쪽 가로로 나열된 백넘버 숫자들)의 실제 bounds**. 코드 주석(line 1485, 1594)이 교체용요소 위치를 "아트보드 밖 위쪽 백넘버 참조 숫자"로 명시. 측정 대상이 교체된 것이지 실제로 축소된 것이 아님
- **증상 4 (결과 EPS 동일)**: 폴백은 **교체용요소 그룹**을 `alignToBodyCenter`로 몸판 중앙에 이동. **진짜 디자인 요소는 STEP 8에서 paste된 원본 위치/크기 그대로** layerDesign에 방치됨 → 모든 사이즈 결과가 "요소 크기 변화 없는 원본 배치"로 동일하게 보임
- **증상 3 (3XL paste=0)**: STEP 8 시점(8B 이전)의 selection=0이므로 위 원인과 **별건**. 추정: 2XS → 3XL 연속 실행 중 STEP 8B가 activeDocument/selection을 복원하지 않고 종료한 후유증으로 clipboard/activeDocument 상태 오염. 조사 범위 내 단정 불가

#### 권장 수정 방향 (PM 결정용 — debugger는 코드 변경 X)
- **1순위 (필수)**: line 1540 `var pastedItems = baseDoc.selection;`을 **selection에 의존하지 않고 layerDesign에서 재획득**
  ```
  baseDoc.selection = null;
  var pastedItems = [];
  for (var li = 0; li < layerDesign.pageItems.length; li++) {
      layerDesign.pageItems[li].selected = true;
      pastedItems.push(layerDesign.pageItems[li]);
  }
  ```
  이렇게 하면 STEP 8B가 selection을 오염시켜도 영향 없음
- **2순위 (안전장치)**: STEP 8B 정상 종료 경로 끝에도
  - `baseDoc.activeLayer = layerDesign;`
  - `baseDoc.selection = null;`
  복원 (현재는 catch 분기에만 `app.activeDocument = baseDoc` 복원 있음, 정상 경로는 없음)
- **3순위 (3XL 진단)**: STEP 8에서 `baseDoc.selection.length === 0`이면 clipboard/activeDocument/designDoc 생존 여부 추가 로그 + paste 1회 재시도
- **차선안 (후보 1, 구조 변경 큼)**: STEP 8B를 STEP 10 이후로 이동. clipboard 유지 보장 검증이 추가로 필요해 리스크 있음 → 1순위보다 후순위

#### 증거 로그 요약 (사용자 제공 vs 커밋 전 로그 비교)
| 항목 | 커밋 전 (정상) | 현재 (회귀) |
|------|---------------|------------|
| STEP 9 적용 후 pastedGroup bounds | `[506.3, 3412.2, 3831.3, -10.6]` height 3422 | `[456.3, 1977.6, 3881.4, 1424.9]` height 552 |
| STEP 10 로그 | `배치=4, 스킵=0, 총=4, linearScaleApplied=0.9213` + 최종 bounds | **없음** (writeLog 공백) |
| STEP 8 paste (3XL만) | selection=3 | selection=0, layerDesign=0 |

#### 대상 파일 (수정 안 함, 참고만)
- `C:\0. Programing\grader\illustrator-scripts\grading.jsx`
  - line 1480~1526: STEP 8B (copy/paste + selection 오염원)
  - line 1540~1550: pastedItems 획득 지점 (오염 흡수 지점)
  - line 1636~1666: useFallback 분기
  - line 1712~1735: STEP 10 writeLog (else 분기 안쪽 — 폴백이면 미실행)

---

### [2026-04-15] illustrator-scripts 경로 dev 분기 (venv 수정 패턴)

#### 배경
- Tauri가 dev 모드에서 `src-tauri/target/debug/illustrator-scripts/`의 자동 스테이징된 구버전을 실행
- 사용자가 `illustrator-scripts/grading.jsx`를 수정해도 target/debug 복사본은 동기화되지 않아 **구버전이 실행**됨 → 디버그 로그 파일이 생성되지 않는 문제 발생
- 이전 `get_python_engine_dir` 수정(커밋 bc4a79a)과 **동일 패턴**으로 근본 해결

#### 변경
| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| `src-tauri/src/lib.rs` | `get_illustrator_scripts_dir` 함수에 환경변수 오버라이드 + dev 분기 추가 (약 30줄 증가) | 수정 |

**수정 포인트** (lib.rs L303~):
1. **환경변수 오버라이드**: `GRADER_ILLUSTRATOR_SCRIPTS_DIR` 지정 시 `grading.jsx` 존재 확인 후 반환
2. **dev 분기** (`#[cfg(debug_assertions)]`): `env!("CARGO_MANIFEST_DIR")`의 부모(= 프로젝트 루트)의 `illustrator-scripts/` 우선 (grading.jsx 유효성 확인)
3. **기존 로직 유지**: exe 역추적 루프 + resource_dir 폴백 그대로

#### 검증
- `cargo check` PASS (10.99초, warning 0)
- 이전 venv 수정과 **정확히 동일 패턴** (1. 환경변수 → 2. CARGO_MANIFEST_DIR 부모 → 3. exe 역추적 → 4. resource_dir)

💡 tester 참고:
- **테스트 방법**:
  1. dev.bat 재시작 (Rust 재컴파일 필요)
  2. grading.jsx 내용 의도적으로 수정 (예: writeLog 문구 추가)
  3. OrderGenerate 실행 → 수정된 내용 반영 확인
- **정상 동작**: target/debug 복사본과 무관하게 **프로젝트 루트**의 최신 grading.jsx 실행됨
- **주의**: production 빌드(release)에는 영향 없음 (cfg(debug_assertions) 덕분)

⚠️ reviewer 참고:
- `get_python_engine_dir`와 **구조적 일관성** 확인 부탁 (탐색 순서/주석 스타일)
- dev 분기의 `grading.jsx` 존재 확인은 **의도된 방어 로직** — 빈 폴더나 잘못된 스테이징을 거르기 위함 (venv 쪽은 `engine.exists()`만 검사하지만, illustrator-scripts는 파일 단위 검증이 더 안전)
- **production 로직 변경 없음** — Phase 5 배포 작업에서 통합 검토 예정

#### 즉시 조치 (PM)
- target/debug/illustrator-scripts/grading.jsx 수동 복사 완료 → 재시작 없이 당장 테스트 가능
- Rust 수정분은 **다음 dev.bat 재시작** 후부터 항상 자동 반영

---

### [2026-04-15] grading.jsx 디버그 로그 파일 추가

📝 구현한 기능: ExtendScript Toolkit 없이 사이즈별 이상 원인을 파악할 수 있도록 `grading.jsx`에 파일 기반 디버그 로그 추가 (원인 확정용 임시 조치).

| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| `illustrator-scripts/grading.jsx` | writeLog/flushLog 헬퍼 + 주요 계산값 로깅 (~161줄 증가) | 수정 |

**변경 포인트**:
- 상단 헬퍼: `_logFilePath`, `_logBuffer`, `writeLog()`, `flushLog()` (ES3 호환, try/catch로 실패 무시)
- main() 초반: `config.resultJsonPath` 기반으로 `grading-log.txt` 경로 결정 + 시작 로그 (config 전체 기록)
- STEP 2A: baseArea + basePieceCount 로깅
- `importSvgPathsToDoc()`: SVG 문서 요약, 50pt 이상 각 path (w/h/area/bounds), 합산 결과 로깅
- STEP 8 paste 직후: pageItems/selection/layerDesign 개수 로깅
- STEP 9 스케일: areaRatio, linearScale, 적용 후 bounds 로깅
- STEP 10 개별 정렬: 배치/스킵/총 개수 + 최종 요소 전체 bounds 로깅
- catch 블록 + 정상 종료: [ERROR] + 종료 마커 + flushLog 호출
- 파일 저장 모드: **append** ("a") — 사이즈별 실행 누적

**로그 파일 위치**: `resultJsonPath`와 같은 폴더에 `grading-log.txt`
- 예: `C:\0. Programing\grader\illustrator-scripts\grading-log.txt`
- 사용자가 이 파일 한 개만 공유하면 모든 사이즈 실행 정보 확인 가능

💡 tester 참고:
- **테스트 방법**: 문제 사이즈(S, 3XL, 4XL)를 포함해 3~4개 사이즈를 OrderGenerate로 연속 실행
- **정상 동작**: `illustrator-scripts/grading-log.txt`가 생성되고, 각 실행마다 시작~종료 블록이 누적됨
- **확인 지표**:
  - S: STEP 8 "붙여넣은 요소 없음" 경고 + selection=0/null 여부
  - 3XL/4XL: STEP 7 targetArea가 XL/2XL 대비 과도하게 큰지, STEP 9 linearScale이 1.3+ 인지
  - path별 area 목록에서 "아트보드 전체 덮는 사각형" 의심 path 찾기
- **주의**: 한글/공백 경로에서 File("UTF-8", "a") 동작 여부 확인

⚠️ reviewer 참고:
- ES3 호환 유지 (var, 함수 선언만, toISOString은 try/catch로 폴백)
- 기존 `$.writeln`은 모두 유지, writeLog는 **추가**만 함 (로직 무변경)
- writeLog 자체가 실패해도 스크립트는 계속 진행 (바깥 try/catch)
- **추후 제거**: 원인 확정 후 이 디버그 로그 전체 제거 (Phase 5+ 또는 원인 커밋 후 별도 revert)

#### 수정 이력
| 회차 | 날짜 | 수정 내용 | 수정 파일 | 사유 |
|------|------|----------|----------|------|
| 1차 | 2026-04-15 | 로그 파일 경로 기준을 `resultJsonPath` → `outputPath` 우선으로 변경 (폴백: resultJsonPath) | `illustrator-scripts/grading.jsx` | 사용자 요청: 결과물(.ai) 바로 옆에 로그가 있어야 추적/공유가 쉬움. ES3 호환 유지 (var/try-catch만 사용) |

### [2026-04-15] 3XL 좌표 문제 조사

**증상**: 13개 사이즈 중 3XL만 요소(숫자 "1234"/"7890"/로고/라벨 등)가 몸판 범위 밖으로 과도하게 크게 튀어나옴. 몸판(파란 영역)은 3XL 크기로 정상. 4XL/5XL은 정상 추정.

**스케일 로직 흐름 (grading.jsx)**:
1. STEP 2A: 디자인 AI "패턴선" 레이어 50pt 이상 path들의 `path.area` 절대값 합산 → `baseArea` (단 한 번, 사이즈 무관)
2. STEP 7 `importSvgPathsToDoc`: 타겟 SVG의 50pt 이상 path `area` 합산 → `targetArea` + `basePieces` bbox 수집
3. STEP 9: `linearScale = sqrt(targetArea / baseArea)` → `pastedGroup.resize(linearScale*100, ..., true,true,true,true)`
4. STEP 10: 요소 그룹 해제 → 각 요소를 `basePieces[pieceIdx].center + (origRelOffset * linearScale)` 위치로 translate

**3XL 특수 조건 없음**: 코드에 사이즈 이름에 따른 분기 전혀 없음. `SIZE_LIST` 인덱스도 grading.jsx 내부에서 쓰지 않음. 3XL.svg 파일 하나를 config.patternSvgPath로 받아서 그대로 처리.

**원인 후보 (우선순위)**:

1. **3XL.svg 파일 자체의 이상** (최고 확률)
   - 원본 SVG viewBox 또는 path 좌표가 다른 사이즈보다 **엄청 큰 숫자 단위**를 쓰고 있을 가능성
   - `svgDoc.artboards[0].artboardRect`로 베이스 문서 크기가 결정되므로 viewBox가 이상하면 몸판 실측치는 맞지만 path 내부 좌표가 엉뚱할 수 있음
   - 예: 다른 사이즈는 mm 단위, 3XL만 inch 단위로 export 됐거나, Illustrator export 시 scale factor가 다르게 들어감
   - `targetArea`가 비정상적으로 커지면 `linearScale = sqrt(targetArea/baseArea)`가 과도하게 커져 → 요소가 과하게 확대됨
   - **몸판은 정상 크기로 보이는데 요소만 크다**는 것이 결정적 단서 → 몸판 path는 `area` 계산만 문제, 렌더링은 정상일 가능성 (벡터는 좌표계 스케일만 다를 수 있음)

2. **3XL.svg의 path 하나가 비정상적으로 크거나 열린 경로**
   - `importSvgPathsToDoc`는 50pt 이상 path 모두 `targetArea`에 합산
   - 만약 3XL.svg에 "전체 아트보드를 덮는 배경 사각형" 같은 path가 하나 들어있다면, 또는 path가 닫히지 않아서 `path.closed = true`로 강제 닫을 때 면적이 폭발적으로 커질 수 있음
   - `calcLayerArea`/`importSvgPathsToDoc` 모두 `if (!path.closed) { path.closed = true; }` 강제 처리 → 복잡한 열린 경로는 예기치 않은 area 발생

3. **basePieces와 designPieces 매핑 실패 + 폴백 비활성화**
   - 만약 3XL.svg의 조각 수가 디자인 AI와 같으면(S1 통과) 개별 정렬 경로로 진입하는데, 인덱스 매핑이 엉뚱하면 엉뚱한 조각 중심으로 이동
   - 하지만 "요소가 몸판 위로 튀어나간다"는 것은 `linearScale`이 과도하다는 신호에 더 가까움 (매핑 오류라면 엉뚱한 조각에 붙긴 해도 크기는 맞을 것)

4. **3XL의 Drive SVG 파일과 디자인 AI 패턴선 레이어의 "기준 사이즈" 불일치** (희박)
   - `baseArea`는 한 번만 계산되고 모든 사이즈 공용 → 여기선 영향 없음 (사이즈마다 재계산 안 함)

**3XL을 의심할 수밖에 없는 이유**:
- grading.jsx는 3XL 이름을 한 번도 사용하지 않음 → 코드 분기에서 3XL만 다르게 취급할 수 없음
- config.json의 `patternSvgPath`만 다르게 들어감 → **Drive의 3XL SVG 파일 자체**가 유일한 독립 변수
- 사용자가 직접 3XL.svg를 다른 사이즈와 비교하는 것이 가장 빠른 확인법

**사용자 확인 요청**:
1. 어떤 프리셋(패턴)에서 발생? 모든 프리셋? 특정 디자인(V넥 등)?
2. 3XL.svg를 Illustrator나 브라우저로 직접 열어서 아트보드 크기가 다른 사이즈(2XL/4XL)와 비슷한지
3. 3XL.svg의 path 수가 다른 사이즈와 동일한지 (조각 수)
4. Illustrator 콘솔(`$.writeln` 로그) 중 3XL 실행 시:
   - `[grading.jsx] 기준 패턴 면적: X pt² (N개 조각)` (baseArea)
   - `[grading.jsx] 타겟 패턴 면적: Y pt² (M개 조각)` (targetArea)
   - `[grading.jsx] 면적 비율: Z`
   - `[grading.jsx] 선형 스케일: W (W*100%)`
   - → 2XL 실행 때 값과 비교하면 3XL의 `면적 비율`이 돌발적으로 튈 것으로 추정

**수정 방향 (원인 확정 후)**:
- 원인 1/2 (SVG 파일 자체): 디자이너가 3XL.svg를 재 export / 또는 코드에 "이상치 방어 로직" 추가 — `linearScale`이 이웃 사이즈 대비 이상하게 튀면 경고 + 수동 확인 요청
- `linearScale` clamp (예: 2.0 초과 시 경고/차단)는 방어적 패치로 유용하지만 근본 원인 규명이 먼저

**코드 수정 없음 — 조사만 진행.**

---

### [2026-04-15] 작업 흐름 재설계 Phase 4 (OrderGenerate 통합) — 계획 제안

#### 기존 분석
- **SizeSelect.tsx (518줄)**: 프리셋/디자인 select + 주문서 업로드(`run_python parse_order`) + 사이즈 체크박스 그리드 + baseSize 드롭다운. `saveGenerationRequest`로 sessionStorage에 저장 후 `/generate` 이동.
- **FileGenerate.tsx (663줄)**: `loadGenerationRequest` → `loadPresets`/`loadDesigns` → `handleStart`:
  - `$APPDATA/outputs/{timestamp}/` 생성
  - Illustrator 존재 확인 (`find_illustrator_exe`)
  - 있으면 `handleStartIllustrator` (각 사이즈마다 `resolveSvgContent` → `write_file_absolute`로 temp SVG → config.json 기록 → `run_illustrator_script`)
  - 없으면 `handleStartPythonFallback` (calc_scale + generate_graded PDF)
- **grading.jsx**: config에 `designAiPath` 우선, `designPdfPath` 폴백. `resolveDesignFile()` 이미 분기 처리 중. 따로 baseSize 안 씀(SVG 치수로 자체 계산).
- **WorkSession 타입**: `workFolder`, `baseAiPath`, `selectedPresetId?`, `createdAt`만 있음. 주문서 경로 / baseSize 필드 없음.

#### 변경 계획
| 파일 | 변경 | 예상 라인 |
|------|------|----------|
| `src/pages/OrderGenerate.tsx` | 신규 (SizeSelect + FileGenerate 통합, Illustrator 전용) | ~450 |
| `src/main.tsx` | `/generate` → OrderGenerate로 교체, import 변경 | +2/-2 |
| `src/App.css` | (기존 `.size-section`, `.gen-result` 등 재활용, 신규 스타일 최소) | 선택 |

**유지 (이번 세션 건드리지 않음)**:
- `src/pages/FileGenerate.tsx` / `SizeSelect.tsx` — Phase 5에서 삭제 (지금은 import만 제거)
- `src/stores/designStore.ts`, `generationStore.ts` — Phase 5에서 삭제
- `src/types/session.ts` — 주문서 경로는 OrderGenerate 내부 state로만, session 스키마 수정 불필요
- `grading.jsx`, `pdf_handler.py`, `order_parser.py` — 수정 없음

#### 세부 설계

**세션 가드 (페이지 진입 시 useEffect)**:
```
const s = loadWorkSession();
if (!s?.workFolder || !s?.baseAiPath) { navigate("/work"); return; }
if (!s.selectedPresetId) { navigate("/pattern"); return; }
```

**상태 (useState)**:
- `session: WorkSession` (로드된 세션)
- `preset: PatternPreset | null` (selectedPresetId로 조회)
- `baseAiName: string` (baseAiPath에서 파일명 추출 + 확장자 제거)
- `selectedSizes: Set<string>` (Q7: 수동 체크 허용)
- `sizeQuantities: Map<string, number>` (주문서에서 추출한 수량, 옵션)
- `orderResult: OrderParseResult | null` (주문서 메타)
- `orderLoading: boolean`
- `baseSize: string` (디자인 기준 사이즈, 기본 "L")
- `results: GenerationResult[]`
- `generating: boolean`
- `globalError: string`

**UI 섹션 구성**:
1. **작업 요약 카드** (세션 정보 3줄):
   - 🎨 기준 AI: `{baseAiName.ai}`
   - 📁 작업 폴더: `{workFolder}`
   - ✅ 선택 패턴: `{preset.name}` (조각 N개, 사이즈 M개)
2. **주문서 (선택)** — `handleExcelUpload` (SizeSelect 로직 그대로 이식)
3. **사이즈 선택** — `.size-grid` 체크박스 (프리셋 등록 사이즈만 활성화). 주문서 업로드 시 자동 체크
4. **기준 사이즈 드롭다운** (baseSize 선택, 프리셋 등록 사이즈 중)
5. **생성 시작 버튼** + 진행 상태
6. **결과 목록** (`.gen-result-list` 재활용) + "작업 폴더 열기" 버튼

**핵심 차이 (FileGenerate 대비)**:
| 항목 | 기존 | 신규 OrderGenerate |
|------|------|-------------------|
| 입력 | GenerationRequest + DesignFile | WorkSession + preset |
| 출력 폴더 | `$APPDATA/outputs/{timestamp}/` | **`session.workFolder`** (바로 저장) |
| 출력 파일명 | `{sanitize(design.name)}_{size}.eps` | **`{sanitize(baseAiName)}_{size}.eps`** (Q6) |
| config | `designAiPath=storedPath` or `designPdfPath` | **항상 `designAiPath=session.baseAiPath`** |
| Python 폴백 | `handleStartPythonFallback` 존재 | **제거** (Q5) |
| Illustrator 미설치 | Python으로 대체 | **에러 다이얼로그**: "Illustrator 설치 필요" |

**출력 파일명 규칙 (Q6)**:
```
baseAiPath = "G:\...\V넥\농구_V넥_XL.ai"
baseAiName = "농구_V넥_XL"   // 확장자 제거
out = `{session.workFolder}\\{sanitizeFileName(baseAiName)}_{size}.eps`
```
이미 파일 있으면 덮어쓰기 (Phase 4는 경고 없음, Phase 5에서 다이얼로그 추가).

**config.json 포맷 (grading.jsx 호환)**:
```json
{
  "patternSvgPath": "{scriptsDir}\\temp_pattern_{size}.svg",
  "outputPath": "{workFolder}\\{baseAiName}_{size}.eps",
  "resultJsonPath": "{scriptsDir}\\result.json",
  "patternLineColor": "auto",
  "designAiPath": "{session.baseAiPath}"
}
```
→ grading.jsx는 이미 `designAiPath` 우선 처리. 수정 없음.

**Illustrator 없을 때 처리**:
```
if (!aiExePath) {
  setGlobalError("Adobe Illustrator가 설치되지 않았거나 찾을 수 없습니다. (Q5: Python 폴백 미지원)");
  setGenerating(false);
  return;
}
```

#### 위험/고려
- **세션 가드**: workFolder/baseAiPath 없을 때 `/work`로, selectedPresetId 없을 때 `/pattern`으로 분기. useEffect 1회 실행.
- **기존 FileGenerate 삭제 시점**: Phase 5. 이번 세션은 main.tsx import만 교체 (파일 존치). 동시에 돌리지 않도록 `/generate` 라우트만 새 컴포넌트로.
- **generationStore 참조**: OrderGenerate는 generationStore를 쓰지 않음 (session에서 직접 읽기). 기존 FileGenerate/SizeSelect는 남아있지만 라우트 연결이 끊어지므로 동작 안 함.
- **baseSize**: WorkSession에 저장 안 하고 페이지 로컬 상태로만 (기본 "L"). Phase 5에서 session 확장 검토.
- **주문서 경로 세션 저장**: 계획서 section 3.1엔 `orderFilePath?` 필드 있지만 이번 MVP에선 불필요(세션 재진입 시 다시 업로드해도 OK). 스킵.
- **에러 복원력**: 한 사이즈 실패해도 다음 사이즈 진행 (FileGenerate 패턴 유지).
- **z-index/CSS**: 기존 `.size-section`, `.size-grid`, `.size-cell`, `.gen-result-list`, `.size-footer` 그대로 재활용. 신규 CSS 0 또는 최소.

#### 구현 단계 (사용자 승인 후)
1. `src/pages/OrderGenerate.tsx` 신규 작성 (~450줄)
2. `src/main.tsx` import 교체 (FileGenerate → OrderGenerate)
3. `npx tsc --noEmit` 검증
4. `npm run build` 검증
5. 실제 Illustrator 실행 테스트는 tester가 수동

---

📝 구현한 기능: Phase 3 즐겨찾기 (⭐ 토글 + 필터, 가상 폴더 제외)

| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| `src/stores/favoritesStore.ts` | favorites.json 로드/저장 (presetStore 패턴: LoadResult, .backup.json, 중복 제거). `getFavoriteKey(preset)` 헬퍼로 stableId/id 폴백 | 신규 |
| `src/pages/PatternManage.tsx` | `favoriteKeys`(Set)/`showFavoritesOnly` state, 로드 useEffect, `handleToggleFavorite`(낙관적 업데이트+롤백+stopPropagation), `filteredPresets`에 즐겨찾기 필터 추가, 툴바에 "⭐ 즐겨찾기만 보기" pill 버튼 + 개수 뱃지, 카드 우상단 ⭐ 토글 버튼 | 수정 |
| `src/App.css` | `.preset-card__check` 우상단→좌상단 이동, `.preset-card__fav-toggle`(+`--active`) 신규, `.pattern-toolbar`+`.pattern-toolbar__fav-filter`(+`--active`)+`.pattern-toolbar__fav-icon`+`.pattern-toolbar__fav-count` 신규 | 수정 |

💡 tester 참고:
- **테스트 방법**:
  1. 패턴 페이지 진입 → 카드 우상단에 빈 별(☆) 표시 확인
  2. 별 클릭 → 채워진 별(★, 앰버색)로 변경 + `$APPDATA/com.grader.app/favorites.json`에 stableId/id 저장 확인
  3. 툴바의 "⭐ 즐겨찾기만 보기" 클릭 → ★ 표시된 카드만 노출
  4. 즐겨찾기 개수 뱃지가 ★ 총개수와 일치
  5. **선택 모드(워크세션 있음)**: 카드 클릭 시 좌상단 ✓ / 우상단 ★ 동시 노출되어도 겹치지 않음
  6. ★ 버튼 클릭 시 카드 선택이 같이 일어나지 않음 (stopPropagation 검증)
- **정상 동작**:
  - 앱 재시작 후에도 즐겨찾기 유지
  - Drive 프리셋은 stableId 기반이라 Drive 폴더명이 바뀌어도 즐겨찾기 유지
  - 저장 실패 시 UI 롤백 + alert
- **주의할 입력**:
  - favorites.json 수동 손상(배열이 아님) → 로드 실패 시 빈 Set + 경고만 찍고 앱 정상 동작
  - 같은 키를 중복 저장 시도 → saveFavorites 내부 Set으로 자동 중복 제거
  - "전체 해제"(빈 배열 저장)는 정상 허용 (presetStore와 규칙 다름 — favorites는 비어있는 것도 정상)

⚠️ reviewer 참고:
- ✓(__check)는 `pointer-events: none`인데 ★(__fav-toggle)는 `z-index: 3`로 위에 있음 → 별이 선택 체크를 가리지 않도록 **좌/우로 위치 자체를 분리**함
- 가상 폴더(즐겨찾기 섹션을 CategoryTree 최상단에 추가)는 계획에서 명시적으로 **제외** — Phase 3-후속으로 보류
- Drive 동기화 대상 X: favorites.json은 로컬 개인 취향이라 Drive에 올리지 않음 (사용자 결정 Q4=A)
- `handleToggleFavorite`는 `favoriteKeys` deps로 useCallback 되어 있어 Set 참조가 바뀌면 새 함수 생성 — 낙관적 업데이트 시점에 최신 Set을 참조하기 위함

검증: `npx tsc --noEmit` PASS / `npm run build` PASS (dist 303KB gzip 94KB)

### [2026-04-15] Phase 4 OrderGenerate 통합 (구현)

📝 구현한 기능: SizeSelect + FileGenerate → OrderGenerate 한 페이지 통합 (Illustrator 전용)

| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| `src/pages/OrderGenerate.tsx` | 신규 작성. 세션 가드(workFolder/baseAiPath/selectedPresetId) → 프리셋 로드 → 사이즈 선택(엑셀 주문서 업로드 옵션) → baseSize 드롭다운 → Illustrator 호출 → 결과 목록 → "작업 폴더 열기" / "새 작업 시작". 출력: `{workFolder}\{baseAiName}_{size}.eps`. config.json에 `designAiPath=session.baseAiPath` 고정. ~530줄. | 신규 |
| `src/main.tsx` | import FileGenerate → OrderGenerate 교체, `/generate` 라우트 엘리먼트 교체, 주석 정리 | 수정 |

핵심 로직 요약:
- **세션 가드**: `useEffect` 1회. workFolder/baseAiPath 없으면 /work, selectedPresetId 없으면 /pattern, 프리셋이 삭제돼 있으면 /pattern. 로드 완료까지 `loadingInit`로 placeholder.
- **출력 규칙**: 구 FileGenerate는 AppData/outputs/{timestamp} 밑에 저장했지만, 신규는 `session.workFolder` 루트에 바로 저장. 파일명은 `getFileBaseName(baseAiPath) → sanitizeFileName → {base}_{size}.eps`.
- **config.json**: grading.jsx 호환 포맷 유지. `designAiPath`만 사용(PDF 분기 제거). `patternLineColor: "auto"` 그대로.
- **엔진**: Illustrator 전용. `find_illustrator_exe` 실패 시 한국어 에러 다이얼로그 후 종료. Python 폴백 로직 포팅하지 않음.
- **주문서**: 선택 사항. 업로드 안 해도 수동 체크만으로 진행 가능. SizeSelect의 `handleExcelUpload` 로직 그대로 이식.
- **baseSize**: 페이지 로컬 state. 기본 "L", 프리셋에 "L" 없으면 첫 번째 사이즈. 세션 스키마 수정 X.
- **"새 작업 시작"**: 결과 화면에만 노출. `clearWorkSession() → navigate("/work")`.
- **에러 복원력**: 한 사이즈 실패해도 다음 사이즈 계속 진행(FileGenerate 동일 패턴).

💡 tester 참고:
- **테스트 전 준비**:
  1. Adobe Illustrator 설치된 환경 필요 (미설치 시 에러 메시지만 확인 가능)
  2. /work에서 작업 폴더 + AI 파일 선택 → /pattern에서 프리셋 선택 → /generate 진입
- **테스트 방법**:
  1. 세션 가드: 브라우저 새로고침/URL 직접 입력 시 /work로 리다이렉트되는지
  2. 작업 요약 카드에 "기준 AI / 작업 폴더 / 선택 패턴" 3줄 정확히 표시
  3. 엑셀 주문서 없이 체크박스만으로 "파일 생성 시작" 가능
  4. 엑셀 주문서 업로드 → 사이즈 자동 체크 + 수량 뱃지 표시
  5. 기준 사이즈 드롭다운 → 프리셋 등록 사이즈만 옵션
  6. 실행 중에는 모든 버튼/체크박스 disabled
  7. 생성 완료 → 작업 폴더에 `{baseAiName}_{size}.eps` 파일들이 존재
  8. "작업 폴더 열기" 버튼 → OS 파일 탐색기로 session.workFolder 오픈
  9. "새 작업 시작" 버튼 → 세션 초기화 + /work 진입
- **정상 동작**:
  - Illustrator 미설치 시: "Adobe Illustrator가 설치되지 않았거나 찾을 수 없습니다. 설치 후 재시도해주세요." 다이얼로그만 표시 후 멈춤
  - Drive 프리셋 사용 시에도 svgPathBySize 경유해서 정상 생성 (resolveSvgContent 통합 경로)
  - 한 사이즈 실패해도 나머지 사이즈는 계속 진행
- **주의할 입력**:
  - **반드시 실제 Illustrator 실행 테스트 필요** (자동화 불가)
  - 프리셋이 Phase 이후 삭제된 경우: /pattern으로 리다이렉트되는지
  - 작업 폴더가 Drive 공유 드라이브인 경우 쓰기 권한 확인
  - baseAiPath에 한글/공백/특수문자 포함되어도 sanitizeFileName이 치환

⚠️ reviewer 참고:
- **기존 FileGenerate/SizeSelect/designStore/generationStore는 파일은 남아있지만 라우트 연결이 끊어져 동작하지 않음** (Phase 5에서 삭제 예정). `/size` 리다이렉트가 `/generate`로 가므로 구 SizeSelect도 렌더되지 않음.
- grading.jsx는 수정 없음. 기존 `designAiPath` 우선 분기가 이미 있어 재활용만 함.
- 세션 스키마(`WorkSession`)는 수정 X (baseSize/주문서경로 모두 페이지 로컬로만). Phase 5에서 필요 시 확장 검토.
- 결과 화면에 `gen-result__path` 클래스 사용 — 기존 CSS에 없으면 code 태그 기본 스타일로 표시됨. 문제 있으면 CSS 추가 필요.
- `outputDir`는 session.workFolder 그대로. "폴더 열기"는 openPath 그대로 재활용.
- Python 폴백을 의도적으로 뺐기 때문에, 미설치 환경에서는 테스트 불가 — 이건 Phase 4 요구사항 그대로.

검증: `npx tsc --noEmit` PASS / `npm run build` PASS (dist 304KB gzip 94KB)

### [2026-04-15] OrderGenerate 버그 수정 + 기준 사이즈 자동 + 구글 시트

📝 구현한 기능:
1. Python 엔진 경로 탐색 버그 수정 (dev 모드에서 엉뚱한 폴더 매칭 방지)
2. AI 파일명에서 사이즈 자동 추출 → OrderGenerate의 기준 사이즈 드롭다운 초기값으로 반영
3. OrderGenerate에 구글 시트 URL 입력 → CSV fetch → 간단 휴리스틱으로 사이즈/수량 추출

| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| `src-tauri/src/lib.rs` | `get_python_engine_dir` 개선: ①환경변수 `GRADER_PYTHON_ENGINE_DIR` 오버라이드 ②`#[cfg(debug_assertions)]`에서 `CARGO_MANIFEST_DIR`의 상위 기준 1순위 탐색 ③기존 exe 역추적/resource_dir 폴백 유지 | 수정 |
| `src/types/session.ts` | `WorkSession.baseSize?: string` 추가 (파일명 파싱 힌트) | 수정 |
| `src/types/pattern.ts` | `extractSizeFromFilename(fileName)` 신규 — 확장자/경로 제거 후 토큰화, 뒤에서부터 SIZE_LIST 매칭 | 수정 |
| `src/pages/WorkSetup.tsx` | `handleNext`에서 `extractSizeFromFilename(baseAiPath)` 호출 → session.baseSize 저장 | 수정 |
| `src/pages/OrderGenerate.tsx` | ①세션 로드 시 `s.baseSize`를 baseSize 초기값으로 사용 ②`toCsvExportUrl()` + `parseCsvSizes()` 순수 헬퍼 추가 ③`sheetUrl/sheetLoading` 상태 + `handleSheetImport()` 추가 ④`.sheet-url-row` input + 가져오기 버튼 UI ⑤`resetOrderToManual`에 sheetUrl 초기화 추가 | 수정 |
| `src/App.css` | `.sheet-url-row` + `.sheet-url-input` 스타일 추가 | 수정 |

핵심 로직:
- **Rust 경로 탐색 우선순위**: ENV 오버라이드 → dev: `CARGO_MANIFEST_DIR/../python-engine` → exe 역추적 → resource_dir. dev 빌드에서는 컴파일 타임에 src-tauri 절대 경로가 박히므로, target/debug 위치에 관계없이 프로젝트 루트를 정확히 찾는다.
- **사이즈 파싱**: `"농구_V넥_XL.ai"` → 확장자 제거 → `_`/공백/`-`/`.`로 토큰 분해 → 뒤에서부터 SIZE_LIST 매칭(대소문자 무시) → `"XL"`. 관습상 사이즈가 뒤쪽에 있어 뒤→앞 스캔. 실패 시 null → 세션 저장 안 하고 OrderGenerate가 기본 "L"로 보정.
- **구글 시트 URL 처리**:
  - `toCsvExportUrl`: `/spreadsheets/d/{KEY}/edit?gid={GID}` → `/spreadsheets/d/{KEY}/export?format=csv&gid={GID}`. gid 없으면 0.
  - `parseCsvSizes`: 2D 그리드 스캔 → 각 셀이 SIZE_LIST 매칭되면 우측 같은 행 → 없으면 아래 같은 열에서 "가장 가까운 양의 정수"를 수량으로. 중복 매칭은 합산.
  - 프리셋에 없는 사이즈는 경고 메시지만 출력 후 제외.
  - CORS: docs.google.com 공개 시트 export는 공유 설정이 "링크가 있는 모든 사용자 뷰어"일 때만 동작.

💡 tester 참고:
- **⚠️ dev.bat 재시작 필수** (lib.rs 수정 → Rust 재컴파일)
- **작업 1 (Rust) 테스트**:
  - `dev.bat` 재시작 후 파이썬 호출이 필요한 기능(엑셀 주문서 업로드 등)을 실행 → 정상 동작해야 함
  - 환경변수 테스트(선택): `set GRADER_PYTHON_ENGINE_DIR=C:/other/python-engine` 후 재시작 시 그 경로가 우선됨
- **작업 2 (기준 사이즈 자동) 테스트**:
  - `/work`에서 파일명이 `..._XL.ai`, `..._M.ai`, `..._2XL.ai` 같은 AI 파일 선택
  - `/pattern` → 프리셋 선택 → `/generate` 진입 시 기준 사이즈 드롭다운 초기값이 파일명 토큰과 일치해야 함
  - 파일명에 사이즈 토큰이 없으면(예: `농구유니폼.ai`) 기존대로 "L"(또는 프리셋 첫 사이즈)로 보정
  - 프리셋에 등록되지 않은 사이즈가 추출되면 자동 보정 useEffect가 다른 값으로 대체 (깜빡임 가능)
- **작업 3 (구글 시트) 테스트**:
  - 테스트 시트 예: S=3, M=5, L=7, XL=2 같은 단순 표
  - 공유 설정을 "링크가 있는 모든 사용자 뷰어"로 변경
  - 시트 URL 붙여넣기 → "시트에서 가져오기" → 체크박스 자동 체크 + 수량 뱃지 표시
  - "총 N장" 요약이 시트 합계와 일치해야 함
  - 잘못된 URL: 에러 메시지 "유효한 구글 시트 URL이 아닙니다..."
  - 권한 없는 시트: "HTTP 403/401..." 에러 → 공유 설정 안내 메시지
  - 사이즈가 없는 시트: "시트에서 사이즈를 찾지 못했습니다..." → 엑셀 업로드 권장 안내
- **정상 동작**:
  - 구글 시트와 엑셀은 상호 배타 아님 — 둘 중 마지막으로 사용한 것이 덮어씀
  - "주문서 초기화" 클릭 시 sheetUrl input까지 비워짐
- **주의할 입력**:
  - 숫자 셀에 따옴표가 있거나 `"1,234"` 같은 천단위 쉼표가 들어있으면 `parsePositiveInt`가 제거 후 파싱 (소수점은 거부)
  - 같은 사이즈가 여러 셀에 있으면 합산됨 (분산 입력 대응이지만, 사용자에게는 "왜 합쳐졌지" 혼란 가능 — Phase 5+에서 재검토)
  - 비공개 시트는 HTML 로그인 페이지가 돌아와서 사이즈 0건으로 끝남

⚠️ reviewer 참고:
- **production 경로 로직(exe 역추적/resource_dir)은 건드리지 않음** — Phase 5 번들 배포 준비 때 재검토
- `parseCsvSizes`는 MVP용 간단 휴리스틱 — Python order_parser의 가로/세로/표형 자동감지를 JS로 포팅하지 않음. Phase 5+에서 필요 시 확장.
- `OrderParseResult.detectedFormat`에 `"auto"` 값이 없어 `"unknown"`으로 매핑했음. 요약 바에는 "자동감지"로 표시됨.
- 시트 fetch는 Tauri의 브라우저 fetch를 그대로 사용 — 별도 Rust 커맨드 추가 없음(CORS 문제는 공개 시트면 docs.google.com이 허용)
- `extractSizeFromFilename`은 pattern.ts에 위치 — SIZE_LIST 상수와 같은 파일이라 응집도 높음. svgResolver는 SVG 전용 유지.

검증: `npx tsc --noEmit` PASS / `cargo check` PASS / `npm run build` PASS (dist 308KB gzip 95.5KB)

### [2026-04-15] 3XL/4XL 좌표 + XL 요소 누락 조사

#### 증상 요약 (사용자 실측)
- **증상 A**: 3XL, 4XL 출력물에서 요소(숫자 1234/7890/20/로고/라벨)가 몸판 상단/좌우로 튀어나가고 과도하게 큼. 몸판(파란 영역) 크기는 정상. 5XL은 언급 없음.
- **증상 B**: 기준 AI = XL, 타겟 = XL 그레이딩 시 결과 EPS에 **몸판만 있고 요소가 전혀 없음**.

#### 조사한 파일
- `src/pages/OrderGenerate.tsx` (955줄): 사이즈 루프 + config.json 생성 로직 (라인 543~624)
- `illustrator-scripts/grading.jsx` (1636줄): STEP 1~11-D 전체 흐름
  - `calcLayerArea` (663~680)
  - `importSvgPathsToDoc` (772~853)
  - `extractPatternPieces` (866~904)
  - `alignElementToPiece` (993~1013)
  - STEP 2A baseArea 계산 (1137~1154)
  - STEP 4 요소 copy + 매핑 사전 수집 (1184~1255)
  - STEP 5 SVG 열기 (1257~1278)
  - STEP 7 importSvgPathsToDoc 호출 (1296~1308)
  - STEP 8 paste (1333~1339)
  - STEP 9 linearScale 적용 (1368~1387)
  - STEP 10 개별 정렬 / 폴백 (1389~1478)

#### OrderGenerate의 config.json 구성 (증상 B 단서)

루프 (라인 543~590):
```
for targetSize in selectedSizes:
  targetSvgData = resolveSvgContent(piece, targetSize)   // Drive SVG 또는 Local 인라인
  tempSvgPath = scriptsDir\temp_pattern_{targetSize}.svg
  write(tempSvgPath, targetSvgData)
  config = {
    patternSvgPath: tempSvgPath,
    outputPath: workFolder\{baseAiName}_{targetSize}.eps,
    resultJsonPath,
    patternLineColor: "auto",
    designAiPath: session.baseAiPath,   // ← 항상 같은 AI 파일
  }
```

**결정적 관찰**: OrderGenerate의 사이즈 루프는 **baseSize를 config.json에 전달하지 않는다**. designAiPath는 사용자가 /work에서 고른 단 하나의 AI 파일 고정. `baseSize` state는 드롭다운 UI용으로만 존재하고, config에도 grading.jsx에도 **전혀 쓰이지 않는다**.

→ **"기준 사이즈"는 실질적으로 baseAiPath 파일의 패턴선 레이어 면적으로 결정된다** (grading.jsx STEP 2A). baseSize 드롭다운은 현재 의미 없는 UI.

#### 증상 B (XL = XL에서 요소 누락) — 원인 후보

grading.jsx는 `basePieces == designAiPath` 동일성 체크 없음. 그래도 실패할 수 있는 경로:

**가설 B1 (최유력): STEP 2A가 "요소"를 "패턴선"으로 오인 포함 — X**
- calcLayerArea는 layer.pathItems만 순회. "패턴선" 레이어에 있는 path만 대상.
- 만약 XL AI 파일이 "요소"까지 모두 "패턴선" 레이어에 들어있다면? → 가능성 있음
- 하지만 이건 증상 B와 직접 연결되지 않음 (요소 누락 원인은 따로)

**가설 B2 (최유력): STEP 4의 designPieces 매핑 안전장치 S1/S3가 모든 요소를 스킵**
- XL AI 파일의 "패턴선" 조각 수 vs 타겟 XL SVG 조각 수가 다르면 useFallback=true → alignToBodyCenter 경로로 가서 요소가 "몸판 중앙"으로 이동만 함 (요소 누락 아님)
- 폴백이 요소를 "몸판 중앙" 한 곳에 모아놓기만 할 뿐이라 **요소는 보여야 함**
- 그런데 사용자 증상은 "아예 없음"

**가설 B3 (매우 유력): baseAiPath가 실제로 Drive의 XL SVG와 다른 파일**
- OrderGenerate에서 `designAiPath = session.baseAiPath` (AI 파일)
- `patternSvgPath = temp_pattern_XL.svg` (Drive에서 해석된 SVG)
- 두 파일은 **원천적으로 다른 파일**이므로 "same file" 이슈 아님
- 하지만 사용자가 /work에서 **AI 파일로 Drive에 있는 SVG 파일을 잘못 선택**했다면? — 타입은 .ai여야 하므로 확장자 필터에서 차단됨. 가능성 낮음.

**가설 B4 (가장 유력): AI 파일의 "요소" 레이어가 비어있거나 다른 이름**
- STEP 4 (1200~1248): `elemLayer = designDoc.layers.getByName("요소")`. 없으면 throw.
- **있는데 pageItems.length === 0이면 copy 실패** → clipboard 비어있음 → STEP 8 paste에서 baseDoc.selection이 null → "붙여넣은 요소가 없음" 로그
- 이러면 **몸판만 보존되고 요소는 정말 아무것도 안 들어감** = 증상 B와 완전 일치
- XL AI가 "기준" 파일이라면 디자이너가 요소를 아직 안 그렸거나, 레이어 이름이 한글 "요소"가 아니라 다른 이름(예: "Elements", "디자인요소")일 수 있음

**가설 B5 (가능): XL SVG의 조각 수가 요소 매핑을 모두 -1로 만들고, 스킵 카운트=전체**
- `findBestMatchingPiece`는 (1) 교집합 면적 최대 (2) 중심 거리 최소 폴백
- 중심 거리 폴백은 pieces가 1개 이상이면 반드시 0 이상 인덱스를 반환 → -1 가능성 낮음
- 그래도 `elementPieceIndex[i] === -1` 조건이 모든 요소에 맞으면 전부 스킵되긴 함
- **하지만 이 경우도 "요소가 아예 없다"가 아니라 "요소는 paste되지만 위치만 엉뚱"이라 증상 B와는 다름**

**가설 B6 (가능): XL.ai 파일 자체가 손상 또는 열기 실패**
- 에러는 catch → result.json에 기록 → OrderGenerate가 "에러"로 표시
- 사용자가 "에러"로 보였는지 "성공인데 요소 없음"인지 확인 필요

→ **가설 B4가 가장 설명력 높음**. 사용자 확인 필수.

#### 증상 A (3XL/4XL 요소 과대) — 원인 후보

**가설 A1 (최유력): 3XL.svg/4XL.svg viewBox 단위가 다른 사이즈와 다름**
- 사용자가 3XL.svg 파일을 새로 추가했다고 함 → 새 파일만 단위/좌표계가 다를 가능성
- STEP 5에서 `svgDoc.artboards[0].artboardRect`로 아트보드 크기 측정 → **CMYK 베이스 문서 크기는 SVG 아트보드 기준**
- STEP 7 `importSvgPathsToDoc`는 path.area를 누적 → **path 좌표 단위가 비정상이면 targetArea가 비정상**
- 몸판이 정상 크기인 이유: `path.duplicate`는 원본 좌표 그대로 복제. 아트보드가 커도 path 좌표가 같이 커졌으면 몸판은 시각적으로 맞게 보임
- 요소가 과대한 이유: `linearScale = sqrt(targetArea / baseArea)`에서 targetArea가 과대하면 linearScale 폭발 → STEP 9의 `pastedGroup.resize(linearScale*100)`이 요소를 크게 확대
- 위치가 상단으로 튀어나가는 이유: `alignElementToPiece`에서 `relX * linearScale`이 과대하면 요소 중심이 basePiece 중심에서 멀어짐. linearScale=2~3배면 요소가 조각 밖 원래 조각 중심 반경 × 스케일만큼 멀어짐

**가설 A2 (유력): 3XL/4XL SVG에 "배경 사각형 path"가 하나 들어있어 targetArea 폭발**
- importSvgPathsToDoc는 50pt 이상 path를 모두 targetArea에 누적
- 아트보드 전체를 덮는 보이지 않는 path 하나만 있어도 targetArea가 실제보다 2~3배 커짐
- 3XL.svg를 Illustrator로 열어 "숨겨진 path"가 있는지 육안 확인 필요

**가설 A3 (가능): 열린 경로 강제 닫기로 인한 면적 폭발**
- `if (!path.closed) { path.closed = true; }` 강제 처리
- 3XL/4XL SVG에 복잡한 열린 경로(예: 시접선, 가이드선)가 있으면 엉뚱한 면적이 합산될 수 있음
- path.width/height 50pt 필터를 통과한 열린 path가 있으면 합산됨

**가설 A4 (배제): 5XL은 정상**
- 가설 A1/A2가 맞다면 5XL도 같이 문제일 가능성이 높은데, 5XL은 "언급 없음" → 진짜 정상인지 미확인 상태
- 사용자에게 5XL 결과 확인 요청 필요

#### 추가 발견 (부수적)

**부수 이슈 1**: OrderGenerate의 `baseSize` 드롭다운은 실제로 아무 동작도 하지 않음
- config에도 안 들어가고, grading.jsx도 baseSize를 모름
- grading.jsx의 "기준"은 `designAiPath`의 "패턴선" 레이어 → 사용자가 /work에서 고른 AI 파일이 곧 기준
- **이건 UX 버그**: 사용자가 "기준 사이즈를 XL로" 드롭다운을 바꿔도 실제 결과에 아무 영향 없음. 기준 사이즈를 바꾸려면 /work에서 AI 파일 자체를 바꿔야 함.
- 이번 조사 범위 밖이지만 PM에게 보고하여 Phase 5+에서 설계 재검토 권장

**부수 이슈 2**: `calcLayerArea`의 path.area 계산은 복잡한 복합 path(여러 subpath)에서도 호출됨
- SVG에서 `<path d="M10,10... M200,200...">`처럼 여러 subpath가 한 path로 묶이면 path.area는 전체 합
- 조각 수 카운트와 면적 합이 어긋날 수 있음 (지금은 증상과 관련 없어 보임)

#### 수정 방향 (원인 확정 후)

**증상 B (가설 B4 확인 시)**:
- `/work`에서 AI 파일 선택 시 "요소" 레이어 존재/비어있음 미리 검증 (Rust/Python 유틸 또는 사전 열기)
- 아니면 grading.jsx에서 "요소" 레이어 비어있을 때 명확한 에러 메시지로 종료 (현재는 경고만 찍고 진행 → 요소 없는 EPS 저장)

**증상 A (가설 A1/A2 확인 시)**:
- 단기: 디자이너에게 3XL/4XL.svg 재 export 요청 (viewBox 단위 통일)
- 중기: grading.jsx에 linearScale clamp 추가 (예: 이웃 사이즈 대비 ±30% 초과 시 경고 + 원본 크기 유지)
- 장기: 사이즈 그룹 전체의 linearScale 분포를 먼저 계산하고 이상치 탐지

**부수 이슈 1 (별건)**:
- baseSize를 config에 전달해서 grading.jsx가 쓰도록 스키마 확장
- 아니면 baseSize UI를 제거하고 "AI 파일의 사이즈를 자동 감지"만 표시

#### 사용자에게 요청 (로그/스크린샷 수집)

1. **증상 A 범위 확정 (결정적)**: 13개 사이즈를 모두 XL 기준으로 돌려 결과물을 한 줄로 나열 — "XS/S/M/L 정상, XL/2XL 정상, 3XL/4XL 이상, 5XL ??"
2. **3XL.svg 와 XL.svg 비교** (결정적):
   - Illustrator로 각각 열어 "파일 > 문서 설정" 또는 "아트보드 옵션"에서 폭/높이(pt) 기록
   - "창 > 레이어" 패널에서 레이어 구조와 path 개수 비교
   - 3XL.svg만 아트보드 전체 크기 path(보이지 않는 사각형)가 있는지 육안 확인
3. **Illustrator 콘솔 로그 수집** (결정적):
   - 3XL 그레이딩 1회 실행 후 Illustrator 콘솔에서 `[grading.jsx]` 시작 라인 전체 복사
   - 핵심: `기준 패턴 면적 / 타겟 패턴 면적 / 면적 비율 / 선형 스케일` 숫자 4개
   - 같은 로그를 XL 그레이딩에서도 수집 → 비교
4. **증상 B의 XL EPS 파일 열기** (결정적):
   - Illustrator에서 `{baseAiName}_XL.eps` 열기 → 레이어 패널 확인
   - "디자인 요소" 레이어가 **비어있는지** / **숨겨져 있는지** / **범위 밖으로 나가있는지** 3가지 중 어느 것인지
   - 그레이딩 결과 로그의 `붙여넣은 요소 수:` 값 확인
5. **XL AI 파일 레이어 확인** (증상 B 최종 확인):
   - /work에서 선택한 기준 AI 파일을 Illustrator로 직접 열기
   - 레이어 패널에 **정확히 "요소"라는 이름**의 레이어가 있는지
   - "요소" 레이어에 path/text/group이 실제로 들어있는지

#### 결론

- **코드 수정 없음** (요청대로 조사만)
- 증상 A와 B는 서로 다른 원인 가능성이 높음 → 가설 A1/A2 + 가설 B4가 가장 설명력 있음
- 결정적 판단에는 사용자 Illustrator 콘솔 로그 + AI/SVG 파일 육안 확인 필수

---

## 테스트 결과 (tester)
(Phase 3 구현 후 검증)

## 리뷰 결과 (reviewer)
(Phase 3 구현 후)

## 수정 요청
| 요청자 | 대상 파일 | 문제 설명 | 상태 |
|--------|----------|----------|------|
| user | grading.jsx / 3XL.svg | 3XL 사이즈 1개에서 요소가 몸판 벗어나 과하게 큼. 다른 12개 사이즈는 정상 추정 | 🔍 조사 중 (원인 후보 수집, 추가 정보 대기) |
| user | 3XL.svg / 4XL.svg | 3XL.svg 추가 후에도 3XL·4XL 요소(숫자/로고/라벨)가 몸판 상단으로 튀어나가고 과하게 큼. 5XL은 언급 없음 | 🔍 조사 중 (SVG 파일 자체 검증 대기) |
| user | grading.jsx / OrderGenerate | 기준 AI = XL로 XL 타겟 그레이딩 시 요소가 하나도 안 들어옴 (몸판만 있음) | 🔍 조사 중 (Illustrator 로그 필요) |
| user | grading.jsx (c52d80f 회귀) | 교체용요소 도입 후 STEP 10 로그 누락 + pastedGroup bounds 과소 + 3XL paste=0 + 모든 사이즈 결과 EPS 동일. 원인 = STEP 8B paste가 baseDoc.selection을 교체용요소로 덮어써 line 1540 pastedItems가 뒤바뀜 | ✅ 수정 완료 (line 1540 layerDesign 직접 참조 + STEP 8B 끝 activeLayer/selection 복원 + STEP 8 진단 로그) — 사용자 테스트 대기 |

## 작업 로그 (최근 10건)
| 날짜 | 에이전트 | 작업 내용 | 결과 |
|------|---------|----------|------|
| 2026-04-15 | developer | Drive 연동 옵션 4 자동 동기화 리팩터 | 커밋 8ec96a3 |
| 2026-04-15 | developer | 트리 더블클릭 + 앱 내 rename 제거 + Drive 읽기 전용 | 커밋 1b8fa4b |
| 2026-04-15 | developer | 프리셋 카드 사이즈 5XS→5XL 정렬 | 커밋 849a6e5 |
| 2026-04-15 | planner-architect | 작업 흐름 재설계 계획서 865줄 | 커밋 5cb0aaa |
| 2026-04-15 | developer | Phase 1 WorkSetup + 세션 + 라우팅 | 커밋 3efa370 |
| 2026-04-15 | developer | WorkSetup AI 파일 선택 하나로 폴더 자동 | 커밋 ad3d073 |
| 2026-04-15 | developer | Phase 2 패턴 선택 모드 | 커밋 3e5a069 |
| 2026-04-15 | developer | 카드 간소화 + 2열 그리드 + 조각 카운팅 | 커밋 bc20e24 |
| 2026-04-15 | developer | DRIVE 뱃지 제거 + 조각 카운팅 개선 (M 명령어) | 커밋 b01c974 |
| 2026-04-15 | pm | 11개 커밋 push + scratchpad 정리 + Phase 3 착수 | 완료 |
| 2026-04-15 | developer | Phase 3 즐겨찾기 (favoritesStore + ⭐ 토글 + 필터) | tsc/build PASS |
| 2026-04-15 | developer | Phase 4 OrderGenerate 통합 (SizeSelect+FileGenerate → 1페이지) | tsc/build PASS |
| 2026-04-16 | planner-architect | 패턴/요소 배치 로직 전면 재검토 계획서 (PLAN-GRADING-REDESIGN.md, 5옵션 비교 + D1 권장) | 코드 미수정 |
| 2026-04-16 | debugger | 버그 B (paste=0) 집중 조사 — 가설 1 유력 확정(svgDoc.close가 AICB clipboard 무효화), 수정안 B(duplicate 기반) 권장 | 코드 미수정 |
| 2026-04-15 | developer | OrderGenerate 버그수정(Rust path) + 기준사이즈 자동 + 구글시트 URL 지원 | tsc/cargo/build PASS |
| 2026-04-15 | debugger | 3XL/4XL 좌표 + XL 요소 누락 조사 (코드 수정 없음, 사용자 로그 요청) | 조사 보고 |
| 2026-04-15 | developer | grading.jsx 디버그 로그 파일 기록 추가 (임시, 원인 확정용) | 구현 완료 |
| 2026-04-15 | developer | grading.jsx 로그 경로 outputPath 기준 변경 (폴백 resultJsonPath) | 구현 완료 |
| 2026-04-16 | developer | grading.jsx "교체용요소" 레이어 지원 (STEP 4B/8B/9B, CENTER scale) | 구현 완료 |
| 2026-04-16 | debugger | 교체용요소 도입 후 회귀 조사: STEP 8B selection 오염 원인 특정 | 조사 보고 (코드 수정 없음) |
| 2026-04-16 | developer | grading.jsx selection 오염 수정 (layerDesign 직접 참조 + 상태 복원 + 진단 로그) | 구현 완료 |
| 2026-04-16 | developer | grading.jsx STEP 8B 교체용요소 pasteInPlace 교체 + bounds 복원 안전망 | 구현 완료 |
| 2026-04-16 | developer | grading.jsx D1 몸판중심 고정 배치 (STEP 9 CENTER scale + STEP 10 조각별 정렬 skip + 중심 복원 안전망) | 구현 완료 |
| 2026-04-16 | planner-architect | grading.jsx 누적 회귀 감사 (PLAN-GRADING-RECOVERY.md, 3버그 독립 진단, Beta 권장) | 코드 미수정, 의사결정 대기 |
| 2026-04-16 | developer | grading.jsx 버그 B 수정: STEP 4/8 duplicate 기반 전환 (clipboard 제거) | 구현 완료 |
| 2026-04-16 | developer | grading.jsx 버그 C 수정: D1 재도입 + 아트보드 clamp 강화 (USE_D1_MODE 플래그 + calculateUnionBoundsOfItems 헬퍼) | 구현 완료 |
