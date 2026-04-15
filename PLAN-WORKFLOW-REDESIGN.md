# 📋 grader 앱 전체 작업 흐름 재설계 — 상세 구현 계획

**작성일**: 2026-04-15
**작성자**: planner-architect
**상태**: 계획 단계 (사용자 의사결정 대기)
**예상 작업량**: 8~12 작업일 (Phase 1~6)

---

## 0. 왜 이 재설계가 필요한가

### 지금 쓰는 구조가 맞지 않는 이유

현재 앱은 "**프리셋 중심**"이다. 패턴도 프리셋, 디자인도 프리셋으로 앱 내부 저장소(`$APPDATA/`)에 쌓아두고 **여러 번 재사용**한다는 가정으로 만들어졌다.

그런데 실제 사용 패턴은 이렇다:

- **디자인**은 매번 다르다. "민호초 농구부" 디자인을 한 번 그레이딩한 뒤 두 번째 쓸 일이 없다 → 프리셋으로 등록해봐야 쓰레기만 쌓인다.
- **작업 폴더**가 이미 디자이너 측에 있다. `G:\공유드라이브\주문\2026-04-14 민호초` 같은 식으로. 여기에 결과물을 돌려줘야 하는데, 앱은 제 맘대로 `$APPDATA/outputs/{타임스탬프}/`에 숨겨둔다.
- **패턴**은 정말 재사용한다. "U넥 스탠다드 암홀X" 같은 건 수백 번 쓴다. 이건 지금처럼 Drive 폴더에서 동기화해 오는 게 맞다.

### 비유

> 지금 앱은 **음식 재료 창고** 같다 — "재료(디자인)를 창고에 넣어두었다가 꺼내 쓰세요"
> 바꾸고 싶은 앱은 **배달 주방** 같다 — "재료(디자인)는 주문마다 받아오고, 도구(패턴)만 주방에 상비"

### 재설계의 핵심 3가지

1. **작업(세션) 중심으로 전환** — 1회성 작업에 필요한 "작업 폴더 + 기준 AI 파일"을 사용자가 매번 지정하고, 앱은 저장하지 않는다.
2. **기준 파일을 PDF에서 AI로** — Illustrator를 이미 백엔드에서 쓰고 있으니 프론트 입력도 AI로 통일.
3. **사이드바를 4단계 → 3단계로** — 디자인 등록 제거, 주문서+파일생성 통합.

---

## 1. 현재 구조 정밀 조사

### 1.1 라우팅 (`src/main.tsx`)

```
/              → Navigate → /pattern
/pattern       → PatternManage   (1단계)
/design        → DesignUpload    (2단계)
/size          → SizeSelect      (3단계)
/generate      → FileGenerate    (4단계)
/settings      → Settings
```

### 1.2 사이드바 (`src/components/Sidebar.tsx` L9~14)

```ts
const navItems = [
  { path: "/pattern",  step: "1", label: "패턴 관리",    icon: "✂" },
  { path: "/design",   step: "2", label: "디자인 등록",  icon: "🎨" },
  { path: "/size",     step: "3", label: "사이즈 선택",  icon: "📏" },
  { path: "/generate", step: "4", label: "파일 생성",    icon: "📄" },
];
```

### 1.3 페이지별 책임

| 페이지 | 핵심 데이터 | 저장 방식 | 핵심 함수 |
|-------|------------|----------|----------|
| PatternManage | presets[], categories[] | `$APPDATA/presets.json`, `categories.json` + Drive 자동 동기화 | `loadPresets/savePresets`, `scanDriveRoot`, `mergeDriveScanResult` |
| DesignUpload | designs[] | `$APPDATA/designs.json` + `$APPDATA/designs/{id}.pdf` + `$APPDATA/designs/{id}.preview.png` | `loadDesigns/saveDesigns`, `copyPdfToAppData`, `run_python get_pdf_info/verify_cmyk/analyze_color/generate_preview` |
| SizeSelect | selectedPresetId, selectedDesignId, baseSize, selectedSizes | sessionStorage `grader.generation.request` | `saveGenerationRequest`, `run_python parse_order` |
| FileGenerate | results[], outputDir | `$APPDATA/outputs/{timestamp}/` | `find_illustrator_exe`, `run_illustrator_script`, `write_file_absolute` |

### 1.4 데이터 흐름 (현재)

```
┌─────────────┐   presets.json  ┌──────────────┐   designs.json  ┌──────────┐   sessionStorage   ┌──────────────┐
│PatternManage│ ──────────────> │ (storage)    │ <────────────── │DesignUp- │                    │ SizeSelect   │
│             │                 └──────────────┘                 │load      │                    │              │
└─────────────┘                                                  └──────────┘                    │  presetId    │
                                                                                                 │  designFileId│ ───┐
                                                                                                 │  baseSize    │    │
                                                                                                 │  selected[]  │    │
                                                                                                 └──────────────┘    │
                                                                                                                     v
                                                                                                 ┌──────────────────────┐
                                                                                                 │ FileGenerate         │
                                                                                                 │  run_illustrator_    │
                                                                                                 │   script             │
                                                                                                 │ $APPDATA/outputs/... │
                                                                                                 └──────────────────────┘
```

### 1.5 Rust 커맨드 (`src-tauri/src/lib.rs`)

- `run_python(command, args) -> String` (L86)
- `find_illustrator_exe() -> String` (L149)
- `run_illustrator_script(exe, script_path, result_json_path, timeout_secs) -> String` (L212)
- `get_illustrator_scripts_path() -> String` (L298)
- `write_file_absolute(path, content)` (L307)
- `read_file_absolute(path)` (L314)
- `remove_file_absolute(path)` (L321)

### 1.6 grading.jsx 입력 (config.json)

`grading.jsx::readConfig()` (L198~238) 기대 필드:

```js
{
  patternSvgPath: string,   // 필수 — 타겟 사이즈 패턴 SVG 임시 경로
  outputPath: string,       // 필수 — .pdf 또는 .eps (확장자로 형식 자동 판별)
  resultJsonPath: string,   // 필수 — 완료 마커 파일 경로
  patternLineColor: "auto"|"keep"|"white"|"black",
  designAiPath?: string,    // AI 파일 (우선)
  designPdfPath?: string,   // PDF 폴백
}
```

`resolveDesignFile()` (L627~649): AI 파일 있으면 AI 사용, 없거나 못 찾으면 PDF로 폴백.

### 1.7 출력 경로 (현재)

```
$APPDATA/com.grader.app/outputs/2026-04-15_14-32-05/
    ├── _preset.json       (Python 폴백 경로에서만 생성)
    └── {designName}_{size}.eps
```

---

## 2. 새 구조 설계

### 2.1 라우팅 (신규)

```
/              → Navigate → /work
/work          → WorkSetup       (1단계: 작업 선택)      ← 신규
/pattern       → PatternManage   (2단계: 패턴)          ← 리네임+기능
/generate      → OrderGenerate   (3단계: 주문서+생성)    ← 신규 (Size+Gen 통합)

/settings      → Settings  (그대로)

# deprecated — 호환 유지용 리다이렉트
/design  → Navigate → /work   (이전 링크 깨짐 방지)
/size    → Navigate → /generate
```

### 2.2 사이드바 (신규)

```ts
const navItems = [
  { path: "/work",     step: "1", label: "작업 선택", icon: "📁" },
  { path: "/pattern",  step: "2", label: "패턴",     icon: "✂" },
  { path: "/generate", step: "3", label: "파일 생성", icon: "📄" },
];
```

**차이점**:
- "패턴 관리" → **"패턴"** (간결)
- "디자인 등록" **제거** (작업 선택에 흡수)
- "사이즈 선택" + "파일 생성" **통합** → "파일 생성" 1개

### 2.3 새 페이지 설계

#### 2.3.1 WorkSetup (`src/pages/WorkSetup.tsx` 신규)

**비유**: "배달 주방의 주문 접수대" — 주문 한 건당 "어디로 배달(작업 폴더)"할지, "재료(기준 AI)"가 뭔지를 기록한다.

**UI 구조**:

```
┌─ 작업 선택 ────────────────────────────────┐
│                                           │
│ 📁 작업 폴더                               │
│ [G:\공유드라이브\주문\2026-04-14 민호초] [찾기]│
│                                           │
│ 🎨 기준 AI 파일                            │
│ [G:\...\민호초 농구부 2026.ai]    [찾기]    │
│                                           │
│ ⓘ 안내: 그레이딩 결과물은 작업 폴더 아래에 │
│   자동 저장됩니다.                         │
│                                           │
│ [다음: 패턴 선택 →]                        │
└───────────────────────────────────────────┘
```

**핵심 동작**:

```typescript
import { open } from "@tauri-apps/plugin-dialog";

// 작업 폴더 선택
async function handlePickFolder() {
  const dir = await open({ directory: true, multiple: false });
  if (dir) setWorkFolder(dir as string);
}

// 기준 AI 파일 선택
async function handlePickAi() {
  const file = await open({
    multiple: false,
    filters: [{ name: "Adobe Illustrator", extensions: ["ai"] }],
  });
  if (file) setBaseAiPath(file as string);
}

// 다음 단계
function handleNext() {
  if (!workFolder || !baseAiPath) return;
  saveWorkSession({ workFolder, baseAiPath, createdAt: Date.now() });
  navigate("/pattern");
}
```

**상태**: `workFolder`, `baseAiPath` 2개만. 복잡한 로드/저장 로직 없음. 복사 안 함, 미리보기 생성 안 함.

#### 2.3.2 PatternManage → Pattern (기존 파일 유지 + 수정)

**유지할 것**: 카테고리 트리, Drive 자동 동기화, 프리셋 카드 목록, 편집 UI 전체.

**추가/수정할 것**:

| 항목 | 변경 |
|------|------|
| page 타이틀 | "패턴 관리" → "패턴" |
| 사이드바 라벨 | "패턴 관리" → "패턴" |
| 프리셋 카드 | 클릭 시 **선택 표시** (기존은 편집 진입) |
| 카드 우측 상단 | **⭐ 즐겨찾기 토글 버튼** 추가 |
| 페이지 상단 | **"⭐ 즐겨찾기만" 필터 토글** 추가 |
| 카테고리 트리 최상단 | "⭐ 즐겨찾기" 가상 카테고리 추가 |
| 하단 고정 바 | **"다음: 파일 생성 →" 버튼** (선택된 프리셋 있을 때 활성화) |
| 편집/삭제 | Drive 프리셋은 기존처럼 비활성화(읽기전용) 유지 |

**선택 흐름**:

```typescript
// 기존: 카드 클릭 → 편집 모드 진입
// 신규: 카드 클릭 → 선택 (session.selectedPresetId = preset.id)
//       편집/삭제는 카드 내 별도 버튼으로만 (local 프리셋에 한함)

function handleCardClick(preset: PatternPreset) {
  setSelectedPresetId(preset.id);
  updateWorkSession({ selectedPresetId: preset.id });
}

function handleNext() {
  const sess = loadWorkSession();
  if (!sess?.selectedPresetId) return;
  navigate("/generate");
}
```

#### 2.3.3 OrderGenerate (`src/pages/OrderGenerate.tsx` 신규 — 기존 SizeSelect + FileGenerate 통합)

**비유**: "주문서 접수 → 즉시 조리 → 포장" 한 창구. 재료(패턴/AI)는 이전 단계에서 이미 골랐으니 여기서는 수량만 확정하고 바로 만든다.

**UI 구조 (1화면 스크롤)**:

```
┌─ 파일 생성 ─────────────────────────────────┐
│ 작업 폴더: G:\...\2026-04-14 민호초         │
│ 기준 AI:   민호초 농구부 2026.ai            │
│ 패턴:      농구_U넥_암홀X                   │
│                                           │
│ ▼ 사이즈 선택                              │
│   [📊 주문서 불러오기 (.xlsx)]             │
│   또는 수동:                               │
│   ☐2XS ☐XS ☑S ☑M ☑L ☑XL ☐2XL ...          │
│                                           │
│   기준 사이즈: [L ▼]  (디자인이 그려진 크기)│
│                                           │
│ ▼ 생성                                     │
│   [파일 생성 시작]                         │
│                                           │
│ ▼ 결과                                     │
│   S ✓ 완료  → 민호초_농구부_2026_S.eps     │
│   M ✓ 완료  → 민호초_농구부_2026_M.eps     │
│   L ✓ 완료  → 민호초_농구부_2026_L.eps     │
│   [📂 작업 폴더 열기]                      │
└───────────────────────────────────────────┘
```

**핵심 로직 변화 (FileGenerate 대비)**:

| 항목 | 기존 FileGenerate | 신규 OrderGenerate |
|------|------------------|-------------------|
| 입력 데이터 | `GenerationRequest` (presetId, designFileId) | `WorkSession` (workFolder, baseAiPath, selectedPresetId) |
| 디자인 출처 | `design.storedPath` (AppData 복사본) | `session.baseAiPath` (사용자 원본 AI) |
| 디자인 형식 | AI or PDF (storedPath 확장자 분기) | **항상 AI** (PDF 분기 제거) |
| 출력 폴더 | `$APPDATA/outputs/{timestamp}/` | **`session.workFolder/grader-output/`** |
| 출력 파일명 | `{sanitize(design.name)}_{size}.eps` | `{sanitize(baseAiName)}_{size}.eps` |
| Python 폴백 | 있음 (Illustrator 없으면 Python) | **제거** (AI는 Python 처리 불가) |
| config.json | `designAiPath` or `designPdfPath` 분기 | 항상 `designAiPath = session.baseAiPath` |

---

## 3. 데이터 모델 변경

### 3.1 신규: WorkSession

`src/types/session.ts` 신규 파일:

```typescript
/**
 * 1회성 작업 세션 정보.
 * sessionStorage에 저장. 앱 종료 또는 "새 작업" 클릭 시 소멸.
 */
export interface WorkSession {
  /** 작업 폴더 절대 경로 (결과물이 저장될 곳) */
  workFolder: string;
  /** 기준 AI 파일 절대 경로 */
  baseAiPath: string;
  /** 선택된 패턴 프리셋 ID (2단계에서 설정) */
  selectedPresetId?: string;
  /** 주문서 파일 경로 (선택, 3단계에서 업로드) */
  orderFilePath?: string;
  /** 세션 생성 시각 */
  createdAt: number;
}
```

### 3.2 신규: sessionStore

`src/stores/sessionStore.ts` 신규:

```typescript
import type { WorkSession } from "../types/session";
const STORAGE_KEY = "grader.session";

export function loadWorkSession(): WorkSession | null { ... }
export function saveWorkSession(s: WorkSession): void { ... }
export function updateWorkSession(patch: Partial<WorkSession>): void { ... }
export function clearWorkSession(): void { ... }
```

generationStore와 같은 패턴(sessionStorage + JSON).

### 3.3 폐기: designStore / designs.json / designs/*.pdf

**방침**: **완전 폐기** (권장안) — 이유: 1회성 세션이므로 앱 저장소에 복사할 이유가 사라진다.

- `src/stores/designStore.ts` → **삭제**
- `src/types/design.ts` → **삭제** (또는 최소 타입만 남김)
- `src/pages/DesignUpload.tsx` → **삭제**
- `$APPDATA/designs.json` / `$APPDATA/designs/` → 사용자 안내 후 수동 정리 권장 (마이그레이션 스크립트 불필요, 앱이 더 이상 읽지 않으면 그만)

### 3.4 즐겨찾기 저장 방식

**3가지 옵션**:

| 옵션 | 구현 난이도 | 장점 | 단점 |
|------|-----------|------|------|
| A. `favorites.json` 신규 | 낮음 | 독립적, 마이그레이션 걱정 없음 | 파일 3개 읽기(presets+categories+favorites) |
| B. `PatternPreset.isFavorite: boolean` | 중 | 구조 단순 | Drive 자동 동기화 시 덮어쓰기 위험(어떻게 보존할지 규칙 필요) |
| C. `settings.json`에 `favoritePresetIds: string[]` | 낮음 | 설정 저장소 재사용 | 설정과 성격 다름 |

**권장안**: **옵션 A (`favorites.json`)** — 이유:
- Drive 동기화가 presets 덮어쓸 때 favorites와 무관(ID만 연결)
- 프리셋 삭제되면 favorites에서 자동 누락(필터로 해결)
- **로컬 PC만 저장** (동기화 안 함, 사용자 질문 Q4 참조)

```typescript
// src/stores/favoriteStore.ts
export async function loadFavorites(): Promise<Set<string>> { ... }
export async function toggleFavorite(presetId: string): Promise<void> { ... }
```

---

## 4. AI 파일 처리 전환

### 4.1 기존 PDF 파이프라인 (제거 대상)

```
DesignUpload
  ├─ copyPdfToAppData (fs read/write)
  ├─ run_python get_pdf_info      ← Python 필요
  ├─ run_python verify_cmyk       ← Python 필요
  ├─ run_python analyze_color     ← Python 필요
  └─ run_python generate_preview  ← Python 필요 (150dpi PNG)
```

### 4.2 신규 AI 파이프라인

```
WorkSetup
  └─ open dialog (ai)
     └─ session.baseAiPath = 절대경로   ← 복사/분석 없음
        (파일 존재만 확인)
```

`grading.jsx::resolveDesignFile()`는 이미 AI 우선 로직이 있음 (L627~649) → **수정 불필요, 그대로 재활용**.

### 4.3 Python 엔진 역할 재정의

| 기능 | 현재 | 신규 |
|------|------|------|
| `get_pdf_info` | DesignUpload에서 호출 | **사용 안 함** (폐기) |
| `verify_cmyk` | DesignUpload에서 호출 | **사용 안 함** (폐기) |
| `analyze_color` | DesignUpload에서 호출 | **사용 안 함** (폐기) |
| `generate_preview` | DesignUpload에서 호출 | **사용 안 함** (폐기) |
| `calc_scale` | FileGenerate Python 폴백 | **사용 안 함** (폴백 제거) |
| `generate_graded` | FileGenerate Python 폴백 | **사용 안 함** (폴백 제거) |
| `parse_order` | SizeSelect에서 호출 | **유지** (주문서 엑셀 파서, 유일하게 필요) |

**결과**: Python 엔진은 `parse_order` 전용으로 축소. `pdf_handler.py`, `pdf_grader.py`, `svg_parser.py`, `pattern_scaler.py`는 삭제하지 않고 `deprecated/` 폴더로 이동하여 보존만.

### 4.4 AI 미리보기 처리

**문제**: AI 파일은 Python으로 썸네일 만들기 어렵다 (Adobe 독점 포맷).

**3가지 옵션**:

| 옵션 | 난이도 | UX | 추가 개발 |
|------|------|----|---------|
| A. **미리보기 없이 파일명만 표시** | 없음 | 하 | 0 |
| B. 파일 선택 시 Illustrator로 PNG export (1회) | 중 | 상 | `illustrator-scripts/preview.jsx` 신규 |
| C. AI 내부 XMP 썸네일 추출 (없을 수 있음) | 중 | 중 | Rust 바이너리 파싱 |

**권장안**: **옵션 A (MVP)** + **옵션 B (Phase 2 선택적 추가)**

WorkSetup은 파일 선택만 하는 페이지라 화면이 단순해도 됨. 파일명+경로+크기(bytes)만 표시.

---

## 5. 기존 코드 처리 매핑

| 파일/기능 | 처리 | 근거 |
|----------|------|------|
| `src/pages/DesignUpload.tsx` | **삭제** | 작업 흐름에서 제거 |
| `src/stores/designStore.ts` | **삭제** | designs.json 폐기 |
| `src/types/design.ts` | **삭제** (또는 일부만 남김) | 더 이상 참조 안 함 |
| `src/pages/SizeSelect.tsx` | **삭제** | OrderGenerate로 통합 |
| `src/pages/FileGenerate.tsx` | **삭제** | OrderGenerate로 통합 (로직은 이식) |
| `src/stores/generationStore.ts` | **삭제 or deprecated** | sessionStore로 대체 |
| `src/types/generation.ts` | **유지** (GenerationResult, IllustratorGradingResult 등 재사용) | OrderGenerate가 그대로 사용 |
| `src/pages/PatternManage.tsx` | **수정** (선택 모드 추가, 즐겨찾기) | 리네임 없이 라벨만 변경 |
| `src/components/Sidebar.tsx` | **수정** | navItems 교체 |
| `src/main.tsx` | **수정** | 라우팅 교체 |
| `python-engine/pdf_handler.py` | **유지 (사용 안 함)** | 향후 복구 가능성 대비 |
| `python-engine/pdf_grader.py` | **유지 (사용 안 함)** | 동상 |
| `python-engine/order_parser.py` | **유지 (계속 사용)** | 주문서 파싱 |
| `python-engine/main.py` | **수정** (사용 안 하는 command 제거는 선택) | parse_order만 남겨도 OK |
| `illustrator-scripts/grading.jsx` | **수정 없음** (이미 AI 우선 지원) | resolveDesignFile이 AI/PDF 모두 처리 |
| `src-tauri/src/lib.rs` | **수정 없음** | run_illustrator_script, write_file_absolute 그대로 |

---

## 6. Phase별 작업 분할

### Phase 1 (1~2일): 뼈대 세팅

**목표**: 사용자가 새 3단계 흐름을 한 번 클릭해서 끝까지 가볼 수 있다. (기능 완전하지 않아도 OK)

| 순서 | 작업 | 담당 | 선행 |
|------|------|------|------|
| 1 | `src/types/session.ts` 신규 (WorkSession 타입) | developer | 없음 |
| 2 | `src/stores/sessionStore.ts` 신규 (load/save/update/clear) | developer | 1 |
| 3 | `src/pages/WorkSetup.tsx` 신규 (폴더 선택 + AI 선택 + 다음 버튼) | developer | 2 |
| 4 | `src/main.tsx` 라우팅 교체 (`/work`, `/pattern`, `/generate` + deprecated 리다이렉트) | developer | 3 |
| 5 | `src/components/Sidebar.tsx` navItems 교체 | developer | 3 |
| 6 | tsc/build 검증 | tester | 1~5 |
| 7 | 커밋 | pm | 6 |

### Phase 2 (1일): 패턴 페이지 선택 모드

**목표**: PatternManage에서 프리셋 카드를 클릭하면 session에 저장되고 "다음" 버튼으로 /generate로 이동.

| 순서 | 작업 | 담당 | 선행 |
|------|------|------|------|
| 1 | 페이지 타이틀/사이드바 라벨 "패턴 관리" → "패턴" | developer | Phase 1 |
| 2 | 카드 클릭 핸들러: selectedPresetId 세션 저장 + 시각 하이라이트 | developer | 1 |
| 3 | 페이지 하단 고정 바: "다음: 파일 생성 →" 버튼 | developer | 2 |
| 4 | 편집/삭제 버튼은 카드 내 별도 버튼으로 이동 (기존 "이름 클릭=편집" 제거) | developer | 2 |
| 5 | tsc/build + UX 수동 테스트 | tester | 4 |
| 6 | 커밋 | pm | 5 |

### Phase 3 (1~2일): 즐겨찾기

**목표**: 자주 쓰는 프리셋에 ⭐ 붙이고 필터링.

| 순서 | 작업 | 담당 | 선행 |
|------|------|------|------|
| 1 | `src/stores/favoriteStore.ts` 신규 + favorites.json 스키마 | developer | 없음 |
| 2 | PatternManage 카드 우상단 ⭐ 토글 버튼 + CSS | developer | 1 |
| 3 | 페이지 상단 "⭐ 즐겨찾기만 보기" 토글 필터 | developer | 2 |
| 4 | 카테고리 트리 최상단 "⭐ 즐겨찾기" 가상 카테고리 | developer | 3 |
| 5 | tsc/build + 수동 테스트 | tester | 4 |
| 6 | 커밋 | pm | 5 |

### Phase 4 (2~3일): 파일 생성 통합 페이지

**목표**: 주문서 업로드 + 사이즈 선택 + Illustrator 실행 + 결과 표시를 한 페이지에서.

| 순서 | 작업 | 담당 | 선행 |
|------|------|------|------|
| 1 | `src/pages/OrderGenerate.tsx` 신규 — 기존 SizeSelect+FileGenerate 로직을 세션 기반으로 이식 | developer | Phase 1~2 |
| 2 | 출력 경로를 `session.workFolder`로 변경 | developer | 1 |
| 3 | Python 폴백 경로 제거(handleStartPythonFallback 삭제) | developer | 1 |
| 4 | 기존 FileGenerate/SizeSelect 라우트 제거 + `src/pages/` 파일 삭제 | developer | 3 |
| 5 | tsc/build + 실제 Illustrator 실행 테스트 (있는 경우) | tester | 4 |
| 6 | 커밋 | pm | 5 |

### Phase 5 (2~3일): PDF 파이프라인 제거 + 마이그레이션

**목표**: 더 이상 안 쓰는 코드 정리.

| 순서 | 작업 | 담당 | 선행 |
|------|------|------|------|
| 1 | DesignUpload.tsx, designStore.ts, design.ts 삭제 | developer | Phase 4 |
| 2 | generationStore.ts 삭제 | developer | Phase 4 |
| 3 | main.tsx에서 DesignUpload import 제거 | developer | 1 |
| 4 | CSS 중 `.design-*` 관련 dead code 제거 | developer | 1 |
| 5 | python-engine/main.py에서 parse_order 제외한 command 주석 처리 (optional) | developer | 1 |
| 6 | `$APPDATA/designs.json`, `$APPDATA/designs/`는 앱이 더 이상 읽지 않음 (사용자가 수동 삭제 가능) | (사용자 안내) | 1 |
| 7 | tsc/build + 전체 흐름 E2E 테스트 | tester | 6 |
| 8 | 커밋 | pm | 7 |

### Phase 6 (1일): 문서/knowledge 갱신

| 순서 | 작업 | 담당 | 선행 |
|------|------|------|------|
| 1 | knowledge/architecture.md에 신규 3단계 아키텍처 기록 | planner-architect | Phase 5 |
| 2 | knowledge/decisions.md에 "PDF→AI 전환" 결정 기록 | planner-architect | Phase 5 |
| 3 | REPORT.md 등 보고서류 상단에 "outdated" 배너 추가 | pm | Phase 5 |
| 4 | README/scratchpad 정리 | pm | 3 |

### 예상 총 작업량

- **합계**: 8~12 작업일
- **MVP 시점** (Phase 1~4까지): **5~7일**
- **완전체** (Phase 1~6): **8~12일**

---

## 7. 위험과 대응

### 7.1 위험 목록

| # | 위험 | 영향 | 대응 |
|---|------|------|------|
| R1 | Illustrator 미설치 PC에서 AI 파이프라인이 유일한 선택지라 아예 못 쓴다 | 상 | 앱 시작 시 `find_illustrator_exe` 확인 → 없으면 안내 모달 + 설정 바로가기 |
| R2 | 기존 사용자의 designs.json/designs/ 폴더가 좀비로 남음 | 하 | README에 삭제 경로 안내 |
| R3 | 작업 폴더가 Drive 공유 폴더면 쓰기 권한이나 동기화 지연 문제 가능 | 중 | 출력 전 `exists(workFolder)` + 시험 파일 쓰기 테스트 (optional) |
| R4 | AI 파일 경로에 한글/공백/유니코드 → Illustrator 실행 시 인자 이스케이프 이슈 | 중 | config.json으로 경로 전달(이미 그렇게 함) → 커맨드라인 인자 아니므로 안전 |
| R5 | Drive 프리셋 자동 동기화 쿨다운이 PatternManage 진입 시에만 트리거됨. /pattern은 2단계라 매 작업마다 진입하므로 기존 쿨다운 60초 로직이 신규 구조와도 호환 | 하 | 변경 불필요 |
| R6 | 즐겨찾기 ID가 Drive 재동기화로 사라진 프리셋을 가리킴 | 하 | 로드 시 presets에 없는 ID는 자동 필터 |
| R7 | 출력 파일명 중복 (`{aiName}_L.eps` 이미 있음) | 중 | 덮어쓰기 (기본) or 타임스탬프 suffix (옵션) — 사용자 질문 Q6 |
| R8 | 사용자가 WorkSetup 건너뛰고 /pattern으로 직접 접근 | 중 | /pattern, /generate는 session 없으면 /work로 리다이렉트 |

### 7.2 롤백 경로

모든 Phase는 git 커밋 단위로 나눠 Phase N에서 문제 발견 시 `git revert <Phase N 커밋>`으로 되돌릴 수 있다. 특히:
- Phase 5(삭제) 직전까지는 기존 DesignUpload 경로가 병행 존재 가능(라우트는 제거해도 코드 삭제 전이면 부활 쉬움).

---

## 8. 사용자 의사결정 필요 항목 (체크리스트)

**이 8개 질문을 모두 결정해야 Phase 1에 착수할 수 있다.** 각 질문마다 권장안 표시.

```
□ Q1. PDF 디자인 지원은 완전히 제거하나, 아니면 병행?
      A) 완전 제거 (MVP 단순화, 코드 -1500줄)           ← 권장
      B) AI 우선 + PDF 폴백 병행 (하위호환, 복잡도↑)

□ Q2. AI 미리보기는 어떻게 처리?
      A) 파일명/경로만 표시                              ← 권장 (MVP)
      B) 파일 선택 시 Illustrator로 PNG export
      C) AI XMP 썸네일 추출 (없을 수도)

□ Q3. 기존 $APPDATA/designs.json + designs/ 폴더는?
      A) 앱이 무시, 사용자가 수동 삭제 안내              ← 권장
      B) 마이그레이션 스크립트로 자동 정리
      C) 그대로 두기 (나중에 결정)

□ Q4. 즐겨찾기 저장 위치/동기화?
      A) favorites.json 로컬 전용                        ← 권장
      B) presets.json에 isFavorite 필드 (Drive 동기화 충돌 주의)
      C) settings.json에 통합
      D) Drive에도 동기화 (여러 PC 간 공유)

□ Q5. Illustrator 미설치 PC 지원?
      A) 미지원 — 앱 시작 시 에러 + 설치 안내             ← 권장
      B) 지원 — Python PDF 파이프라인 폴백 유지 (PDF 모드 병행)

□ Q6. 출력 파일명 규칙?
      A) {AI파일명}_{사이즈}.eps (덮어쓰기)                ← 권장 (단순)
      B) {AI파일명}_{사이즈}_{YYYYMMDD-HHmmss}.eps
      C) {작업폴더이름}_{사이즈}.eps
      D) 사용자 지정 prefix

□ Q7. 주문서 → 사이즈 추출 후 수동 추가 허용?
      A) 허용 (체크박스로 가감)                          ← 권장 (현행 유지)
      B) 주문서 결과만 사용 (수동 수정 차단)

□ Q8. 어느 Phase까지를 MVP로 착수?
      A) Phase 1+2+4 (즐겨찾기 제외, 최단 경로)
      B) Phase 1~4 (즐겨찾기 포함)                      ← 권장
      C) Phase 1~5 (PDF 제거까지)
      D) 전체 Phase 1~6
```

---

## 9. 마이그레이션

### 9.1 기존 사용자 데이터 (사용자 본인)

scratchpad 기록 확인 시 현재 designs.json 사용 흔적 거의 없음. Drive 연동 후 디자인 파일 프리셋 등록은 거의 사용하지 않았다.

| 데이터 | 조치 |
|--------|------|
| `$APPDATA/presets.json` | **그대로 유지** (패턴은 계속 씀) |
| `$APPDATA/categories.json` | **그대로 유지** |
| `$APPDATA/designs.json` | **무시** (앱이 더 이상 읽지 않음) |
| `$APPDATA/designs/*.pdf` | **무시** (용량 많으면 수동 삭제 안내) |
| `$APPDATA/outputs/*` | **유지** (과거 결과물 보관) |
| `$APPDATA/settings.json` | **유지** (Drive 설정) |
| sessionStorage `grader.generation.request` | **자동 소멸** (앱 종료 시) |

### 9.2 사용자 안내 문구 (README 추가)

> **v2 업데이트 안내**
>
> 디자인 파일을 앱에 등록하지 않고, 작업 시점에 기준 AI 파일을 직접 선택하는 방식으로 변경되었습니다.
>
> 이전에 등록한 디자인(`$APPDATA/com.grader.app/designs/` 폴더)은 더 이상 앱에서 사용되지 않습니다. 용량을 정리하려면 해당 폴더를 수동으로 삭제하세요.

---

## 10. Phase 1 MVP 착수 스펙 (개발자용)

### 10.1 WorkSetup.tsx 상세 스펙

```tsx
/**
 * WorkSetup 페이지 (1단계)
 * 작업 폴더 + 기준 AI 파일을 선택하여 세션을 시작한다.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { stat } from "@tauri-apps/plugin-fs";
import { loadWorkSession, saveWorkSession } from "../stores/sessionStore";

function WorkSetup() {
  const navigate = useNavigate();
  const [workFolder, setWorkFolder] = useState<string>("");
  const [baseAiPath, setBaseAiPath] = useState<string>("");
  const [baseAiSize, setBaseAiSize] = useState<number>(0);  // 바이트, 표시용
  const [error, setError] = useState<string>("");

  // 초기 로드: 세션 복원 (중간에 돌아왔을 때 선택 유지)
  useEffect(() => {
    const s = loadWorkSession();
    if (s) {
      setWorkFolder(s.workFolder || "");
      setBaseAiPath(s.baseAiPath || "");
    }
  }, []);

  async function handlePickFolder() {
    setError("");
    try {
      const dir = await open({ directory: true, multiple: false, title: "작업 폴더 선택" });
      if (dir) setWorkFolder(dir as string);
    } catch (e) {
      setError(`폴더 선택 오류: ${e}`);
    }
  }

  async function handlePickAi() {
    setError("");
    try {
      const file = await open({
        multiple: false,
        title: "기준 AI 파일 선택",
        filters: [{ name: "Adobe Illustrator", extensions: ["ai"] }],
      });
      if (!file) return;
      setBaseAiPath(file as string);
      // 파일 크기 조회 (UI 표시용)
      try {
        const info = await stat(file as string);
        setBaseAiSize(info.size);
      } catch { /* 크기 조회 실패는 무시 */ }
    } catch (e) {
      setError(`파일 선택 오류: ${e}`);
    }
  }

  function handleNext() {
    if (!workFolder || !baseAiPath) {
      setError("작업 폴더와 기준 AI 파일을 모두 선택해주세요.");
      return;
    }
    saveWorkSession({
      workFolder,
      baseAiPath,
      createdAt: Date.now(),
    });
    navigate("/pattern");
  }

  return (
    <div className="page">
      <h1 className="page__title">작업 선택</h1>
      <p className="page__description">
        그레이딩할 작업의 폴더와 기준 디자인 AI 파일을 선택하세요.
        결과물은 작업 폴더에 자동 저장됩니다.
      </p>

      <section className="work-section">
        <label className="work-label">📁 작업 폴더</label>
        <div className="work-input-row">
          <input className="work-input" value={workFolder} readOnly
                 placeholder="폴더를 선택하세요" />
          <button className="btn" onClick={handlePickFolder}>찾기</button>
        </div>
      </section>

      <section className="work-section">
        <label className="work-label">🎨 기준 AI 파일</label>
        <div className="work-input-row">
          <input className="work-input" value={baseAiPath} readOnly
                 placeholder="AI 파일을 선택하세요" />
          <button className="btn" onClick={handlePickAi}>찾기</button>
        </div>
        {baseAiSize > 0 && (
          <div className="work-hint">크기: {(baseAiSize / (1024 * 1024)).toFixed(1)} MB</div>
        )}
      </section>

      {error && <div className="design-error">{error}</div>}

      <div className="size-footer">
        <button className="btn btn--primary btn--large"
                onClick={handleNext}
                disabled={!workFolder || !baseAiPath}>
          다음: 패턴 선택 →
        </button>
      </div>
    </div>
  );
}

export default WorkSetup;
```

### 10.2 sessionStore.ts 상세 스펙

```typescript
/**
 * WorkSession 저장소 (sessionStorage 기반)
 */
import type { WorkSession } from "../types/session";

const STORAGE_KEY = "grader.session";

export function loadWorkSession(): WorkSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WorkSession;
  } catch (err) {
    console.error("세션 로드 실패:", err);
    return null;
  }
}

export function saveWorkSession(s: WorkSession): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch (err) {
    console.error("세션 저장 실패:", err);
  }
}

export function updateWorkSession(patch: Partial<WorkSession>): void {
  const cur = loadWorkSession();
  if (!cur) {
    console.warn("업데이트할 세션이 없습니다. saveWorkSession으로 먼저 생성하세요.");
    return;
  }
  saveWorkSession({ ...cur, ...patch });
}

export function clearWorkSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
```

### 10.3 라우팅 변경 diff (`src/main.tsx`)

```diff
 import App from "./App";
+import WorkSetup from "./pages/WorkSetup";
 import PatternManage from "./pages/PatternManage";
-import DesignUpload from "./pages/DesignUpload";
-import SizeSelect from "./pages/SizeSelect";
-import FileGenerate from "./pages/FileGenerate";
+import OrderGenerate from "./pages/OrderGenerate"; // Phase 4
 import Settings from "./pages/Settings";

 ...
        <Route path="/" element={<App />}>
-          <Route index element={<Navigate to="/pattern" replace />} />
+          <Route index element={<Navigate to="/work" replace />} />
+          <Route path="work" element={<WorkSetup />} />
           <Route path="pattern" element={<PatternManage />} />
-          <Route path="design" element={<DesignUpload />} />
-          <Route path="size" element={<SizeSelect />} />
-          <Route path="generate" element={<FileGenerate />} />
+          <Route path="generate" element={<OrderGenerate />} />
+          {/* 하위 호환: 이전 경로 → 신규 경로 리다이렉트 */}
+          <Route path="design" element={<Navigate to="/work" replace />} />
+          <Route path="size" element={<Navigate to="/generate" replace />} />
           <Route path="settings" element={<Settings />} />
        </Route>
```

### 10.4 Sidebar 변경 diff

```diff
 const navItems = [
-  { path: "/pattern",  step: "1", label: "패턴 관리",    icon: "✂" },
-  { path: "/design",   step: "2", label: "디자인 등록",  icon: "🎨" },
-  { path: "/size",     step: "3", label: "사이즈 선택",  icon: "📏" },
-  { path: "/generate", step: "4", label: "파일 생성",    icon: "📄" },
+  { path: "/work",     step: "1", label: "작업 선택", icon: "📁" },
+  { path: "/pattern",  step: "2", label: "패턴",     icon: "✂" },
+  { path: "/generate", step: "3", label: "파일 생성", icon: "📄" },
 ];
```

### 10.5 Phase 1 소요 시간 예상

| 작업 | 파일 수 | LOC 예상 | 시간 |
|------|--------|---------|------|
| types/session.ts | 1 신규 | +15 | 10분 |
| stores/sessionStore.ts | 1 신규 | +40 | 20분 |
| pages/WorkSetup.tsx | 1 신규 | +130 | 60분 |
| main.tsx | 1 수정 | ±10 | 10분 |
| components/Sidebar.tsx | 1 수정 | ±6 | 5분 |
| App.css (work-* 스타일) | 1 수정 | +40 | 20분 |
| tsc/build 검증 | - | - | 10분 |
| **합계** | 4 신규 + 3 수정 | +241 | **약 2시간 15분** |

Phase 1만 빠르게 돌려보고 시연 가능.

---

## 11. 요약: 한눈에 보는 비교표

| 항목 | 현재 | 신규 |
|------|------|------|
| 워크플로우 단계 | 4 | 3 |
| 디자인 처리 | 앱 저장소에 복사 | 사용자 폴더 직접 참조 |
| 디자인 파일 형식 | PDF (우선) + AI (폴백) | AI 전용 |
| 디자인 저장소 | `$APPDATA/designs/*.pdf` (수십~수백MB) | 없음 |
| 패턴 관리 | "패턴 관리" (등록+편집+선택) | "패턴" (선택 중심) |
| 즐겨찾기 | 없음 | ⭐ 토글 + 필터 |
| 주문서+사이즈+생성 | 2개 페이지 (SizeSelect, FileGenerate) | 1개 페이지 (OrderGenerate) |
| 출력 저장 위치 | `$APPDATA/outputs/{timestamp}/` | `{사용자작업폴더}/grader-output/` |
| Python 엔진 역할 | PDF 분석 + 주문서 파싱 + 스케일 계산 | 주문서 파싱 전용 |
| 엔진 선택 | Illustrator + Python 폴백 | Illustrator 전용 (Python 폴백 제거) |

---

**문서 끝**. 사용자 의사결정 8개 항목(Q1~Q8) 답변 후 Phase 1부터 착수 가능.
