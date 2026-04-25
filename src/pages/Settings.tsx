/**
 * Settings 페이지
 *
 * 왜 별도 페이지인가:
 *   "Drive 루트 폴더 경로", "Drive 동기화 활성/비활성", "캐시 관리"는
 *   패턴/디자인/사이즈와 같은 작업 흐름이 아닌 "환경 설정"이다.
 *   사용자가 한 번 지정하면 거의 안 바꾸므로, 워크플로우 사이드바와 분리해
 *   별도 메뉴(설정)로 둔다.
 *
 * 비유:
 *   - 워크플로우(1~4단계)는 "공장 라인", 설정 페이지는 "공장 제어실".
 *
 * 책임 (Phase 1):
 *   1) Drive 루트 폴더 선택/검증/저장
 *   2) Drive 연동 ON/OFF 토글
 *   3) SVG 캐시 통계 + 비우기
 *   4) 정보 (Drive for Desktop 안내)
 */

import { useState, useEffect, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { exists } from "@tauri-apps/plugin-fs";

import {
  loadSettings,
  updateDriveRoot,
  setDriveSyncEnabled,
  // === Phase 3 (AI→SVG 자동 변환) — 단계 1에서 추가된 setter 2개 ===
  // 왜 named import: settingsStore는 default export 없이 setter를 개별 export
  setAiAutoConvertEnabled,
  setAiAutoConvertConsent,
} from "../stores/settingsStore";
import { getCacheStats, clearAll as clearSvgCache } from "../stores/svgCacheStore";
import UpdateSection from "../components/UpdateSection";
// === Phase 3 (AI→SVG 자동 변환) — 첫 ON 시 1회 동의 모달 ===
// 왜 default import: 단계 1에서 default export로 정의됨
import AutoConvertConsentModal from "../components/AutoConvertConsentModal";
import type { AppSettings } from "../types/pattern";

/**
 * 캐시 통계를 사람이 읽기 쉬운 형태로 변환.
 * 예: 12345678 → "11.77 MB"
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(2)} ${units[idx]}`;
}

function Settings() {
  // === 설정 상태 ===
  const [settings, setSettings] = useState<AppSettings>({
    driveSyncEnabled: false,
  });
  const [loading, setLoading] = useState(true);
  // 로드 실패 시 저장 차단 — presetStore와 동일한 방어 패턴
  const [isLoadSuccess, setIsLoadSuccess] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // === 폴더 선택 직후 입력값 (적용 버튼 누르기 전까지 대기) ===
  const [pendingPath, setPendingPath] = useState<string>("");
  // 폴더 검증 상태: idle | checking | valid | invalid
  const [pathStatus, setPathStatus] = useState<
    "idle" | "checking" | "valid" | "invalid"
  >("idle");
  const [pathStatusMessage, setPathStatusMessage] = useState<string>("");

  // === 캐시 통계 (5초마다 자동 갱신) ===
  const [cacheStats, setCacheStats] = useState(getCacheStats());

  // === 저장 중 플래그 ===
  const [saving, setSaving] = useState(false);

  // === Phase 3 (AI→SVG 자동 변환): 첫 ON 시 1회 동의 모달 표시 플래그 ===
  // 왜 별도 state: 토글 ON 시도 → consent 검증 → 모달 ON/OFF 전환을 분리해야
  // "사용자가 모달에서 [취소] 누르면 토글 ON 자체가 일어나지 않는다"를 깔끔히 표현 가능.
  const [showConsentModal, setShowConsentModal] = useState(false);

  // === 초기 로드 ===
  useEffect(() => {
    loadSettings()
      .then((result) => {
        if (result.success) {
          setSettings(result.data);
          setPendingPath(result.data.drivePatternRoot ?? "");
          setIsLoadSuccess(true);
          setLoadError(null);
        } else {
          setLoadError(result.error ?? "알 수 없는 오류");
          setIsLoadSuccess(false);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // === 캐시 통계 주기적 갱신 ===
  useEffect(() => {
    const timer = setInterval(() => {
      setCacheStats(getCacheStats());
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // === 폴더 선택 다이얼로그 ===
  const handlePickFolder = useCallback(async () => {
    try {
      // Tauri dialog plugin: directory: true → 폴더만 선택 가능
      const picked = await open({
        directory: true,
        multiple: false,
        title: "Drive 패턴 루트 폴더 선택",
      });
      // 사용자가 취소하면 null 반환
      if (!picked || typeof picked !== "string") return;
      setPendingPath(picked);
      // 선택한 폴더 자동 검증
      await validatePath(picked);
    } catch (err) {
      console.error("폴더 선택 실패:", err);
      alert(`폴더 선택 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  // === 경로 검증 (존재 여부만 확인 — 내부 SVG 스캔은 PatternManage에서) ===
  const validatePath = useCallback(async (path: string) => {
    if (!path.trim()) {
      setPathStatus("idle");
      setPathStatusMessage("");
      return;
    }
    setPathStatus("checking");
    setPathStatusMessage("폴더 확인 중...");
    try {
      const ok = await exists(path);
      if (ok) {
        setPathStatus("valid");
        setPathStatusMessage("폴더 접근 가능");
      } else {
        setPathStatus("invalid");
        setPathStatusMessage(
          "폴더가 없거나 접근 권한이 없습니다 (Drive for Desktop이 실행 중인지 확인)"
        );
      }
    } catch (err) {
      // fsScope 권한 부족 시 readDir/exists에서 예외 발생
      setPathStatus("invalid");
      setPathStatusMessage(
        `검증 실패 (fsScope 범위 밖일 수 있음): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, []);

  // === Drive 루트 적용 ===
  const handleApplyPath = useCallback(async () => {
    if (!isLoadSuccess) {
      alert("설정 로드 실패 상태에서는 저장할 수 없습니다.");
      return;
    }
    if (pathStatus !== "valid") {
      alert("유효한 폴더를 선택해주세요.");
      return;
    }
    setSaving(true);
    try {
      // 루트 경로 변경 시 기존 SVG 캐시 무효화 (다른 폴더의 캐시는 무의미)
      clearSvgCache();
      setCacheStats(getCacheStats());

      await updateDriveRoot(pendingPath);
      setSettings((prev) => ({ ...prev, drivePatternRoot: pendingPath }));
      alert("Drive 루트가 저장되었습니다.");
    } catch (err) {
      alert(`저장 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [pendingPath, pathStatus, isLoadSuccess]);

  // === Drive 연동 토글 ===
  const handleToggleSync = useCallback(
    async (enabled: boolean) => {
      if (!isLoadSuccess) return;
      setSaving(true);
      try {
        await setDriveSyncEnabled(enabled);
        setSettings((prev) => ({ ...prev, driveSyncEnabled: enabled }));
      } catch (err) {
        alert(`저장 실패: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setSaving(false);
      }
    },
    [isLoadSuccess]
  );

  // === Phase 3: AI→SVG 자동 변환 토글 ===
  // 동작:
  //   - OFF → ON 전환:
  //     · consent === true   → 즉시 enabled=true 영속 + 토글 ON
  //     · consent === false  → 동의 모달 표시 (사용자가 [동의하고 켜기] 누를 때까지 대기)
  //   - ON → OFF 전환: 즉시 enabled=false 영속 (consent 값은 그대로 유지 — 다음 ON 때 모달 X)
  const handleToggleAutoConvert = useCallback(
    async (enabled: boolean) => {
      if (!isLoadSuccess) return;

      // ON 시도 + 아직 동의한 적 없음 → 모달 띄우기만 하고 실제 토글은 onConsent에서
      if (enabled && !settings.aiAutoConvertConsent) {
        setShowConsentModal(true);
        return;
      }

      // OFF로 전환 또는 ON + 이미 동의됨 → 즉시 영속
      setSaving(true);
      try {
        await setAiAutoConvertEnabled(enabled);
        setSettings((prev) => ({ ...prev, aiAutoConvertEnabled: enabled }));
      } catch (err) {
        alert(`저장 실패: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setSaving(false);
      }
    },
    [isLoadSuccess, settings.aiAutoConvertConsent]
  );

  // === Phase 3: 동의 모달 [동의하고 켜기] 클릭 처리 ===
  // 두 setter를 순차적으로 호출 — consent=true 영속 후 enabled=true 영속.
  // 두 호출 모두 최신 settings.json을 읽어서 한 필드만 바꾸는 패턴이라 순서가 중요하다.
  const handleConsentApproved = useCallback(async () => {
    setSaving(true);
    try {
      // 1) 동의 영속 — 다음에 토글 OFF→ON 해도 모달 안 뜸
      await setAiAutoConvertConsent(true);
      // 2) 자동 변환 활성 영속
      await setAiAutoConvertEnabled(true);
      // 3) 화면 상태 동기화
      setSettings((prev) => ({
        ...prev,
        aiAutoConvertConsent: true,
        aiAutoConvertEnabled: true,
      }));
      // 4) 모달 닫기
      setShowConsentModal(false);
    } catch (err) {
      alert(`저장 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }, []);

  // === Phase 3: 동의 모달 [취소] / ESC / 백드롭 처리 ===
  // 토글은 ON 안 됨 — 모달만 닫는다.
  const handleConsentCancel = useCallback(() => {
    setShowConsentModal(false);
  }, []);

  // === 캐시 비우기 ===
  const handleClearCache = useCallback(() => {
    if (!confirm("SVG 메모리 캐시를 모두 비웁니다. 다음 미리보기 시 다시 로드됩니다. 진행할까요?")) {
      return;
    }
    clearSvgCache();
    setCacheStats(getCacheStats());
  }, []);

  // === 로딩 화면 ===
  if (loading) {
    return (
      <div className="page">
        <h1 className="page__title">설정</h1>
        <p className="page__description">설정을 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page__title">설정</h1>
      <p className="page__description">
        앱 환경 설정을 변경합니다. 모든 설정은 자동으로 저장됩니다.
      </p>

      {/* 로드 실패 경고 */}
      {loadError && (
        <div className="load-error">
          설정 로드 실패: {loadError}
          <br />이 상태에서는 저장이 차단됩니다. 앱을 재시작해주세요.
        </div>
      )}

      {/* === 섹션 1: Drive 패턴 루트 폴더 === */}
      <section className="settings-section">
        <h2 className="settings-section__title">Drive 패턴 루트 폴더</h2>
        <p className="settings-section__description">
          Google Drive(또는 OneDrive 등 로컬 마운트 폴더) 안의 패턴 SVG 루트 경로를
          지정합니다. 예: <code>G:\공유 드라이브\디자인\00. 2026 커스텀용 패턴 SVG</code>
        </p>

        <div className="settings-row">
          <label className="settings-row__label">현재 경로</label>
          <div className="settings-row__value">
            {settings.drivePatternRoot ? (
              <code className="settings-path">{settings.drivePatternRoot}</code>
            ) : (
              <span className="settings-row__placeholder">(미설정)</span>
            )}
          </div>
        </div>

        <div className="settings-row">
          <label className="settings-row__label">새 경로 선택</label>
          <div className="settings-row__value">
            <div className="settings-path-pick">
              <input
                type="text"
                className="settings-input"
                placeholder="폴더 선택 또는 직접 입력"
                value={pendingPath}
                onChange={(e) => {
                  setPendingPath(e.target.value);
                  setPathStatus("idle");
                  setPathStatusMessage("");
                }}
                onBlur={() => validatePath(pendingPath)}
              />
              <button
                className="btn btn--small"
                onClick={handlePickFolder}
                disabled={saving}
              >
                폴더 선택
              </button>
              <button
                className="btn btn--small"
                onClick={() => validatePath(pendingPath)}
                disabled={!pendingPath.trim() || pathStatus === "checking"}
              >
                검증
              </button>
              <button
                className="btn btn--small btn--primary"
                onClick={handleApplyPath}
                disabled={
                  !isLoadSuccess ||
                  saving ||
                  pathStatus !== "valid" ||
                  pendingPath === settings.drivePatternRoot
                }
              >
                적용
              </button>
            </div>
            {pathStatusMessage && (
              <div
                className={`settings-status settings-status--${pathStatus}`}
              >
                {pathStatusMessage}
              </div>
            )}
          </div>
        </div>

        <div className="settings-row">
          <label className="settings-row__label">Drive 연동 사용</label>
          <div className="settings-row__value">
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={settings.driveSyncEnabled}
                onChange={(e) => handleToggleSync(e.target.checked)}
                disabled={!isLoadSuccess || saving}
              />
              <span>
                {settings.driveSyncEnabled
                  ? "활성 (패턴 관리 진입 시 자동 동기화, 60초 쿨다운)"
                  : "비활성 (Drive 자동 동기화 중지)"}
              </span>
            </label>
          </div>
        </div>
      </section>

      {/* === 섹션 1.5: AI 자동 변환 (Phase 3) ===
          왜 Drive 섹션 바로 아래: "Drive 동기화"로 SVG를 가져온 다음 단계가
          "AI→SVG 자동 변환"이므로 사용자 머릿속 흐름과 일치한다.
          Drive 동기화 OFF면 자동 변환도 의미 없지만, 토글 자체는 독립 동작 —
          (Drive ON + 자동변환 ON) 조합에서만 PatternManage가 트리거함. */}
      <section className="settings-section">
        <h2 className="settings-section__title">AI 자동 변환</h2>
        <p className="settings-section__description">
          Google Drive 폴더에 있는 .ai 파일 중 짝이 되는 SVG가 없는 것을
          자동으로 SVG로 변환하여 같은 폴더에 저장합니다. 패턴 관리 페이지에
          진입할 때마다 1회 백그라운드로 실행됩니다.
        </p>

        <div className="settings-row">
          <label className="settings-row__label">자동 변환 사용</label>
          <div className="settings-row__value">
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={settings.aiAutoConvertEnabled ?? false}
                onChange={(e) => handleToggleAutoConvert(e.target.checked)}
                disabled={!isLoadSuccess || saving}
              />
              <span>
                {settings.aiAutoConvertEnabled
                  ? "활성 (G드라이브 스캔 직후 자동 변환)"
                  : "비활성 (자동 변환 중지 — 수동 변환만 가능)"}
              </span>
            </label>
          </div>
        </div>

        <div className="settings-row">
          <label className="settings-row__label">안내</label>
          <div className="settings-row__value settings-row__hint-block">
            <ul className="settings-hint-list">
              <li>같은 이름의 SVG가 이미 있으면 건너뜁니다 (덮어쓰지 않음).</li>
              <li>변환 진행 상황은 패턴 관리 페이지 상단 배너에 표시됩니다.</li>
              <li>3회 연속 실패하면 자동으로 꺼집니다 — 이 토글에 다시 켜야 합니다.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* === 섹션 2: SVG 캐시 === */}
      <section className="settings-section">
        <h2 className="settings-section__title">SVG 메모리 캐시</h2>
        <p className="settings-section__description">
          Drive에서 읽은 SVG는 메모리에 임시 저장하여 재로딩 속도를 높입니다.
          캐시는 앱을 다시 시작하면 자동으로 비워집니다.
        </p>

        <div className="settings-row">
          <label className="settings-row__label">캐시 항목</label>
          <div className="settings-row__value">
            {cacheStats.size} / {cacheStats.maxEntries}
            <span className="settings-row__hint">
              {" "}(약 {formatBytes(cacheStats.totalBytes)})
            </span>
          </div>
        </div>

        <div className="settings-row">
          <label className="settings-row__label">캐시 비우기</label>
          <div className="settings-row__value">
            <button
              className="btn btn--small btn--danger"
              onClick={handleClearCache}
              disabled={cacheStats.size === 0}
            >
              모두 삭제
            </button>
          </div>
        </div>
      </section>

      {/* === 섹션 3: 버전 정보 + 업데이트 (자동 업데이트 Phase C) === */}
      <UpdateSection />

      {/* === Phase 3: AI 자동 변환 첫 ON 시 1회 동의 모달 === */}
      {/* isOpen이 false면 컴포넌트 내부에서 null 반환 — 렌더 비용 0 */}
      <AutoConvertConsentModal
        isOpen={showConsentModal}
        onConsent={handleConsentApproved}
        onCancel={handleConsentCancel}
      />

      {/* === 섹션 4: 정보 === */}
      <section className="settings-section">
        <h2 className="settings-section__title">정보</h2>
        <div className="settings-row">
          <label className="settings-row__label">앱 버전</label>
          <div className="settings-row__value">0.1.0</div>
        </div>
        <div className="settings-row">
          <label className="settings-row__label">Drive for Desktop</label>
          <div className="settings-row__value">
            Drive 연동을 사용하려면 Google Drive for Desktop이 설치되어 있어야 합니다.
            <br />
            <a
              href="https://www.google.com/drive/download/"
              target="_blank"
              rel="noreferrer"
              className="settings-link"
            >
              다운로드 페이지 열기 →
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Settings;
