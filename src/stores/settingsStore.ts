/**
 * 앱 설정 저장소 (settingsStore)
 *
 * 왜 이 파일이 필요한가:
 *   "Drive 루트 경로", "Drive 동기화 활성/비활성" 같은 환경 설정은
 *   patterns/categories/designs 같은 "데이터"와 역할이 다르므로 별도 파일로 관리한다.
 *   백업/이식 정책, 초기화 범위도 달라진다.
 *
 * 저장 위치: {앱 데이터 폴더}/settings.json
 *   Windows: C:\Users\{user}\AppData\Roaming\com.grader.app\settings.json
 *
 * 안전장치:
 *   1) 로드 결과에 success 플래그를 두어 파싱 실패 시 기본값으로 덮어쓰기 방지
 *   2) 저장 전 기존 파일을 .backup.json으로 복사
 *   3) 빈 객체/누락 필드는 DEFAULT_SETTINGS로 채움 (버전 업그레이드 호환)
 */

import {
  readTextFile,
  writeTextFile,
  exists,
  mkdir,
  BaseDirectory,
} from "@tauri-apps/plugin-fs";

import type { AppSettings } from "../types/pattern";

// ============================================================================
// 상수
// ============================================================================

const SETTINGS_FILE = "settings.json";
const SETTINGS_BACKUP_FILE = "settings.backup.json";

/**
 * 기본 설정값.
 *
 * 왜 driveSyncEnabled 기본값이 false인가: 신규 사용자가 앱을 처음 켰을 때
 * "Drive 연동"이라는 기능이 있다는 것을 모르는 상태에서 네트워크/드라이브
 * 접근이 일어나면 당황할 수 있다. 명시적으로 Settings에서 켜야 동작한다.
 */
const DEFAULT_SETTINGS: AppSettings = {
  driveSyncEnabled: false,
  // === AI→SVG Phase 3 ===
  // 신규 사용자가 모르는 사이에 G드라이브에 SVG 파일이 자동 생성되면 안 되므로
  // 두 필드 모두 기본 false. 사용자가 Settings에서 명시적으로 켜야만 동작.
  aiAutoConvertEnabled: false,
  aiAutoConvertConsent: false,
};

// ============================================================================
// 로드/세이브
// ============================================================================

/**
 * 로드 결과 타입 (다른 스토어와 동일 패턴).
 * data가 항상 AppSettings 단일 객체라는 점만 다르다 (배열 아님).
 */
export interface SettingsLoadResult {
  success: boolean;
  data: AppSettings;
  error?: string;
}

/**
 * settings.json을 읽어 AppSettings를 반환한다.
 *
 * - 파일 없음: success=true + DEFAULT_SETTINGS (첫 실행 정상 케이스)
 * - 파싱 실패: success=false + DEFAULT_SETTINGS (저장 차단용 플래그)
 */
export async function loadSettings(): Promise<SettingsLoadResult> {
  try {
    const fileExists = await exists(SETTINGS_FILE, {
      baseDir: BaseDirectory.AppData,
    });

    if (!fileExists) {
      // 파일 없음 = 첫 실행, 기본값 반환
      return { success: true, data: { ...DEFAULT_SETTINGS } };
    }

    const raw = await readTextFile(SETTINGS_FILE, {
      baseDir: BaseDirectory.AppData,
    });

    const parsed = JSON.parse(raw) as Partial<AppSettings>;

    // 기본값과 병합 — 신규 필드 추가 시 기존 파일 호환
    const merged: AppSettings = {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };

    return { success: true, data: merged };
  } catch (err) {
    console.error("설정 로드 실패:", err);
    // 실패 시에도 DEFAULT를 반환해 UI가 렌더링은 되게 하되,
    // success=false로 저장을 차단한다 (덮어쓰기 사고 방지)
    return {
      success: false,
      data: { ...DEFAULT_SETTINGS },
      error: String(err),
    };
  }
}

/**
 * AppSettings 전체를 settings.json에 저장한다.
 *
 * 안전장치: 기존 파일이 있으면 .backup.json으로 먼저 복사.
 */
export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    // AppData 디렉토리 준비 (이미 있으면 무시)
    await mkdir("", { baseDir: BaseDirectory.AppData, recursive: true }).catch(
      () => {}
    );

    // 기존 파일 백업
    try {
      const hasFile = await exists(SETTINGS_FILE, {
        baseDir: BaseDirectory.AppData,
      });
      if (hasFile) {
        const existing = await readTextFile(SETTINGS_FILE, {
          baseDir: BaseDirectory.AppData,
        });
        await writeTextFile(SETTINGS_BACKUP_FILE, existing, {
          baseDir: BaseDirectory.AppData,
        });
      }
    } catch {
      // 백업 실패는 무시하고 본 저장은 진행
    }

    const json = JSON.stringify(settings, null, 2);
    await writeTextFile(SETTINGS_FILE, json, {
      baseDir: BaseDirectory.AppData,
    });
  } catch (err) {
    console.error("설정 저장 실패:", err);
    throw err;
  }
}

// ============================================================================
// 편의 업데이터 (부분 수정용)
// ============================================================================

/**
 * Drive 루트 경로만 변경하고 저장.
 *
 * 왜 부분 업데이터를 제공하나: UI 컴포넌트가 "현재 설정 전체를 먼저 읽어서
 * 필드 하나만 바꿔 다시 저장"하는 보일러플레이트를 작성하지 않도록 캡슐화.
 */
export async function updateDriveRoot(path: string): Promise<void> {
  const { data } = await loadSettings();
  const next: AppSettings = { ...data, drivePatternRoot: path };
  await saveSettings(next);
}

/**
 * Drive 동기화 활성/비활성 토글.
 */
export async function setDriveSyncEnabled(enabled: boolean): Promise<void> {
  const { data } = await loadSettings();
  const next: AppSettings = { ...data, driveSyncEnabled: enabled };
  await saveSettings(next);
}

/**
 * AI→SVG 자동 변환 활성/비활성 토글 (Phase 3).
 *
 * 왜 setDriveSyncEnabled와 같은 패턴인가:
 *   "현재 설정 전체를 읽어 한 필드만 바꿔 다시 저장"하는 보일러플레이트를
 *   여러 호출자가 반복하지 않도록 캡슐화하기 위함. 호출 측은 단 한 줄로 토글 가능.
 *
 * 호출 시점:
 *   - Settings 페이지 토글 클릭 (사용자 명시 액션)
 *   - useAutoAiConvert 훅에서 3연속 실패 시 강제 OFF (settings.json에 영속해야 다음
 *     실행에서도 OFF 상태 유지 — 메모리 플래그로는 안전하지 않음)
 */
export async function setAiAutoConvertEnabled(enabled: boolean): Promise<void> {
  const { data } = await loadSettings();
  const next: AppSettings = { ...data, aiAutoConvertEnabled: enabled };
  await saveSettings(next);
}

/**
 * AI→SVG 자동 변환 동의 여부 갱신 (Phase 3).
 *
 * 한 번 true가 되면 영구 유지 (사용자가 토글을 OFF→ON으로 다시 켜도 동의 모달 재표시 X).
 * Settings 초기화 시점에만 false로 돌아간다.
 *
 * 비유:
 *   설치 시 한 번만 묻는 "이용 약관 동의" 같은 것. 다시 묻지 않는다.
 */
export async function setAiAutoConvertConsent(consent: boolean): Promise<void> {
  const { data } = await loadSettings();
  const next: AppSettings = { ...data, aiAutoConvertConsent: consent };
  await saveSettings(next);
}
