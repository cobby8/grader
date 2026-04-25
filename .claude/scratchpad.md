# 작업 스크래치패드

## 🎯 다음 세션 시작 가이드
1. **PLAN-AI-TO-SVG.md 검토** (1017줄, 12섹션) → 승인 시 developer Phase 1-A 착수
2. **수정 요청 3건 테스트** 결과 확인 (TEST-GUIDE-2026-04-25.md, 사용자 담당)
3. **AI→SVG 자동 변환 Phase 1 구현** (Phase 1-A ~ 1-H, 총 8.5~13.5시간)

---

## 현재 작업
- **요청**: AI→SVG Phase 1-F 구현 (PatternManage.tsx 통합 — 배너 + 모달 렌더)
- **상태**: ✅ **developer 1-F 완료** (1-A~1-F 모두 완료, 커밋 B + tester/reviewer 대기)
- **현재 담당**: PM → 커밋 B (1-C ~ 1-F 묶음) → tester/reviewer 병렬 → 1-G/1-H
- **⚠️ 1-D 발견**: `ScanResult`는 평면 구조 → 1-F에서 `scanResult.unconvertedAiFiles` (data 경유 X)
- **병행 대기**: 수정 요청 3건 테스트 (TEST-GUIDE-2026-04-25.md, 사용자 담당)

---

## 기획설계 (planner-architect)

### [2026-04-25] AI→SVG 자동 변환 Phase 1 MVP 상세 설계 완료
- **산출물**: `PLAN-AI-TO-SVG.md` (1017줄, 12섹션 + 부록 3개)
- **범위**: PyMuPDF 기반 반자동 변환 (PDF 호환 AI 약 89% 커버)
- **예상**: **8.5~13.5시간** (Phase 1-A~1-H)
- **신규 4파일 / 수정 5파일** (3층 구조 미러: Python ← Rust ← React)
- **핵심 분기**: AI 헤더 10바이트 (`%PDF-` → PyMuPDF / `%!PS-Adobe` → Phase 2 skip / 그 외 → 에러)
- **커밋 전략**: A(엔진 Python+Rust) → B(UI React+driveSync) → C(docs)
- **사용자 확정 5건**: 반자동 / 동일 폴더 저장 / 기본 skip + 옵션 덮어쓰기 / Phase 1 PyMuPDF만 / Phase 분할
- **외부 검증**: 2026-04-20 G드라이브 63개 100% 성공 (PyMuPDF 56 + Illustrator COM 7) — Phase 1은 89% 커버

---

## 수정 요청 3건 진행 상황 (요약)

### ✅ 버그 #1: 3XL 요소 과대 — **수정됨**
- 조치: `ELEMENT_SCALE_EXPONENT` 1.0 → 0.95 (커밋 `801bee4`)
- 사용자 실행 테스트 대기 (TEST-GUIDE-2026-04-25.md 테스트 A)

### 🟡 버그 #2: 3XL/4XL 요소 상단 튀어나감 — **실행 테스트 필요**
- 상태: 버그 #1 수정으로 자연 완화 가능, v2 구조 개선으로 v1 근본 버그는 해결됨
- 재현 체크: EPS에서 요소 top Y > 몸판 top Y 여부
- 로그 체크: `grading-debug.log`의 `타겟Bottom` vs `bodyTop`
- #1 수정 후 재발 시 → `placeElementGroupPerPiece` Y 상한 가드 추가 (1~2h)

### 🟡 버그 #3: XL 타겟 요소 0개 — **AI 레이어 구조 확인 필요**
- 의심 지점: `grading.jsx:537` `findBodyForLayer` — `piece=null` 레이어 즉시 -1 반환
- 재현 조건: `"요소"`(piece=null) + `"요소_표_앞"`(piece="앞") 혼재 AI 파일
- 사용자 제공 필요: XL.ai 레이어 목록 + `grading-debug.log`
- 재발 시 → piece=null 폴백 로직 추가 (2~3h)

**상세 분석**: `.claude/knowledge/errors.md`의 "grading v2 리팩토링 안전장치 3종 누락" 항목 참조

---

## 진행 현황표
| 단계 | 내용 | 상태 |
|------|------|------|
| 0~7 | 기본 기능(패턴/디자인/사이즈/CMYK/Illustrator/APCA) | ✅ 완료 |
| 8 | 설치형 배포 + 자동 업데이트 | ✅ v1.0.0 배포 완료 |
| 9 | Drive 연동 (자동 동기화) | ✅ |
| 10~11 | Phase 1/2 (WorkSetup, 패턴 선택) | ✅ |
| 12 | Phase 3 (즐겨찾기) | ✅ |
| 12-A | SVG 일괄 표준화 Phase 1 | ✅ 완료 (v1.0.0 포함) |
| **12-B** | **AI→SVG 자동 변환** | 🔨 **Phase 1 설계 완료 (구현 대기)** |
| 12-C | 양면 유니폼 그레이딩 버그 4종 | ✅ 완료 |
| 13 | Phase 4 (OrderGenerate 통합) | ✅ |
| - | 수정 요청 #1 (3XL 요소 과대) | ✅ 수정됨, 실테스트 대기 |
| - | 수정 요청 #2/#3 | ⏳ 실테스트 대기 |

---

## 프로젝트 핵심 정보
- **기술 스택**: Tauri 2.x + React 19 + TypeScript + react-router-dom 7, Python 엔진(PyMuPDF/reportlab/pillow/openpyxl/svgpathtools), CSS+BEM(Tailwind 금지)
- **빌드**: `dev.bat` (MSVC), `build.bat`
- **주요 폴더**: `src/pages`, `src/components`, `src/services`, `src/stores`, `src/types`, `src-tauri`, `python-engine`, `illustrator-scripts`
- **데이터**: `$APPDATA/com.grader.app/` (presets/categories/settings/favorites.json), Drive `G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG` (60초 쿨다운), sessionStorage `grader.session`

---

## 구현 기록 (developer)

### developer [2026-04-25] Phase 1-A: ai_converter.py + main.py CLI (AI→SVG)

📝 **구현한 기능**: PyMuPDF 기반 AI→SVG 자동 변환 Python 엔진 (헤더 10바이트 분기 + atomic write)

| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| `python-engine/ai_converter.py` | 437줄 신규 — 헤더 분류 + PyMuPDF 변환 + atomic write | 신규 |
| `python-engine/main.py` | +107줄 — `ai_convert_preview`/`ai_convert_batch` 분기 + `_expand_ai_files` 헬퍼 + help 2줄 + examples 3줄 | 수정 |

**ai_converter.py 구조**:
- 모듈 상수 3개: `CONVERTER_VERSION="1.0-pymupdf-pdf-compatible"`, `HEADER_PDF_PREFIX=b"%PDF-"`, `HEADER_POSTSCRIPT_PREFIX=b"%!PS-Adobe"`
- private 4개: `_read_header`(첫 10바이트), `_classify_ai`(분류), `_convert_pdf_compatible`(변환+atomic write), `_ai_to_svg_path`(경로 변환)
- public 2개: `preview_ai_conversion(files)` / `convert_ai_batch(files, overwrite)`

**핵심 구현 요점**:
- 헤더 첫 10바이트 검사로 `pdf_compatible`/`postscript`/`unknown` 분류 (lessons.md [2026-04-21] 교훈 반영)
- PyMuPDF `page.get_svg_image(text_as_path=True)` — 글자 path 변환으로 폰트 의존 제거
- atomic write (.tmp → `os.replace`) — 변환 중 강제 종료 시에도 svg 파일 안전
- overwrite=False 기본 + `--overwrite` 시 자동 .bak 백업 (shutil.copy2)
- 파일 단위 실패 → FAIL 기록만, 배치 중단 없이 다음 파일 계속 진행
- PostScript / unknown / 기존 SVG → SKIP 분류 (실패 아님)

**검증 (모두 PASS)**:
- py_compile ai_converter.py: ✅
- py_compile main.py: ✅
- help 출력에 `ai_convert_preview` + `ai_convert_batch` 2건 포함: ✅
- 빈 인자 테스트: ✅ `{"success": false, "error": "인자가 부족합니다..."}` 한 줄 JSON
- 없는 파일 테스트(preview): ✅ `entries: [], summary: {0,0,0,0}`
- 없는 파일 테스트(batch): ✅ `total: 0, converted: 0, results: []`
- `--overwrite` 옵션 인식: ✅
- 알 수 없는 옵션 거부: ✅ 한 줄 JSON 에러

**무변경 확인**: svg_normalizer.py, svg_parser.py, pdf_grader.py, pattern_scaler.py, pdf_handler.py, order_parser.py 모두 수정 없음 (`git status` 확인)
**requirements.txt**: PyMuPDF>=1.25.0 이미 등록되어 있음 (수정 불필요)

💡 **tester 참고**:
- 실제 AI 파일 변환 테스트는 사용자(G드라이브 접근 필요) 담당
- syntax/CLI 동작은 Phase 1-A 내에서 모두 검증됨
- Phase 1-B(Rust 커맨드) 완료 후에 통합 테스트 권장

⚠️ **reviewer 참고**:
- atomic write 구현부 (ai_converter.py L165~185) — `.tmp` 정리 분기까지 모두 처리되었는지 점검 권장
- backup=True 고정값 (convert_ai_batch L289) — Phase 1에선 항상 .bak 생성. 향후 옵션화 검토 가능

**다음 단계**: Phase 1-B Rust 커맨드 2개 (`src-tauri/src/lib.rs`에 `ai_convert_preview`/`ai_convert_batch` 추가, 기존 `run_python` 재사용 패턴 — SVG 표준화 Phase 1-4와 동일)

### developer [2026-04-25] Phase 1-B: lib.rs Rust 커맨드 2개 (AI→SVG)

📝 **구현한 기능**: Phase 1-A의 Python CLI를 Tauri invoke로 노출

| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| `src-tauri/src/lib.rs` | +47줄 / -1줄 — `ai_convert_preview`/`ai_convert_batch` 커맨드 2개 + invoke_handler 등록 + 한국어 주석 | 수정 |

**구현 요점**:
- SVG 표준화 Phase 1-4(2026-04-22) 패턴 완전 미러 — 신규 발명 0
- `run_python` 재사용 (lib.rs L122~177) — Python subprocess 로직 중복 안 함
- 반환 타입 `Result<String, String>` (PLAN 6-3 준수, 프론트에서 `JSON.parse`)
- sync fn 유지 (run_python이 sync `Command::output()` 기반, Tauri가 자동 스레드풀 실행)
- `overwrite` bool → "--overwrite" 인자 변환은 Rust 측에서 처리 (Python 측 args 구성 실수 차단)
- camelCase 변환: 프론트 호출은 `invoke<string>("ai_convert_preview", { files })` / `invoke<string>("ai_convert_batch", { files, overwrite })`
- `svg_normalize_batch` 뒤 콤마 추가 + 신규 라인 2개 (트레일링 콤마 없이 `ai_convert_batch`로 끝)

**최종 lib.rs 구조** (검증 grep 결과):
- L414 `fn svg_preview_normalize` (무변경)
- L435 `fn svg_normalize_batch` (무변경)
- L461 `fn ai_convert_preview` ⭐ 신규
- L480 `fn ai_convert_batch` ⭐ 신규
- L515~519 invoke_handler 등록 (svg 2개 + ai 2개)

**검증 (모두 PASS)**:
- `cargo check` (src-tauri): ✅ `Finished dev profile in 18.72s`, 에러 0
- 함수 정의 grep: ✅ 2건 (L461, L480)
- invoke_handler 등록 grep: ✅ ai_convert_preview/ai_convert_batch 각 2건씩 출현 (정의+등록)
- 기존 svg_preview_normalize/svg_normalize_batch 무변경: ✅ L414/L435 위치 보존

**무변경 확인**: lib.rs 외 다른 Rust 파일 수정 0건, Python 엔진 수정 0건, Cargo.toml 수정 0건, capabilities 수정 0건

💡 **tester 참고**:
- 이 단계 단독 통합 테스트는 어려움 (프론트 호출 코드가 아직 없음)
- Phase 1-C(aiConvertService.ts)까지 완료된 후에 `invoke("ai_convert_preview", { files: "..." })` end-to-end 테스트 가능
- `cargo check` 통과로 컴파일 타임 시그니처 정합성은 확보됨

⚠️ **reviewer 참고**:
- 신규 발명 0 — 완전 미러 패턴이라 별도 검토 포인트 적음
- 인자명 `files`(camelCase 변환 후 `files`)는 Phase 1-A `_expand_ai_files`와 짝
- `overwrite` bool 변환 흐름이 Phase 1-A의 `--overwrite` 인자와 정확히 매칭되는지만 검토 권장

**다음 단계**: 커밋 A (Phase 1-A + 1-B 묶음). 그 이후 Phase 1-C(aiConvertService.ts) 또는 1-D(driveSync.ts) 진행.

### developer [2026-04-25] Phase 1-C: aiConvertService.ts (AI→SVG TS 게이트웨이)

📝 **구현한 기능**: Phase 1-A/1-B의 invoke 커맨드를 React에서 사용 가능한 비동기 함수로 노출

| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| `src/services/aiConvertService.ts` | 239줄 신규 — 타입 6개 + invoke 래퍼 함수 2개 | 신규 |

**구조**:
- Type/Interface 6개: `AiKind`, `AiPreviewEntry`, `AiPreviewResult`, `AiBatchStatus`, `AiBatchResultEntry`, `AiBatchResult`
- async 함수 2개: `previewAiConversion(files)`, `convertAiBatch(files, overwrite)`

**구현 요점**:
- `svgStandardizeService.ts` 패턴 완전 미러 — discriminated union 안 씀, Python `{success, data, error}` 그대로 노출
- `invoke<string>` → `JSON.parse(raw)` → 타입 캐스팅 (svg standardize와 동일)
- console 로그 프리픽스 `[ai-convert]` (디버깅 식별 용이)
- 에러 처리: invoke/JSON.parse 실패 시 throw (사용자 명시 액션이라 조용한 실패 안 함)
- `files: string[]`을 `";"`로 join하여 Rust로 전달 (Python CLI 관례 일관성)
- `skipped_unknown` 필드 추가(optional `?: number`) — Phase 1-A `ai_converter.py` L408~410 실제 반환 필드 반영
- batch 성공 로그에 5개 카운트(`total`/`converted`/`skipped_ps`/`skipped_existing`/`skipped_unknown`/`failed`) 한 줄 출력

**검증 (모두 PASS)**:
- `npx tsc --noEmit`: ✅ EXIT_CODE=0, 에러 0건
- import 확인: ✅ `@tauri-apps/api/core`만 import (1줄)
- export 확인: ✅ type 2개 + interface 4개 + function 2개 = 8개
- 무변경 확인: ✅ `git status`상 `src/services/aiConvertService.ts`만 untracked, 다른 src/src-tauri/python-engine 파일 0건 수정

💡 **tester 참고**:
- 단독 테스트는 어려움 — 호출 컴포넌트(AiConvertModal)가 Phase 1-E에서 추가됨
- `tsc --noEmit` 통과로 컴파일 타임 시그니처 정합성은 확보됨
- 호출 예시:
  ```ts
  import { previewAiConversion, convertAiBatch } from '../services/aiConvertService';
  const preview = await previewAiConversion(['/abs/XL.ai', '/abs/2XL.ai']);
  const result = await convertAiBatch(['/abs/XL.ai'], false);
  ```

⚠️ **reviewer 참고**:
- 신규 발명 0 — `svgStandardizeService.ts` 패턴 완전 미러
- 단순한 invoke 래퍼라 별도 검토 포인트 적음
- 다만 `skipped_unknown`이 optional(`?: number`)인 이유: PLAN 의사코드엔 없지만 Phase 1-A 구현엔 있음 — 추후 Python 측 누락 시에도 TS 타입은 안전

**다음 단계**: Phase 1-D(driveSync.ts 확장 — `unconvertedAiFiles: string[]` 필드 추가) 또는 1-E(AiConvertModal.tsx).

### developer [2026-04-25] Phase 1-E: AiConvertModal.tsx + App.css (AI→SVG)

📝 **구현한 기능**: 6상태 Phase 머신 모달 + 분류 요약 + 진행바 + 결과 아코디언

| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| `src/components/AiConvertModal.tsx` | 680줄 신규 — 6상태 머신, idle/previewing/preview-done/converting/done/error | 신규 |
| `src/App.css` | +427줄 — `.ai-convert-modal__*` BEM 클래스 + `.pattern-manage__ai-banner` | 수정 (append) |

**구현 요점**:
- SvgStandardizeModal(560줄) 패턴 완전 미러 — 6상태 discriminated union Phase 머신
- ESC + 백드롭 클릭 차단 (converting 단계만, previewing은 차단 안 함 — 빠르게 끝남)
- 옵션 "기존 SVG 덮어쓰기" 기본 꺼짐 (안전 우선)
- preview-done의 [실행] 버튼에 실제 변환 예정 개수 표시 — `pdf_compatible 분류 중 (overwrite || !existing_svg)` 카운트
- 결과 단계의 PostScript skip 항목에 "Phase 2 지원 예정" 뱃지 자동 추가
- 충돌 행 시각화: PostScript는 회색, unknown은 회색+이탤릭, 충돌은 노란 배경
- 진행바는 indeterminate 슬라이딩 애니메이션 (Python progress 콜백 미제공 대응)
- 결과 요약 카드 4개: 변환/PostScript/기존SVG/실패 (auto-fit grid로 반응형)
- 모든 색상은 `var(--color-*)` 변수 또는 alpha rgba (svg-standardize와 동일 패턴), 하드코딩 hex 0건, Tailwind 0건
- `pattern-manage__ai-banner` 클래스 4종 (banner/icon/text/button) + hover/disabled 함께 추가 (Phase 1-F가 사용)

**검증 (모두 PASS)**:
- `npx tsc --noEmit`: ✅ EXIT_CODE=0, 에러 0건
- 하드코딩 hex 색상 grep (신규 CSS 영역 L2543~2969): ✅ 0건
- Tailwind 클래스 grep (.flex/.grid/.p-N/.m-N/bg-/text-/hover:): ✅ 0건
- import 검증: ✅ React (`useCallback, useEffect, useMemo, useState`) + aiConvertService만 (외부 아이콘 라이브러리 0)
- BEM 매칭: ✅ tsx에서 87건 사용, CSS에서 57건 정의 (모두 정의됨)
- pattern-manage__ai-banner 정의: ✅ 6건 (banner/icon/text/button + hover/disabled)
- git status: ✅ AiConvertModal.tsx (`??`) + App.css (`M`) + scratchpad (`M`) 만 변경

**무변경 확인**: 기존 src 파일 0건 수정 (svg-standardize 모달, UpdateModal 등 불변)

💡 **tester 참고**:
- 단독 통합 테스트 어려움 — Phase 1-F(PatternManage 통합)까지 완료된 후 e2e 테스트 가능
- `tsc --noEmit` 통과로 컴파일 타임 시그니처 정합성 확보됨
- 호출 패턴 (Phase 1-F에서 사용):
  ```tsx
  {aiConvertTargets && (
    <AiConvertModal
      files={aiConvertTargets}
      onClose={() => setAiConvertTargets(null)}
      onComplete={() => {
        setAiConvertTargets(null);
        lastAutoScanRef.current = 0;
        runAutoSync();
      }}
    />
  )}
  ```

⚠️ **reviewer 참고**:
- 신규 발명 0 — SvgStandardizeModal 6-Phase 패턴 + BEM/CSS 변수 컨벤션 완전 미러
- discriminated union으로 각 phase에서 필요한 데이터 타입 안전 강제 (preview-done에는 AiPreviewResult 필수, done에는 AiBatchResult 필수)
- alpha rgba() 사용은 기존 컨벤션 (svg-standardize-modal L2367/L2416 동일 패턴)
- handleDoneClose 분기: 변환된 파일 1개 이상이면 onComplete(재스캔), 아니면 onClose만 (불필요한 재스캔 방지)
- 진행바 indeterminate 슬라이딩은 Python 측 progress 콜백 미제공 대응책 (PLAN 6-5 명시)
- "변환 가능 개수" 계산 공식: `pdf_compatible && (overwrite || !existing_svg)` — overwrite 토글 시 useMemo가 즉시 재계산

**다음 단계** (Phase 1-F):
- PatternManage.tsx에서 `useState<string[] | null>(null)` (`aiConvertTargets`) + `useState<string[]>([])` (`unconvertedAi`)
- 배너 렌더: `unconvertedAi.length > 0` 조건
- 모달 조건부 렌더: `aiConvertTargets && <AiConvertModal files={aiConvertTargets} ... />`
- onComplete 콜백: `setAiConvertTargets(null)` + `lastAutoScanRef.current=0` + `runAutoSync()`
- ⚠️ Phase 1-D 발견: `scanResult.unconvertedAiFiles` (data 경유 X, 평면 구조)

### developer [2026-04-25] Phase 1-D: driveSync.ts unconvertedAiFiles 수집 (AI→SVG)

📝 **구현한 기능**: G드라이브 스캔 시 SVG 짝 없는 .ai 파일을 절대 경로 배열로 수집 + ScanResult 타입 확장

| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| `src/services/driveSync.ts` | +56줄 / -3줄 — ScanResult 타입 확장 + listChildren에 aiFiles 수집 + scanDriveRoot 폴더 단위 SVG/AI 짝 비교 + 반환 필드 추가 | 수정 |

**구현 요점**:
- `ScanResult.unconvertedAiFiles: string[]` 필드 추가 (PLAN 의사코드의 `data.unconvertedAiFiles`는 실제 평면 ScanResult 구조에 맞춰 최상위로 배치)
- `listChildren` 반환에 `aiFiles: {name, absPath}[]` 추가 — `.ai` 파일을 svgFiles와 분리 수집 (presets에는 절대 추가 안 됨, 기존 동작 보존)
- `scanDriveRoot` BFS 순회 중 폴더별로 SVG basename Set 만들고 AI basename과 비교 → 짝 없는 AI만 push
- basename 비교는 **소문자**로 정규화 (예 "XL.ai" + "xl.svg"도 짝으로 인식)
- ".svg"/.ai" 길이 4/3 슬라이스로 단순 추출 (정규식 회피, 분기 단순화)
- 같은 폴더 내부에서만 매칭 (전체 트리 cross-folder 매칭 안 함)
- 에러 경로(`success: false`) 2곳에도 `unconvertedAiFiles: []` 빈 배열 반환 → 호출자 분기 단순화
- `mergeDriveScanResult` **무변경** (PatternManage가 ScanResult에서 직접 꺼내 씀)

**검증 (모두 PASS)**:
- `npx tsc --noEmit`: ✅ EXIT_CODE=0, 에러 0
- `unconvertedAiFiles` 참조 grep: ✅ 7건 (interface 1 + 변수 1 + 에러경로 2 + push 1 + 정상 return 1 + 주석 1)
- 기존 export 보존: ✅ 11건 (SIZE_REGEX, ScanCategory, ScanPreset, ScanResult, parseFilename, writeMetaJson, readOrCreateMetaJson, loadSvgFromPath, scanDriveRoot, MergeResult, mergeDriveScanResult) 모두 시그니처 무변경
- `.ai` 처리 로직 grep: ✅ L361 분기로 aiFiles에만 수집 (svgFiles 무영향)
- `git status`: ✅ `src/services/driveSync.ts`만 추가 수정 (다른 작업 미푸시 파일은 이전 상태 그대로)

**무변경 확인**: scanDriveRoot/mergeDriveScanResult 외부 호출 측 영향 없음 — 새 필드는 기존 호출자가 무시해도 컴파일 가능 (TypeScript 구조적 타이핑). 기존 `.ai` 조용히 스킵 동작은 svgFiles/presets 흐름에서 그대로 유지 (paths에 .ai가 들어가지 않음).

💡 **호출 측 안내** (Phase 1-F PatternManage):
- `runAutoSync` 내 `scanDriveRoot` 결과 처리 시 `setUnconvertedAi(scanResult.unconvertedAiFiles)` 한 줄 추가
- 배열 빔이면 배너 숨김, 비어있지 않으면 표시
- ⚠️ PLAN 6-6에는 `scanResult.data.unconvertedAiFiles`로 명세되어 있으나 실제 ScanResult는 평면 구조라 `scanResult.unconvertedAiFiles`로 접근

⚠️ **reviewer 참고**:
- PLAN과 실제 ScanResult 구조 차이로 인한 명세 변경 (data 중첩 X, 평면 필드로 추가) — 기존 코드 보존 우선
- basename 비교는 단순 슬라이스 (svg 4글자 / ai 3글자) — `.SVG`/`.AI` 대소문자는 `.toLowerCase()` 끝에서 처리되지만 슬라이스 인덱스는 같음
- AI 수집 로직(L508~528)은 **SVG 처리 후 + 하위 폴더 큐 추가 전** 위치 — 같은 BFS 순회 안에서 동일 children을 재사용해 추가 I/O 0

**다음 단계**: 커밋 B 묶음(Phase 1-C ~ 1-F)으로 PM 처리 예정. 그 이전에 1-E(AiConvertModal.tsx) + 1-F(PatternManage.tsx 배너) 구현.

### developer [2026-04-25] Phase 1-F: PatternManage.tsx AiConvertModal 통합 (AI→SVG)

📝 **구현한 기능**: AI 미변환 배너 + AiConvertModal 렌더 + onComplete 시 쿨다운 우회 후 재스캔

| 파일 경로 | 변경 내용 | 신규/수정 |
|----------|----------|----------|
| `src/pages/PatternManage.tsx` | +60줄 — import 1줄 + state 2개 + runAutoSync 4줄(주석 포함) + 배너 16줄 + 모달 렌더 18줄 | 수정 |

**구현 요점**:
- `import AiConvertModal from "../components/AiConvertModal";` (default export 형태 — 실제 컴포넌트 export 형식 확인 후 결정)
- state 2개: `aiConvertTargets: string[] | null`, `unconvertedAi: string[]`
  - 두 state 분리 이유: 배너는 unconvertedAi 기준 표시, 모달 열기 시 스냅샷을 aiConvertTargets로 캡처 → 진행 중 재스캔 일어나도 입력 흔들림 없음
- `runAutoSync` 내 `scanResult.success` 분기 직후 `setUnconvertedAi(scanResult.unconvertedAiFiles ?? [])` 1줄 추가
  - **⚠️ 평면 구조 사용** — `scanResult.data.unconvertedAiFiles` 아님 (Phase 1-D 발견사항)
- 상단 배너: `loadError` 배너 다음, `pattern-layout` 위 — `unconvertedAi.length > 0` 조건 + "변환되지 않은 AI N개" + [자동 변환 →] 버튼
  - 배너 클릭 시 `setAiConvertTargets(unconvertedAi)`로 모달 열림
- 모달 렌더: 기존 `SvgStandardizeModal` 블록 바로 다음에 `aiConvertTargets && <AiConvertModal files={...} onClose={...} onComplete={...} />`
- onComplete 콜백 3줄: `setAiConvertTargets(null)` + `lastAutoScanRef.current = 0` + `void runAutoSync()` (Promise 무시)
- 기존 SvgStandardizeModal 통합 코드 무수정 (L48 import / L262 state / L455~ runAutoSync / L1372~ 모달 렌더 보존)

**검증 (모두 PASS)**:
- `npx tsc --noEmit`: ✅ EXIT_CODE=0, 에러 0건
- AiConvertModal 참조 grep: ✅ 2건 (import L51, 렌더 L1395)
- aiConvertTargets/unconvertedAi state 참조 grep: ✅ 13건 (state 정의 + setter + 배너 사용 + 모달 props + 주석)
- `scanResult.unconvertedAiFiles` (평면 구조) 사용: ✅ 1건 (L478)
- `scanResult.data.unconvertedAiFiles` 사용 0건 (잘못된 형태 미사용): ✅
- 기존 SvgStandardizeModal 통합 보존: ✅ 10건 (import + state 2 + 주석 + 모달 렌더 6) — 변동 없음
- 다른 파일 무수정: ✅ git status 상 PatternManage.tsx만 새로 변경 (App.css/driveSync.ts/AiConvertModal.tsx/aiConvertService.ts는 1-C~1-E 기존 결과물)

**무변경 확인**: PatternManage.tsx 외 추가 수정 0건. 다른 컴포넌트/서비스 영향 없음.

💡 **다음 단계 (Phase 1-G)**:
- tester + reviewer 병렬 실행 권장
- 통합 흐름 end-to-end (사용자 G드라이브 테스트):
  1. 빈 폴더 또는 SVG만 있는 폴더 스캔 → unconvertedAi 0건 → 배너 안 보임
  2. AI 1개만 있는 폴더 추가 후 스캔 (60초 쿨다운 또는 페이지 재진입) → 배너 표시
  3. [자동 변환 →] 클릭 → AiConvertModal 열림 (idle phase)
  4. [헤더 분석] → preview 결과(분류 요약 카드 3개) 표시
  5. [실행] → 진행바 → 결과 화면 → [닫기]
  6. 자동으로 onComplete 발화 → lastAutoScanRef=0 + runAutoSync → 재스캔 → unconvertedAi 갱신 → 배너 사라짐 또는 개수 감소

⚠️ **reviewer 참고**:
- 평면 구조 (`scanResult.unconvertedAiFiles`) 일관성 — driveSync.ts ScanResult 인터페이스 확장과 짝
- 배너 위치는 페이지 헤더(타이틀/설명) → loadError 배너 → AI 미변환 배너 → pattern-layout 순. 사용자가 카드 그리드 보기 전에 인지 가능
- `void runAutoSync()` — onComplete가 동기 콜백인데 runAutoSync가 Promise를 반환하므로 명시적 void로 fire-and-forget (lint 경고 차단)
- 두 state 분리 설계가 "모달 진행 중 재스캔 → 입력 흔들림" 문제를 사전에 방지함 (AiConvertModal은 props.files가 바뀌어도 자체 phase 머신을 보호하지만, 분리해 두는 편이 안전)


## 테스트 결과 (tester)
(해당 없음 — 수정 요청 3건은 사용자 실테스트 담당)

## 리뷰 결과 (reviewer)
(해당 없음)

---

## 수정 요청 (누적 보류)
| 요청자 | 대상 파일 | 문제 설명 | 상태 |
|--------|----------|----------|------|
| user | grading.jsx / 3XL.svg | 3XL 요소 몸판 벗어나 과하게 큼 | ✅ 수정됨 (0.95), 실테스트 대기 |
| user | 3XL.svg / 4XL.svg | 3XL/4XL 요소 몸판 상단 튀어나감 | 🔍 실테스트 필요 |
| user | grading.jsx / OrderGenerate | 기준 AI=XL로 XL 타겟 시 요소 0개 | 🔍 AI 레이어 구조 확인 필요 |
| user | driveSync.ts / PatternManage.tsx | G드라이브 신규 SVG 미인식 | ✅ 수정 완료, 실테스트 대기 |

---

## 작업 로그 (최근 10건)
| 날짜 | 에이전트 | 작업 내용 | 결과 |
|------|---------|----------|------|
| 2026-04-22 | developer | 자동 업데이트 Phase D 배포 가이드 문서 3종 작성 | ✅ RELEASE-GUIDE/CHANGELOG/INSTALL-GUIDE-STAFF 총 768줄 |
| 2026-04-23 | pm | v1.0.0 서명 키 재생성 + GitHub Actions 빌드 성공 (8분 6초) | 커밋 27a46eb~4e51365 |
| 2026-04-23 | pm | v1.0.0 Release Notes 작성 + Publish (자동 업데이트 활성화) | ✅ Draft→Published |
| 2026-04-24 | pm | 직원 배포용 공지문 3종 작성 (NOTICE-v1.0.0.md) | 커밋 2a6ac97 |
| 2026-04-24 | pm | SVG 표준화 Phase 1-7 문서 정리 (architecture+lessons+index 갱신) | 커밋 bc30017 |
| 2026-04-24 | debugger | 수정 요청 3건 v2 코드 정적 재검증 | 🔴#1 확실 / 🟡#2,#3 실테스트 필요 |
| 2026-04-24 | developer | 버그 #1 A안: ELEMENT_SCALE_EXPONENT 1.0 → 0.95 | 커밋 801bee4 |
| 2026-04-25 | pm | 수정 요청 3건 사용자 테스트 가이드 작성 (TEST-GUIDE-2026-04-25.md) | ✅ 버그 #1/#2/#3 검증 체크리스트 |
| 2026-04-25 | planner-architect | AI→SVG 자동 변환 Phase 1 MVP 설계 (PLAN-AI-TO-SVG.md 1017줄) | ✅ 12섹션+부록 3개, knowledge 7건 갱신 |
| 2026-04-25 | pm | scratchpad 정리 (273줄 → ~135줄) | ✅ 디버거 조사 상세 → errors.md 참조로 단순화 |
| 2026-04-25 | developer | AI→SVG Phase 1-B: lib.rs Rust 커맨드 2개 추가 | ✅ ai_convert_preview/ai_convert_batch + invoke_handler, cargo check 통과 |
| 2026-04-25 | developer | AI→SVG Phase 1-C: aiConvertService.ts 신규 (TS 게이트웨이) | ✅ 239줄, 타입 6개+함수 2개, tsc --noEmit 통과 |
| 2026-04-25 | developer | AI→SVG Phase 1-D: driveSync.ts unconvertedAiFiles 수집 | ✅ +56/-3, ScanResult 확장 + 폴더 단위 SVG/AI 짝 비교, tsc 통과 |
| 2026-04-25 | developer | AI→SVG Phase 1-E: AiConvertModal.tsx 신규 + App.css append | ✅ 680줄 신규 + 427줄 append, 6상태 머신, tsc 통과, hex/Tailwind 0건 |
| 2026-04-25 | developer | AI→SVG Phase 1-F: PatternManage.tsx AiConvertModal 통합 | ✅ +60줄, import/state2/runAutoSync1줄/배너/모달, 평면구조 사용, tsc 통과, 다른 파일 무수정 |

---

## ⏸ 보류 (다음 작업)
- 사용자 PLAN-AI-TO-SVG.md 검토 → 승인 후 developer Phase 1-A 착수
- 수정 요청 3건 실행 테스트 (사용자, TEST-GUIDE-2026-04-25.md)
- 직원 첫 설치 피드백 수집 → INSTALL-GUIDE-STAFF.md FAQ 갱신
- SVG 표준화 Phase 2 (슬림/V넥/하의, JSON 프리셋 외부화)
- 자동 업데이트 실제 검증은 v1.0.1 릴리스 시 자연스럽게

### 💡 Phase 1-6 tester용 회귀 테스트 명령 (참고 보관)
```bash
cd "C:\0. Programing\grader\python-engine"
venv\Scripts\activate && pip install -r requirements.txt
mkdir C:\temp\svg_test
copy "G:\...\양면유니폼_U넥_스탠다드_L.svg" C:\temp\svg_test\
copy "G:\...\양면유니폼_U넥_스탠다드_2XL.svg" C:\temp\svg_test\
python main.py normalize_batch "C:/temp/svg_test" "C:/temp/svg_test/양면유니폼_U넥_스탠다드_2XL.svg"
```
⚠️ G:\ 직접 실행 금지 (Drive 동기화 트리거)

### 기획설계 참조
| 계획서 | 상태 |
|--------|------|
| PLAN-GRADING-REBUILD.md | 구현됨 (grading-v2.jsx 607줄) |
| PLAN-PIECE-AWARE-LAYOUT.md | Phase 1+2 구현 |
| PLAN-GRADING-RECOVERY.md | Beta 권장안 반영 |
| PLAN-GRADING-REDESIGN.md | D1 권장안 구현 |
| PLAN-WORKFLOW-REDESIGN.md | Phase 1~4 완료 |
| PLAN-GDRIVE-SYNC.md | 옵션 4 구현 |
| PLAN-AUTO-UPDATE.md | Phase A~D 완료, v1.0.0 배포 |
| PLAN-SVG-STANDARDIZATION.md | Phase 1-1~1-5 완료 (v1.0.0 포함) |
| **PLAN-AI-TO-SVG.md** | **Phase 1 설계 완료 (구현 대기)** |
