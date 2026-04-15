# Google Drive 폴더 연동 구현 계획서

> **작성일**: 2026-04-15 (초안) / 2026-04-15 (J-2/J-3/J-4 반영 미세 조정)
> **작성자**: planner-architect
> **상태**: Phase 0 완료, 사용자 최종 승인 대기 → Phase 1 착수 준비 완료
> **선행 조사**: scratchpad "Google Drive 폴더 연동 타당성" + "패턴 데이터 공유/중앙화 7방식 비교"
> **확정 파라미터**: 루트 = `G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG` / 카테고리 최대 3레벨 / 조각 1개 가정 (Phase 1)

---

## [A] 개요

### 한 줄 요약
이미 회사 Google Drive에 정리되어 있는 패턴 SVG 폴더를 grader 앱이 직접 읽어와 카테고리/프리셋으로 자동 매핑하고, 나중에는 앱에서의 변경도 Drive로 되돌려 보내는 양방향 동기화를 만든다.

### 왜 이 기능이 필요한가
**비유**: 지금까지는 직원마다 자기 컴퓨터에 패턴 도시락(`presets.json`)을 따로 싸 다녔다. A 직원이 새 패턴을 추가해도 B 직원은 모른다. 이걸 **회사 공용 냉장고(Google Drive 공유 드라이브)** 에 옮겨두면, 누구든지 같은 재료를 꺼내 쓸 수 있다.

이미 디자인팀은 **Drive 공유 드라이브**에 패턴을 잘 정리해두고 있다 (`G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG\` 하위). 이 자산을 grader 앱이 직접 읽어 쓰면:

1. **데이터 진리 원천이 하나로 통일된다** (Drive 폴더가 원본, 앱은 읽는 쪽)
2. **새 직원 온보딩이 폴더 권한만 부여하면 끝난다** (앱에 패턴 일일이 등록 불필요)
3. **디자이너가 SVG만 폴더에 던지면 자동으로 grader에 반영된다**

### 이전 OneDrive 안과의 차이
| 항목 | OneDrive 안 (이전 검토) | Google Drive 안 (이번 채택) |
|------|----------------------|-------------------------|
| 진리 원천 | `presets.json` (앱이 만든 것) | **Drive 폴더 자체** (디자이너가 만든 것) |
| 코드 변경량 | 거의 0 (심볼릭 링크) | 중간 (약 +600줄, 폴더 스캔 로직 신규) |
| 데이터 흐름 | 앱 → JSON → OneDrive 동기화 | Drive 폴더 → 앱 스캔 → 메모리 캐시 |
| 디자이너 작업 | 여전히 앱에서 등록 필요 | **Drive에 SVG 던지기만 하면 끝** |
| 충돌 위험 | JSON 통째 덮어쓰기 (LWW) | 파일 단위 → Drive가 충돌사본 자동 생성 |

OneDrive 안은 "**기존 워크플로우를 그대로 두고 저장 위치만 옮기는**" 작전이고, Drive 안은 "**디자인팀이 이미 잘 정리한 폴더 구조 자체를 데이터 모델로 격상**"하는 작전이다. 후자가 회사 실제 작업 흐름과 일치한다.

### Phase별 마일스톤
| Phase | 기간 | 목표 | 양방향 |
|-------|------|------|-------|
| **Phase 0** | 사용자 대기 | 폴더 트리 확정 + 파일명 규칙 합의 | — |
| **Phase 1** | 3~4일 | **읽기 전용 MVP** — Drive 폴더 스캔 → 앱에 임포트 | 단방향 (Drive → 앱) |
| **Phase 2** | 2~3일 | 양방향 — 앱에서 추가/이름변경 → Drive 파일 변경 | 양방향 |
| **Phase 3** | 5~7일 (필요 시) | Drive REST API 전환 — Workspace 계정 없는 환경 또는 동시 편집 충돌 다발 시 | API 직접 |

---

## [B] 폴더/파일명 규칙 확정본

### 한 줄 요약
폴더는 "종목 → 세부 → 세부상세" 최대 3단계 카테고리, 파일명은 `{패턴명}_{사이즈}.svg` 하나의 규칙만 인정한다 (조각 1개 가정, Phase 1 범위).

### 카테고리 깊이 규칙 (J-3 확정: 3레벨)

**확정된 구조 (최대 depth 3):**
```
G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG\   ← 루트 (사용자가 Settings에서 지정)
├── 농구유니폼\                                       ← depth 0 = 카테고리 "농구유니폼"
│   ├── 1. 단면 유니폼 상의 패턴\                      ← depth 1 = 카테고리 "단면 유니폼 상의 패턴"
│   │   ├── 세부상세폴더\                             ← depth 2 = 카테고리 "세부상세폴더" (선택)
│   │   │   ├── 농구유니폼_V넥_스탠다드_암홀X_XS.svg  ← 패턴 파일
│   │   │   └── ... (13 사이즈)
│   │   ├── (또는 depth 2 없이 여기에 바로 SVG)
│   │   └── 농구유니폼_V넥_스탠다드_암홀X_XS.svg
│   ├── 2. 양면 유니폼 상의 패턴\
│   └── 3. 하의 패턴\
├── 축구유니폼\
└── 야구유니폼\
```

**규칙:**
- 최대 **3레벨**까지 카테고리로 인정 (depth 0: 종목, depth 1: 세부, depth 2: 세부상세)
- 각 레벨은 **선택적** — depth 1에서 바로 SVG 파일이 나와도 OK (depth 2 생략 가능)
- **4레벨 이상**: 재귀 스캔 자체는 동작하나 **UI에서 가독성 낮음 경고** 표시. 권장 깊이 = 3.
- 폴더명 앞의 `1. ` `2. ` 같은 정렬용 번호는 **그대로 카테고리명에 포함**한다 (단순화). 추후 정렬 키와 표시명을 분리하려면 별도 검토.
- SVG 파일은 어느 depth에서나 나올 수 있음 — 그 파일의 **부모 폴더 = 해당 패턴이 속한 카테고리(최하위)**

### 파일명 파싱 규칙 (Phase 1: 조각 1개 가정)

**왜 단순화했나**: [J-2] 답변 — "옷 종류별로 파일명 규칙이 다를 수 있다"는 사실이 확인됐다. 모든 파일에 일관된 `{패턴명}_{조각명}_{사이즈}` 규칙을 강제할 수 없다. 대신 **"파일명 끝이 `_사이즈.svg`로 끝나면 그 앞 전부를 패턴명으로 간주"**하는 유연한 파서로 통일한다.

**인정 규칙 (단일 규칙)**:
```
{패턴명}_{사이즈}.svg
예1: 농구유니폼_V넥_스탠다드_암홀X_XS.svg
     └─────────── 패턴명 ───────────┘ └사이즈┘
예2: 축구유니폼_라운드넥_슬림_M.svg
     └────── 패턴명 ──────┘ └사이즈┘
예3: 야구_긴팔_XL.svg
     └ 패턴명┘ └사이즈┘
```

파일명 전체를 **패턴명(presetName)** 으로 취급하며, 앱은 조각명을 추출하지 **않는다**. 같은 폴더에서 같은 `presetName`을 가진 파일들은 사이즈별 버전으로 묶어 **PatternPiece 1개**(조각 1개)로 만든다.

**파싱 알고리즘 (의사코드, 단순화된 최종본)**:
```typescript
const SIZE_LIST = ["5XS","4XS","3XS","2XS","XS","S","M","L","XL","2XL","3XL","4XL","5XL"];
// 탐욕 매칭 회피 위해 긴 것부터 시도. 정규식은 alternation이라 자동 처리됨.
const SIZE_REGEX = new RegExp(`^(.+)_(${SIZE_LIST.join("|")})\\.svg$`, "i");

function parseFilename(filename: string): { presetName: string; size: string } | null {
  const match = filename.match(SIZE_REGEX);
  if (!match) return null;          // 사이즈 토큰으로 끝나지 않으면 스킵
  const [, presetName, size] = match;
  return { presetName, size };      // 조각명 추출 X — 파일명 앞부분 전체 = presetName
}

// 같은 폴더 + 같은 presetName = 하나의 프리셋
// → PatternPreset.pieces = [{ id, name: presetName, svgPathBySize: { XS:..., S:..., ... } }]
```

**사이즈 화이트리스트 (13종, 기존 코드와 동일)**:
```
XS, S, M, L, XL, 2XS, 2XL, 3XS, 3XL, 4XS, 4XL, 5XS, 5XL
```

**다중 조각 지원은 Phase 1 범위 밖** (상세: [J-2], [J-8]). Phase 2 또는 별도 단계에서 사용자가 실제 다중 조각 예시 파일 1~2개 제공 후 그때 파싱 분기를 추가한다.

### 그룹핑 규칙 (조각 1개 가정)
같은 폴더 안에서 `presetName`이 같은 파일들 = **하나의 PatternPreset** (조각 1개).
- `pieces[0].svgPathBySize`에 사이즈별 경로 보관
- `size` 종류 수 = 지원 사이즈 수

예시:
```
폴더: G:\...\농구유니폼\1. 단면 유니폼 상의 패턴\
├── 농구유니폼_V넥_스탠다드_암홀X_XS.svg  ┐
├── 농구유니폼_V넥_스탠다드_암홀X_S.svg   │  → PatternPreset
├── ...                                  │    name="농구유니폼_V넥_스탠다드_암홀X"
└── 농구유니폼_V넥_스탠다드_암홀X_5XL.svg ┘    pieces=[{ svgPathBySize: {XS,S,...,5XL} }]
                                              (조각 1개 × 사이즈 13개 = 13파일)
```

### meta.json 스키마 (선택 사항, 자동 생성)

**왜 필요한가**: 폴더명/파일명만으로는 표현 못 하는 정보 (UUID, 생성일, 디스플레이 이름 별칭 등)를 보존하기 위함. **사용자 확인 [J-7] 필요**.

```json
// G:\...\농구유니폼\1. 단면 유니폼 상의 패턴\농구유니폼_V넥_스탠다드_암홀X.meta.json
{
  "stableId": "preset-2026-abc123",     // UUID — 패턴명 바뀌어도 식별 유지
  "presetName": "농구유니폼_V넥_스탠다드_암홀X",  // 파일명에서 추출한 원본 패턴명
  "displayName": "농구 V넥 스탠다드 (암홀 없음)",  // 사용자에게 표시할 별칭 (선택)
  "createdAt": "2026-04-15T10:00:00Z",
  "pieceCount": 1,                       // Phase 1은 항상 1. Phase 2에서 다중 조각 지원 시 증가
  "appVersion": "0.x.x"                  // 메타 생성 당시 grader 버전
}
```

> **Phase 2 확장 예정**: 다중 조각 지원 시 `pieces[]` 배열(각 조각의 `name`/`label`/파일명 패턴)을 추가. 현재는 `pieceCount=1` 암묵 가정.

**자동 생성 규칙**:
- 최초 스캔 시 폴더에 `*.meta.json`이 없으면 grader가 자동 생성
- 사용자가 거부감 있으면 (`[J-7]`) 메모리에만 두고 파일은 안 만드는 옵션 제공

### 특수문자 sanitize 규칙

Drive는 파일/폴더명에 다음 문자를 허용하지 않거나 권장하지 않음:
```
/ \ : * ? " < > |
```

**규칙**:
- 앱이 폴더/파일을 만들 때 (Phase 2 업로드) 위 문자를 **모두 `_` 로 치환**
- 스캔 시 위 문자가 포함된 폴더/파일을 만나면 **경고 로그만 남기고 그대로 사용** (디자이너가 만든 이름 존중)

---

## [C] 데이터 모델 변경안

### 한 줄 요약
기존 `PatternPiece.svgBySize`(SVG 문자열을 직접 들고 있던 필드) 옆에 `svgPathBySize`(파일 경로만 들고 있는 필드)를 추가하고, 어디서 왔는지 표시하는 `svgSource` 플래그를 단다.

### 변경 대상: `src/types/pattern.ts`

```typescript
// === 기존 ===
export interface PatternPiece {
  id: string;
  name: string;
  svgBySize?: Record<string, string>;  // SVG 문자열 직접 보관
}

export interface PatternPreset {
  id: string;
  categoryId: string;
  name: string;
  pieces: PatternPiece[];
  // ...
}

// === 추가 ===
export interface PatternPiece {
  id: string;
  name: string;

  // 기존 (앱에서 직접 등록한 케이스 — 호환성 유지)
  svgBySize?: Record<string, string>;

  // 신규: Drive 출처 케이스 (경로만 보관, 내용은 svgCacheStore에서 관리)
  svgPathBySize?: Record<string, string>;  // 예: { "XS": "농구유니폼/1. 단면.../농구V넥_XS.svg" }

  // 신규: 출처 표시
  svgSource?: "local" | "drive";  // 기본 "local" (기존 데이터 호환)
}

export interface PatternPreset {
  id: string;
  categoryId: string;
  name: string;
  pieces: PatternPiece[];

  // 신규
  driveFolder?: string;   // Drive 루트로부터의 상대 경로 (예: "농구유니폼/1. 단면 유니폼 상의 패턴")
  stableId?: string;      // meta.json의 UUID — 폴더 이름 바뀌어도 식별 유지
  // ...
}

// === 신규 ===
export interface AppSettings {
  drivePatternRoot?: string;     // Drive 루트 절대 경로 (예: "G:\\공유 드라이브\\디자인\\00. 2026 커스텀용 패턴 SVG")
  driveSyncEnabled: boolean;     // false면 Drive 기능 모두 비활성화 (안전 스위치)
  driveAutoMetaJson: boolean;    // meta.json 자동 생성 동의 여부
}
```

**호환성 전략**:
- 기존 `presets.json`에 저장된 데이터는 `svgSource` 미설정 → 코드에서 `?? "local"`로 처리
- 기존 `svgBySize`는 그대로 작동 (Drive 미사용 사용자 영향 없음)
- Drive 출처 프리셋은 `svgBySize` 미설정 + `svgPathBySize` 설정 + `svgSource: "drive"`

---

## [D] 신규/수정 파일 목록 (Phase 1)

### 한 줄 요약
신규 4개 파일 + 수정 7개 파일, 총 약 600줄 (조각 1개 가정으로 파싱 분기 제거되어 이전 추정 640줄에서 약 40줄 감소).

| 파일 | 종류 | 역할 (한 줄) | 예상 줄수 |
|------|------|------|---------|
| `src/services/driveSync.ts` | 신규 | 폴더 트리 스캔(최대 3레벨) + 파일명 파싱(단일 규칙) + meta.json 읽기/쓰기 | 170 |
| `src/stores/svgCacheStore.ts` | 신규 | Drive에서 읽은 SVG를 메모리 Map에 캐시 (LRU) | 80 |
| `src/stores/settingsStore.ts` | 신규 | `drivePatternRoot` 등 앱 설정을 settings.json에 영속화 | 50 |
| `src/pages/Settings.tsx` | 신규 | "Drive 루트 폴더 선택" UI + 동의 토글 | 80 |
| `src/pages/PatternManage.tsx` | 수정 | "Drive에서 가져오기" 버튼 + 스캔 결과 미리보기 모달 | +100 |
| `src/stores/presetStore.ts` | 수정 | Drive 스캔 결과를 presets에 머지 (stableId로 중복 방지) | +60 |
| `src/stores/categoryStore.ts` | 수정 | 폴더 트리 → 카테고리 자동 생성 (3레벨 지원) | +45 |
| `src/types/pattern.ts` | 수정 | 위 [C] 항목 (타입 확장) | +15 |
| `src-tauri/src/lib.rs` | 수정 | (필요시) Drive 폴더 권한 검증 커맨드 추가 | 10 |
| `src-tauri/tauri.conf.json` | 수정 | `fsScope`에 `G:\\**` 또는 사용자 지정 경로 허용 | 5 |
| `src-tauri/capabilities/main.json` | 수정 | `fs:allow-read-dir`, `fs:allow-read-file` 권한 추가 | 5 |

**총 신규 약 380줄 + 수정 약 220줄 = 약 600줄** (주석 포함)

---

## [E] Phase 1 작업 순서 (단계별)

### 한 줄 요약
타입 확장 → 스캔 서비스 → 캐시/설정 → UI → 통합 머지의 순서. 각 단계는 5~30분 단위로 쪼개져 있어 중간에 멈춰도 안전하다. **조각 1개 가정**으로 단순화되어 이전 14단계 → 13단계, 약 45분 감소.

| # | 작업 | 산출물 | 담당 | 선행 | 예상 시간 |
|---|------|-------|------|------|---------|
| 1 | `src/types/pattern.ts` 확장 | 타입 정의 | developer | — | 15분 |
| 2 | Tauri `fsScope` 설정 (`G:\` 읽기 허용) | tauri.conf.json + capabilities | developer | — | 15분 |
| 3 | `src/services/driveSync.ts` 초안 — `scanDriveRoot(path)` (3레벨 재귀) | 스캔 함수 (단일 규칙 파서) | developer | 1, 2 | 60분 |
| 4 | 단위 검증: 모의 폴더(3레벨 구조) 만들어 스캔 결과 콘솔 출력 | PASS/FAIL | tester | 3 | 20분 |
| 5 | `src/stores/svgCacheStore.ts` 구현 | 메모리 Map 캐시 | developer | 1 | 30분 |
| 6 | `src/stores/settingsStore.ts` 구현 | settings.json 읽기/쓰기 | developer | 1 | 30분 |
| 7 | `src/pages/Settings.tsx` 구현 | 경로 선택 UI | developer | 6 | 45분 |
| 8 | `meta.json` 읽기/자동 생성 로직 | UUID 발급, `presetName`/`pieceCount=1` 스키마 | developer | 3 | 30분 |
| 9 | `src/stores/categoryStore.ts` 자동 생성 (3레벨 지원) | 폴더 트리 → 카테고리 | developer | 3 | 30분 |
| 10 | `src/stores/presetStore.ts` 머지 로직 | stableId 기반 중복 방지 | developer | 8, 9 | 45분 |
| 11 | `src/pages/PatternManage.tsx` "가져오기" 버튼 + 미리보기 | UI 통합 | developer | 7, 10 | 60분 |
| 12 | 통합 테스트 (실제 Drive 폴더 지정 → 스캔 → 임포트) | E2E PASS | tester | 11 | 30분 |
| 13 | reviewer 코드 리뷰 (병렬 가능) | 리뷰 결과 | reviewer | 11 | 30분 |

**총 약 7~8시간 (3일 분산 작업 가정)**.

> **제거된 항목**: 이전 PLAN의 "다중 조각 파싱 분기(45분)"는 Phase 2 또는 별도 단계로 이관. 실제 다중 조각 예시 파일 ([J-8]) 수신 후 설계 재개.

### 병렬 실행 가능 구간
- 5, 6 동시 진행 가능 (서로 독립)
- 12, 13 동시 진행 가능 (tester + reviewer)

---

## [F] Phase 2 작업 순서 (양방향)

### 한 줄 요약
파일 변경 감지(watcher) → 앱 변경의 Drive 반영 → 충돌사본 감지의 순서.

| # | 작업 | 산출물 | 담당 | 선행 |
|---|------|-------|------|------|
| P2-1 | Rust `notify` crate 추가 + `watch_drive_folder` Tauri command | watcher 시작/중지 API | developer | Phase 1 완료 |
| P2-2 | React 측 watcher 이벤트 리스너 + debounce 재스캔 | 변경 감지 자동화 | developer | P2-1 |
| P2-3 | 앱 내 프리셋 이름 변경 → 폴더 rename 호출 | 양방향 이름 동기화 | developer | P2-1 |
| P2-4 | 앱 내 새 SVG 업로드 → Drive 폴더에 파일 저장 (H3=A) | "추가 시 카테고리 폴더 선택" UI | developer | P2-1 |
| P2-5 | 충돌 사본 (`_(1).svg`, `_충돌사본_*` 등) 감지 + 경고 UI | 수동 병합 안내 모달 | developer | P2-2 |
| P2-6 | 삭제 감지 + 앱 내 프리셋 비활성화 | 소프트 삭제 (meta에 `deleted: true`) | developer | P2-2 |
| P2-7 | 통합 테스트 (직원 2명 동시 편집 시뮬레이션) | E2E PASS | tester | 전부 |

---

## [G] 사용자가 해야 할 것 (직원 온보딩 가이드 초안)

### 한 줄 요약
Drive for Desktop 설치 → 공유 드라이브 권한 확인 → grader Settings에서 경로 지정 → 끝.

### 1. Google Drive for Desktop 설치
- **다운로드**: https://www.google.com/drive/download/
- **설치 후 로그인**: `@stiz.kr` Workspace 계정으로 로그인
- **마운트 드라이브**: 기본 `G:` (변경 가능. 변경 시 grader에서도 경로 재설정 필요)
- **모드 선택**: **"파일 스트리밍" 권장** (필요할 때만 다운로드, 디스크 절약)
  - "전체 동기화"는 디자인 폴더 전체를 PC에 복사하므로 수십 GB 차지 가능
  - "파일 스트리밍"은 grader가 SVG를 열 때만 다운로드 + 캐시

### 2. 공유 드라이브 접근 권한 확인
- Drive for Desktop 설치 후 Windows 탐색기에서 다음 경로가 보이는지 확인:
  ```
  G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG\
  ```
- 안 보이면 Workspace 관리자에게 "디자인 공유 드라이브 편집 권한" 요청

### 3. grader 앱 설정
1. grader 실행 → 좌측 메뉴 **Settings** 클릭
2. **"Drive 패턴 루트 폴더"** 항목에서 폴더 선택 버튼
3. `G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG` 선택
4. 저장 → "Drive 동기화 활성화" 토글 ON
5. **PatternManage** 페이지 → "Drive에서 가져오기" 버튼 → 미리보기 확인 → 임포트

### 4. (Phase 2 이후) 새 패턴 추가 워크플로우
- **방법 A — Drive에 직접 SVG 업로드**: 디자이너가 `G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG\농구유니폼\1. 단면.../농구신상_XS.svg` 올림 → grader 자동 감지 → 카테고리 트리에 자동 표시
- **방법 B — 앱에서 업로드**: grader "패턴 추가" → 카테고리 선택 → SVG 드래그 → 자동으로 Drive 폴더에 저장

---

## [H] 테스트 시나리오 (Phase 1)

### 한 줄 요약
기본 정상 케이스부터 빈 폴더, 이름 위반, 오프라인까지 7개 시나리오로 검증.

| ID | 시나리오 | 입력 | 기대 결과 |
|----|---------|------|---------|
| T1 | 빈 폴더 스캔 | SVG 0개 폴더 지정 | 에러 없이 "0개 프리셋" 안내 표시 |
| T2 | 단일 조각 패턴 13사이즈 | `농구V넥_{13사이즈}.svg` | 1개 PatternPreset, pieces[0].svgPathBySize에 13개 키 |
| T3 | 3레벨 카테고리 깊이 스캔 | 루트/종목/세부/세부상세/농구V넥_XS.svg | 카테고리 3단 생성 + 최하위에 프리셋 소속 |
| T4 | 파일명 규칙 위반 | `안전지대.svg` (사이즈 토큰 없음) | 경고 로그 출력 + 해당 파일 스킵, 다른 파일은 정상 처리 |
| T5 | 같은 이름 2회 임포트 | 1차 임포트 → 폴더 이름 변경 → 2차 임포트 | meta.json의 stableId 일치 → 중복 생성 안 됨 (이름만 갱신) |
| T6 | Drive 오프라인 모드 | 인터넷 끊김 + Drive for Desktop 오프라인 캐시 | 캐시된 폴더는 정상 스캔, 캐시 없는 파일은 경고 |
| T7 | 한글 경로 깨짐 검증 | `G:\공유 드라이브\디자인\...` 한글 폴더명 | UTF-8 정상, 깨짐 없음 |

### 검증 체크리스트
- [ ] tsc --noEmit PASS
- [ ] cargo check PASS
- [ ] 모의 폴더 (수동 생성) 스캔 결과 콘솔 출력 일치
- [ ] 실제 Drive 폴더 (사용자 지정) 스캔 후 카테고리 트리 정상 표시
- [ ] PatternManage 페이지에서 가져온 프리셋 SVG 미리보기 렌더링

---

## [I] 위험 및 대응

### 한 줄 요약
대부분 리스크는 "사용자 입력 검증"과 "캐시 정책"으로 흡수 가능. 가장 큰 리스크는 **G 드라이브 문자 변경**과 **meta.json 유실**.

| 위험 | 심각도 | 발생 가능성 | 대응 |
|------|-------|-----------|------|
| 폴더/파일명에 특수문자 `/\:*?"<>\|` | 빨강 | 낮음 | sanitize 함수 (자동 치환 `_`), 스캔 시 발견하면 경고 로그 |
| 사용자가 Drive 루트를 잘못 지정 | 노랑 | 중간 | 루트 하위에 SVG 0개면 "이 폴더에 SVG 없음" 안내 모달 |
| 파일명 규칙 위반 (사이즈 토큰 없음 등) | 노랑 | 중간 | 정규식 실패 시 경고 로그 + 스킵, 임포트 결과에 "X개 스킵됨" 표시 |
| `meta.json` 유실 (사용자 실수 삭제) | 노랑 | 낮음 | 없으면 자동 재생성 (UUID 새로 발급 → 기존 카테고리 연결 끊김!) → **백업 권고 + 휴지통 복구 가이드** |
| G 드라이브 문자 변경 (예: G→H) | 노랑 | 중간 | Settings에 "마운트 포인트 자동 탐색" 옵션 (Drive for Desktop API 또는 레지스트리 조회) — Phase 2 이후 |
| 한글 경로 인코딩 이슈 | 노랑 | 낮음 | Tauri fs는 UTF-8 기본 — T7으로 검증 필수 |
| 다수 직원 동시 스캔 | 초록 | 중간 | 스캔은 로컬 작업 (Drive에 쓰기 안 함) → 서로 영향 없음 |
| Drive for Desktop 미설치 직원 | 빨강 | 중간 | grader 시작 시 경로 확인, 없으면 "설치 가이드 링크" 안내 |
| Phase 2: 동시 편집 충돌 사본 | 노랑 | 중간 | Drive가 자동 생성하는 `_충돌사본_*` 패턴 감지 + 수동 병합 안내 모달 |
| Phase 2: 앱이 폴더 rename 도중 watcher가 감지 → 무한 루프 | 노랑 | 낮음 | rename 호출 전 watcher 일시 중지 → 완료 후 재개 (디바운스 500ms) |

---

## [J] 사용자 확인 필요 항목

### 한 줄 요약
Phase 1 착수 전 필수 4개 항목(J-1~4) 확정 완료. Phase 2 준비 항목 3개(J-5~7) + 신규 J-8(다중 조각 예시)은 Phase 1 진행 중 또는 완료 후 답변 가능.

```
✅ [J-1] 단일 조각 패턴 파일명 규칙: {패턴명}_{사이즈}.svg
        → 확정 (코드 진행 가능)

✅ [J-2] 다중 조각 패턴 파일명 규칙
        → 확정: "옷 종류별로 규칙이 다를 수 있음" (일관된 강제 불가)
        → Phase 1 대응: 다중 조각 파싱 미지원, 조각 1개 가정으로 진행
        → Phase 2 또는 별도 단계에서 J-8 답변 후 확장

✅ [J-3] 카테고리 깊이 제한
        → 확정: 최대 3레벨 (종목 → 세부 → 세부상세)
        → 4레벨 이상도 재귀 스캔 동작하나 UI에서 가독성 경고 표시

✅ [J-4] 확정된 Drive 루트 경로
        → 확정: G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG
        → 이전 가정(2026 커스텀용 패턴\00. SVG\농구유니폼\) 구조에서 변경됨

☐ [J-5] 앱에서 업로드할 때 자동 저장 규칙 (Phase 2 전 답변)
        - 어느 카테고리 폴더에 저장? (사용자가 UI에서 선택? 기본 폴더?)
        - 파일명 자동 생성? (프리셋 이름 + 사이즈 조합)
        - 다중 조각인 경우 조각명 입력 받기?

☐ [J-6] 파일명 중복 정책 (Phase 2 전 답변)
        - 이미 같은 이름 파일이 Drive에 있을 때 어떻게 처리?
          (덮어쓰기 / 거부 / 자동 번호 추가)

☐ [J-7] meta.json 자동 생성 동의 (Phase 1 진행 중 답변 권장)
        - 앱이 Drive 폴더에 .meta.json 자동 생성·수정하는 것에 거부감?
          (디자이너가 보기엔 정체불명 파일이 생긴다고 느낄 수 있음)
        - 거부 시: 메모리에만 두고 파일은 안 만드는 옵션 제공
          (단점: 카테고리 식별자 안정성 ↓, 폴더명 변경 시 새 카테고리로 인식)

☐ [J-8] 🆕 다중 조각 패턴 실존 여부 + 예시 파일명 (Phase 1 종료 전 답변 권장)
        - 실제로 "조각이 여러 개인 패턴"이 Drive에 존재하나?
        - 있다면 구체 예시 파일명 1~2개 제공
          (예: 조각 종류가 앞판/뒷판/소매인지, 네이밍은 어떻게 되어 있는지)
        - 없다면 Phase 2 파싱 확장 작업 불필요
```

---

## [K] 예상 총 작업량

| 단계 | 기간 | 담당 | 비고 |
|------|------|------|------|
| Phase 0 (폴더 트리 확정) | ✅ 완료 | 사용자 | [J-1~4] 확정 완료 |
| Phase 1 (MVP 읽기 전용) | **3일** | developer + tester + reviewer | 약 7~8시간 실작업 (조각 1개 가정으로 감소) |
| Phase 2 (양방향 + 다중 조각) | 2~3일 | developer + tester | Phase 1 안정화 1주 후 권장. [J-8] 답변 후 다중 조각 파싱 추가 |
| Phase 3 (Drive REST API 전환) | 5~7일 | (미래) | 동시 편집 충돌 다발 시 또는 Workspace 계정 없는 환경 발생 시 |

---

## [L] 문서 갱신 계획

작업 완료 시 함께 갱신할 문서:

| 문서 | 갱신 내용 |
|------|---------|
| `CLAUDE.md` (프로젝트) | "Drive 루트 경로 설정 방법" 운영 가이드 추가 |
| `.claude/knowledge/architecture.md` | "패턴 데이터 진리 원천 = Drive 폴더" 구조 기록 |
| `.claude/knowledge/decisions.md` | "OneDrive 안 대신 Google Drive 폴더 직접 스캔 채택" 결정 기록 |
| `.claude/knowledge/conventions.md` | 파일명 규칙 파서 스펙 + sanitize 규칙 |
| `.claude/knowledge/errors.md` | (Phase 1 후) 실제 발생한 에러 패턴 누적 |
| `PLAN-GDRIVE-SYNC.md` (이 문서) | Phase 1 완료 시 "구현 결과" 섹션 추가 |

---

## [M] 다음 액션

### 사용자
1. ✅ 폴더 트리 변경 작업 완료 ([J-2~4] 답변 수신)
2. **이 미세 조정판 PLAN 최종 승인** → developer 착수 승인
3. (선택) [J-7] meta.json 자동 생성 동의 여부 결정 (Phase 1 진행 중)
4. (Phase 1 종료 전) [J-8] 다중 조각 패턴 실존 여부 + 예시 파일명 제공

### planner-architect (이 에이전트)
- ✅ [J-2/J-3/J-4] 반영한 미세 조정 완료 (2026-04-15)
- Phase 1 진행 중 [J-7/J-8] 답변 수신 시 PLAN 추가 갱신
- Phase 2 착수 전 다중 조각 파싱 설계 재개 (J-8 기반)

### developer
- **Phase 0 완료** → 사용자 최종 승인 후 [E] 표 1번부터 순차 진행 가능 상태
- 각 단계별로 사용자 승인 받고 진행 (CLAUDE.md "코드 수정 전 반드시 확인" 원칙 준수)

---

> **이 PLAN은 Phase 0 완료, 사용자 최종 승인 대기 상태입니다.**
> 승인 후 즉시 Phase 1 13단계 (7~8시간) 진행 가능.
