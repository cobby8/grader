# PLAN-SVG-STANDARDIZATION.md — SVG 일괄 표준화 앱 UI 통합 계획서

> 작성일: 2026-04-22
> 작성자: planner-architect
> 대상 범위: **Phase 1-4 ~ Phase 1-7** (Rust 커맨드 + React UI + 통합 테스트 + 커밋/지식 기록)
> 선행 범위: Phase 1-1 ~ Phase 1-3 (`python-engine/svg_normalizer.py` 950줄 + CLI 3개) — **완료**
> 트리거: 사용자가 "5XL 변환을 CLI 수동 실행 없이 앱 버튼 하나로" 요청 + 분류 로직/CLI 인터페이스 **실사용 검증 통과**

---

## 0. 왜 이게 필요한지 (바이브 코더용 요약)

현재는 디자이너가 새 사이즈 SVG(예: 5XL)를 드라이브에 추가할 때마다 개발자가 매번 터미널을 열어
`python main.py normalize_batch ...` 를 손으로 실행해야 합니다. 오늘 하루에만도 이 작업이 발생했고,
앞으로 다른 패턴 그룹에서도 같은 일이 반복될 예정입니다.

이 계획서는 **"패턴 관리 페이지에서 카드 위 버튼 한 번"** 으로 그 작업이 끝나게 만듭니다.

### 핵심 구조 비유

| 조각 | 비유 | 실제 역할 |
|-----|------|---------|
| **Python 엔진 `svg_normalizer.py`** | "주방장 — 실제로 요리함" | 이미 완성된 SVG 표준화 로직 (950줄, 멱등성 검증 통과) |
| **Rust Tauri 커맨드** | "주문 접수 창구" | 프론트의 요청을 받아 주방(Python)에 전달, JSON으로 응답 |
| **`svgStandardizeService.ts`** | "메뉴판 운영 매니저" | React 컴포넌트가 쓰기 편하게 Tauri 호출을 래핑 |
| **`SvgStandardizeModal.tsx`** | "손님이 보는 테이블 주문지" | 대상 폴더/기준 파일을 선택하고 미리보기→실행 |
| **PatternManage 카드의 [📐] 버튼** | "식당 호출 벨" | 모달을 띄우는 진입점 |

### 전체 흐름 (한 줄)

```
카드 ⋮ 메뉴 → [📐 SVG 표준화]
  → SvgStandardizeModal 열림 (대상 폴더 자동 = driveFolder, 기준 사이즈 = 등록된 사이즈)
  → [미리보기] → 변환될 파일 N개 + 건너뛸 파일 + 경고 표시
  → [실행] → Python normalize_batch 호출 (.bak 자동 백업)
  → 결과 요약 (PASS/FAIL/SKIP + 경고) → [확인]
  → 자동으로 Drive 재스캔 → 새 사이즈 UI에 반영
```

---

## 1. 사용자 확정 조건 (변경 불가)

| 항목 | 결정 |
|------|------|
| 분류 로직 | **폭 우선 비교 + 4그룹 위쪽쌍 채택** (5XL 실사용 변환으로 검증 완료) |
| CLI 인터페이스 | `preview_normalize <folder_or_files> <base_file>`, `normalize_batch <folder> <base_file> [--no-backup]` (`;` 구분자 다중 파일 지원) |
| 표준화 범위 | Phase 1은 **U넥 양면유니폼 스탠다드 전용** (`NORMALIZER_VERSION = "1.0-uneck-double-sided"`) |
| 백업 정책 | **기본 `.bak` 자동 생성**, 모달에서 "백업 생략" 체크박스로 비활성 가능 |
| Python 실행 방식 | **기존 `run_python` Tauri 커맨드 재사용** (sidecar 전환 금지 — 불필요한 복잡도) |
| 파일 수정 범위 | 사용자가 모달에서 명시적으로 승인한 **폴더 하나에 대해서만** (Drive 루트 전체 일괄 금지) |
| G드라이브 직접 쓰기 | **허용** (사용자가 이미 G드라이브 경로에 수동 복사하고 있으므로 자동화가 본질) |

---

## 2. 범위 (Scope)

### 포함 (Phase 1-4 ~ 1-7)
- Rust Tauri 커맨드 2개 추가 (`svg_preview_normalize`, `svg_normalize_batch`) — `run_python` 래퍼
- TypeScript 서비스 `svgStandardizeService.ts` 신규 (Tauri invoke 얇은 래퍼 + 타입 정의)
- React 컴포넌트 `SvgStandardizeModal.tsx` 신규 (4단계 Phase 머신 UX)
- PatternManage의 프리셋 카드에 **⋮ 더보기 메뉴** 형태로 [📐 SVG 표준화] 진입점 추가
- 모달 실행 완료 시 **Drive 재스캔 트리거** (새 사이즈가 UI에 즉시 반영)
- 통합 테스트 (실제 U넥 양면 폴더 회귀 + 단면 유니폼 미영향)
- knowledge 3종 갱신 + 커밋 2회 분할

### 제외 (향후 Phase)
- ❌ V넥, 라운드넥, 하의 등 **다른 패턴 양식** (Phase 3에서 JSON 프리셋으로 외부화 검토)
- ❌ **AI→SVG 자동 변환** (별도 계획서 — Phase 1-7 완료 후 착수)
- ❌ **Drive 루트 전체 일괄 정상화** (이번에는 "선택한 프리셋 1개의 폴더만" 처리)
- ❌ 경고 55건 전용 UI (아래 3-D 옵션 A 채택 시 이 범위에 포함됨 — 결정 필요)

---

## 3. 설계 결정 (Q&A)

### Q1. 버튼을 어디에 둘까?

**채택: 옵션 A-modified — 프리셋 카드 ⋮ 더보기 메뉴 안에 [📐 SVG 표준화] 항목**

| 옵션 | 장점 | 단점 | 판정 |
|------|------|------|------|
| A. 카드 위 상시 버튼 아이콘 | 즉시 클릭 | 카드 UI 복잡화, 즐겨찾기 별과 충돌 | ❌ |
| **A-modified. 카드 ⋮ 더보기 메뉴** | 카드 공간 안 차지, 향후 "열기/복사" 등 확장성 | 한 번의 클릭이 더 필요 | ✅ |
| B. 별도 상세 페이지 | 공간 여유 | 페이지 이동 필요, 현재 카드 클릭은 "선택" 액션에 이미 할당됨 | ❌ |
| C. 상단 툴바 + 다수 선택 | 일괄 처리 가능 | 복잡도↑, 바이브 코더 UX 부담 | ❌ (Phase 3 재검토) |

**근거**:
1. 사용자 요청은 "한 번에 1개 패턴 그룹" 범위이지 다수 일괄이 아님
2. 즐겨찾기 별(☆/★)이 이미 카드 우상단을 차지함 → 추가 아이콘 공간 부족
3. ⋮ 메뉴 패턴은 향후 "Drive 폴더 열기", "프리셋 복사" 등으로 자연 확장 가능
4. 바이브 코더에게 "카드에서 오른쪽 위 점 세 개 누르고 선택" 은 Gmail/GitHub 등에서 익숙한 UX

**구현**:
- 카드 우상단 ★ 왼쪽에 `⋮` 버튼 추가 (z-index 동일, 위치만 오프셋)
- 클릭 시 기존 카드 onClick(선택 모드) stopPropagation
- 간단한 드롭다운 메뉴 렌더 (외부 라이브러리 금지, CSS `position: absolute`로 자체 구현)
- 메뉴 항목 1개: [📐 SVG 표준화]
- 메뉴 밖 클릭 시 닫기 (useEffect + document click listener)

### Q2. 기준 사이즈는 어떻게 고르나?

**채택: 모달 내 드롭다운 + 자동 추천 XL (등록된 사이즈만 노출)**

| 방안 | 평가 |
|------|------|
| A. 항상 XL 고정 | ❌ 새 폴더에 XL 없을 수 있음 |
| B. **드롭다운 + 자동 추천 XL → 없으면 2XL → 가장 큰 사이즈** | ✅ |
| C. 사용자가 파일 탐색기에서 직접 선택 | ❌ 바이브 코더에게 너무 복잡 |

**기준 파일 자동 탐지 로직** (모달 오픈 시):
1. 프리셋의 `preset.sizes[].size` 순회 → Drive 파일 존재 확인
2. 우선순위: `XL` → `2XL` → (XL~5XL 중 가장 큰 순) → (L~XS 중 가장 큰 순)
3. 후보가 여러 개면 드롭다운에서 사용자가 변경 가능

**실행 불가 조건**:
- 폴더 내 SVG가 1개 이하 → "표준화할 대상이 없습니다" (실행 버튼 disabled)
- 기준 사이즈에 대응하는 SVG 파일이 폴더에 없음 → "기준 파일을 찾을 수 없습니다"

### Q3. Python 실행은 어떻게?

**채택: 기존 `run_python` Tauri 커맨드 재사용 (신규 커맨드는 래퍼만)**

| 방안 | 평가 |
|------|------|
| A. **`run_python` 재사용하는 얇은 Rust 래퍼 2개** | ✅ |
| B. sidecar 전환 | ❌ Python venv는 이미 `setup-python.bat`로 설치됨. sidecar는 배포 복잡도 2배 |
| C. stdin/stdout 대신 임시 파일 | ❌ svg_normalizer는 이미 JSON을 stdout 한 줄로 반환, 변경 불필요 |

**Rust 커맨드 시그니처** (`src-tauri/src/lib.rs`):

```rust
#[tauri::command]
fn svg_preview_normalize(
    app: tauri::AppHandle,
    folder: String,
    base_file: String,
) -> Result<String, String>  // Python이 반환한 JSON 문자열 그대로

#[tauri::command]
fn svg_normalize_batch(
    app: tauri::AppHandle,
    folder: String,
    base_file: String,
    no_backup: bool,
) -> Result<String, String>
```

**내부 구현**: 두 커맨드 모두 단순히 `run_python` 로직(get_python_engine_dir → subprocess)을 재사용하고, args 벡터만 `["preview_normalize", folder, base_file]` 또는 `["normalize_batch", folder, base_file, "--no-backup"?]`로 구성.

**중복 제거 제안**: 이미 프론트에서 `invoke("run_python", { command, args })` 형태로 부를 수 있으므로, **별도 Rust 커맨드를 만들지 않고 기존 `run_python`을 직접 쓸지** 고민했으나:
- ✅ **채택**: 별도 커맨드 **신규 추가** — 명시적 네이밍(타입/권한이 구분됨)이 바이브 코더에게 유리, `run_python`의 동적 타입 문자열 사용 대비 안전
- 타입 체크 단계에서 "folder가 누락됐네?" 같은 컴파일 에러가 일찍 잡힘

### Q4. 모달 UX 흐름 (Phase 머신)

**4단계 상태 머신 채택**:

```
idle ──(미리보기 클릭)──> previewing ──(결과 수신)──> preview-done
                                           │
preview-done ──(실행 클릭)──> executing ──(결과 수신)──> done
                                           │
                              (실패 경로는 각 단계에서 'error' 상태로 분기)
```

| 상태 | 표시 내용 | 버튼 |
|------|----------|------|
| `idle` | 대상 폴더 경로 + 기준 사이즈 드롭다운 + 백업 체크박스 | [취소] [미리보기] |
| `previewing` | 로딩 스피너 "시뮬레이션 중..." | [취소] (disabled) |
| `preview-done` | 대상 파일 목록 (N개) + 건너뛸 파일(기준 파일) + 경고 | [취소] [← 뒤로] [▶ 실행] |
| `executing` | 진행 문구 "변환 중... (파일 N개)" (스피너) | (모두 disabled, ESC 차단) |
| `done` | 결과 요약 (`pass=3 fail=0 skipped=1`) + 경고 펼치기 아코디언 | [닫기] |
| `error` | 에러 메시지 (Python/권한/파일 없음) | [닫기] [다시 시도] |

**안전장치**:
- 모달 상단에 상시 안내: "이 작업은 원본 SVG 파일을 수정합니다. `.bak` 백업이 자동 생성됩니다." (노란색 배경)
- 실행 중(`executing`) ESC/백드롭 클릭 차단 (UpdateModal 패턴과 동일)
- `executing` → `done` 전환 시 **Drive 재스캔을 자동 트리거**하여 부모 PatternManage의 presets가 최신화되도록 함 (사용자 "재스캔 수동" 부담 제거)

### Q5. 경고 55건 UI 문제 — 이 기회에 같이 해결?

**결론: ❌ 이번 범위에서는 제외** (별도 이슈로 분리)

- 현재 PatternManage는 `console.warn`으로만 경고를 표시하고 UI에는 띄우지 않음 (사용자 명시적 요청 Q3-B)
- SVG 표준화 모달의 "경고" 는 **normalize_batch 결과의 per-file warnings** 로 국한 (Drive 스캔 전체 경고와 다름)
- Drive 스캔 경고 UI화는 **Settings 페이지의 별도 섹션**(Phase 2)로 분리하는 것이 역할 분리 원칙상 맞음
- 이번 모달은 해당 작업의 결과 경고만 "펼치기 아코디언"에 보여줌 (스코프 관리)

---

## 4. 아키텍처

### 4-1. 계층 구조

```
PatternManage.tsx (카드 ⋮ 메뉴)
  │
  └─ SvgStandardizeModal.tsx (React, 4상태 Phase 머신)
       │
       └─ svgStandardizeService.ts (TypeScript 서비스 레이어)
            │
            ├─ invoke("svg_preview_normalize", { folder, baseFile })
            └─ invoke("svg_normalize_batch", { folder, baseFile, noBackup })
                   │
                   └─ src-tauri/src/lib.rs (Rust 커맨드)
                        │
                        └─ run_python 로직 재사용 (Python subprocess)
                             │
                             └─ python-engine/main.py
                                  │
                                  └─ svg_normalizer.preview_normalization() / normalize_batch()
```

### 4-2. 데이터 흐름 (미리보기 → 실행)

```
[모달 열림]
  사용자 기준 사이즈 선택 (드롭다운)
  │
  ▼
[미리보기 클릭]
  folder = preset.driveFolder (절대경로 합성)
  baseFile = folder + "/" + pieceName + "_" + selectedBaseSize + ".svg"
  │
  ▼
Tauri invoke("svg_preview_normalize", { folder, baseFile })
  │
  ▼
Python stdout JSON:
  { "success": true, "data": { "previews": [{ file, status, big_width, no_x_collision, ... }, ...] } }
  │
  ▼
서비스가 파싱 → preview-done 상태로 전환
  │
  ▼
[실행 클릭]
  Tauri invoke("svg_normalize_batch", { folder, baseFile, noBackup: false })
  │
  ▼
Python stdout JSON:
  { "success": true, "data": { "pass_count": N, "fail_count": 0, "skipped_count": 1, "results": [...] } }
  │
  ▼
서비스가 파싱 → done 상태로 전환 → Drive 재스캔 트리거 → 부모 PatternManage sizes 갱신
```

---

## 5. 파일 변경 목록

### 5-1. 신규 파일 (3개)

| 파일 | 줄수 예상 | 역할 |
|------|---------|------|
| `src/services/svgStandardizeService.ts` | ~120 | Tauri invoke 래퍼 + `PreviewResult`/`BatchResult` 타입 정의 |
| `src/components/SvgStandardizeModal.tsx` | ~320 | 4상태 Phase 머신 모달, BEM 클래스 `.svg-standardize-modal__*` |
| (CSS는 `src/App.css`에 append) | ~120 | `.svg-standardize-modal__*` BEM 스타일 (백드롭/카드/섹션/푸터/결과표) |

### 5-2. 수정 파일 (4개)

| 파일 | 변경 범위 | 변경 내용 |
|------|---------|----------|
| `src-tauri/src/lib.rs` | 커맨드 2개 추가 + `invoke_handler` 등록 | `svg_preview_normalize` / `svg_normalize_batch` 함수 + handler 튜플 등록 |
| `src/pages/PatternManage.tsx` | 카드 렌더 영역 + 모달 상태 관리 | `⋮` 버튼 + 드롭다운 메뉴 + `<SvgStandardizeModal>` 조건부 렌더 + 실행 후 `runAutoSync()` 호출 |
| `src/App.css` | append only | `.preset-card__menu-*` + `.svg-standardize-modal__*` 클래스 |
| `.claude/scratchpad.md` | 섹션 추가 | "## 기획설계" 하위에 이번 계획 섹션 |

### 5-3. 재사용/영향 없음

- `python-engine/svg_normalizer.py` — **변경 없음** (Phase 1-1~1-3에서 완성)
- `python-engine/main.py` — **변경 없음** (CLI 3개 이미 등록됨)
- `src/services/driveSync.ts` — **변경 없음** (기존 `mergeDriveScanResult` 재활용)
- `src-tauri/capabilities/default.json` — **변경 없음** (이번 커맨드는 shell 권한 확장 불필요)

---

## 6. 컴포넌트 상세 설계

### 6-1. `svgStandardizeService.ts`

```ts
// 타입 (Python JSON과 1:1 매핑)
export interface PreviewEntry {
  file: string;        // 절대 경로
  status: "OK" | "FAIL";
  big_width?: number;
  small_width?: number;
  gap_between_patterns?: number;
  no_x_collision?: boolean;
  viewbox_ok?: boolean;
  error?: string;      // FAIL 시
}
export interface PreviewResult {
  success: boolean;
  previews?: PreviewEntry[];
  error?: string;
}

export interface BatchResultEntry {
  file: string;
  status: "PASS" | "FAIL" | "SKIP";
  reason?: string;     // SKIP 이유
  error?: string;      // FAIL 이유
  data?: Record<string, unknown>;  // 검증 통과 상세
}
export interface BatchResult {
  success: boolean;
  folder?: string;
  total_count?: number;
  pass_count?: number;
  fail_count?: number;
  skipped_count?: number;
  results?: BatchResultEntry[];
  version?: string;
  error?: string;
}

// 함수 (모두 async)
export async function previewNormalize(folder: string, baseFile: string): Promise<PreviewResult>
export async function normalizeBatch(folder: string, baseFile: string, noBackup: boolean): Promise<BatchResult>
```

**구현 요점**:
- `invoke()`가 Rust 커맨드에서 Python JSON 문자열을 받아 오면 `JSON.parse` → 공통 래핑 없이 Python 형식 그대로 노출
- 에러 규약: `{ success: false, error: "..." }` (Python 관례) + Rust/네트워크 예외는 `throw`로 위쪽에서 잡게 함 (updaterService의 "조용한 실패" 원칙과 구분 — 여기는 사용자 명시 액션이므로 에러는 드러내야 함)
- **discriminated union 대신 `success` 플래그 사용**: Python 측과 일관성 우선
- console 로그: `[svg-standardize]` 프리픽스

### 6-2. `SvgStandardizeModal.tsx`

**Props**:
```ts
interface SvgStandardizeModalProps {
  presetName: string;              // 프리셋명 (타이틀 표시)
  pieceBaseName: string;           // "양면유니폼_U넥_스탠다드" (파일명 prefix 복원용)
  driveFolder: string;             // 절대 경로 (자동 탐지된 폴더)
  registeredSizes: string[];       // preset.sizes 순서 그대로 ["XS", "S", ...]
  onClose: () => void;
  onComplete: () => void;          // 실행 성공 시 호출 → PatternManage가 runAutoSync 트리거
}
```

**내부 상태**:
```ts
type Phase = "idle" | "previewing" | "preview-done" | "executing" | "done" | "error";
const [phase, setPhase] = useState<Phase>("idle");
const [baseSize, setBaseSize] = useState<string>(pickDefaultBaseSize(registeredSizes)); // XL > 2XL > 가장 큰
const [noBackup, setNoBackup] = useState<boolean>(false);
const [preview, setPreview] = useState<PreviewResult | null>(null);
const [result, setResult] = useState<BatchResult | null>(null);
const [errorMsg, setErrorMsg] = useState<string | null>(null);
```

**기준 파일 경로 합성 규칙**:
```
baseFile = `${driveFolder}\\${pieceBaseName}_${baseSize}.svg`
```
- `pieceBaseName`: 프리셋 첫 조각의 파일명에서 사이즈 제거한 값 (예: `양면유니폼_U넥_스탠다드`)
- 경로 구분자는 Windows `\\` (Python은 forward slash도 허용하므로 양쪽 OK)

**BEM 클래스** (`App.css`):
```
.svg-standardize-modal__backdrop
.svg-standardize-modal__card
.svg-standardize-modal__header
.svg-standardize-modal__section           — 폴더/기준 사이즈/백업 옵션
.svg-standardize-modal__warning           — 노란 안내 박스
.svg-standardize-modal__preview-list      — 대상 파일 목록
.svg-standardize-modal__preview-row
.svg-standardize-modal__preview-row--skip
.svg-standardize-modal__preview-row--fail
.svg-standardize-modal__result-summary    — PASS/FAIL/SKIP 집계 숫자
.svg-standardize-modal__warnings-accordion
.svg-standardize-modal__progress          — 실행 중 스피너
.svg-standardize-modal__footer
```

모두 `var(--color-*)` 변수만 사용 (하드코딩 색 금지). Tailwind 금지.

### 6-3. `lib.rs` 추가 코드 구조

```rust
#[tauri::command]
fn svg_preview_normalize(
    app: tauri::AppHandle,
    folder: String,
    base_file: String,
) -> Result<String, String> {
    run_python(app, "preview_normalize".to_string(), vec![folder, base_file])
}

#[tauri::command]
fn svg_normalize_batch(
    app: tauri::AppHandle,
    folder: String,
    base_file: String,
    no_backup: bool,
) -> Result<String, String> {
    let mut args = vec![folder, base_file];
    if no_backup {
        args.push("--no-backup".to_string());
    }
    run_python(app, "normalize_batch".to_string(), args)
}
```

**등록**:
```rust
.invoke_handler(tauri::generate_handler![
    greet,
    run_python,
    list_svg_files,
    find_illustrator_exe,
    run_illustrator_script,
    get_illustrator_scripts_path,
    write_file_absolute,
    read_file_absolute,
    remove_file_absolute,
    svg_preview_normalize,        // 신규
    svg_normalize_batch,          // 신규
])
```

### 6-4. PatternManage.tsx 수정 지점

**① 상태 추가**:
```ts
const [standardizeTarget, setStandardizeTarget] = useState<PatternPreset | null>(null);
const [openMenuPresetId, setOpenMenuPresetId] = useState<string | null>(null);
```

**② 카드 렌더 영역 (`preset-card__fav-toggle` 옆)**:
```tsx
<button
  className="preset-card__menu-toggle"
  onClick={(e) => { e.stopPropagation(); setOpenMenuPresetId(preset.id === openMenuPresetId ? null : preset.id); }}
  aria-label="더보기"
>
  ⋮
</button>
{openMenuPresetId === preset.id && (
  <div className="preset-card__menu" onClick={(e) => e.stopPropagation()}>
    <button
      className="preset-card__menu-item"
      onClick={() => { setStandardizeTarget(preset); setOpenMenuPresetId(null); }}
      disabled={!preset.driveFolder}  // Local 프리셋은 비활성
      title={!preset.driveFolder ? "Drive 연동 프리셋만 가능합니다" : undefined}
    >
      📐 SVG 표준화
    </button>
  </div>
)}
```

**③ 모달 조건부 렌더 (페이지 최하단)**:
```tsx
{standardizeTarget && (
  <SvgStandardizeModal
    presetName={standardizeTarget.name}
    pieceBaseName={getPieceBaseName(standardizeTarget)}
    driveFolder={buildAbsoluteDriveFolder(drivePatternRoot, standardizeTarget.driveFolder!)}
    registeredSizes={standardizeTarget.sizes.map(s => s.size)}
    onClose={() => setStandardizeTarget(null)}
    onComplete={() => {
      setStandardizeTarget(null);
      lastAutoScanRef.current = 0;  // 쿨다운 무시하고 즉시 재스캔
      runAutoSync();
    }}
  />
)}
```

**④ `document.addEventListener('click', ...)` 훅으로 메뉴 바깥 클릭 시 닫기**.

---

## 7. Phase 분할 및 예상 시간

| Phase | 내용 | 예상 시간 | 커밋 단위 | 담당 |
|-------|------|---------|---------|------|
| **1-4** | Rust 커맨드 2개 + lib.rs handler 등록 + `cargo check` 통과 | **1~1.5시간** | 커밋 A | developer |
| **1-5a** | `svgStandardizeService.ts` 신규 (타입 + invoke 2개 + JSON.parse + 에러 래핑) | **0.5~1시간** | 커밋 B의 일부 | developer |
| **1-5b** | `SvgStandardizeModal.tsx` 신규 (Phase 머신 + UI + CSS append) | **2~3시간** | 커밋 B의 일부 | developer |
| **1-5c** | PatternManage.tsx 통합 (⋮ 메뉴 + 모달 조건부 렌더 + 완료 후 재스캔) | **1~1.5시간** | 커밋 B의 일부 | developer |
| **1-6** | 통합 테스트 (U넥 양면 회귀 + 단면 유니폼 미영향 + 에러 시나리오 3건) | **1~2시간** | (비커밋) | tester + reviewer 병렬 |
| **1-7** | knowledge 3종 갱신 + scratchpad 정리 + 최종 커밋 C (문서만) | **0.5~1시간** | 커밋 C | pm |

**총 소요**: **6~10시간** (하루 반나절 ~ 하루)

**의존 관계**:
```
1-4 (Rust) ─┐
            ├─▶ 1-5a (Service) ─▶ 1-5b (Modal) ─▶ 1-5c (PatternManage) ─▶ 1-6 (테스트) ─▶ 1-7 (커밋)
(독립)       ┘
```
- **1-4와 1-5a는 병렬 가능** (타입이 이미 Python JSON으로 정해짐)
- **1-5b와 1-5c는 병렬 어려움** (1-5c가 Modal을 import하므로 껍데기라도 먼저 있어야 함)
  - 실용적으로는 1-5b/c를 한 번의 developer 작업으로 묶어서 처리 권장

---

## 8. 커밋 전략

| 커밋 | 대상 | 이유 |
|------|------|------|
| **A**: `feat: Rust 커맨드 추가 (SVG 표준화 Tauri invoke)` | 1-4 완료 후 | Rust 빌드 단위 분리 — 프론트 코드 없이도 `cargo check` 통과 |
| **B**: `feat: SVG 일괄 표준화 앱 UI 통합 (모달 + PatternManage 연동)` | 1-5 + 1-6 통과 후 | 프론트 변경 일괄 — 서비스/컴포넌트/페이지가 상호 참조하므로 분리 불가 |
| **C**: `docs: SVG 표준화 Phase 1 완료 — knowledge + scratchpad 갱신` | 1-7 완료 후 | 문서만 분리해 히스토리 탐색 용이 |

**메시지 규칙**: 기존 Conventional Commits + Co-Authored-By 포함 (`Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`)

---

## 9. 테스트 시나리오 (Phase 1-6)

### 9-A. 회귀 테스트 (정상 경로)

**셋업**:
```bash
mkdir C:\temp\svg_regression
copy "G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG\...\U넥 양면유니폼 스탠다드\*.svg" C:\temp\svg_regression\
```
G드라이브 직접 실행 금지 원칙 준수 — 반드시 로컬 복사본에서만 테스트.

**테스트 1**: 12개 사이즈 전체 변환
- 모달 열기 → 기준 사이즈 XL → [미리보기] → 목록 11개(XL 제외) 확인
- [실행] → `pass_count=11, fail_count=0, skipped_count=1`
- `.bak` 파일 11개 생성 확인
- 재실행 → `pass_count=11` (멱등성 검증 — 두 번째 실행 결과가 첫 번째와 동일)

**테스트 2**: 신규 사이즈 추가 시나리오 (오늘 5XL 케이스 재현)
- 단일 body 구조의 5XL.svg만 새로 추가된 상태
- 기준 사이즈 XL 선택 → [미리보기] → 5XL 1개만 표시 (나머지 11개는 이미 4-body라 변환 불필요하지만 시뮬레이션 결과 동일하므로 표시)
- [실행] → 5XL 변환 성공

**테스트 3**: `--no-backup` 옵션
- 모달에서 "백업 생략" 체크 → 실행
- `.bak` 파일이 생성되지 않는지 확인

### 9-B. 회귀 방지 (단면 유니폼 미영향)

- 연세대 레플리카(단면 유니폼) 프리셋 카드에서 ⋮ 메뉴 → [📐 SVG 표준화]
- **현재 정책**: Phase 1은 U넥 양면유니폼 스탠다드 전용 (`NORMALIZER_VERSION = "1.0-uneck-double-sided"`)
- 단면 유니폼에 실행하면 Python `normalize_svg` 내부 검증에서 `FAIL` 반환 → 모달 결과에 "변환 실패: 패턴 path 2개 추출 실패" 표시
- **실제 파일이 수정되지 않음을 확인** (`.bak`도 생성되지 않거나 원본이 원본 그대로여야 함)
- ⚠️ 이 시나리오는 "단면에 실수로 돌렸을 때" 안전성 검증 — 실패가 정상

### 9-C. 에러 시나리오

**E1. 기준 파일 누락**:
- 폴더에 `..._XL.svg` 없는 상태 → 모달에서 XL 선택
- Python이 "기준 SVG 파일을 찾을 수 없습니다" 반환
- 모달 `error` 상태 → 에러 메시지 표시

**E2. 권한 없음**:
- 읽기 전용 폴더에서 실행 → Python이 OSError 반환
- 모달 `error` 상태 → Python 에러 메시지 표시

**E3. Python 엔진 없음 (venv 미설치)**:
- venv 폴더 임시 rename → 실행
- Rust 측 에러 "Python venv를 찾을 수 없습니다" → `svgStandardizeService`에서 throw
- 모달 `error` 상태 → 에러 메시지 + "setup-python.bat을 실행하세요" 힌트 제안

**E4. 폴더에 SVG 0개**:
- 빈 폴더 선택 → [미리보기]
- Python이 "시뮬레이션 대상 SVG 파일이 없습니다" 반환
- 모달 `error` 상태로 전환 (또는 `preview-done` + 빈 목록 메시지 — 구현 시 결정)

### 9-D. UX 검증 (tester 수동)

- ESC 키로 모달 닫기 (`executing` 제외)
- 백드롭 클릭으로 닫기 (`executing` 제외)
- `executing` 중 [닫기]/[취소] 버튼 disabled 확인
- 완료 후 자동으로 PatternManage가 새 사이즈를 UI에 반영 (5XL 체크박스 활성화)
- 카드 외부 클릭 시 ⋮ 메뉴 자동 닫힘

---

## 10. 리스크 & 대응

| 리스크 | 영향도 | 가능성 | 대응 |
|--------|-------|-------|------|
| G드라이브 경로의 한글/공백이 Python argv 인코딩 깨짐 | 높음 | 중 | 기존 `run_python`은 UTF-8 강제 — 신뢰. 대신 실 G드라이브 경로로 테스트 1회 수행 |
| Python stdout 출력이 여러 줄(warning 포함)이라 `JSON.parse` 실패 | 중 | 중 | svg_normalizer는 `print_json`으로 한 줄만 반환하도록 이미 설계됨. 혹시 stderr 섞이면 `lastLine` 추출로 방어 |
| 경로 구분자 `\\` vs `/` 혼용 | 낮음 | 높음 | `normalize_artboard` 등 기존 커맨드가 양쪽 모두 처리 중. Rust가 문자열을 그대로 넘기므로 문제 없음 |
| `driveFolder`가 상대 경로인데 모달은 절대 경로를 요구 | 중 | 높음 | PatternManage에서 `drivePatternRoot + '/' + preset.driveFolder`로 절대 경로 합성 후 props에 넘김 |
| 단면 유니폼 프리셋에서 실행되어 망가지는 사고 | 높음 | 낮음 (Q2의 실행 불가 조건으로 차단) | 1차 가드: Phase 1은 U넥 전용 안내 문구 모달 상단. 2차 가드: Python이 FAIL로 반환하되 원본 파일은 수정하지 않음 (svg_normalizer 이미 atomic 쓰기) |
| `runAutoSync` 쿨다운(60초)이 재스캔을 막음 | 중 | 높음 | `onComplete` 콜백에서 `lastAutoScanRef.current = 0`으로 강제 무효화 후 runAutoSync 호출 |
| 모달이 PatternManage 상태(presets)를 참조하지 못해 재스캔 결과가 반영 안 됨 | 중 | 중 | `runAutoSync`의 deps에 presets/categories 포함되어 있음 — useCallback 최신성 유지. 콜백 시점에 이미 최신 |
| CSS 충돌 (`.preset-card__menu` 같은 기존 이름 중복) | 낮음 | 낮음 | App.css grep으로 사전 확인. 신규 네임스페이스 `.preset-card__menu-*` 로 충돌 회피 |
| 바이브 코더가 "백업 생략" 체크하고 나중에 후회 | 중 | 낮음 | 기본값 `false`(백업 ON) + 체크박스 옆 작은 안내 문구 "원본 복구가 필요할 수 있어요. 권장: 켜진 상태 유지" |

---

## 11. knowledge 업데이트 계획 (Phase 1-7)

### `architecture.md` 추가 항목 1건

```markdown
### [2026-04-22] SVG 표준화 앱 UI 통합 완료 — Rust 커맨드 + Modal + PatternManage 연동
- **분류**: architecture
- **발견자**: planner-architect → developer
- **내용**: Phase 1-4~1-7 구현 완료. 신규 3파일: `src/services/svgStandardizeService.ts`(~120줄, Tauri invoke 래퍼 + PreviewResult/BatchResult 타입), `src/components/SvgStandardizeModal.tsx`(~320줄, 6상태 Phase 머신 idle/previewing/preview-done/executing/done/error, Drive 재스캔 자동 트리거), `src/App.css` append(~120줄, BEM `.svg-standardize-modal__*`). 신규 Rust 커맨드 2개(`svg_preview_normalize`, `svg_normalize_batch`)는 기존 `run_python` 로직 재사용 — sidecar 전환 금지. PatternManage 카드에 ⋮ 더보기 메뉴 추가(즐겨찾기 별 옆) — Drive 프리셋에서만 활성화. 실행 완료 시 `lastAutoScanRef.current = 0` 강제 무효화 후 `runAutoSync()` 트리거하여 새 사이즈 즉시 UI 반영. Python 측 로직(svg_normalizer.py)은 무변경.
- **참조횟수**: 0
```

### `decisions.md` 추가 항목 4건

1. **카드 ⋮ 더보기 메뉴 배치** — 상시 아이콘/상세 페이지/툴바 거부
2. **Rust 커맨드 신규 추가 vs `run_python` 직접 사용** — 신규 추가 채택 (타입 안전성)
3. **Python 실행은 기존 venv 유지** — sidecar 거부 (배포 복잡도)
4. **표준화 범위는 Phase 1에서 U넥 양면 전용 유지** — 다형식 외부화는 Phase 3

### `index.md` 갱신
- architecture.md 항목수 12 → 13
- decisions.md 항목수 26 → 30
- 최근 지식 최상단에 4건 추가

---

## 부록 A. 용어집 (바이브 코더용)

| 용어 | 의미 |
|-----|------|
| **SVG 표준화** | 디자이너가 사이즈별로 제각각 그린 SVG를 기준 사이즈의 구조(4-body 양면 레이아웃)로 통일하는 작업 |
| **normalize_batch** | 폴더 안의 모든 SVG를 일괄 표준화하는 Python 함수 |
| **기준 파일(base)** | 이미 올바른 구조를 가진 SVG (보통 XL). 이 파일을 "정답지"로 삼아 다른 사이즈를 재배치 |
| **미리보기(preview)** | 실제 파일 수정 없이 "변환하면 어떻게 되는지"만 시뮬레이션. 커밋 전 git diff 같은 역할 |
| **.bak 파일** | 원본 백업. `양면유니폼_U넥_스탠다드_5XL.svg.bak` 형태로 같은 폴더에 저장됨 |
| **driveFolder** | 프리셋이 G드라이브 어느 서브폴더에 있는지 저장한 값 (PatternPreset의 optional 필드) |
| **Phase 머신** | 모달 UI가 내부적으로 가지는 6가지 상태(idle/previewing/... /error)와 그 전환 규칙. 신호등 3색과 비슷한 개념이되 색이 6개 |
| **discriminated union** | TypeScript에서 `kind` 필드로 분기하는 타입. updaterService의 `UpdateCheckResult`가 예 |

---

## 부록 B. 변경 없는 파일 (보존 대상)

이 계획의 구현 과정에서 **절대 수정하지 않을** 파일 목록. PR/커밋 검토 시 이 파일들의 diff가 0줄인지 확인.

- `python-engine/svg_normalizer.py` (950줄)
- `python-engine/main.py` (452줄) — CLI 3개 그대로 유지
- `python-engine/pdf_grader.py`, `svg_parser.py`, `pattern_scaler.py` 등 그레이딩 파이프라인 전반
- `src/services/driveSync.ts` (742줄) — Drive 병합 로직 건드리지 않음
- `src/pages/OrderGenerate.tsx`, `src/pages/WorkSetup.tsx` — 다른 페이지는 영향 없음
- `illustrator-scripts/grading.jsx` — 그레이딩 ExtendScript 무관
- `src-tauri/tauri.conf.json`, `capabilities/default.json` — Phase A 자동 업데이트 설정 보존

---

> 총 라인 수: ~650 (작성 완료 시)
> 선행 완료: Phase 1-1~1-3 (`svg_normalizer.py` 950줄, CLI 3개)
> 이 계획서 승인 후 **커밋 A → B → C 순서**로 구현
