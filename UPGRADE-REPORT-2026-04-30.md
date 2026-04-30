# v1.0.4 이후 업그레이드 후보 종합 보고서 (2026-04-30)

## 한 줄 요약
v1.0.4까지 정식 배포 완료(자동 업데이트 검증 OK). 다음 우선순위는 **GitHub Actions Node 24 강제 전환(2026-06-02) 대응**과 **그레이딩 timeout 60→120초**(콜드 스타트 안전망) 두 가지를 묶어 v1.0.5로 내는 것.

비유: 기름은 채웠고 차도 잘 굴러간다. 다음 정비는 6월 도로법 개정(Node 24)에 맞춰 타이어 교체(actions 버전업) 한 번 + 시동 늦게 걸리면 멈춰버리는 안전장치(timeout 늘리기) 한 번.

---

## 카테고리별 후보 목록

### P0 — 외부 강제 마감 있음 (놓치면 빌드 깨짐)
| # | 항목 | 마감 | 작업량 | 비고 |
|---|------|------|--------|------|
| 1 | `actions/checkout@v4` + `actions/setup-node@v4` → `@v5` 업그레이드 | **2026-06-02** Node 24 강제 / **2026-09-16** Node 20 제거 | ★ | 현재 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` 옵트인으로 임시 우회 중 |

### P1 — 사용자 영향 큰 결함/UX
| # | 항목 | 영향받는 사용자 | 작업량 | 비고 |
|---|------|----------------|--------|------|
| 2 | 그레이딩 timeout 60초 → 120초 확장 (콜드 스타트 안전망) | Illustrator 콜드 스타트 PC | ★ | `OrderGenerate.tsx:597` + `FileGenerate.tsx:353` 2줄. errors.md 2026-04-27 가설 P1 처방 |
| 3 | 수정 요청 5건 누적 보류 — 실 테스트 / 추가 수정 | 본 사용자 + 직원 | ★~★★ | 3XL/4XL 튀어나감, AI 레이어 구조, "알 수 없는 오류" 4건 등 (사용자 테스트 선행 필요) |
| 4 | "알 수 없는 오류" fallback 4곳 통일 (`String(e)` 가면 벗기기) | 모든 사용자(에러 진단성) | ★ | OrderGenerate는 v1.0.1에서 처리됨. 잔존 4곳: `useAutoAiConvert.ts:312`, `DesignUpload.tsx:353`, `FileGenerate.tsx:248`, `Settings.tsx:94`, `SvgStandardizeModal.tsx:156` |

### P2 — 기술 부채 / 릴리스 인프라
| # | 항목 | 효과 | 작업량 |
|---|------|------|--------|
| 5 | AI→SVG UX 보강 — `.tmp.ai` 원본 매핑 / converting sub-status / PS 실패 UI 노출 | AI 변환 사용자 진단성 | ★★ |
| 6 | SVG 표준화 Phase 2 (V넥/라운드넥/하의 양식 확장 — JSON 프리셋 외부화) | 양면 외 패턴 사용자 | ★★★~★★★★ |
| 7 | grading.jsx 안전망 3종 재도입 검토 (D1 clamp / exponent 0.9~0.95 / piece=null 폴백) | 3XL/4XL 사용자 | ★★ |
| 8 | 의존성 메이저 버전 점검 (PyMuPDF 1.25→1.27.x, vite 7 등 추격) | 보안/성능 | ★ |

### P3 — 기능 보강 (Nice to have)
| # | 항목 | 효과 | 작업량 |
|---|------|------|--------|
| 9 | 직원 첫 설치 피드백 수집 → INSTALL-GUIDE-STAFF.md FAQ 갱신 | 신규 PC 보급 | ★ |
| 10 | Tauri Updater latest.json 안내 범위 좁히기 (v1.0.0→v1.0.4 검증 누적 후) | NOTICE 가독성 | ★ |
| 11 | Drive 스캔 경고 UI화 (Settings 별도 섹션 — PLAN-SVG-STANDARDIZATION Phase 2) | 패턴 관리자 | ★★ |

---

## 항목별 상세

### 1. GitHub Actions Node 24 대응 (P0)
- **무엇을**: `.github/workflows/release.yml`의 `actions/checkout@v4` → `@v5`, `actions/setup-node@v4` → `@v5`로 업그레이드. 현재 옵트인 환경변수 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`는 v5 정착 후 제거.
- **왜**: 2026-06-02부터 GitHub runner 기본 Node가 24로 전환되고, 2026-09-16엔 Node 20이 runner에서 완전히 제거된다. v4 액션은 내부적으로 Node 20을 쓰므로 그 시점에 워크플로우가 깨진다 → **태그 푸시해도 릴리스 빌드 실패** = 직원 자동 업데이트 중단.
- **어떻게**: (A) v5 태그가 정식 출시됐는지 확인, (B) release.yml에서 두 줄 수정, (C) 테스트 태그(v1.0.5 또는 v1.0.4-test) 푸시로 빌드 통과 확인, (D) 옵트인 env 라인 삭제.
- **작업량**: ★ (반나절). 위험도 낮음. 실패 시 v4로 즉시 롤백 가능.
- **위험도**: 낮음(옵트인 환경에서 이미 Node 24 강제 실행 OK 확인됨, errors.md 2026-04-29).
- **의존**: 없음. **추측**: 2026-04 기준 actions/checkout@v5는 이미 stable 태그 존재 가능성 높음(미확인 — WebFetch로 확인 필요).

### 2. 그레이딩 timeout 60 → 120초 (P1)
- **무엇을**: `src/pages/OrderGenerate.tsx:597`과 `src/pages/FileGenerate.tsx:353`의 `timeoutSecs: 60` → `120`으로 변경. Rust 측 `lib.rs:253` `timeout_secs: u64`는 인자 받는 구조라 무수정.
- **왜**: errors.md 2026-04-27 항목 — Illustrator 콜드 스타트(라이선스 캐시/인증 만료, 좀비 프로세스) 시 60초 안에 result.json 못 만들고 timeout. 4사이즈 동시 시도 시 4분 동안 "알 수 없는 오류" 4번. 이미 `aiConvertService.ts:384`는 PostScript 변환에 120초 사용 중이라 일관성도 맞춤.
- **어떻게**: 한 줄씩 수정 → tsc --noEmit 통과 확인 → 커밋. 사용자가 다른 PC에서 Illustrator 콜드 스타트 재현되면 즉시 적용 가능.
- **작업량**: ★ (반나절 미만, 사실상 30분).
- **위험도**: 매우 낮음. 더 오래 기다리는 것뿐이라 회귀 가능성 0.
- **의존**: 사용자 다른 PC 검증(보류 #1)과 무관하게 선제 적용 가능. 보수적 안전망 성격.

### 3. 수정 요청 5건 누적 보류 (P1)
- **무엇을**: scratchpad "수정 요청 (누적 보류)" 테이블의 5건 — (a) 3XL 요소 과대(0.95 적용 후 실 테스트 대기), (b) 3XL/4XL 상단 튀어나감, (c) 기준 AI=XL로 XL 타겟 시 요소 0개, (d) G드라이브 신규 SVG 미인식(수정 완료, 실 테스트 대기), (e) 그레이딩 4건 "알 수 없는 오류"(본 PC 재시도 정상).
- **왜**: 사용자 실제 작업 흐름의 결함이라 v1.0.5의 핵심 가치.
- **어떻게**: (a)/(d)는 실 테스트로 종결 가능. (b)/(c)는 재현 데이터 수집 후 debugger 분석 → developer 수정. (e)는 timeout 120초(P1 #2)로 동시 처방.
- **작업량**: 단순 검증 ★, (b)/(c) 디버깅 포함 시 ★★.
- **위험도**: 그레이딩 핵심 로직(`grading.jsx`)은 여러 안전망이 얽혀 있어 회귀 위험 있음 — errors.md 2026-04-24 "v2 리팩토링 누락 안전망 3종" 참고.
- **의존**: 사용자 실 테스트.

### 4. "알 수 없는 오류" fallback 4곳 통일 (P1)
- **무엇을**: v1.0.1에서 OrderGenerate는 `String(e)` 패턴으로 처리됐으나 잔존 5곳: `useAutoAiConvert.ts:312`, `DesignUpload.tsx:353`, `FileGenerate.tsx:248`, `Settings.tsx:94`, `SvgStandardizeModal.tsx:156`. 모두 `e instanceof Error ? e.message : "알 수 없는 오류"` 패턴.
- **왜**: errors.md 2026-04-27 — Tauri Rust 커맨드 `Result<String, String>` Err은 string으로 catch에 도달, `instanceof Error` 분기로 메시지 마스킹. 진단 시간을 폭발적으로 늘림.
- **어떻게**: 5곳 모두 `e instanceof Error ? e.message : String(e)` 또는 `e instanceof Error ? e.message : (typeof e === "string" ? e : "알 수 없는 오류")` 패턴으로 통일. Edit 5번 + tsc.
- **작업량**: ★ (한 시간).
- **위험도**: 매우 낮음.
- **의존**: 없음. P1 #2와 묶어 v1.0.5에 동봉 적합.

### 5. AI→SVG UX 보강 (P2)
- **무엇을**: PLAN-AI-TO-SVG.md L952 명시 "남은 한계" 3건 — (a) 결과 화면에 `.tmp.ai` 경로가 그대로 노출(원본 PostScript 매핑 미구현), (b) converting sub-status 미표시(PS 변환/일반 변환/정리 단계), (c) PS 실패는 콘솔만 — UI 노출 부재.
- **왜**: 사용자가 변환 결과를 봐도 "어떤 원본이 어떤 tmp가 됐는지" 추적 불가 → 디버깅 어려움. v1.0.2 검토 항목으로 명시됐으나 v1.0.2~v1.0.4는 catch-22/CI에 집중되어 미진행.
- **어떻게**: `aiConvertService.ts`에 `originalToTmpMap` 반환 + `AiConvertModal.tsx`의 결과 카드에 "원본 → 변환된 SVG" 매핑 표시. converting 단계는 모듈 상태에 sub-status 추가.
- **작업량**: ★★ (하루).
- **위험도**: AI 변환 엔진 무수정 가능 — UI/매핑 레이어만.
- **의존**: 사용자가 AI→SVG Phase 1+2+3 실 사용 검증 후 피드백 수집 권장.

### 6. SVG 표준화 Phase 2 — 양식 확장 (P2)
- **무엇을**: 현재 `NORMALIZER_VERSION = "1.0-uneck-double-sided"`로 U넥 양면유니폼만 지원. V넥/라운드넥/하의 추가는 PLAN-SVG-STANDARDIZATION L613에서 "Phase 3에서 JSON 프리셋 외부화" 명시.
- **왜**: 새 양식 패턴 추가 요청이 들어오면 단면 유니폼 등에서 사용 불가.
- **어떻게**: `python-engine/svg_normalizer.py`의 하드코딩 상수(ARTBOARD_WIDTH/PATTERN_X_OFFSET 등)를 `python-engine/patterns/{양식}.json`으로 외부화. 모달에 양식 선택 드롭다운 추가.
- **작업량**: ★★★~★★★★ (2~3일~1주, 양식별 검증 포함).
- **위험도**: 기존 U넥 양면 회귀 위험 있음 — Idempotent 테스트(lessons.md 2026-04-21) 필수.
- **의존**: 새 양식 추가 요청 발생 시점.

### 7. grading.jsx 안전망 3종 재도입 검토 (P2)
- **무엇을**: errors.md 2026-04-24 "v1 안전장치 3종 누락" — (A) D1 Step 3 아트보드 95% clamp, (B) `ELEMENT_SCALE_EXPONENT 0.9~0.95` 재도입(현재 0.95 적용 후 실 테스트 대기), (C) `findBodyForLayer`의 piece=null 폴백.
- **왜**: 3XL/4XL에서 요소 과대/튀어나감 재발 가능성. v1 → v2 리팩토링에서 의도적 제거됐으나 근본 문제(SVG body가 XL 86%) 미해결.
- **어떻게**: 수정 요청 #1/#2 실 테스트 결과 보고 결정. 0.95로 충분하면 (B)만, 부족하면 (A)+(C) 추가 이식.
- **작업량**: ★★ (하루).
- **위험도**: 그레이딩 핵심 회귀 위험 — debugger 분석 + tester 검증 필수.
- **의존**: 수정 요청 #1/#2 실 테스트.

### 8. 의존성 점검 (P2)
- **무엇을**: `package.json`/`Cargo.toml`/`requirements.txt` 메이저 버전 추격.
  - **추측**: PyMuPDF 1.25 → 1.27.x 가능, svgpathtools 1.7.x stable, vite 7 → 8 가능성, react 19.1 → 19.2, @tauri-apps/* 2.x 패치 업데이트 누적, tauri-plugin-updater 2.10 → 신규.
- **왜**: 보안 패치 + 성능 개선. 다만 grader는 인터넷 노출이 적은 데스크톱 앱이라 보안 우선순위는 낮음.
- **어떻게**: `npm outdated` + `cargo outdated`(설치 필요) + PyMuPDF 변경로그 확인. 메이저 버전 변경은 별도 PR.
- **작업량**: ★ (점검만, 실제 업데이트는 항목별 ★~★★).
- **위험도**: PyMuPDF는 그레이딩과 분리되어 위험도 낮음. Tauri 플러그인은 신중히.
- **의존**: 없음. v1.0.5 외 별도 사이클 권장.

### 9. 직원 첫 설치 피드백 → INSTALL-GUIDE-STAFF.md FAQ 갱신 (P3)
- **무엇을**: scratchpad "보류" 항목. v1.0.2/v1.0.3 catch-22 정비 후 신규 PC에서 어떤 결함이 더 발견됐는지 수집.
- **왜**: 신규 직원 보급 시 FAQ가 충실하면 PM 부담 감소.
- **어떻게**: 직원에게 한 번 더 설문. 비기술 항목(접근성/실수 등)도 함께.
- **작업량**: ★. **의존**: 직원 피드백.

### 10. NOTICE 안내 범위 좁히기 (P3)
- **무엇을**: lessons.md 2026-04-29 — 본 PC v1.0.1 → v1.0.4 자동 업데이트 성공 확인. 다음 NOTICE에서 "v1.0.0/v1.0.1 막힘" 안내 범위를 좁힐 가능성.
- **왜**: 직원 안내 가독성. 보수적 유지가 기본이지만 데이터 누적 시 좁히기 가능.
- **어떻게**: v1.0.5 NOTICE 작성 시점에 직원 PC 자동 업데이트 검증 추가 데이터 수집 후 결정.
- **작업량**: ★. **의존**: 검증 데이터 누적.

### 11. Drive 스캔 경고 UI화 (P3)
- **무엇을**: PLAN-SVG-STANDARDIZATION L187 — "Drive 스캔 경고는 Settings 페이지의 별도 섹션"(Phase 2). 현재는 콘솔 로그/상단 토스트로만 노출.
- **왜**: 패턴 관리자가 Drive 폴더 정합성을 한 화면에서 검토 가능.
- **어떻게**: Settings에 "Drive 진단" 섹션 신설 + driveSync 경고 누적 표시.
- **작업량**: ★★. **의존**: 직원 사용 패턴 관찰.

---

## 이미 완료/해소된 후보 (참고)

scratchpad "v1.0.2 후보"에 있던 항목 중 **v1.0.2~v1.0.4에서 이미 처리된** 것:

| 후보 | 처리 시점 | 비고 |
|------|----------|------|
| awk 마지막 정식 버전 추출 부풀음(P2) | **v1.0.4** | release.yml 종료 조건 `^## ` 로 확장 (de33309) |
| catch-22 패턴 (settings 저장 실패) | **v1.0.2 + v1.0.3** | capabilities mkdir $APPDATA + store 4종/capabilities 3종 전수 점검 |
| OrderGenerate "알 수 없는 오류" 가면 벗기기 | **v1.0.1** | `String(e)` 적용 (619행) — 다른 4곳은 잔존(P1 #4) |
| GitHub Actions Node 24 옵트인 검증 | **v1.0.4** | `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` 임시 우회 — 진짜 v5 업그레이드는 P0 #1로 잔존 |

---

## 권장 다음 액션

1. **사용자 실 테스트 수집** (수정 요청 5건 / AI→SVG Phase 1+2+3) — 다음 작업의 우선순위 데이터 확보.
2. **v1.0.5 작은 묶음 출시** — P0 #1(Actions v5) + P1 #2(timeout 120) + P1 #4(가면 벗기기 4곳). 작업량 ★★ 합계, 1일 내 가능.
3. **수정 요청 결과 회수 후 v1.0.6 묶음 결정** — P1 #3 + P2 #7(grading 안전망)을 함께 다룰지 분기.

---

## v1.0.5 묶음 제안 (큰 그림)

**테마**: "외부 마감 대응 + 진단성 강화" (회귀 위험 0, 사용자 가시 기능 변경 없음)

| 포함 항목 | 작업량 | 위험도 |
|----------|--------|--------|
| P0 #1 — Actions v5 업그레이드 + Node 24 옵트인 env 제거 | ★ | 낮음 |
| P1 #2 — 그레이딩 timeout 60 → 120초 (2줄) | ★ | 매우 낮음 |
| P1 #4 — "알 수 없는 오류" 가면 벗기기 5곳 통일 | ★ | 매우 낮음 |

**합계 작업량**: 약 ★★(하루 미만)
**커밋 단위**: 3건(Conventional Commits — `chore(ci):`, `fix(grading):`, `refactor:`)
**검증**: tsc --noEmit + 테스트 태그 1회 → 정식 v1.0.5 태그
**NOTICE 메시지**: "외부 마감 대응(GitHub Actions 환경 변경) + 콜드 스타트 안전망 + 에러 표시 개선" 3줄

이 묶음은 **사용자 가시 변경 0**이라 직원 안내가 가벼움 — "조용한 정비" 성격으로 v1.0.4의 NOTICE 톤을 그대로 재사용 가능.

---

> 다음 큰 묶음(v1.0.6 이후)은 사용자 실 테스트 결과를 받은 후 P1 #3 + P2 #7(grading 안전망)을 중심으로 재기획 권장.
