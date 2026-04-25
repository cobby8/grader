# PLAN-AI-TO-SVG.md — AI→SVG 자동 변환 앱 통합 계획서 (Phase 1 MVP)

> 작성일: 2026-04-25
> 작성자: planner-architect
> 대상 범위: **Phase 1 MVP — PyMuPDF 기반 반자동 변환 (PDF 호환 AI 약 89%)**
> 선행 지식: 2026-04-20 외부 작업 — G드라이브 AI↔SVG 대조 63개 중 63개 변환 성공 (PyMuPDF 56 + Illustrator COM 7)
> 트리거: 디자이너가 G드라이브에 AI 파일만 올리고 SVG를 빼먹는 누락이 잦음. 현재 `driveSync.ts:336`이 `.ai`를 조용히 스킵해 grader가 인식조차 못함

---

## 0. 왜 이게 필요한지 (바이브 코더용 요약)

### 현재 상황

디자이너가 새 사이즈 패턴(예: 4XL)을 작업하고 G드라이브에 올립니다. 이때 디자이너는 주로
**AI 파일(Illustrator 원본)** 을 업로드하고, **SVG로 내보내기를 자주 까먹습니다.** grader 앱은
SVG만 읽기 때문에 그대로 "빈 사이즈"로 인식되어 작업이 막힙니다.

2026-04-20에 이 상황이 실제 발생해 63개 AI 파일을 **외부 파이썬 스크립트로 한 번 수동 변환** 했고,
PyMuPDF 56개 + Illustrator COM 7개 = **100% 성공**을 확인했습니다. 하지만 그 지식은 grader 앱
바깥에 있어, 다음에 같은 일이 생기면 또 터미널/수동 작업이 필요합니다.

**이 계획서는 그 변환 지식을 grader 앱에 내장**해, 버튼 한 번으로 처리하게 만듭니다.

### 핵심 구조 비유: "G드라이브 입국심사대"

grader의 Drive 동기화는 공항의 **입국심사대**와 같습니다.

- **지금**: SVG 승객만 통과시킵니다. AI 승객이 오면 "우린 그런 여권 몰라요" 하며 조용히 무시합니다 (`driveSync.ts:336`).
- **Phase 1 이후**: 심사대 옆에 **AI 여권 자동 발급소**가 생깁니다. AI 승객이 오면 발급소로
  안내하여 SVG 여권을 발급받고, 다시 심사대를 통과하게 합니다.

### 전체 흐름 (한 줄)

```
Drive 스캔 완료 → "미변환 AI N개 발견" 배너 표시
  → 사용자가 [변환] 버튼 클릭 (반자동 UX — 투명성 우선)
  → AiConvertModal 열림 (대상 파일 목록 + 옵션 + 실행)
  → Python ai_converter 호출
    → 파일마다 헤더 10바이트 검사
      → %PDF- 로 시작 → PyMuPDF get_svg_image(text_as_path=True) → 같은 폴더에 XL.svg 저장
      → %!PS-Adobe 로 시작 → Phase 2 대상으로 skip (Phase 1에서는 실패가 아닌 "나중에")
  → 결과 요약 (변환 N, skip M, 실패 K) → [닫기]
  → Drive 재스캔 자동 트리거 (새 SVG가 UI에 즉시 반영)
```

### 주요 조각의 역할

| 조각 | 비유 | 실제 역할 |
|-----|------|---------|
| **Python `ai_converter.py`** (신규) | "여권 발급소의 심사관 — 진짜 일함" | AI 헤더 검사 + PyMuPDF로 SVG 추출 (**핵심 검증 로직 이미 외부에서 통과**) |
| **Rust Tauri 커맨드** | "주문 접수 창구" | 프론트의 요청을 받아 Python 에 전달, JSON 응답 |
| **`aiConvertService.ts`** | "메뉴판 운영 매니저" | React가 Tauri 호출을 간단히 쓸 수 있게 래핑 |
| **`AiConvertModal.tsx`** | "손님이 보는 주문지" | 미변환 목록 + 옵션 + 미리보기 → 실행 |
| **배너/진입점 (PatternManage)** | "식당 호출 벨" | 미변환 AI 감지 시 배너 표시 |

**핵심 원칙**: SVG 표준화 Phase 1에서 완성한 3층 구조(Python ← Rust ← React)를 **그대로 미러**합니다.
신규 발명을 최소화해 복잡도와 회귀 위험을 동시에 줄입니다.

---

## 1. 사용자 확정 조건 (변경 불가)

| 항목 | 결정 | 비유 |
|------|------|------|
| **실행 방식** | **반자동** — Drive 스캔 후 "미변환 AI N개 발견" 배너만 띄움. 사용자가 [변환] 버튼을 직접 눌러야 실행 | 스팸 필터가 "차단 가능한 메일 3건" 이라 알려주되 자동 삭제하진 않음 |
| **저장 위치** | **G드라이브 동일 폴더** — `XL.ai` 옆에 `XL.svg` 생성. 별도 폴더·다른 이름 금지 | 원본과 번역본을 같은 서랍에 보관 |
| **충돌 처리** | **기본 건너뜀 + 옵션 덮어쓰기** — 같은 이름 SVG 이미 있으면 skip. 체크박스로 덮어쓰기 허용(이때 `.bak` 자동 백업) | SVG 표준화와 동일 UX 패턴 |
| **PostScript AI** | **Phase 1에선 skip, Phase 2 대상** — 헤더 `%!PS-Adobe` 파일은 실패가 아닌 "보류" 상태로 분류 | 여권 발급소 A(PDF 전용) 가 일하고, 발급소 B(PostScript 전용)는 Phase 2에서 개소 |
| **자동 백그라운드 변환** | **Phase 3에서** — 이번 Phase 1은 사용자 클릭 기반 반자동만 |
| **Phase 1 변환 도구** | **PyMuPDF 단독** — `page.get_svg_image(text_as_path=True)` 사용. Illustrator COM 은 Phase 2에서 추가 |
| **G드라이브 직접 쓰기** | **허용** — 사용자가 이미 수동 올리고 있으므로 자동화가 본질 (SVG 표준화와 동일 정책) |

### Phase 분할 (이번 설계 범위 = Phase 1만)

| Phase | 범위 | 커버리지 | 이번 설계 상세 | 예상 시간 |
|-------|------|--------|------------|---------|
| **1** | PyMuPDF + 반자동 UI + 동일 폴더 저장 | **PDF 호환 AI 약 89%** | ✅ 구현 완료 (2026-04-25) | **6~10시간** |
| **2** | Illustrator COM 추가 (PostScript AI 재저장 후 변환) | PostScript AI 약 11% (나머지) | ✅ 구현 완료 (2026-04-25, ~2h) | 3~4시간 |
| **3** | 자동 백그라운드 변환 (Drive 스캔 시 옵트인 자동 실행) | 사용자 클릭 제거 (옵트인) | ✅ **본 계획서 13장 상세 설계 완료** | 2.5~3.5시간 |

---

## 2. 범위 (Scope)

### 포함 (Phase 1)

- **Python `ai_converter.py` 신규 모듈** — 헤더 검사 + PyMuPDF 변환 + CLI 커맨드 2개
  (`ai_convert_preview`, `ai_convert_batch`)
- **Rust Tauri 커맨드 2개** — `ai_convert_preview` / `ai_convert_batch` (기존 `run_python` 재사용 래퍼)
- **TypeScript 서비스 `aiConvertService.ts` 신규** — invoke 래퍼 + 타입 정의
- **React 컴포넌트 `AiConvertModal.tsx` 신규** — 6상태 Phase 머신 UX (SVG 표준화 모달의 미러)
- **PatternManage 상단 배너** — Drive 스캔 후 미변환 AI N개 감지 시 노출
- **`driveSync.ts` 확장** — 스캔 결과에 `unconvertedAiFiles: string[]` 추가 (기존 `.ai` 무시 L336 대신 목록 수집)
- **변환 완료 시 Drive 재스캔 자동 트리거** — 새 SVG 즉시 UI 반영
- **통합 테스트 (실제 G드라이브 샘플 폴더 회귀 + 에러 시나리오 4건)**
- **knowledge 4종 갱신 + 커밋 3회 분할 (A=Rust/Python, B=UI, C=docs)**

### 제외 (향후 Phase)

- ❌ **PostScript AI 변환** — Phase 2의 Illustrator COM 파이프라인
- ❌ **자동 백그라운드 변환** — Phase 3 (Drive 스캔과 완전 통합)
- ❌ **변환 SVG의 표준화 자동 실행** — SVG 표준화는 별도 기능으로 유지 (사용자가 이어서 돌림)
- ❌ **AI 파일 미리보기 이미지** — 복잡도 대비 이득 적음. 파일명 목록만 표시
- ❌ **변환 중단/취소 버튼** — 파일당 1~2초로 짧음. Phase 3에서 자동 백그라운드 시 재검토

---

## 3. 설계 결정 (Q&A)

### Q1. AI 파일 분기는 어떻게?

**채택: 헤더 첫 10바이트 바이너리 검사**

| 방안 | 장점 | 단점 | 판정 |
|------|------|------|------|
| **A. 첫 10바이트 바이너리 검사 (`%PDF-` / `%!PS-Adobe`)** | O(1), 확정적, 외부 63개 실증 완료 | Adobe 내부 구조 변경 시 이론상 위험 (현실은 수십 년 안정) | ✅ |
| B. 파일 확장자만 사용 + try/except로 PyMuPDF 시도 | 간단 | 11%의 PostScript가 try 안에서 큰 오류 스택 트레이스 찍고 실패 → 로그 오염 + UX 혼란 | ❌ |
| C. 외부 툴(file 명령) 호출 | 표준적 | Windows 기본 환경 미보장 + subprocess 오버헤드 | ❌ |

**근거**:
1. lessons.md `[2026-04-21]` 항목에 검증 완료 — 실제 63개 중 7개(11%)가 PostScript 원본
2. PDF 호환 AI는 헤더 `%PDF-1.4`(또는 `%PDF-1.7`) 로 정확히 시작 — 프리픽스 매칭 `startswith(b"%PDF-")`으로 충분
3. PostScript AI는 `%!PS-Adobe-` 로 시작 (공식 규약, Adobe 문서화됨)
4. 알 수 없는 헤더(예: 손상 파일, 아예 AI가 아닌 파일)는 명시적 에러로 분류 → 혼란 방지

**구현 규약**:
```python
# ai_converter.py 의사 코드 (developer 담당)
with open(ai_path, "rb") as f:
    header = f.read(10)
if header.startswith(b"%PDF-"):
    kind = "pdf_compatible"
elif header.startswith(b"%!PS-Adobe"):
    kind = "postscript"
else:
    kind = "unknown"
```

### Q2. 미변환 알림은 어디에?

**채택: PatternManage 페이지 상단 배너 + 클릭 시 모달 열림**

| 옵션 | 장점 | 단점 | 판정 |
|------|------|------|------|
| **A. PatternManage 페이지 상단 노란 배너** | 눈에 띄고, 해당 도메인에 맞는 위치, 스쿨드 UI | 다른 페이지에서는 감지 안 됨 | ✅ |
| B. 헤더에 상시 알림 배지 | 어느 페이지에서든 보임 | 전역 레이아웃 수정 필요, UpdateModal과 경쟁 | ❌ |
| C. Drive 스캔 직후 토스트 알림 | 즉시성 | 놓치면 사라짐, 재진입 경로 없음 | ❌ |
| D. Settings 페이지 안에 섹션 | 모아보기 | 사용자가 설정에 들어가야 발견 | ❌ |

**근거**:
1. 미변환 AI는 **패턴 등록 도메인**의 문제 → PatternManage에 속하는 것이 자연스러움
2. 배너는 "닫기(X) 버튼 없이" 미변환이 0이 되면 사라지도록 설계 → 사용자가 놓치기 어려움
3. SVG 표준화 Phase 1의 카드 ⋮ 메뉴와 별도 진입점으로 공존 (둘은 다른 역할)

**구현 규약** (설계만):
- Drive 스캔 결과에 `unconvertedAiFiles: string[]` 추가
- PatternManage는 해당 배열 길이가 0보다 크면 배너 렌더
- 배너 문구 예시: "📋 변환되지 않은 AI 파일 5개가 있습니다. → [자동 변환]"
- 클릭 시 AiConvertModal 열림, 전체 목록을 props로 전달

### Q3. 변환 진행률 표시는 어떻게?

**채택: 6상태 Phase 머신 (SVG 표준화 모달과 동일 구조)**

| 상태 | 표시 내용 | 버튼 |
|------|----------|------|
| `idle` | 대상 파일 목록 N개 + 덮어쓰기 체크박스 | [취소] [▶ 변환 시작] |
| `previewing` | 로딩 스피너 "헤더 분석 중..." | [취소] (disabled) |
| `preview-done` | 분류 결과 (PDF호환 N개 / PostScript M개 / 기존 SVG 있음 K개) | [취소] [← 뒤로] [▶ 실행] |
| `converting` | "변환 중... (i/N 파일)" + 진행바 + 현재 파일명 | (모두 disabled, ESC 차단) |
| `done` | 결과 요약 (변환 N, skip M, 실패 K) + 상세 펼치기 아코디언 | [닫기] |
| `error` | 에러 메시지 (venv/권한/파일 없음) | [닫기] [다시 시도] |

**근거**:
1. SVG 표준화 모달의 6상태 머신이 실사용으로 검증됨 (v1.0.0 포함, 2026-04-22)
2. 파일당 1~2초이므로 진행바가 필수는 아니지만, 파일이 많을 수 있으므로(63개 케이스) 표시
3. `previewing` 단계 분리 이유: 헤더 분석만으로 "PostScript는 skip, PDF호환만 변환" 을 사용자가 미리 볼 수 있게 하여 예측 가능성 제공

### Q4. PyMuPDF 실패 AI는 어떻게?

**채택: 결과 목록에 "실패 + Phase 2 대상"으로 유지, 파일은 그대로 둠**

| 방안 | 장점 | 단점 | 판정 |
|------|------|------|------|
| **A. 결과 목록에 실패로 분류 + 목록 보존** | 나중에 Phase 2 도입 시 한 번에 처리 가능 | 일시적으로 미변환 파일 남음 | ✅ |
| B. 실패 시 즉시 사용자에게 "Illustrator로 열어 수동 변환" 지시 | 명확 | 현재 UX 흐름 깨짐 + 63개 실패 나면 지옥 | ❌ |
| C. 삭제하거나 별도 폴더로 이동 | 깔끔 | 사용자 파일 임의 이동은 위험 원칙 위배 | ❌ |

**실패 유형** (Phase 1에서 예상):
1. **PostScript AI** — 헤더 검사에서 분류됨, PyMuPDF로 시도조차 안 함 → "skip_postscript" 상태
2. **알 수 없는 헤더** — 손상 파일, 잘못된 확장자 → "error_unknown_header" 상태
3. **PyMuPDF가 PDF 호환 AI도 못 여는 경우** (희귀) — "error_pymupdf" 상태

모두 모달 결과에 **파일명 + 이유** 로 표시. Phase 2에서는 "skip_postscript" 목록을 Illustrator COM으로 재처리.

### Q5. 경고 누적 어떻게 표시?

**채택: SVG 표준화 모달과 동일 패턴 — 결과 화면의 펼치기 아코디언**

- 변환 과정의 warning(예: "빈 페이지", "폰트 누락 경고")은 모두 파일별로 수집
- `done` 상태 결과 요약 밑에 `<details>` 아코디언 "경고 상세 보기"
- 기본은 닫혀 있음, 클릭 시 펼침. 사용자 피로도 최소화

### Q6. Rust 커맨드 신규 vs `run_python` 재사용?

**채택: 신규 커맨드 2개 추가, 내부는 `run_python` 재사용 (SVG 표준화와 동일)**

| 방안 | 평가 |
|------|------|
| A. `svg_*_normalize`와 같이 **신규 전용 래퍼 2개** — `ai_convert_preview`, `ai_convert_batch` | ✅ (타입 안전, 명시적 네이밍) |
| B. 프론트가 `invoke("run_python", { command: "ai_convert_batch", args: [...] })` 직접 호출 | ❌ 동적 문자열 사용, 바이브 코더에게 위험 |
| C. Python sidecar 전환 | ❌ 배포 복잡도 2배 (SVG 표준화 때 이미 결정) |

**근거 (SVG 표준화 decisions.md [2026-04-22] 재사용)**:
- 타입 안전성 우선 — TypeScript `invoke<"ai_convert_preview">(...)` 컴파일 타임 검증
- Python `run_python` 로직은 이미 8개월 안정 동작
- 신규 파일 1개 추가(Python) + Rust 커맨드 2개 = 최소 변경

### Q7. 미변환 감지 로직은 driveSync에 둘까 별도 모듈일까?

**채택: `driveSync.ts` 내부에서 수집, ScanResult에 필드 추가**

- 기존 `driveSync.ts:336` 의 "조용히 스킵" 동작을 "목록 수집"으로 교체
- 판정 규칙: `폴더 내 {basename}.ai 파일 존재` + `동일 폴더에 {basename}.svg 미존재`
- 결과 배열 `unconvertedAiFiles: string[]` (절대 경로)를 `ScanResult`에 추가
- `driveSync.ts`는 이미 폴더 전체를 순회하므로 추가 비용 거의 없음 (O(1) 추가 체크)

**핵심 안전장치**: 기존 `.ai` 스캔 대상 제외 로직은 유지 — 병행 SVG가 있으면 AI는 조용히 무시(현재 동작).
새 로직은 오직 **"SVG 짝이 없는 AI"** 만 감지.

---

## 4. 아키텍처

### 4-1. 계층 구조

```
PatternManage.tsx (상단 미변환 배너)
  │
  └─ AiConvertModal.tsx (React, 6상태 Phase 머신)
       │
       └─ aiConvertService.ts (TypeScript 서비스 레이어)
            │
            ├─ invoke("ai_convert_preview", { files })
            └─ invoke("ai_convert_batch", { files, overwrite })
                   │
                   └─ src-tauri/src/lib.rs (Rust 커맨드 2개 신규)
                        │
                        └─ run_python 로직 재사용 (무변경)
                             │
                             └─ python-engine/main.py (CLI 커맨드 2개 신규)
                                  │
                                  └─ ai_converter.py (신규 모듈)
                                       │
                                       ├─ 헤더 10바이트 검사
                                       ├─ PyMuPDF.get_svg_image(text_as_path=True)
                                       └─ 같은 폴더 저장 + .bak 백업(덮어쓰기 모드)
```

별도로:
```
driveSync.ts (확장)
  │
  └─ scanDriveRoot() 스캔 결과에 unconvertedAiFiles 배열 추가
  │
  └─ PatternManage가 배너로 렌더 → 클릭 시 AiConvertModal 오픈
```

### 4-2. 데이터 흐름 (스캔 → 변환 → 재스캔)

```
[앱 시작 또는 수동 재스캔]
  │
  ▼
runAutoSync() → scanDriveRoot(drivePatternRoot)
  │
  ▼
driveSync 내부에서 폴더 순회:
  - *.svg 수집 (기존 동작)
  - 추가: 각 *.ai 파일에 대해 "같은 이름 *.svg가 있나?" 체크
  - 없으면 unconvertedAiFiles 배열에 절대 경로 push
  │
  ▼
ScanResult {
  mergedPresets,
  drivePatternRoot,
  unconvertedAiFiles: [...N개]  // 신규 필드
}
  │
  ▼
PatternManage 렌더: unconvertedAiFiles.length > 0 이면 배너 표시
  │
  ▼ (사용자 배너 클릭)
AiConvertModal 열림 (props: files = unconvertedAiFiles)
  │
  ▼ (사용자 [변환 시작] 클릭)
Tauri invoke("ai_convert_preview", { files })
  │
  ▼
Python ai_converter.preview() :
  각 파일 헤더 10바이트 검사 → { file, kind: "pdf" | "postscript" | "unknown", existingSvg: bool }
  │
  ▼
Modal preview-done 상태로 전환, 분류 결과 표시
  │
  ▼ (사용자 [실행])
Tauri invoke("ai_convert_batch", { files, overwrite })
  │
  ▼
Python ai_converter.batch() :
  for file in files:
    if kind == "pdf_compatible":
      PyMuPDF.get_svg_image(text_as_path=True) → 같은 폴더에 .svg 저장
      (overwrite=true + 기존 SVG 있으면 → .bak 백업 후 덮어쓰기)
    elif kind == "postscript":
      skip (Phase 2 대상)
    else:
      error
  │
  ▼
Modal done 상태로 전환 → 결과 요약
  │
  ▼ (자동 트리거)
onComplete() → PatternManage에서 lastAutoScanRef.current = 0 리셋 → runAutoSync() 재호출
  │
  ▼
Drive 재스캔 → 새 SVG들이 mergedPresets의 svgPathBySize에 등록됨
  → unconvertedAiFiles가 비워짐 → 배너 사라짐
```

---

## 5. 파일 변경 목록

### 5-1. 신규 파일 (4개)

| 파일 | 줄수 예상 | 역할 |
|------|---------|------|
| `python-engine/ai_converter.py` | ~250~350 | 헤더 검사 + PyMuPDF 변환 + 배치 처리 + 결과 dict 반환 |
| `src/services/aiConvertService.ts` | ~120~150 | Tauri invoke 래퍼 + `PreviewResult`/`BatchResult` 타입 |
| `src/components/AiConvertModal.tsx` | ~400~500 | 6상태 Phase 머신 모달, BEM 클래스 `.ai-convert-modal__*` |
| (CSS는 `src/App.css`에 append) | ~150 | `.ai-convert-modal__*` + `.pattern-manage__ai-banner` BEM 스타일 |

### 5-2. 수정 파일 (5개)

| 파일 | 변경 범위 | 변경 내용 |
|------|---------|----------|
| `python-engine/main.py` | CLI 커맨드 2개 추가 | `ai_convert_preview`, `ai_convert_batch` 핸들러 (기존 `preview_normalize`/`normalize_batch` 구조 복제) |
| `src-tauri/src/lib.rs` | Rust 커맨드 2개 추가 + `invoke_handler` 등록 | `ai_convert_preview` / `ai_convert_batch` 함수 (run_python 얇은 래퍼) |
| `src/services/driveSync.ts` | 스캔 함수 2~3지점 확장 | `ScanResult` 타입에 `unconvertedAiFiles: string[]` 추가 + 폴더 순회 시 AI 파일 목록 수집 로직 |
| `src/pages/PatternManage.tsx` | 배너 렌더 + 모달 상태 관리 | 상단 배너 + `<AiConvertModal>` 조건부 렌더 + onComplete에서 runAutoSync 강제 트리거 |
| `src/App.css` | append only | `.ai-convert-modal__*` + `.pattern-manage__ai-banner` 클래스 (CSS 변수만 사용) |

### 5-3. 재사용/영향 없음 (절대 수정 금지)

- `python-engine/svg_normalizer.py` — 변경 없음
- `python-engine/svg_parser.py`, `pdf_grader.py`, `pattern_scaler.py` — 변경 없음 (그레이딩 회귀 위험 차단)
- `illustrator-scripts/grading.jsx` — 변경 없음
- `src-tauri/capabilities/default.json` — 변경 없음 (이번 커맨드는 shell 권한 확장 불필요)
- `src-tauri/tauri.conf.json` — `bundle.resources`는 `scripts/sync-bundle-resources.mjs`가 자동으로
  `ai_converter.py`를 포함하므로 **수동 수정 불필요** (Phase A 자동 업데이트 인프라 재활용)

---

## 6. 컴포넌트 상세 설계

### 6-1. `ai_converter.py` (신규)

**역할**: AI→SVG 변환의 실제 로직. svg_normalizer.py와 완전 분리 (관심사 분리 원칙).

**주요 함수 구조** (모두 grader 컨벤션 `{"success": bool, "data": ..., "error": ...}` dict 반환):

```python
# ai_converter.py 골격 (의사 코드 — developer가 구현)

# --- 모듈 상수 ---
CONVERTER_VERSION = "1.0-pymupdf-pdf-compatible"
HEADER_PDF_PREFIX = b"%PDF-"          # PDF 호환 AI
HEADER_POSTSCRIPT_PREFIX = b"%!PS-Adobe"  # PostScript 원본 AI

# --- private 함수 3개 ---
def _read_header(ai_path: str) -> bytes:
    """AI 파일 첫 10바이트 반환. 파일 열기 실패 시 빈 bytes."""

def _classify_ai(ai_path: str) -> str:
    """헤더 검사 결과 'pdf_compatible' | 'postscript' | 'unknown' 중 하나 반환."""

def _convert_pdf_compatible(ai_path: str, svg_path: str, overwrite: bool, backup: bool) -> dict:
    """PyMuPDF로 PDF 호환 AI → SVG 변환. 기존 SVG 충돌 시 overwrite 정책에 따라 처리.
    반환: { "success": bool, "action": "converted" | "skipped_existing" | "overwritten",
            "svg_path": str, "warnings": [...], "error": str }"""

# --- public 함수 2개 (main.py CLI와 1:1 매칭) ---
def preview_ai_conversion(files: list[str]) -> dict:
    """파일 목록 헤더 분석. 파일 수정 없음.
    반환: { "success": True, "data": {
        "entries": [
            { "file": "/abs/path/양면유니폼_U넥_스탠다드_XL.ai",
              "kind": "pdf_compatible",
              "existing_svg": True },
            ...
        ],
        "summary": { "pdf_compatible": N, "postscript": M, "unknown": K,
                     "existing_svg_conflict": Q }
    }}"""

def convert_ai_batch(files: list[str], overwrite: bool) -> dict:
    """파일 목록 일괄 변환. PDF 호환만 처리, PostScript/unknown은 skip.
    반환: { "success": True, "data": {
        "folder": "(혼재 가능이므로 None 또는 'mixed')",
        "total": N,
        "converted": K,
        "skipped_postscript": P,
        "skipped_existing": Q,  # overwrite=false일 때 기존 SVG 있어 skip
        "failed": F,
        "results": [
            { "file": "/abs/path/XL.ai", "status": "PASS", "svg_path": "/abs/path/XL.svg",
              "warnings": [] },
            { "file": "/abs/path/FG26-03-05.ai", "status": "SKIP", "reason": "postscript" },
            { "file": "/abs/path/XXL.ai", "status": "SKIP", "reason": "existing_svg" },
            { "file": "/abs/path/broken.ai", "status": "FAIL", "error": "..." }
        ],
        "version": CONVERTER_VERSION
    }}"""
```

**PyMuPDF 호출 요점** (lessons.md 교훈 반영):
```python
# 의사 코드 — developer가 실제 구현
import fitz  # PyMuPDF

doc = fitz.open(ai_path)  # PDF 호환 AI만 성공 (헤더 검사로 선별됨)
page = doc[0]  # AI는 단일 페이지
svg_text = page.get_svg_image(text_as_path=True)  # text_as_path 핵심
doc.close()

# overwrite 처리
if os.path.exists(svg_path):
    if not overwrite:
        return { "success": True, "action": "skipped_existing", ... }
    # 덮어쓰기 모드 — .bak 백업
    shutil.copy(svg_path, svg_path + ".bak")

# atomic write (임시 파일 → rename)
tmp = svg_path + ".tmp"
with open(tmp, "w", encoding="utf-8") as f:
    f.write(svg_text)
os.replace(tmp, svg_path)
```

**왜 `text_as_path=True`?** — Illustrator 외 환경에서 폰트가 없어도 글자 모양이 유지됨.
lessons.md 검증에서 11KB 수준의 정상 SVG 생성 확인.

**에러 처리 규약**:
- 파일 단위 실패는 `status: "FAIL"` + `error`로 기록, 배치 전체는 계속 진행 (한 파일 실패로 63개가 모두 중단되면 안 됨)
- 배치 전체 실패(예: 디스크 꽉 참)는 `{ "success": False, "error": "..." }`

### 6-2. `main.py` CLI 커맨드 추가 (수정)

기존 `preview_normalize`/`normalize_batch` 패턴을 그대로 미러:

```python
# main.py 추가 영역 (의사 코드)

elif command == "ai_convert_preview":
    # 사용: ai_convert_preview "file1.ai;file2.ai;..."  (; 구분자)
    #       또는 폴더 경로 (폴더 내 .ai 전수 수집)
    if len(args) < 1:
        print_json({"success": False, "error": "인자 부족. 예: python main.py ai_convert_preview files"})
    else:
        files = _expand_ai_files(args[0])  # ; 분할 또는 폴더 스캔
        result = preview_ai_conversion(files)
        print_json(result)

elif command == "ai_convert_batch":
    # 사용: ai_convert_batch "file1.ai;file2.ai;..." [--overwrite]
    if len(args) < 1:
        print_json({"success": False, "error": "인자 부족"})
    else:
        files = _expand_ai_files(args[0])
        overwrite = "--overwrite" in args[1:]
        result = convert_ai_batch(files, overwrite=overwrite)
        print_json(result)
```

CLI 도움말에 2줄 추가:
```
"ai_convert_preview <file_or_files> [--overwrite]": "[AI→SVG] 변환 시뮬레이션 (파일 미수정). ; 구분자로 다중 파일 가능",
"ai_convert_batch <file_or_files> [--overwrite]": "[AI→SVG] AI 일괄 변환. 기본은 기존 SVG 유지, --overwrite 시 .bak 백업 후 덮어쓰기",
```

### 6-3. `lib.rs` Rust 커맨드 (수정)

SVG 표준화의 `svg_preview_normalize`/`svg_normalize_batch` 구조 그대로 미러:

```rust
// 의사 코드 — developer 구현
#[tauri::command]
fn ai_convert_preview(
    app: tauri::AppHandle,
    files: String,  // ";" 구분 절대 경로 배열
) -> Result<String, String> {
    run_python(app, "ai_convert_preview".to_string(), vec![files])
}

#[tauri::command]
fn ai_convert_batch(
    app: tauri::AppHandle,
    files: String,
    overwrite: bool,
) -> Result<String, String> {
    let mut args = vec![files];
    if overwrite {
        args.push("--overwrite".to_string());
    }
    run_python(app, "ai_convert_batch".to_string(), args)
}
```

`invoke_handler!` 튜플 끝에 `ai_convert_preview, ai_convert_batch` 2개 추가.

**왜 `files`를 문자열로?** — Rust/Tauri의 `Vec<String>` 바인딩도 가능하지만, Python main.py의 CLI 인자는
결국 단일 문자열이므로 "세미콜론 구분" 관례를 유지하는 편이 Rust/Python 양쪽 일관성 있음 (SVG 표준화의
`preview_normalize`에서 이미 같은 규약 사용 중).

### 6-4. `aiConvertService.ts` (신규)

SvgStandardizeService 미러:

```ts
// 타입 (Python JSON과 1:1 매핑)
export type AiKind = "pdf_compatible" | "postscript" | "unknown";

export interface AiPreviewEntry {
  file: string;          // 절대 경로
  kind: AiKind;
  existing_svg: boolean; // 같은 폴더에 같은 이름 SVG 있는지
}

export interface AiPreviewResult {
  success: boolean;
  data?: {
    entries: AiPreviewEntry[];
    summary: {
      pdf_compatible: number;
      postscript: number;
      unknown: number;
      existing_svg_conflict: number;
    };
  };
  error?: string;
}

export type AiBatchStatus = "PASS" | "SKIP" | "FAIL";

export interface AiBatchResultEntry {
  file: string;
  status: AiBatchStatus;
  svg_path?: string;     // PASS 시
  reason?: string;       // SKIP 시 ("postscript" | "existing_svg" | "unknown")
  error?: string;        // FAIL 시
  warnings?: string[];
}

export interface AiBatchResult {
  success: boolean;
  data?: {
    total: number;
    converted: number;
    skipped_postscript: number;
    skipped_existing: number;
    failed: number;
    results: AiBatchResultEntry[];
    version: string;
  };
  error?: string;
}

// 함수 (모두 async)
export async function previewAiConversion(files: string[]): Promise<AiPreviewResult>
export async function convertAiBatch(files: string[], overwrite: boolean): Promise<AiBatchResult>
```

**구현 요점**:
- `files: string[]` 을 ";" 로 join해서 invoke (Python CLI 관례)
- `invoke()` 반환 JSON 문자열 `JSON.parse` → Python 형식 그대로 노출
- 에러 규약: `{ success: false, error: "..." }` (일관성)
- console 로그: `[ai-convert]` 프리픽스

### 6-5. `AiConvertModal.tsx` (신규)

**Props**:
```ts
interface AiConvertModalProps {
  files: string[];          // 미변환 AI 파일 절대 경로 배열 (PatternManage 배너에서 전달)
  onClose: () => void;
  onComplete: () => void;   // 성공 시 → PatternManage가 runAutoSync 트리거
}
```

**내부 상태**:
```ts
type Phase = "idle" | "previewing" | "preview-done" | "converting" | "done" | "error";
const [phase, setPhase] = useState<Phase>("idle");
const [overwrite, setOverwrite] = useState<boolean>(false);
const [preview, setPreview] = useState<AiPreviewResult | null>(null);
const [result, setResult] = useState<AiBatchResult | null>(null);
const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
const [errorMsg, setErrorMsg] = useState<string | null>(null);
```

**UI 섹션** (idle 상태):
- 상단 경고 카드: "이 작업은 G드라이브에 SVG 파일을 생성합니다. Phase 1은 PDF 호환 AI만 처리하며, PostScript AI는 Phase 2에서 지원됩니다."
- 파일 목록 표 (파일명, 폴더 요약)
- 옵션: `[ ] 기존 SVG가 있으면 덮어쓰기 (.bak 자동 백업)` — 기본 **꺼짐**
- 푸터: [취소] [헤더 분석] (= 미리보기)

**UI 섹션** (preview-done):
- 분류 요약 카드 3개: PDF 호환 N개 / PostScript M개(건너뜀) / 알 수 없음 K개
- 기존 SVG 충돌 Q개 (overwrite 꺼져 있으면 "건너뜀" 뱃지)
- 파일별 테이블: 파일명 / 분류 / 충돌 여부
- 푸터: [← 뒤로] [취소] [실행 (N개 변환)] — 실제 변환 예정 개수 버튼에 표시

**UI 섹션** (converting):
- 진행바 + "변환 중... (i / N)" 문구
- 현재 처리 중 파일명 (Python에서 progress 콜백이 없으므로 UI 추정치로 대체 — 단순 N/N 카운트)
- ⚠️ 주의: 실시간 progress는 Phase 1 스코프 밖. `total` 만 표시하고 스피너 (향후 Python sidecar 시 실시간 가능)

**UI 섹션** (done):
- 결과 요약 (변환 N, skip P, 실패 F)
- 상세 아코디언: 파일별 status + 이유
- PostScript skip 파일들은 "Phase 2에서 지원 예정" 뱃지
- 푸터: [닫기]

**UI 섹션** (error):
- 에러 메시지 + 힌트 (venv/권한/경로)
- [닫기] [다시 시도]

**BEM 클래스** (App.css):
```
.ai-convert-modal__backdrop
.ai-convert-modal__card
.ai-convert-modal__header
.ai-convert-modal__warning               — 상단 노란 안내
.ai-convert-modal__section
.ai-convert-modal__file-list
.ai-convert-modal__file-row
.ai-convert-modal__file-row--postscript
.ai-convert-modal__file-row--conflict
.ai-convert-modal__summary               — 분류 요약 카드들
.ai-convert-modal__summary-card
.ai-convert-modal__progress              — 진행바
.ai-convert-modal__result-badge
.ai-convert-modal__footer
.pattern-manage__ai-banner               — PatternManage 상단 배너
```

모두 `var(--color-*)` 변수만 사용 (하드코딩 금지, Tailwind 금지).

**실행 중 차단**: `converting` 상태에서 ESC/백드롭 클릭 차단 (UpdateModal/SvgStandardizeModal 패턴 일관).

### 6-6. `driveSync.ts` 확장

**수정 지점 1**: `ScanResult` 타입 확장

```ts
export interface ScanResult {
  success: boolean;
  data?: {
    mergedPresets: PatternPreset[];
    drivePatternRoot: string;
    unconvertedAiFiles: string[];  // 신규 — 절대 경로
  };
  error?: string;
}
```

**수정 지점 2**: 폴더 순회 로직 (`scanDriveRoot` 내부)

```ts
// 기존 (L336 근처): .ai 파일은 조용히 스킵
// if (ext === ".ai") continue;

// 신규 로직 (의사 코드)
// 폴더의 파일 목록을 읽을 때 svg/ai 두 Set을 수집
const svgBaseNames = new Set<string>();  // "XL" (확장자 제외 basename)
const aiBaseNames = new Map<string, string>();  // "XL" → 절대 경로
for (const entry of dirEntries) {
  const ext = path.extname(entry).toLowerCase();
  const base = path.basename(entry, ext);
  if (ext === ".svg") svgBaseNames.add(base);
  else if (ext === ".ai") aiBaseNames.set(base, absPath);
}
// 짝이 없는 AI만 수집
for (const [base, absPath] of aiBaseNames) {
  if (!svgBaseNames.has(base)) {
    unconvertedAiFiles.push(absPath);
  }
}
```

**중요**: 기존 `.ai` 조용히 스킵 동작은 **그대로 유지**. 새 로직은 **병행하여** 목록만 수집.

**수정 지점 3**: `mergeDriveScanResult` 는 AI 처리 안 함 (ScanResult에서 바로 꺼내 쓰게 설계)

### 6-7. PatternManage.tsx 수정 지점

**① 상태 추가**:
```ts
const [aiConvertTargets, setAiConvertTargets] = useState<string[] | null>(null);
const [unconvertedAi, setUnconvertedAi] = useState<string[]>([]);
```

**② `runAutoSync` 완료 시 `unconvertedAi` 업데이트**:
```ts
const scanResult = await scanDriveRoot(drivePatternRoot);
if (scanResult.success && scanResult.data) {
  // 기존 presets 병합 로직 ...
  setUnconvertedAi(scanResult.data.unconvertedAiFiles);  // 신규 한 줄
}
```

**③ 페이지 상단 배너 렌더** (`PatternManage`의 header 아래):
```tsx
{unconvertedAi.length > 0 && (
  <div className="pattern-manage__ai-banner" role="alert">
    <span className="pattern-manage__ai-banner-icon">📋</span>
    <span className="pattern-manage__ai-banner-text">
      변환되지 않은 AI 파일 {unconvertedAi.length}개가 있습니다.
    </span>
    <button
      className="pattern-manage__ai-banner-button"
      onClick={() => setAiConvertTargets(unconvertedAi)}
    >
      자동 변환 →
    </button>
  </div>
)}
```

**④ 모달 조건부 렌더** (페이지 최하단):
```tsx
{aiConvertTargets && (
  <AiConvertModal
    files={aiConvertTargets}
    onClose={() => setAiConvertTargets(null)}
    onComplete={() => {
      setAiConvertTargets(null);
      lastAutoScanRef.current = 0;  // 쿨다운 무시
      runAutoSync();                // 재스캔 → unconvertedAi 자동 갱신 → 배너 사라짐
    }}
  />
)}
```

---

## 7. Phase 분할 및 예상 시간

| Phase | 내용 | 예상 시간 | 커밋 단위 | 담당 |
|-------|------|---------|---------|------|
| **1-A** | `ai_converter.py` 신규 작성 + main.py CLI 2개 추가 + 로컬 CLI 테스트 | **2~3시간** | 커밋 A의 일부 | developer |
| **1-B** | Rust 커맨드 2개 추가 + `cargo check` 통과 | **0.5~1시간** | 커밋 A의 일부 | developer |
| **1-C** | `aiConvertService.ts` 신규 (타입 + invoke 2개 + JSON.parse) | **0.5~1시간** | 커밋 B의 일부 | developer |
| **1-D** | `driveSync.ts` 확장 — `unconvertedAiFiles` 수집 로직 + 타입 추가 | **1~1.5시간** | 커밋 B의 일부 | developer |
| **1-E** | `AiConvertModal.tsx` 신규 (Phase 머신 + UI + CSS append) | **2~3시간** | 커밋 B의 일부 | developer |
| **1-F** | PatternManage.tsx 통합 (배너 + 모달 렌더 + 완료 후 재스캔) | **1시간** | 커밋 B의 일부 | developer |
| **1-G** | 통합 테스트 (정상 / PostScript / 기존 SVG 충돌 / 에러 4건) | **1~2시간** | (비커밋) | tester + reviewer 병렬 |
| **1-H** | knowledge 4종 갱신 + scratchpad 정리 + 최종 커밋 C (문서만) | **0.5~1시간** | 커밋 C | pm |

**총 소요**: **8.5~13.5시간** (하루 ~ 하루 반)

**의존 관계**:
```
1-A (Python) ─┐
              ├─▶ 1-B (Rust) ─▶ 1-C (Service) ─┬─▶ 1-E (Modal) ─▶ 1-F (PatternManage) ─▶ 1-G (테스트) ─▶ 1-H (커밋)
              │                                 │
              └─ 1-D (driveSync 확장) ──────────┘
```

- **1-A와 1-D는 완전 병렬 가능** (Python 모듈과 driveSync는 서로 무관)
- **1-B는 1-A 완료 후** (Rust 커맨드 테스트 시 Python 측이 이미 있어야 함)
- **1-E와 1-F 는 반드시 순차** (1-F가 Modal을 import하므로 껍데기라도 먼저 있어야 함)

---

## 8. 커밋 전략

| 커밋 | 대상 | 이유 |
|------|------|------|
| **A**: `feat: AI→SVG 변환 엔진 추가 (Python ai_converter + Rust 커맨드)` | 1-A + 1-B 완료 후 | Python/Rust 빌드 단위 분리 — 프론트 없이도 `cargo check` + 로컬 CLI 테스트 가능 |
| **B**: `feat: AI→SVG 자동 변환 앱 UI 통합 (Modal + PatternManage 배너 + driveSync 확장)` | 1-C~1-F + 1-G 통과 후 | 프론트 변경 일괄 — service/Modal/PatternManage/driveSync가 상호 참조 |
| **C**: `docs: AI→SVG 변환 Phase 1 완료 — knowledge + scratchpad 갱신` | 1-H 완료 후 | 문서만 분리해 히스토리 탐색 용이 |

**메시지 규칙**: Conventional Commits + `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`

**미푸시 커밋**: PM이 매 커밋 후 개수 알림 (사용자 가이드라인 준수).

---

## 9. 테스트 시나리오 (Phase 1-G)

### 9-A. 정상 경로 — PDF 호환 AI 변환

**셋업**:
```
mkdir C:\temp\ai_convert_test
copy "G:\공유 드라이브\...\양면유니폼_U넥_스탠다드_XL.ai" C:\temp\ai_convert_test\
```

G드라이브 직접 실행 금지. 반드시 로컬 복사본.

**테스트 1**: 단일 PDF 호환 AI 변환
- 배너에서 [자동 변환] 클릭 → Modal idle → [헤더 분석]
- 결과: `pdf_compatible: 1, postscript: 0, unknown: 0`
- [실행] → done 상태 → 변환 1, skip 0, 실패 0
- 파일 확인: `XL.svg` 생성됨, 크기 ~11KB 수준
- 재스캔 후 배너 사라짐

**테스트 2**: 다수 PDF 호환 AI (5개 이상)
- 진행바 동작 확인
- 결과 아코디언에 5개 모두 "PASS"

**테스트 3**: 덮어쓰기 옵션
- 기존 SVG가 있는 상태에서 모달에서 "덮어쓰기" 체크
- [실행] → `.bak` 생성 + SVG 새로 작성 확인
- 원본 복구 시 `.bak` rename 으로 가능함을 수동 검증

### 9-B. PostScript AI 감지 (skip 처리)

- `%!PS-Adobe` 헤더를 가진 AI 파일을 테스트 폴더에 복사
- 배너 → Modal → [헤더 분석]
- 결과: `postscript: 1` 로 분류
- 파일 테이블에서 해당 파일이 "PostScript — Phase 2에서 지원" 뱃지
- [실행] → 결과 "skip_postscript: 1" + 원본 AI 파일 **변경 없음** 확인
- 같은 폴더 SVG 생성되지 **않음** 확인

### 9-C. 기존 SVG 있을 때 (기본 skip)

- 테스트 폴더에 `XL.ai` + `XL.svg` 둘 다 존재
- driveSync 스캔 → `XL`은 짝이 맞으므로 `unconvertedAiFiles`에 포함 **안 됨**
- 배너 자체가 뜨지 않음 (올바름)

→ 단, `driveSync`의 새 로직을 직접 유닛 테스트할 때 위 조건 확인.

### 9-D. 덮어쓰기 옵션 체크 시

- `XL.ai` + `XL.svg`(오래된 버전) 폴더 준비
- 배너가 안 뜨는 상황(9-C)이므로, 대신 모달에서 파일을 **직접 선택** 하는 시나리오는 Phase 3에서 지원
- **Phase 1에서는 배너 경로만 사용** — 짝이 없는 AI만 처리 대상
- 따라서 "덮어쓰기"는 Phase 1에서 사실상 **사용되지 않는 엣지 케이스** → Phase 2/3에서 본격 활용
- 단, UI 옵션으로는 노출하여 일관성 유지 (이유: 드물지만 AI→SVG 변환 후 디자이너가 SVG만 수정했다가 AI를 다시 내보낸 경우 충돌 가능)

### 9-E. 에러 시나리오

**E1. 헤더 읽기 실패 (파일 0바이트)**:
- 빈 파일 `broken.ai` 생성 → [헤더 분석]
- 결과: `kind: "unknown"` → [실행] 시 해당 파일 "FAIL"

**E2. PyMuPDF가 PDF 호환이라 주장하는 AI를 못 여는 경우** (희귀):
- `%PDF-` 헤더는 있지만 본문 손상된 파일
- 결과: PyMuPDF 예외 → status "FAIL" + error 메시지

**E3. 권한 없음 (읽기 전용 G드라이브)**:
- 읽기 전용 폴더에서 실행 → Python OSError
- 결과: Modal error 상태

**E4. Python 엔진 없음 (venv 미설치)**:
- venv 폴더 임시 rename → 실행
- Rust 측 에러 "Python venv를 찾을 수 없습니다" → service throw
- 모달 error 상태 + "setup-python.bat 실행" 힌트

**E5. 빈 폴더/파일 0개**:
- driveSync가 애초에 `unconvertedAiFiles`를 빈 배열로 반환 → 배너 안 뜸
- 엣지: 모달을 강제로 빈 files로 열면 → [헤더 분석] 결과 "대상 없음" 메시지

### 9-F. UX 검증 (tester 수동)

- ESC 키로 모달 닫기 (`converting` 제외)
- 백드롭 클릭으로 닫기 (`converting` 제외)
- `converting` 중 [닫기]/[취소] disabled 확인
- 완료 후 자동으로 PatternManage 배너가 사라짐 (짝 맞춘 AI들)
- 한글 경로 G드라이브 폴더에서 정상 동작 확인 (`공유 드라이브/디자인/...`)

---

## 10. 리스크 & 대응

| 리스크 | 영향도 | 가능성 | 대응 |
|--------|-------|-------|------|
| **G드라이브 경로의 한글/공백이 Python argv 인코딩 깨짐** | 높음 | 중 | 기존 `run_python`은 UTF-8 강제 — 신뢰. svg_normalizer가 이미 한글 경로 처리 중. 실 G드라이브 1회 수동 테스트 |
| **대용량 AI (50MB+)가 PyMuPDF 메모리 폭증** | 중 | 낮음 | Python 프로세스 격리로 앱 자체는 안전. 단일 파일 처리 중 OOM 시 해당 파일만 FAIL 처리. 외부 실측: 11KB SVG 생성 == 원본은 수MB 수준 |
| **`text_as_path=True`로 변환된 SVG가 표준 스키마 위반** | 중 | 중 | 변환 후 SVG 표준화(Phase 1-A)를 수동 실행으로 복구 가능. 두 파이프라인을 모두 가진 것이 보험 |
| **사용자가 변환 중 앱 종료** | 중 | 낮음 | Python atomic write(.tmp → rename)으로 파일 손상 방지. 이미 변환된 파일은 그대로 남고, 나머지는 다음 재실행에서 처리 |
| **Drive 스캔 `unconvertedAiFiles` 누락 — 폴더 순회 로직 실수** | 높음 | 중 | driveSync에 유닛 테스트 추가 (테스트 폴더에 `A.ai`, `A.svg`, `B.ai` 만 두고 `unconvertedAiFiles == [B.ai]` 검증) |
| **재스캔 쿨다운 60초가 완료 후 재스캔을 막음** | 중 | 높음 | `onComplete`에서 `lastAutoScanRef.current = 0` 강제 — SVG 표준화와 동일 패턴 |
| **PyMuPDF 버전에 따른 get_svg_image 차이** | 중 | 낮음 | requirements.txt에 PyMuPDF 버전 핀(현재 1.27.2 사용). 외부 검증된 환경 복제 |
| **배너가 스크롤 밑에 있어 놓침** | 낮음 | 중 | PatternManage header 바로 아래 고정 위치 + 눈에 띄는 노란 배경 (`var(--color-warn-bg)` 사용) |
| **짝이 없는 AI 판정이 잘못됨 (예: 파일명 미묘한 차이 `XL.ai` vs `XL (복사본).ai`)** | 중 | 중 | `path.basename(file, ext)` 정확 매칭 — 이름이 조금이라도 다르면 짝 아님. 엄격한 판정이 안전 |
| **PyMuPDF가 `%PDF-` 헤더 있어도 못 여는 에지 케이스** | 중 | 낮음 | FAIL로 분류 + error 메시지. Phase 2에서 해당 파일도 Illustrator COM으로 재시도 가능 |
| **한 배치에서 수십 개 파일 처리 중 한두 개만 실패** | 낮음 | 중 | 파일 단위 try/except — 하나 실패해도 나머지 계속 진행. 결과 화면에서 실패만 별도 목록 |

---

## 11. knowledge 업데이트 계획 (Phase 1-H)

### `architecture.md` 추가 1건

```markdown
### [2026-04-25] AI→SVG 자동 변환 Phase 1 구현 완료 — 반자동 UI + PyMuPDF 엔진
- **분류**: architecture
- **발견자**: planner-architect → developer
- **내용**: Phase 1 구현 완료. 신규 3파일: `python-engine/ai_converter.py`(~300줄, 헤더 10바이트 검사 + PyMuPDF text_as_path 변환 + atomic write), `src/services/aiConvertService.ts`(~130줄, Tauri invoke 래퍼), `src/components/AiConvertModal.tsx`(~450줄, 6상태 Phase 머신 idle/previewing/preview-done/converting/done/error). 신규 Rust 커맨드 2개(`ai_convert_preview`, `ai_convert_batch`)는 기존 `run_python` 재사용. `driveSync.ts`의 `.ai` 조용히 스킵 로직은 유지하되 병행하여 "SVG 짝이 없는 AI 수집" 로직 추가 — `ScanResult.data.unconvertedAiFiles: string[]`. PatternManage 상단에 배너 추가(짝 없는 AI 1개 이상일 때만 노출), 클릭 시 AiConvertModal 오픈. 실행 완료 시 `lastAutoScanRef.current = 0` 강제 무효화 후 `runAutoSync()` 트리거. PostScript AI(헤더 `%!PS-Adobe`)는 Phase 2에서 Illustrator COM으로 재처리. 변환 범위는 PDF 호환 AI 약 89%로 제한(외부 63개 실증에서 도출). svg_normalizer.py/svg_parser.py/grading.jsx 등 그레이딩 파이프라인 완전 무변경.
- **참조횟수**: 0
```

### `decisions.md` 추가 5건

1. **AI 파일 분기: 헤더 첫 10바이트 바이너리 검사 (%PDF- vs %!PS-Adobe)** — 외부 63개 실증, 파일 확장자 + try/except 거부
2. **미변환 AI 알림: PatternManage 상단 배너 (전역 헤더/토스트/Settings 거부)** — 도메인 일치 + 재진입 가능
3. **Rust 커맨드 신규 2개 추가 vs run_python 직접 호출** — SVG 표준화와 동일 결정 (타입 안전성 우선)
4. **변환 SVG 저장 위치: G드라이브 동일 폴더** — 별도 폴더/다운로드 거부. Drive 스캔이 자연스럽게 인식하도록
5. **충돌 처리: 기본 건너뜀 + 옵션 덮어쓰기 (.bak 백업)** — SVG 표준화 UX 패턴 재사용

### `lessons.md` 추가 (작업 완료 후, 새 교훈 발견 시)

- 외부 63개 실증에서 이미 도출된 교훈(`[2026-04-21]` 항목)은 이번 Phase 1에서 실제로 소비되는 지식 — 신규 추가는 구현 중 발견 시 반영

### `index.md` 갱신

- architecture.md 항목수 15 → 16
- decisions.md 항목수 31 → 36
- 최근 지식 최상단에 6건 추가

---

## 12. Phase 2 개요 (구현 완료 — 참고)

### Phase 2: PostScript AI 지원 (실제 ~2시간 소요)

> **상태**: ✅ 2026-04-25 구현 완료 (`f67d55d`). 아래는 결과 요약.

- **신규 파일**: `illustrator-scripts/ai_to_pdf.jsx` (181줄) — AI를 PDF 호환 .tmp.ai로 재저장
- **흐름 변경 (PLAN 11과 다름)**: `ai_converter.py`에 `_convert_postscript()` 추가하지 않음 → **프론트가 분기 호출**
  1. `convertPostScriptToTmp(psFiles)` 호출 → 파일별 `ai_to_pdf.jsx` 실행 → `.tmp.ai` 일괄 생성
  2. 성공한 `.tmp.ai`를 PDF 호환 AI 묶음에 합쳐 `convertAiBatch` 호출 (Phase 1 흐름 그대로)
  3. `finally`에서 `cleanupTmpFiles` 호출하여 `.tmp.ai` 정리
- **UX**: AiConvertModal에 "PostScript도 변환" 체크박스 (Illustrator 미설치 시 disable + 안내)
- **재사용**: Rust `find_illustrator_exe`/`run_illustrator_script` 그대로 사용. `ai_converter.py`/`lib.rs` 무수정
- **결정 근거**: `decisions.md` [2026-04-25] "AI→SVG Phase 2 흐름: 프론트 분기 호출"
- **남은 한계 (v1.0.2 검토)**: `.tmp.ai` 경로 결과 화면 노출(원본 매핑 미구현), converting sub-status 미표시, PS 실패 콘솔만

---

## 13. Phase 3 상세 설계 — 자동 백그라운드 변환 (옵트인)

> **목표**: Phase 1+2가 만든 변환 파이프라인을 **사용자 클릭 없이** 호출. 단, **옵트인**(기본 꺼짐).
> **예상 시간**: 2.5~3.5시간 (위험도 🟡 중간 — 동시성 제어 + 자동 OFF 가드 추가 필요)

### 13-0. 한 줄 요약 + 비유

> "Drive 스캔이 끝나면, 옵션이 켜져 있을 때만 **조용히 뒤에서** AI를 SVG로 바꿔놓는다. 사용자는 작업 중이라는 사실조차 몰라도 되지만, 알고 싶으면 PatternManage 배너의 작은 진행률 바로 볼 수 있다."

- **비유**: 호텔 룸서비스 자동 청소 옵트인. 체크인 시 "자동 청소 받겠음"에 체크하면 외출한 사이 청소가 끝나 있다. 끄면 직접 부르는 식(=Phase 1+2 그대로).

### 13-1. 사용자 확정 결정 9건 (재논의 금지)

decisions.md에 이미 옵트인 + 헤더 검사 + G드라이브 동일 폴더 저장이 결정됨. 이번 Phase 3에서 **추가 결정**한 9건:

| # | 질문 | 결정 | 거부된 대안 | 근거 |
|---|------|------|-----------|------|
| **Q1** | 옵트인 토글 위치 | **Settings 페이지에 "AI 자동 변환" 섹션 신설** (Drive 동기화 섹션 바로 아래) | (A) Drive 섹션 안 체크박스 1줄 추가 — Drive와 AI 변환은 다른 책임. (B) PatternManage 페이지 내부 — 설정 항목이 워크플로우 안에 박히면 발견성 저하 | UpdateSection 패턴 미러. "환경 설정" = Settings 통일 |
| **Q2** | 트리거 시점 | **Drive 스캔 완료 직후, `unconvertedAiFiles.length > 0`일 때 1회 시도** (b 채택) | (a) 앱 시작 시 — Drive 스캔 결과가 없는 시점이라 의미 없음. (c) 주기적 — 60초 쿨다운과 중복, 의미 없음. (d) 조합 — 복잡도만 증가 | Phase 1 배너 트리거 지점과 동일 — 자연스러운 확장 |
| **Q3** | UI 표시 | **PatternManage 배너 재활용 + 모드 전환** (배너 라벨/버튼 변경) | (A) 별도 토스트 — 놓치면 재진입 경로 없음. (B) Header 글로벌 진행률 — 다른 페이지 침범. (C) 무알림 — 사용자가 통제감 잃음 | 배너는 이미 "AI 변환 알림 영역" 도메인 — 자동 모드일 때만 라벨/버튼만 바뀌는 게 가장 적은 수정 |
| **Q4** | 일시 중지/취소 | **배너에 [중지] 버튼 노출 + 진행 중 파일 경계에서 안전 종료** | (A) 즉시 kill — atomic write 깨짐 위험. (B) 중지 불가 — 100개 파일 시작했는데 멈출 방법 없음 | "현재 파일 끝나면 그만"이 가장 안전 + 직관적 |
| **Q5** | 실패 처리 | **3연속 실패 시 자동 OFF + 알림 배너 + Settings 토글 OFF로 동기화** | (A) 무한 재시도 — 망가진 파일 1개로 영원히 루프. (B) 1실패 OFF — 지나치게 보수적 | 자체 중단 안전장치. 사용자가 다시 켜야 재가동 |
| **Q6** | Illustrator 미설치 | **PDF 호환 AI만 자동 변환, PostScript AI는 자동 모드에서 SKIP + Drive 스캔 결과에서 제외** | (A) 자동 모달 띄우기 — 옵트인 전제(조용함) 위배. (B) 전체 변환 차단 — PDF 89%까지 막히는 손해 | Phase 1+2 분기 흐름 그대로. PS 처리는 Phase 1 배너 경로로 사용자가 직접 |
| **Q7** | 동시성 제어 | **모듈 레벨 단일 뮤텍스 (`isAutoConverting` 플래그)** + 수동 모달이 열려있으면 자동 트리거 차단 | (A) 무제어 — 같은 파일 2번 쓰기, atomic 깨짐. (B) Rust 레벨 락 — 오버킬 | useAutoUpdateCheck 모듈 상태 패턴 재사용. 단일 인스턴스 앱이라 충분 |
| **Q8** | 코드 재사용 vs 분리 | **신규 훅 `useAutoAiConvert.ts`만 추가** (서비스/모달은 Phase 1+2 그대로 사용) | (A) `aiConvertService`에 `runBackgroundBatch` 추가 — UI 의존성이 service에 새는 안티패턴. (B) `backgroundAiConvertService` 분리 — 코드 중복 | service는 순수 함수, 훅이 정책(쿨다운/뮤텍스/배너 모드)을 담당. Modal은 Phase 1+2 수동 경로 전용 유지 |
| **Q9** | 기본값 + 첫 켤 때 동의 | **기본 OFF + 첫 ON 시 1회 동의 모달** (간단한 확인) | (A) 동의 모달 없음 — G드라이브 자동 쓰기는 한 번은 명시적 동의 필요. (B) 매번 확인 — 옵트인 의미 상실 | "한 번만 확실히, 이후엔 조용히" — Tauri Updater "나중에" UX와 동일 철학 |

### 13-2. 시스템 흐름도 (Phase 3 전용)

```
┌─────────────────────────────┐
│ Settings: AI 자동 변환 토글 │
│   - 기본 OFF                │
│   - 첫 ON 시 동의 모달       │
└──────────┬──────────────────┘
           │ settings.aiAutoConvertEnabled
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ PatternManage.runAutoSync() 끝부분                                   │
│   1) scanResult.unconvertedAiFiles 확보                              │
│   2) settings.aiAutoConvertEnabled === true ?                       │
│   3) AND aiConvertTargets === null (수동 모달 안 열림) ?           │
│   4) AND useAutoAiConvert의 isAutoConverting === false ?           │
│   5) AND 자동 OFF 가드 통과 (3연속 실패 아님)?                     │
│   → 모두 통과: scheduleAutoConvert(unconvertedAiFiles)              │
└──────────┬──────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ useAutoAiConvert (신규 훅)                                           │
│   상태머신: idle → preparing → converting → done | error | aborted   │
│                                                                      │
│   converting 단계:                                                   │
│     1) findIllustratorExe() → null이면 PS 파일 사전 제외            │
│     2) PS 파일 있으면 convertPostScriptToTmp() (Illustrator 있을 때)│
│     3) convertAiBatch(allFiles, overwrite=false)                    │
│     4) cleanupTmpFiles                                               │
│     5) lastAutoScanRef.current = 0; runAutoSync()  (재스캔)         │
│                                                                      │
│   실패 카운터: failCount++ → 3 도달 시 setAutoEnabled(false) + 알림  │
└──────────┬──────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────┐    ┌─────────────────────────────┐
│ PatternManage 배너 (모드 2) │    │ Settings 섹션 — 마지막 결과 │
│   "🔄 AI 자동 변환 중      │    │   "마지막 변환: 5/5 성공     │
│    (3/12) [중지]"           │    │    2026-04-26 14:22"        │
│                             │    │   [수동 변환] / [토글 ON]    │
│  - 진행 중: 회전 아이콘     │    └─────────────────────────────┘
│  - 완료: "✅ 5개 변환 완료"
│  - 실패: "⚠️ 자동 변환이 │
│    실패하여 꺼졌습니다"     │
└─────────────────────────────┘
```

### 13-3. 신규/수정 파일 목록

#### 신규 (3개)

| 경로 | 역할 | 예상 줄수 |
|------|------|---------|
| `src/hooks/useAutoAiConvert.ts` | 모듈 상태 + 구독자 패턴(useAutoUpdateCheck.ts 미러). 자동 변환 정책: 뮤텍스/실패 카운터/Abort 신호/배너 모드 게시 | ~180 |
| `src/components/AutoConvertConsentModal.tsx` | 첫 ON 시 1회 동의 모달 (G드라이브 직접 쓰기 + 백그라운드 동작 안내). UpdateModal 구조 미러 | ~120 |
| `PLAN-AI-TO-SVG.md` 13장 | 본 설계 문서 | (이 파일) |

#### 수정 (4개)

| 경로 | 변경 내용 | 예상 변경량 |
|------|----------|----------|
| `src/types/pattern.ts` | `AppSettings`에 `aiAutoConvertEnabled?: boolean` + `aiAutoConvertConsent?: boolean` 2개 필드 추가 | +4줄 |
| `src/stores/settingsStore.ts` | `setAiAutoConvertEnabled(b)` + `setAiAutoConvertConsent(b)` 두 setter 추가 (기존 `setDriveSyncEnabled` 패턴 그대로) + DEFAULT_SETTINGS 갱신 | +30줄 |
| `src/pages/Settings.tsx` | "AI 자동 변환" 섹션 추가 (UpdateSection 옆). 토글, 마지막 결과 표시, [수동 변환 페이지로] 버튼 | +90줄 |
| `src/pages/PatternManage.tsx` | (1) `runAutoSync` 끝부분에 `scheduleAutoConvert` 호출 추가, (2) 배너 컴포넌트에 자동 모드 분기 + 진행률/중지 버튼, (3) `useAutoAiConvert` 구독 | +60줄 |

#### 변경 없음 (Phase 1+2 자산 재사용)

- `python-engine/ai_converter.py` (437줄)
- `python-engine/main.py` CLI 라우터
- `src-tauri/src/lib.rs` (`ai_convert_*` 커맨드 그대로)
- `src/services/aiConvertService.ts` (240줄, 모든 함수 그대로 호출)
- `src/services/driveSync.ts` (`scanDriveRoot` 결과 그대로)
- `src/components/AiConvertModal.tsx` (수동 경로 전용, Phase 3에서도 등장)
- `illustrator-scripts/ai_to_pdf.jsx`

> **재사용 원칙**: Phase 3는 "정책 레이어 1개 추가"일 뿐, 변환 엔진/UI 모달은 단 한 줄도 안 바뀐다.

### 13-4. `useAutoAiConvert` 훅 — 핵심 설계

#### 모듈 상태 (싱글톤)

```typescript
// 비유: 식당 주방 화이트보드 1장 — 누가 작업 중인지/실패 몇 번인지 한 곳에 적어둠
type AutoConvertMode = "idle" | "preparing" | "converting" | "done" | "error" | "aborted";

interface AutoConvertState {
  mode: AutoConvertMode;
  current: number;       // 진행 중 인덱스 (1-based, 사용자 표시용)
  total: number;
  lastResult: { ok: number; skip: number; fail: number; finishedAt: string } | null;
  failCountConsecutive: number;  // 3 도달 시 자동 OFF
  lastError: string | null;
}
```

#### 외부 API (3개만 노출)

```typescript
export function useAutoAiConvert(): AutoConvertState;  // 구독 전용
export function scheduleAutoConvert(files: string[]): void;  // PatternManage가 호출
export function abortAutoConvert(): void;  // 배너 [중지] 버튼이 호출
```

#### 정책 (동시성/실패/중지)

1. **뮤텍스**: `if (state.mode === "converting" || state.mode === "preparing") return;` — 중복 호출 무시
2. **수동 모달과의 충돌 방지**: `scheduleAutoConvert`가 호출되기 전에 `aiConvertTargets !== null`이면 PatternManage가 호출 자체를 차단 (게이트 책임은 호출자에)
3. **AbortSignal**: `let aborter = new AbortController();` 모듈 변수. 파일 1개 변환 끝날 때마다 `if (aborter.signal.aborted) break;`
4. **실패 카운터**: `convertAiBatch` 결과 `fail >= 1`이면 `failCountConsecutive++`. `=== 3`이면 `setAiAutoConvertEnabled(false)` + `mode='error'` + 사용자 알림 배너
5. **성공 시 카운터 리셋**: `fail === 0`이면 `failCountConsecutive = 0`
6. **재스캔 트리거**: `mode='done'` 직전에 PatternManage가 등록한 콜백(`onComplete`) 호출 → `lastAutoScanRef.current = 0; runAutoSync()` (배너가 비워지거나 다음 미변환 사이클 진입)

#### Illustrator 미설치 분기 (Q6)

```typescript
// scheduleAutoConvert 내부 preparing 단계
const illustratorPath = await findIllustratorExe();
const psFiles = files.filter(f => /* 헤더 검사는 service가 알아서 함 — 분류는 previewAiConversion으로 */);
// 정확히는: previewAiConversion(files)로 먼저 PDF/PS/unknown 분류
const preview = await previewAiConversion(files);
const pdfTargets = preview.entries.filter(e => e.kind === "pdf_compatible").map(e => e.absPath);
const psTargets = preview.entries.filter(e => e.kind === "postscript").map(e => e.absPath);

if (illustratorPath && psTargets.length > 0) {
  // PS 변환 후 합치기
} else {
  // PDF만 처리 — PS는 다음 사이클에 사용자가 수동 모달에서 처리하게 둠
}
```

### 13-5. PatternManage 배너 — 모드 분기

```
┌──────────────────────────────────────────────────────────────────┐
│ 모드 A (Phase 1+2 — 기존):                                       │
│ "📋 변환되지 않은 AI 파일 5개가 있습니다.    [자동 변환 →]"      │
│  → 클릭 시 AiConvertModal 열림                                   │
│                                                                  │
│ 모드 B (Phase 3 자동 진행 중 — 신규):                            │
│ "🔄 AI 자동 변환 중 (3/12)        [중지]"                        │
│  → progress bar 12 중 3                                          │
│                                                                  │
│ 모드 C (Phase 3 완료 직후 — 신규, 5초간 표시 후 자동 사라짐):    │
│ "✅ AI 5개 자동 변환 완료"                                       │
│                                                                  │
│ 모드 D (Phase 3 자동 OFF 발동 — 신규):                           │
│ "⚠️ 자동 변환이 3회 실패하여 꺼졌습니다.   [Settings 열기]"     │
└──────────────────────────────────────────────────────────────────┘
```

- **모드 결정 로직**: `useAutoAiConvert().mode` + `unconvertedAi.length` 조합
  - mode='converting' → B
  - mode='done' → C (5초 타이머)
  - mode='error' → D
  - 그 외 + unconvertedAi > 0 → A (Phase 1 그대로)

### 13-6. 단계별 작업 목록 (Phase 1과 일관된 형식)

| 단계 | 작업 | 담당 | 선행 조건 | 예상 |
|------|------|------|----------|------|
| **3-A** | `AppSettings` 타입 + `settingsStore` setter 2개 추가 | developer | 없음 | 15분 |
| **3-B** | `useAutoAiConvert.ts` 신규 훅 작성 (모듈 상태/뮤텍스/실패 카운터/Abort) | developer | 3-A | 60분 |
| **3-C** | `AutoConvertConsentModal.tsx` 신규 (첫 ON 시 1회) | developer | 3-A | 30분 |
| **3-D** | `Settings.tsx`에 "AI 자동 변환" 섹션 추가 (토글/동의 모달 트리거/마지막 결과/Settings에서 [수동 변환 시작] 링크) | developer | 3-A, 3-B, 3-C | 40분 |
| **3-E** | `PatternManage.tsx` 통합 (배너 모드 분기 + `runAutoSync` 끝부분 `scheduleAutoConvert` 호출 + 수동 모달과 뮤텍스) | developer | 3-B | 40분 |
| **3-F** | `App.css` BEM 추가 (`.pattern-manage__ai-banner--auto`/`--done`/`--error` + 진행률 바 + Settings 섹션) | developer | 3-E | 20분 |
| **3-G** | tsc + 수동 시나리오 검증 (옵트인 OFF 동작 / 첫 ON 동의 / PS 미설치 / 3연속 실패 / [중지]) | tester | 3-A~3-F | 30분 |
| **3-H** | knowledge 갱신 (architecture + decisions Q1~Q9 9건) + 커밋 | pm | 3-G | 15분 |

**합계**: 약 **3시간 30분** (위험도 🟡 중간 — 동시성 제어 + 자동 OFF 가드)

> **병렬 가능성**: 3-B와 3-C는 독립이므로 동시 작업 가능. 3-F는 3-E 직후 곧장.

### 13-7. 테스트 시나리오 (3-G용)

| 시나리오 | 사전 조건 | 기대 동작 |
|---------|---------|---------|
| **T1** 옵트인 OFF (기본) | settings.aiAutoConvertEnabled = false | Phase 1+2 동작과 100% 동일. 배너 클릭으로만 변환 |
| **T2** 첫 ON | 토글 OFF→ON 전환 | AutoConvertConsentModal 1회 표시 → "동의 후 활성화" → settings.aiAutoConvertConsent = true → 다음 Drive 스캔 시 자동 시작 |
| **T3** 정상 자동 변환 | ON + unconvertedAi 5개 | 배너 모드 B → 5개 변환 완료 → 모드 C 5초 → 사라짐 → Drive 재스캔 |
| **T4** Illustrator 미설치 + PS 섞임 | ON + 5 PDF + 2 PS | PDF 5개만 자동 변환. PS 2개는 다음 사이클에 사용자가 수동(Phase 1 배너 모드 A)으로 처리 |
| **T5** [중지] 버튼 | 변환 중 클릭 | 현재 파일 끝나는 즉시 mode='aborted' → 배너 사라짐 |
| **T6** 3연속 실패 자동 OFF | 일부러 깨진 AI 3개 | 매 사이클마다 fail 발생 → 3회째 mode='error' + Settings 토글 OFF + 모드 D 배너 |
| **T7** 수동 모달 충돌 방지 | AiConvertModal 열린 상태에서 Drive 재스캔 | scheduleAutoConvert 차단 (모달 닫을 때까지 대기) |
| **T8** 동시 진행 충돌 방지 | 변환 중에 다시 runAutoSync 발동 (60초 후) | 뮤텍스로 무시 |

### 13-8. 리스크 & 대응

| 리스크 | 대응 |
|-------|------|
| 사용자가 옵트인 끈 적 없음에도 자동 변환이 의도치 않게 발동 | 기본 OFF + Settings에 토글 상시 노출 + 첫 ON 시 동의 모달 1회 + 자동 OFF 발동 시 배너 안내 |
| Drive 60초 쿨다운과 자동 변환 동시 충돌 | `runAutoSync`가 이미 쿨다운 가드 보유 → 그 끝부분에서만 자동 변환 트리거하므로 자연 직렬화 |
| atomic write 도중 [중지] | AbortController는 **다음 파일 시작 전**에만 체크. 실행 중 파일은 끝까지 완주 |
| 사용자가 PatternManage 떠나면 진행 중단? | 모듈 상태이므로 페이지 이동해도 변환 계속됨. mode='done' 시 다음 PatternManage 진입 시 모드 C 배너 표시 (5초 후 사라짐) |
| Illustrator 설치 상태가 실행 중에 바뀜 | 매 사이클 `findIllustratorExe()` 재호출 (캐시 안 함) |
| 첫 ON 시 사용자가 동의 모달 강제 종료 | aiAutoConvertConsent=false 유지 + 토글도 false로 되돌림 |

### 13-9. knowledge 갱신 계획 (3-H)

`decisions.md`에 추가 9건 (Q1~Q9 매핑):
1. Phase 3 옵트인 토글 위치 = Settings AI 자동 변환 섹션 신설
2. Phase 3 트리거 = Drive 스캔 직후 1회 (앱 시작/주기적 거부)
3. Phase 3 UI = PatternManage 배너 재활용 (4모드)
4. Phase 3 중지 = 파일 경계 안전 종료 (즉시 kill 거부)
5. Phase 3 실패 처리 = 3연속 실패 시 자동 OFF
6. Phase 3 Illustrator 미설치 = PDF만 자동, PS는 다음 사이클 수동
7. Phase 3 동시성 = 모듈 레벨 단일 뮤텍스 + 수동 모달과 게이트
8. Phase 3 코드 분리 = 신규 훅만 추가, service/Modal 무수정
9. Phase 3 기본값 = OFF + 첫 ON 시 동의 모달

`architecture.md`에 추가 1건:
- "AI→SVG Phase 3 옵트인 자동 백그라운드 변환 — 신규 훅 1개 + Consent 모달 1개 + Settings 섹션 + PatternManage 배너 모드 분기 + Phase 1+2 엔진 100% 재사용"

### 13-10. 커밋 전략 (Phase 1+2 패턴 미러)

| 커밋 | 범위 | 시점 |
|------|------|------|
| **E**: `feat(ai-convert): Phase 3 자동 백그라운드 변환 (옵트인) — 훅+Consent+Settings+배너 모드` | 3-A~3-F + 3-G 통과 후 | 단일 커밋 (훅+UI 상호 의존) |
| **F**: `docs(ai-convert): Phase 3 종결 — knowledge 갱신` | 3-H | 분리 커밋 (기능과 문서 분리) |

---

## 부록 A. 용어집 (바이브 코더용)

| 용어 | 의미 |
|-----|------|
| **AI 파일** | Adobe Illustrator 파일. 확장자 `.ai`. 디자이너 원본 |
| **SVG** | 웹 표준 벡터 파일. grader가 이해하는 유일한 포맷 |
| **PDF 호환 모드 AI** | Illustrator에서 저장할 때 "PDF 호환 파일 만들기" 옵션이 켜진 AI. 헤더 `%PDF-` — PyMuPDF로 읽을 수 있음 |
| **PostScript AI** | Illustrator에서 PDF 호환을 끄고 저장한 AI. 헤더 `%!PS-Adobe` — Adobe 전용 포맷이라 PyMuPDF/Inkscape/Ghostscript 모두 못 읽음 |
| **PyMuPDF** | Python PDF 처리 라이브러리. `page.get_svg_image()` 로 벡터를 SVG로 변환 가능 |
| **text_as_path** | PyMuPDF 옵션. 글자를 path(선 그림)로 변환하여 폰트 없이도 모양 유지 |
| **헤더 10바이트** | 파일 첫 10바이트. 포맷 판별용. `%PDF-1.4...` 또는 `%!PS-Adobe-3...` 같은 문자열 |
| **반자동** | "자동이지만 사용자 클릭으로 시작" — 완전 자동이 아니라 투명성 우선 |
| **.bak 파일** | 원본 백업. 덮어쓰기 시 안전장치 |
| **배너** | 페이지 상단 눈에 띄는 알림 영역. 이메일 앱의 "10개 새 메일" 알림과 같은 역할 |
| **Phase 머신** | 모달 UI가 내부적으로 가지는 6가지 상태와 그 전환 규칙. 신호등처럼 한 번에 한 색만 |
| **atomic write** | `.tmp` 파일에 먼저 쓰고 성공 시 원본으로 rename. 중간 종료돼도 파일 손상 없음 |
| **CLI 커맨드** | Python main.py의 첫 인자 (예: `normalize_batch`). Rust에서 string으로 전달 |

---

## 부록 B. 변경 없는 파일 (보존 대상)

이 계획의 구현 과정에서 **절대 수정하지 않을** 파일. PR/커밋 검토 시 diff 0줄 확인.

- `python-engine/svg_normalizer.py` (950줄)
- `python-engine/svg_parser.py`, `pdf_grader.py`, `pattern_scaler.py` (그레이딩 파이프라인)
- `python-engine/pdf_handler.py`, `order_parser.py`
- `illustrator-scripts/grading.jsx` (v2 1585줄)
- `src-tauri/tauri.conf.json` — Phase A 자동 업데이트 설정 보존 (resources는 sync 스크립트가 자동 처리)
- `src-tauri/capabilities/default.json` — shell 권한 확장 불필요
- `src/pages/OrderGenerate.tsx`, `src/pages/WorkSetup.tsx` (다른 페이지 영향 없음)
- `src/components/SvgStandardizeModal.tsx`, `src/services/svgStandardizeService.ts` (형제 기능, 독립)
- `src/components/UpdateModal.tsx`, `src/services/updaterService.ts` (자동 업데이트)

---

## 부록 C. 외부 검증 기록 (2026-04-20)

이 계획의 변환 로직은 **외부에서 이미 63개 실전 검증 완료**.

- **총 파일**: 63개 (G드라이브 디자인/00. 2026 커스텀용 패턴 SVG 대조)
- **PyMuPDF 성공**: 56개 (89%) — 헤더 `%PDF-`
- **Illustrator COM 성공**: 7개 (11%) — 헤더 `%!PS-Adobe`, PDF 재저장 후 PyMuPDF
- **최종 성공률**: 63/63 = **100%**
- **총 소요 시간**: 1분 32초 (PyMuPDF 79초 + Illustrator 12초 + 오버헤드)
- **평균 파일 크기**: 변환 후 SVG ~11KB (기존 SVG와 동일 수준)

Phase 1 은 PyMuPDF 56/63(89%) 부분을 앱에 내장합니다. 나머지 7개(11%)는 Phase 2에서 처리.

---

> 총 라인 수: ~620 (작성 완료 시)
> 선행 검증: 외부 63개 AI 변환 100% 성공 (2026-04-20)
> 재사용 기반: SVG 표준화 Phase 1 3층 구조 (Python ← Rust ← React) 완전 미러
> 이 계획서 승인 후 **커밋 A(엔진) → B(UI) → C(docs) 순서**로 구현
