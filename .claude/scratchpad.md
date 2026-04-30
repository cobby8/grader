# 작업 스크래치패드

## 🎯 다음 세션 시작 가이드
1. **v1.0.5 직원 PC 자동 업데이트 전파 확인** — 본 PC v1.0.4→v1.0.5 모달 수신 검증 필요
2. **카카오톡 메모챗 재발송** — 세션 만료로 미발송, 카카오 재인증 후 NOTICE-v1.0.5.md 카톡 박스 메시지 재시도 또는 사용자 직접 복사
3. **수정 요청 #1/#2/#3 실 테스트** (TEST-GUIDE-2026-04-25.md, 사용자 담당)
4. **AI→SVG Phase 1+2+3 실 사용 검증** (사용자 담당)
5. **v1.0.6 후보 작업** 착수 검토 (수정 요청 누적 결과 + grading 안전망 3종 + AI→SVG UX 보강)

---

## 현재 작업
- **요청**: v1.0.0 릴리스 자산 검증 + 발견 결함 v1.0.1 패치
- **상태**: ✅ **정식 배포 완료** (`v1.0.1`, 2026-04-28 publish)
- **현재 담당**: 없음 (다음 작업 대기)

### v1.0.1 최종 산출물
- 태그: `v1.0.1` / 커밋: `8100736` / 미푸시: 0개
- URL: https://github.com/cobby8/grader/releases/tag/v1.0.1
- 자산 5종 + latest.json (notes에 CHANGELOG 정상 추출 ✨)
- 직원 PC 자동 업데이트 모달 전파 시작

### v1.0.2 후보 (이번 작업 외 발견사항)
- "알 수 없는 오류" 잔존 4곳 통일: `useAutoAiConvert.ts:312`, `FileGenerate.tsx:382, 457`, `Settings.tsx:94`
- awk 마지막 정식 버전 추출 시 부풀음 (release.yml P2)
- GitHub Actions Node.js 20 deprecation: `actions/checkout@v4`/`setup-node@v4` → `@v5` 업그레이드 (2026-06 강제 전환 전)
- AI→SVG UX 보강 (.tmp.ai 매핑, converting sub-status 등)
- 그레이딩 timeout 60→120초 (콜드 스타트 재현 시)

---

## 기획설계 (planner-architect)

### [2026-04-30] v1.0.4 이후 업그레이드 후보 종합 보고서 작성 완료

🎯 목표: v1.0.4 이후 업그레이드 가능 요소 우선순위 매기기

📁 산출물: `C:\0. Programing\grader\UPGRADE-REPORT-2026-04-30.md` (약 215줄)

📊 핵심 발견:
- **P0(외부 강제 마감)**: 1건 — GitHub Actions Node 24 강제 전환(2026-06-02) 대응. checkout/setup-node @v4 → @v5
- **P1(사용자 영향)**: 3건 — 그레이딩 timeout 60→120 / 수정 요청 5건 누적 / "알 수 없는 오류" 가면 5곳
- **P2(기술 부채)**: 4건 — AI→SVG UX 보강 / SVG 표준화 Phase 2 / grading.jsx 안전망 3종 / 의존성 추격
- **P3(Nice to have)**: 3건

⚡ 가장 시급한 1건:
- **P0 #1 GitHub Actions v5 업그레이드** — 2026-06-02부터 Node 24 강제, 9-16엔 Node 20 제거.
- 현재 `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` 옵트인으로 임시 우회 중이라 정식 v5 적용은 시간 여유 있음.
- 작업량 ★(반나절). v1.0.5 묶음(P0 #1 + P1 #2 + P1 #4) 합계 ★★(하루 미만)에 동봉 권장.

📋 v1.0.5 묶음 제안:
| 포함 | 작업량 | 위험도 |
|------|--------|--------|
| Actions v5 업그레이드 | ★ | 낮음 |
| 그레이딩 timeout 60→120(2줄) | ★ | 매우 낮음 |
| "알 수 없는 오류" 5곳 통일 | ★ | 매우 낮음 |

이미 처리된 v1.0.2 후보 4건(awk P2 / catch-22 / OrderGenerate 마스킹 / Node 24 옵트인) 보고서 별도 명시.

## 구현 기록 (developer)

### [2026-04-30] v1.0.5 묶음 3건 구현 완료 (Actions v5 + 그레이딩 timeout + 가면 5곳)

📝 구현한 기능:
- **작업 1**: GitHub Actions checkout/setup-node v4→v5 정식 업그레이드 + Node 24 옵트인 env 제거
- **작업 2**: 그레이딩 Illustrator 호출 timeout 60→120초 (콜드 스타트 마스킹 방지)
- **작업 3**: "알 수 없는 오류" fallback 5곳 통일 (케이스 A 진단힌트 3곳 + 케이스 B Tauri Rust string Err 대응 2곳)

| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| `.github/workflows/release.yml` | checkout@v4→v5, setup-node@v4→v5, FORCE_JAVASCRIPT_ACTIONS_TO_NODE24 env 블록+주석 제거, v1.0.5 이력 주석 추가 | 수정 |
| `src/pages/OrderGenerate.tsx` | timeoutSecs 60→120 (line 597 부근) + 사유 주석 | 수정 |
| `src/pages/FileGenerate.tsx` | timeoutSecs 60→120 (line 353 부근) + 사유 주석 / catch 블록(line 248 부근) string Err 대응 패턴으로 변경 | 수정 |
| `src/hooks/useAutoAiConvert.ts` | line 312 fallback "알 수 없는 오류" → "(AI 변환기 응답에 error 필드 없음 — python 출력 확인)" | 수정 |
| `src/components/SvgStandardizeModal.tsx` | line 156 fallback → "(SVG 표준화 응답에 error 필드 없음 — svg_normalizer.py 출력 확인)" | 수정 |
| `src/pages/Settings.tsx` | line 94 fallback → "(설정 로드 응답에 error 필드 없음)" | 수정 |
| `src/pages/DesignUpload.tsx` | catch 블록(line 353 부근) string Err 대응 패턴으로 변경 | 수정 |

✅ 검증:
- `npx tsc --noEmit`: 출력 0줄 = 타입 오류 없음 (PASS)
- release.yml YAML 구조 시각 검토: 정상, swatinem/rust-cache@v2 / dtolnay/rust-toolchain@stable 유지
- 변경 0인 파일: aiConvertService.ts(이미 120초), OrderGenerate.tsx:619 catch(이미 String(e) 패턴)

💡 tester 참고:
- **테스트 방법 (정적)**: tsc --noEmit 재실행, grep 으로 `timeoutSecs: 60` 0건 확인, `"알 수 없는 오류"` 5곳 잔존 0건 확인
- **테스트 방법 (실행)**:
  - 작업 2: Illustrator 종료 상태에서 그레이딩 시도 → 60초 안에 콜드 스타트 못 끝내도 120초 안에 result.json 도달 시 정상 결과 노출
  - 작업 3-A: settings.json 손상 등으로 loadSettings 실패 시 "(설정 로드 응답에 error 필드 없음)" 노출 (가면 벗김 확인)
  - 작업 3-B: Tauri Rust 커맨드 string Err 시 진짜 에러 메시지가 화면에 노출 (이전엔 "알 수 없는 오류가 발생했습니다." 였음)
- **정상 동작**: 사용자 가시 동작 변화 0 (정상 케이스). 에러 발생 시에만 메시지 어휘가 진단 친화로 바뀜.
- **주의할 입력**: release.yml 실 검증은 v1.0.5 태그 푸시 시점에 PM이 GitHub Actions 빌드 통과 여부로 검증 (이 단계에서는 정적 검토만).

⚠️ reviewer 참고:
- 작업 1 release.yml 의 `node-version: '20'` 라인은 의도적으로 유지함 — setup-node@v5 자체는 Node 24 런타임이지만, **빌드 환경의 Node 버전**은 별도 입력이라 vite 빌드용 Node 20 그대로 사용. v5 업그레이드 의의는 "v4 액션이 deprecated 되어 2026-09-16 이후 동작 안 함" 회피.
- 작업 3 케이스 B의 `typeof err === "string"` 분기는 v1.0.1 OrderGenerate.tsx:619 패턴과 100% 일치 (errors.md 2026-04-27 catch-22 항목 일관성).
- 추가 발견 / 후속 권장:
  - OrderGenerate.tsx:619 의 String(e) 패턴은 케이스 B와 약간 다름(중간에 typeof === "string" 분기 없이 String(e) 직행). 동작은 동일하나(String("hello") === "hello"), 어휘 일관성 차원에서 차후 동일하게 정렬 가능. 본 작업 범위 초과라 미수정.
  - aiConvertService.ts 의 PostScript 변환 timeout 120초가 그레이딩과 동일해졌으므로, 차후 timeout 상수를 한 곳에 모으는 리팩터 후보.

## 테스트 결과 (tester)

### [2026-04-30] v1.0.5 정적 검증

| 항목 | 결과 | 비고 |
|------|------|------|
| T1 tsc --noEmit | PASS | 출력 0줄 |
| T2 release.yml v5 | PASS | checkout@v5(58행) / setup-node@v5(62행) 각 1회, @v4 잔존 0건 |
| T3 FORCE env 제거 | PASS | env 블록 제거됨, 52행 v1.0.5 이력 주석에만 단어 등장(의도) |
| T4 timeoutSecs 120 | PASS | OrderGenerate:600, FileGenerate:364, aiConvertService:384(기존). `:60` 잔존 0건 |
| T5 가면 5곳 통일 | PASS | useAutoAiConvert:315 / SvgStandardizeModal:158 / Settings:96 / FileGenerate:247-256 / DesignUpload:352-361 모두 신규 패턴 적용. 코드 본문 fallback "알 수 없는 오류" 0건 (주석에만 v1.0.5 이력으로 6곳 등장) |
| T6 무수정 파일 | PASS | src-tauri/src/lib.rs / src/services/aiConvertService.ts diff 0줄, OrderGenerate.tsx:619-628 String(e) 패턴 그대로 유지 |
| T7 git status | PASS | 의도된 7파일(release.yml + src/ 6개) 변경 + 허용 파일 3개(scratchpad/settings.local/UPGRADE-REPORT-2026-04-30.md). 의도치 않은 변경 0건 |

종합: 7/7 통과 / 0개 실패 / 0개 N/A

## 리뷰 결과 (reviewer)

### [2026-04-30] v1.0.5 코드 리뷰

| 항목 | 결과 | 한 줄 코멘트 |
|------|------|-------------|
| Q1 v5 호환성 | ✅ | checkout@v5/setup-node@v5 모두 v4 입력(node-version/cache) 동일 호환, swatinem/rust-cache@v2 + dtolnay/rust-toolchain@stable 와 충돌 없음 (별개 액션). |
| Q2 FORCE env 제거 안전성 | ✅ | v5 액션은 자체 Node 24 런타임 사용이 공식 발표 사실. 회귀 시 env 라인 한 블록만 다시 추가하면 1단계 후퇴 가능. |
| Q3 timeout 회귀 위험 | ✅ | 영향 범위는 사용자 대기시간뿐(에러 케이스에서만 60→120, 정상 케이스 0영향). errors.md 2026-04-27 콜드 스타트 추정과 부합. aiConvertService 120초와 동일해 일관성 ✨. |
| Q4 케이스 A 적절성 | ✅ | "(... 응답에 error 필드 없음 — xxx.py 출력 확인)" 형식이 진단 친화적. 직원 노출 시 "원인 + 어디 보면 됨" 명료. 다만 일반 사용자에겐 낯선 표현. |
| Q5 케이스 B 일관성 | 🟡 | FileGenerate:248 / DesignUpload:353 의 3분기 패턴은 명확. OrderGenerate:619 는 2분기(`Error → String(e)`) — 동작 동일(`String("hello")==="hello"`)하나 어휘 일관성 부족. **차후 처리 권장**. |
| Q6 주석 품질 | ✅ | 모든 변경에 [v1.0.5] 태그 + errors.md 날짜 참조 + 변경 이유 명시. 과하지 않고 미래 reviewer 가 "왜" 즉시 파악 가능. release.yml v1.0.4 옵트인 흔적도 깔끔히 v1.0.5 이력 1블록으로 대체. |
| Q7 부수 효과 | ✅ | `git diff --stat` 결과 7개 파일 + scratchpad/settings.local.json(PM 관리) 외 변경 0. import 정리/공백 변경 0. `timeoutSecs: 60` src 잔존 0건, `"알 수 없는 오류"` fallback 코드 잔존 0건(주석에만 등장 — 의도). |

종합: 🟢 **우수** / 권장 보강 1건 / critical 0건

권장 보강 (차후 처리 권장 — 이번 v1.0.5 범위 잠금):
- **Q5 OrderGenerate.tsx:627 패턴 정렬**: `e instanceof Error ? e.message : String(e)` → 케이스 B 5곳과 동일하게 `... : (typeof e === "string" ? e : String(e))` 로 어휘 통일. 동작 변화 0, 순수 일관성 목적. v1.0.6 또는 다음 정비 묶음에서 처리.
- **Q4 어휘 톤 (선택)**: 직원 가시 메시지에 "(파이썬 출력 확인)" 같은 개발자 어휘 노출. 향후 "내부 진단: <원어휘>" 식 래퍼 패턴 검토 가능. 우선순위 낮음.

근거 자료: 변경 영향 7개 파일 외 0(git diff --stat) / tsc PASS / errors.md 2026-04-27 catch-22 + 콜드 스타트 항목과 패턴 일치.

---

## 진행 현황표
| 단계 | 내용 | 상태 |
|------|------|------|
| 0~7 | 기본 기능(패턴/디자인/사이즈/CMYK/Illustrator/APCA) | ✅ 완료 |
| 8 | 설치형 배포 + 자동 업데이트 | ✅ v1.0.0 배포 완료 |
| 9~13 | Drive/WorkSetup/즐겨찾기/OrderGenerate | ✅ 완료 |
| 12-A | SVG 일괄 표준화 Phase 1 | ✅ 완료 |
| 12-B | AI→SVG 자동 변환 Phase 1+2 | ✅ 완료 |
| 12-C | AI→SVG 자동 변환 Phase 3 (옵트인 자동) | ✅ 완료 |
| 12-D | 양면 유니폼 그레이딩 버그 4종 | ✅ 완료 |
| **v1.0.1** | **릴리스 결함 패치 (표시/마스킹/notes 자동화 + 첫 실행 폴더 + bump-version CRLF)** | ✅ **정식 배포 완료** (2026-04-28) |
| **v1.0.2~v1.0.4** | **catch-22 정비(v1.0.2/3) + CI 안정화(v1.0.4)** | ✅ **정식 배포 완료** (2026-04-28~29) |
| **v1.0.5** | **Actions v5 + 그레이딩 timeout 120 + 가면 5곳 통일 (사용자 가시 변경 0)** | ✅ **정식 배포 완료** (2026-04-30, 빌드 8m45s, MSI/latest.json 검증 OK) |

---

## 수정 요청 (누적 보류)
| 요청자 | 대상 파일 | 문제 설명 | 상태 |
|--------|----------|----------|------|
| user | grading.jsx / 3XL.svg | 3XL 요소 몸판 벗어나 과하게 큼 | ✅ 수정됨 (0.95), 실테스트 대기 |
| user | 3XL.svg / 4XL.svg | 3XL/4XL 요소 몸판 상단 튀어나감 | 🔍 실테스트 필요 |
| user | grading.jsx / OrderGenerate | 기준 AI=XL로 XL 타겟 시 요소 0개 | 🔍 AI 레이어 구조 확인 필요 |
| user | driveSync.ts / PatternManage.tsx | G드라이브 신규 SVG 미인식 | ✅ 수정 완료, 실테스트 대기 |
| user | OrderGenerate / 환경 | 그레이딩 4건 전부 "알 수 없는 오류" 실패 | 🔄 본 PC 재시도 정상, 다른 PC 검증 대기 |

---

## 작업 로그 (최근 10건)
| 날짜 | 에이전트 | 작업 내용 | 결과 |
|------|---------|----------|------|
| 2026-04-26 | tester | Phase 3 정적 검증 (T1~T10) | 10/10 PASS |
| 2026-04-26 | reviewer | Phase 3 코드 리뷰 (7파일) | 🟢 우수, critical 0 |
| 2026-04-26 | developer | Phase 3 reviewer 권장 #1/#2/#3 처리 | tsc PASS ✅ |
| 2026-04-26 | pm | knowledge 갱신 + scratchpad 정리 | 커밋 `b54782d` + `818aade` |
| 2026-04-27 | debugger | 그레이딩 4건 실패 1차+2차 분석 — 코드 회귀 0건, Illustrator 콜드 스타트 timeout 마스킹 가설 | errors.md 등록, 다른 PC 검증 대기 |
| 2026-04-28 | pm | GitHub v1.0.0 자산 검증 — 결함 2건 발견 (v0.1.0 표시 / latest.json placeholder) | v1.0.1 패치 시작 |
| 2026-04-28 | developer | v1.0.1 패치 3건 (vite define / OrderGenerate 가면 벗기기 / release.yml CHANGELOG 추출) | 빌드 PASS, dist v0.1.0 0건, tsc PASS |
| 2026-04-28 | tester | v1.0.1 정적 검증 (T1~T10) | 10/10 PASS |
| 2026-04-28 | reviewer | v1.0.1 코드 리뷰 (7파일, Q1~Q10) | 🟢 우수, critical 0, 권장 P1/P2 |
| 2026-04-28 | pm | reviewer P1 반영 (release.yml fallback 어휘 강화) + 커밋 `6ffeb73` | 미푸시 4개 |
| 2026-04-28 | pm | 다른 PC 첫 실행 결함 즉시 처방 (write_file_absolute 부모 폴더 자동 생성) + 커밋 `84a000c` | cargo check PASS, 미푸시 5개 |
| 2026-04-28 | pm | bump-version.mjs CRLF 처리 보강 + 1.0.0→1.0.1 + 정리 커밋 (`8ac3dac`/`8100736`) + 푸시(7) + 태그 v1.0.1 | GitHub Actions 빌드 성공 (8m23s) |
| 2026-04-28 | pm | v1.0.2 핫픽스 (capabilities mkdir $APPDATA + settingsStore 명시 catch) + 직원 안내문 + publish | catch-22 결함 해소, NOTICE-v1.0.2.md 작성 |
| 2026-04-29 | pm | v1.0.3 catch-22 패턴 전수 점검 (store 4종 + capabilities 3종 + FileGenerate 가면 통일) + publish | 사전 차단 + 진단성 강화, NOTICE-v1.0.3.md 작성 |
| 2026-04-29 | pm | v1.0.4 CI 안정화 (Node 24 옵트인 + awk 종료 조건 보강) + publish | Node 24 forced 실행 OK 확인, 2026-06 대비 완료 |
| 2026-04-29 | pm | v1.0.4 직원 배포 공지문 작성 + 카톡 메모 발송 + 자동 업데이트 검증 (v1.0.1→v1.0.4 본 PC 성공) | NOTICE-v1.0.4.md 작성, lessons.md +1 (보수적 안내 유지 결정), 커밋 `11a2bbd`+`18ce181` |
| 2026-04-30 | planner-architect | v1.0.4 이후 업그레이드 후보 종합 보고서 작성 (P0~P3 분류, v1.0.5 묶음 제안) | UPGRADE-REPORT-2026-04-30.md 215줄, P0 1건/P1 3건/P2 4건/P3 3건 식별 |
| 2026-04-30 | developer | v1.0.5 묶음 3건 구현 (Actions v5 / timeout 60→120 / 가면 5곳 통일) | tsc PASS, 7파일 수정 |
| 2026-04-30 | tester+reviewer | v1.0.5 정적 검증(7/7) + 코드 리뷰(🟢 우수, critical 0, 권장 보강 1건 차후) | 양호 |
| 2026-04-30 | pm | v1.0.5 CHANGELOG + bump 1.0.4→1.0.5 + 커밋 3건(`67ea299`/`3cb406d`/`0307536`) | 미푸시 3개, 태그 v1.0.5 대기 |
| 2026-04-30 | pm | v1.0.5 태그 푸시 → Actions 빌드 8m45s 성공 → Draft Publish + MSI/latest.json 검증 OK | 정식 배포 완료, GitHub Releases v1.0.5 publish |
| 2026-04-30 | pm | NOTICE-v1.0.5.md 작성(조용한 정비 톤) + 커밋 `6580e75` + 푸시 / 카톡 메모챗 세션 만료로 미발송 | 직원 안내 준비 완료, 카톡은 재인증 후 재시도 또는 수동 복사 |
| 2026-04-30 | developer | v1.0.5 묶음 3건 구현 (Actions v5 정식 / 그레이딩 timeout 60→120 / "알 수 없는 오류" 5곳 통일) | tsc --noEmit PASS, 7파일 수정, 가면 벗기기 케이스 A 3곳 + 케이스 B 2곳 |

---

## ⏸ 보류 (다음 작업)
- **다른 PC 검증** (사용자, 그레이딩 4건 실패 재현 여부) — timeout 연장 결정에 필요
- **v1.0.1 릴리스 빌드/태그 푸시** (다른 PC 검증 통과 후, 사용자 트리거)
- **수정 요청 3건 실행 테스트** (사용자, TEST-GUIDE-2026-04-25.md)
- **AI→SVG Phase 1+2+3 실 사용 검증** (사용자, 토글 ON 후 G드라이브 AI 자동 변환)
- 직원 첫 설치 피드백 수집 → INSTALL-GUIDE-STAFF.md FAQ 갱신
- v1.0.2 후보: "알 수 없는 오류" 4곳 통일 / awk P2 / AI→SVG UX 보강 / SVG 표준화 Phase 2

---

## 프로젝트 핵심 정보
- **기술 스택**: Tauri 2.x + React 19 + TypeScript + react-router-dom 7, Python 엔진(PyMuPDF/reportlab/pillow/openpyxl/svgpathtools), CSS+BEM
- **빌드**: `dev.bat` (MSVC), `build.bat`
- **주요 폴더**: `src/pages`, `src/components`, `src/services`, `src/stores`, `src/hooks`, `src/types`, `src-tauri`, `python-engine`, `illustrator-scripts`
- **데이터**: `$APPDATA/com.grader.app/`, Drive `G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG` (60초 쿨다운)
- **설치 경로**: `C:\Users\user\AppData\Local\Grader\` (NSIS 기본)

### 기획설계 참조
| 계획서 | 상태 |
|--------|------|
| PLAN-GRADING-REBUILD.md | 구현됨 |
| PLAN-WORKFLOW-REDESIGN.md | Phase 1~4 완료 |
| PLAN-AUTO-UPDATE.md | Phase A~D 완료, v1.0.0 배포 |
| PLAN-SVG-STANDARDIZATION.md | Phase 1-1~1-5 완료 |
| PLAN-AI-TO-SVG.md | Phase 1+2+3 완료 |
