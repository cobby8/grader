# PLAN-GRADING-RECOVERY

## grading.jsx 누적 회귀 감사 + 롤백 지점 식별 + 재건 계획

- **작성일**: 2026-04-16
- **작성자**: planner-architect
- **트리거**: 사용자 최종 실측 결과(2XS/4XS/S/3XL/4XL 사이즈별 상이) + 3개 로그 증상
- **이번 문서는 감사/계획서이며 코드 수정 없음**

---

## 0. 핵심 요약 (10줄)

1. 회귀는 **c52d80f(교체용요소 레이어 도입) → 06b16fa(D1 몸판중심)** 4개 커밋이 누적된 결과다.
2. **가장 치명적인 단독 버그는 STEP 8B의 복원 안전망** — `refOrigTop`(designDoc 좌표)과 `newTop`(baseDoc 좌표)을 **다른 문서의 ruler 좌표계**로 비교해 dy=-3401.57(=svgHeight)만큼 **오히려 파괴한다**.
3. pasteInPlace는 실제로 **아트보드 좌표 기준**이라 맞게 붙여넣는데, 안전망이 **문서 좌표 기준**으로 잘못 교정하는 구조다.
4. **S/4XL paste=0 간헐 실패**는 selection/clipboard가 아닌 **copy 호출 자체가 빈 selection에서 실행된** 것으로 보인다(STEP 4 로직에 selection.length 조건 있으나 `designDoc.selection` 배열 평가 타이밍 버그 가설).
5. **3XL 리본 분리**는 D1이 `Transformation.CENTER` 스케일만 수행하지만 **원본 요소 bounds가 아트보드 상단에 이미 근접**했고, 확대율(×1.08~)만큼 확대 시 아트보드를 직선 초과하는 구조적 한계다.
6. **"마지막 대체로 정상" 지점은 `7091831`(디버그 로그 커밋)** — 교체용요소 분리 이전이며, 기능적으로 패턴+요소가 한 묶음으로 움직였다.
7. 세 가지 버그가 **독립적**이라 옵션 Gamma(3개 정밀 hotfix)가 **실제로 가장 저비용**이다.
8. 단 **사용자는 "차근차근"을 명시**했으므로 옵션 Beta(c52d80f 롤백)로 한 번 **안정 기저점** 확보 후 한 커밋씩 재도입하는 Walk-Before-Run이 더 안전하다.
9. 권장안은 **옵션 Beta 2단계** — 1) `git revert c52d80f..06b16fa` 4개 커밋 되돌리기로 7091831 상태 복원 → 2) 교체용요소 없이 XL 기준 AI로 **회귀 없는 베이스라인**을 실측 검증 → 3) 그 위에 교체용요소/D1을 **한 번에 한 기능씩** 재도입.
10. 의사결정 포인트 5개 (섹션 H).

---

## A. 커밋별 감사

### A-1 감사 표

| 커밋 | 날짜 | 의도 | 단독 논리 | 다른 커밋과 조합 시 효과 | 회귀 원인 지수 |
|------|------|------|----------|----------------------|--------------|
| 4a0efc7 | 04-15 | dev 경로 분기 (Rust) | ✅ 건전 | 무관 | ⬜ 0 |
| 7091831 | 04-15 | 디버그 로그 기능 | ✅ 건전 (로깅만) | 무관 | ⬜ 0 (**베이스라인 후보**) |
| e0f1851 | 04-15 | 로그 경로 outputPath 기준 | ✅ 건전 | 무관 | ⬜ 0 |
| **c52d80f** | **04-16** | **교체용요소 레이어 도입** | ⚠️ 의도 맞으나 selection을 baseDoc.selection 배열 평가로 훼손 가능 | baseDoc.selection이 paste 직후 "교체용요소"로 바뀜 → STEP 9/10이 엉뚱한 객체 스케일 | 🟥 **핵심 원인** |
| 73df1d2 | 04-16 | selection 오염 수정 | ✅ 적절 (layerDesign 직접 참조) | c52d80f와 조합으로 완화되나 근본 해결 아님 | 🟨 중간 (파생 방어) |
| **38933f9** | **04-16** | **pasteInPlace + 복원 안전망** | 🟥 **안전망 자체가 문서 간 좌표계 혼동** — dy=-3401 오동작 | pasteInPlace는 맞는데 안전망이 파괴 | 🟥 **핵심 원인** |
| **06b16fa** | **04-16** | **D1 몸판중심 고정** | ⚠️ 로직은 건전(CENTER 스케일) 하지만 원본 bounds가 경계 근접 시 구조적 초과 | 3XL 리본 분리 + "중심 복원 안전망"이 요소가 **0개일 때** try 블록 내부에서 일찍 break되지만 `linearScaleApplied !== 1.0` 조건 미충족 상황 | 🟧 부분 원인 (구조 한계) |

### A-2 "마지막으로 정상 동작했던 시점"

- **7091831** ("디버그 로그 추가") → grading.jsx에는 코드 로직 변경 없음, 로그 기록만 추가.
- 이 상태에서는 교체용요소 개념이 없었고, 모든 사이즈에서 **요소가 일관되게** 패턴 위에 배치됨.
- 다만 **아트보드 초과 문제**(3XL/4XL 요소 bbox 넘침)는 이 시점에도 존재 — 교체용요소 도입 전 시점부터의 "기본 스케일 공식 한계"다.
- → 7091831은 "**선택된 회귀가 모두 없는**" 상태일 뿐, 완벽한 정답은 아님.

---

## B. 격번 paste 실패 (S, 4XL `pageItems=0`) 가설 Top 3

실측: 짝수 사이즈 STEP 8 paste 직후 `pageItems=0`, 홀수는 정상.

### 가설 1 — clipboard가 이전 사이즈 실행의 designDoc close 시점에 무효화 (확률 35%)
- Illustrator는 문서를 close할 때 "Keep on clipboard?" 대화상자를 띄운다.
- `executeMenuCommand("doScript")` 등에서 이 대화상자가 자동 "아니오"로 소비되면 clipboard가 비워진다.
- 사이즈를 여러 번 연속 실행할 때 이전 실행의 designDoc 닫힘이 현재 실행의 clipboard를 오염시킬 수 있음.
- **검증 방법**: STEP 8 paste 직전에 `app.activeDocument.name` + `baseDoc.layers.length`를 로그로 찍고, 사이즈별 실행 간격을 늘려보기.

### 가설 2 — `designDoc.selection` getter가 배열이 아닌 스냅샷을 반환 (확률 30%)
- STEP 4에서 `designDoc.selection.length > 0` 체크 후 `app.executeMenuCommand("copy")` 호출.
- 그런데 `designDoc.selection`은 getter이고, 내부적으로 페이지 아이템을 순회해 반환한다.
- 특정 사이즈에서 selection이 빈 상태인데 length 체크를 통과하는 경쟁 조건 가능성.
- **증상 일치도**: paste=0이면서 log에 "selection.length > 0" 분기는 돌았다는 것이 이 가설과 부합.
- **검증 방법**: `designDoc.pageItems`로 직접 순회하며 selected=true 설정한 직후 `$.sleep(100)` 넣어보기.

### 가설 3 — STEP 8B의 activeDocument 전환이 STEP 8 paste 이후의 paste 대상을 바꿔버림 (확률 25%)
- STEP 8: `baseDoc.activeLayer = layerDesign` + `app.executeMenuCommand("paste")`.
- STEP 8B: `app.activeDocument = designDoc` → copy → `app.activeDocument = baseDoc` → pasteInPlace.
- 이 과정에서 Illustrator가 clipboard를 내부적으로 재번역(translate)하며 활성 문서의 좌표계로 재매핑한다.
- 다음 사이즈의 STEP 8에서 이 재번역된 clipboard가 엉뚱한 좌표로 paste되어 `pageItems=0`(뷰포트 밖)으로 보일 수 있음.
- **검증 방법**: STEP 8 paste 직전에 `baseDoc.pageItems.length`를 찍고 paste 직후 수치 변화를 **모든** pageItem에 대해 확인(selection이 아닌 pageItems).

### 나머지 가설 (확률 10%)
- 격번 현상이 실행 순번(짝/홀)과 정확히 일치하는 것은 **외부 상태 누적**이 원인일 가능성이 큼 (예: Illustrator의 undo 히스토리 depth, 메모리 캐시).

---

## C. pasteInPlace 좌표계 차이 — 근본 원인과 해결안

### C-1 근본 원인
```
refOrigTop   (designDoc 기준)  = 예: 651.82   ← designDoc의 ruler origin
newTop       (baseDoc 기준)     = 예: 4053.39  ← baseDoc의 ruler origin
dy = refOrigTop - newTop       = -3401.57     ≈ svgHeight(baseDoc 아트보드 높이)
```
- designDoc은 AI 원본 파일로 열려 ruler origin이 **사용자 설정(좌상단 기준)** 또는 **이전 상태**.
- baseDoc은 `createCmykBaseDoc`으로 새로 생성 → ruler origin이 **기본값(좌하단 기준)**.
- Illustrator `pasteInPlace`는 **아트보드 좌표**(artboardRect origin 기준)로 맞게 붙여넣는다.
- 그러나 `geometricBounds`는 **문서 좌표**(ruler origin 기준)로 반환한다.
- 두 문서의 ruler origin이 정확히 `svgHeight`만큼 차이나므로, 문서 좌표로 비교하면 아트보드 높이만큼 어긋나 보인다.

### C-2 해결안 (선택지)
| # | 방법 | 복잡도 | 위험 |
|---|------|-------|------|
| **C-a** | **안전망 블록 전체 삭제** (pasteInPlace만 신뢰) | ⭐ 최저 | pasteInPlace가 드물게 실패하는 Illustrator 버전에선 무방비. 다만 사용자 Illustrator는 정상 지원 확인 |
| C-b | 안전망을 "아트보드 기준 상대좌표"로 환산 후 비교 | ⭐⭐⭐ | 양쪽 아트보드 rect를 읽고 상대 offset 변환 필요 — 산술 오류 위험 |
| C-c | baseDoc ruler origin을 designDoc과 일치시킴 (`rulerOrigin` 속성) | ⭐⭐ | Illustrator API의 rulerOrigin 속성이 버전별 상이, 문서화 빈약 |

→ **권장 C-a**. pasteInPlace가 실패하면 폴백 paste(화면 중앙)로 가는데, 이때도 안전망이 있으면 파괴적이므로 **안전망 자체를 제거하고 실패는 로그만** 남기는 방식.

---

## D. D1 아트보드 초과 — 구조적 한계와 해결안

### D-1 실측
- 3XL bounds top=3149.0, 아트보드 top=3401.57 → 여유 252pt.
- 원본 XL 요소 bounds가 이미 아트보드 상단에 근접(여유 160~200pt).
- linearScale=1.08 → 중심점 기준 확대 시 원본 높이 H가 H×1.08 → 상단이 `(H×0.04)` 만큼 추가 상승.
- H가 크면 이 0.04 증분이 여유를 초과 → 리본이 아트보드 밖.

### D-2 해결안 (선택지)
| # | 방법 | 장점 | 단점 |
|---|------|-----|------|
| **D-a** | **그룹 전체 scale 전 bbox 여유 확인 → 초과 시 scale 비율을 상한으로 clamp** | 단순, 예측 가능 | 면적 비율 미달 → 일부 사이즈는 원본보다 작아짐 |
| D-b | bbox 크기만 먼저 계산해 **세로 여유 비율**로 scaleY 제한 | 수학적 정확 | 요소 종횡비 변형 — 디자이너 불만 가능 |
| D-c | 요소를 **개별 piece별로 따로** 스케일 (레거시 Phase 2 복귀) | 조각별 정렬이라 초과 없음 | 06b16fa에서 이미 폐기한 방식 — 조각 간격 벌어짐 문제 재발 |
| D-d | 아트보드 초과 요소를 **clip mask**로 잘라냄 | 출력은 깔끔 | 인쇄 시 잘림 — 디자인 의도 손상 |

→ **권장 D-a** (clamp). `scaleMax = min(linearScale, artboardFit)` 계산, 예를 들어 요소 상단까지의 여유가 300pt, 요소 높이 2000pt면 최대 scaleY = `(여유 + 원본 절반) / 원본 절반`.

---

## E. 재건 전략 3가지 옵션

### 옵션 Alpha — 06b16fa만 롤백 (최소 침습)
- `git revert 06b16fa` 1회
- 결과: STEP 10 레거시 Phase 2 경로로 복귀. 조각별 정렬 재작동.
- 남는 문제: 조각 간격 벌어짐(원래 문제), STEP 8B 안전망 오동작, paste=0 격번.
- **불채택** — 원래 문제로 돌아갈 뿐.

### 옵션 Beta — c52d80f 이전으로 4개 커밋 롤백 (클린 리셋)
- `git revert 06b16fa 38933f9 73df1d2 c52d80f` (한 번에 4개 revert)
- 또는 `git revert c52d80f..06b16fa` 범위 revert
- 결과: 7091831 상태의 grading.jsx (교체용요소 개념 없음).
- 장점: **단일 안정 기저점 확보**. 사용자가 XL 기준 그대로 실측 → 과거 "대체로 정상" 상태 재현.
- 단점: 교체용요소/D1 기능 상실. 재도입 필요.

### 옵션 Gamma — 3개 버그 정밀 hotfix (현 상태 유지)
- 버그 A (섹션 C): STEP 8B 복원 안전망 블록 삭제 (1552~1586라인) — 약 35줄 제거.
- 버그 B (섹션 D): D1에 scale clamp 추가 — 약 15줄 삽입.
- 버그 C (섹션 B): paste=0 격번 — 가설 2에 따라 STEP 4 copy 직전에 `$.sleep(100)` 1줄 + pageItems 직접 순회 방식으로 변경.
- 장점: 최소 변경, 로직 보존.
- 단점: 3개를 한꺼번에 고치면 어느 것이 효과냈는지 구분 어려움. 사용자의 "차근차근" 원칙과 충돌.

### 옵션 비교

| 기준 | Alpha | **Beta** | Gamma |
|-----|-------|---------|-------|
| 개발 시간 | 10분 | 30분 + 기능 재도입 2~3시간 | 1~2시간 |
| 실측 검증 시간 | 20분 (5사이즈) | 20분 + 재도입 단계마다 20분 × 3 = 80분 | 20분 |
| "차근차근" 원칙 | ❌ 문제 복귀 | ✅ 기저점→한걸음씩 | ❌ 3개 동시 |
| 근본 문제 해결 | ❌ | ✅ | ✅ (버그 격리 후) |
| 기능 보존 | ✅ | ⚠️ 재도입 필요 | ✅ |
| 추천 | ⬜ | 🟩 **권장** | 🟨 사용자 선택 시 |

---

## F. 권장안 (옵션 Beta) 실행 계획

### Phase 0 — 현재 상태 스냅샷 (5분)
- `git tag pre-recovery-snapshot`
- `.claude/scratchpad.md` 백업
- 변경 전 로그 파일 별도 보관

### Phase 1 — 4개 커밋 revert (30분)

```bash
git revert --no-edit 06b16fa 38933f9 73df1d2 c52d80f
# 또는
git revert --no-commit c52d80f^..06b16fa
git commit -m "revert: grading.jsx 교체용요소~D1 4개 커밋 롤백 (재건 기저점 확보)"
```

- revert 충돌 예상 구간: STEP 4B/8B 추가 블록, STEP 10 D1 분기 — 모두 후속 커밋이 이전 커밋 코드에 얹은 구조라 **자동 revert 성공 가능성 높음**.
- 충돌 시: STEP 4B/8B/9B/D1 블록을 통째로 삭제하고 `pre-c52d80f` 상태로 맞춘다.

### Phase 2 — 베이스라인 실측 검증 (20분)
- 기준 AI: 현재 사용 중인 XL.ai (교체용요소 레이어는 존재해도 로직에서 참조 안 함 — 안전).
- 타겟 사이즈: 2XS / 4XS / S / 3XL / 4XL (사용자 최종 실측과 동일).
- 확인 포인트:
  1. paste=0 격번 재현 여부 — 이 시점에서도 발생하면 버그 B가 c52d80f와 무관한 선행 버그.
  2. 3XL 리본 분리 재현 여부 — 이 시점에서도 발생하면 버그 C가 D1과 무관.
  3. 백넘버 처리 — 교체용요소 무시되어 "요소" 레이어에 통합된 백넘버가 같이 스케일됨 → 과거와 동일한 "백넘버 하단 노출" 재현.

### Phase 3 — 실측 결과 분기점 (사용자 결정)

| 실측 결과 | 다음 작업 |
|---------|---------|
| 2XS/4XS/S/3XL/4XL 모두 "요소 있음" + 격번 paste 없음 | → Phase 4 (교체용요소 재도입) |
| paste=0 격번 여전히 발생 | → 버그 B 단독 수정 (가설 2 기반) 후 다시 측정 |
| 3XL 리본 분리 여전 | → 버그 C 단독 수정 (D-a clamp) 후 다시 측정 |

### Phase 4 — 교체용요소 기능 재도입 (40분, 버그 A 교훈 반영)

- c52d80f의 STEP 4B/8B/9B 로직만 되살리되, **섹션 C의 안전망 블록은 포함하지 않음**.
- 테스트: 교체용요소 레이어를 포함한 XL.ai로 짝수/홀수 사이즈 실측.
- pasteInPlace 단독 신뢰. 실패 시 로그만 남기고 진행.

### Phase 5 — D1 기능 재도입 + clamp (40분, 버그 C 교훈 반영)

- 06b16fa의 D1 로직 되살리되, **섹션 D-a clamp 추가**.
- 테스트: 4XL까지 아트보드 초과 없는지 확인.

### Phase 6 — 정리 + 커밋 (15분)

- knowledge/lessons.md에 "문서 간 좌표계 혼동" 교훈 기록.
- knowledge/errors.md에 "STEP 8B 안전망 오동작 dy=-svgHeight 패턴" 기록.
- 커밋 메시지 4개로 분리: revert / 베이스라인 확인 / 교체용요소 재도입 / D1 clamp.

### Phase별 예상 시간 총계

| Phase | 시간 | 위험 |
|-------|-----|------|
| 0 스냅샷 | 5분 | 무 |
| 1 revert | 30분 | revert 충돌 시 +30분 |
| 2 실측 | 20분 | Illustrator 환경 의존 |
| 3 분기 | 결정만 | — |
| 4 교체용요소 재도입 | 40분 | 신규 버그 가능 |
| 5 D1 + clamp | 40분 | clamp 계수 튜닝 필요 |
| 6 정리 | 15분 | 무 |
| **합계** | **2.5시간** | 중간 |

---

## G. 최종 권장 결론

**옵션 Beta(4커밋 revert → 한 걸음씩 재도입)를 권장**합니다.

근거 요약:
1. 사용자가 "**정상동작하던 부분부터 다시 짚어보면서 차근차근**"을 명시했다.
2. 3개 버그(C/D/B)가 **서로 독립적**이라 한 번에 고치면 어느 수정이 효과냈는지 인과 구분이 불가능하다.
3. revert는 Git 이력이 보존되므로 **언제든 c52d80f 원본 로직을 다시 참고** 가능하다.
4. Phase 2 실측에서 **paste=0 격번이 재현되면** 그 버그가 c52d80f와 무관한 선행 버그임이 드러남 — 큰 진단 가치.
5. 재도입 단계마다 실측하므로 **"어느 기능 추가가 어느 회귀를 낳았는지" 1:1 매핑** 가능.

---

## H. 사용자 의사결정 포인트 (5개)

### Q1. 옵션 선택
- **A (권장)**: Beta — 4커밋 revert 후 재도입
- B: Gamma — 현 상태에서 3개 버그 hotfix (시간 절반)
- C: Alpha — 06b16fa만 롤백 (비추)

### Q2. revert 범위
- **A (Q1=A 시 권장)**: 4개 커밋 전체 revert (c52d80f/73df1d2/38933f9/06b16fa)
- B: 06b16fa + 38933f9만 revert (교체용요소 유지, 안전망만 제거)

### Q3. Phase 2 실측 타겟 사이즈
- **A (권장)**: 사용자 최종 실측과 동일 5개 (2XS/4XS/S/3XL/4XL)
- B: 전체 (5XS~5XL) — 시간 2배

### Q4. 교체용요소 재도입 시 안전망
- **A (권장)**: pasteInPlace만 신뢰, 안전망 없음 (실패는 로그만)
- B: 안전망을 아트보드 좌표 기준으로 재구현 (C-b)

### Q5. D1 clamp 전략
- **A (권장)**: 아트보드 여유 비율로 scale 상한 (D-a), 종횡비 유지
- B: scaleY만 별도 제한 (D-b), 종횡비 변형 허용

---

## I. 부록 — 핵심 파일 경로

| 파일 | 경로 |
|------|------|
| 본 계획서 | `C:\0. Programing\grader\PLAN-GRADING-RECOVERY.md` |
| 이전 계획서 | `C:\0. Programing\grader\PLAN-GRADING-REDESIGN.md` |
| 메인 대상 | `C:\0. Programing\grader\illustrator-scripts\grading.jsx` |
| 빌드 복사본 | `C:\0. Programing\grader\src-tauri\target\debug\illustrator-scripts\grading.jsx` |
| 실행 진입점 Rust | `C:\0. Programing\grader\src-tauri\src\*.rs` (run_illustrator_script) |
| scratchpad | `C:\0. Programing\grader\.claude\scratchpad.md` |
| knowledge | `C:\0. Programing\grader\.claude\knowledge\` |

## J. 부록 — grading.jsx STEP별 라인 맵 (현재 HEAD 06b16fa 기준)

| STEP | 라인 | 역할 | 회귀 커밋 |
|------|-----|------|---------|
| 0 | 1177~ | config.json 읽기 | — |
| 1 | 1223~ | 디자인 파일 경로 결정 | — |
| 2 | 1228~ | 디자인 파일 열기 + RGB 엄격 | — |
| 2A | 1245~ | 기준 패턴 면적(baseArea) | — |
| 3 | 1267~ | 메인 색상 추출 | — |
| 4 | 1295~ | "요소" → clipboard copy | — |
| **4B** | **1368~1387** | **"교체용요소" 레이어 탐색** | **c52d80f** |
| 5 | 1390~ | SVG 열기 + CMYK 베이스 문서 생성 | — |
| 6 | 1413~ | 레이어 3개 생성 | — |
| 7 | 1429~ | SVG path 임포트 | — |
| 8 | 1466~1486 | clipboard → layerDesign paste | 진단 로그 추가 |
| **8B** | **1488~1604** | **교체용요소 copy/pasteInPlace + 안전망(**버그 A**)** | **c52d80f / 38933f9** |
| 상태 복원 | 1606~1614 | activeLayer / selection 복원 | 73df1d2 |
| 9 | 1654~1707 | 면적 비율 스케일 (CENTER) | 06b16fa 수정 |
| **9B** | **1709~1740** | **교체용요소 CENTER scale** | **c52d80f** |
| **10** | **1742~1923** | **USE_D1_MODE 분기 — D1 + 레거시 Phase 2** | **06b16fa** |
| 11-A | 1935~ | RGB 잔존 안전망 | — |
| 11-A+ | 1961~ | 패턴선 색상 APCA | — |
| 11-B | 2022~ | 레이어 z-order 통합 | — |
| 11-C | 2047~ | 저장 | — |
| 11-D | 2059~ | 정리 + result.json | — |
