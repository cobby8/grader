/**
 * Drive 가져오기 모달 (DriveImportModal)
 *
 * 왜 별도 컴포넌트인가:
 *   PatternManage가 이미 1000줄 이상이라 새 기능을 인라인으로 넣으면 가독성이 급격히 떨어진다.
 *   "Drive 스캔 + 결과 미리보기 + 병합" 흐름을 한 컴포넌트로 캡슐화한다.
 *
 * 책임:
 *   1) Settings에 저장된 Drive 루트로 scanDriveRoot 호출
 *   2) 결과(카테고리/프리셋/경고) 미리보기
 *   3) "가져오기" 클릭 시 stableId 기준 중복 체크 후 신규 항목만 병합 (콜백 호출)
 *
 * 책임 밖:
 *   - 실제 카테고리/프리셋 저장은 부모(PatternManage)가 담당. 이 컴포넌트는 "병합 결과 객체"만 반환.
 */

import { useState, useCallback, useEffect } from "react";
import { scanDriveRoot } from "../services/driveSync";
import type { ScanResult } from "../services/driveSync";
import { loadSettings } from "../stores/settingsStore";
import type { PatternPreset, PatternCategory } from "../types/pattern";
import { generateId } from "../stores/presetStore";

/**
 * 부모에게 돌려줄 병합 후보 데이터.
 * 부모가 기존 categories/presets 배열에 이걸 concat해 영속화한다.
 */
export interface DriveImportResult {
  /** 신규 추가될 카테고리 (parentId 체인 정합성 보장) */
  newCategories: PatternCategory[];
  /** 신규 추가될 프리셋 */
  newPresets: PatternPreset[];
  /** 스킵된 프리셋 수 (이미 stableId가 있는 경우) */
  skippedCount: number;
  /** 스캔 경고 (원본 그대로 전달) */
  warnings: string[];
}

interface Props {
  /** 모달 닫기 콜백 */
  onClose: () => void;
  /** 기존 카테고리 (중복 체크용) */
  existingCategories: PatternCategory[];
  /** 기존 프리셋 (stableId 중복 체크용) */
  existingPresets: PatternPreset[];
  /** 가져오기 확정 시 호출. 부모가 영속화 책임. */
  onImport: (result: DriveImportResult) => Promise<void>;
}

function DriveImportModal({
  onClose,
  existingCategories,
  existingPresets,
  onImport,
}: Props) {
  // === 상태 ===
  const [drivePatternRoot, setDrivePatternRoot] = useState<string | undefined>(
    undefined
  );
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [importing, setImporting] = useState(false);
  // 병합 미리보기 (가져올 신규 항목 수 등) — 사용자에게 보여줄 것
  const [previewSkipped, setPreviewSkipped] = useState(0);

  // === Settings에서 루트 경로 로드 ===
  useEffect(() => {
    loadSettings().then((result) => {
      if (result.success) {
        setDrivePatternRoot(result.data.drivePatternRoot);
      }
    });
  }, []);

  // === 스캔 시작 ===
  const handleScan = useCallback(async () => {
    if (!drivePatternRoot) {
      alert("먼저 Settings 페이지에서 Drive 루트 경로를 설정하세요.");
      return;
    }
    setScanning(true);
    setScanResult(null);
    setPreviewSkipped(0);
    try {
      const result = await scanDriveRoot(drivePatternRoot);
      setScanResult(result);
      // 미리 stableId 중복 체크해서 사용자에게 "N개 스킵 예정" 안내
      if (result.success) {
        const existingStableIds = new Set(
          existingPresets.map((p) => p.stableId).filter(Boolean)
        );
        const skipped = result.presets.filter((p) =>
          existingStableIds.has(p.stableId)
        ).length;
        setPreviewSkipped(skipped);
      }
    } catch (err) {
      console.error("스캔 실패:", err);
      alert(
        `스캔 중 오류 발생: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setScanning(false);
    }
  }, [drivePatternRoot, existingPresets]);

  // === 가져오기 확정 ===
  const handleImport = useCallback(async () => {
    if (!scanResult || !scanResult.success) return;
    setImporting(true);
    try {
      // 1) 카테고리 병합: scanResult의 catId(해시)를 기존 카테고리(name+parentId)로 매핑
      // 왜 매핑이 필요한가: scan 카테고리 id는 경로 해시(`cat-xxx`)이고,
      // 기존 카테고리는 generateId()로 만든 ID. 폴더명/parent 일치하면 같은 카테고리로 본다.
      const scanIdToFinalId = new Map<string, string>();
      const newCategories: PatternCategory[] = [];

      // 깊이 오름차순으로 처리 (parent가 먼저 등록되어야 함)
      const sortedScanCats = [...scanResult.categories].sort(
        (a, b) => a.depth - b.depth
      );

      for (const sc of sortedScanCats) {
        // scan의 parentId(해시) → 기존/신규 ID로 변환
        const finalParentId = sc.parentId
          ? scanIdToFinalId.get(sc.parentId) ?? null
          : null;

        // 같은 parent 아래 같은 이름의 카테고리가 이미 있는가?
        const existing = existingCategories.find(
          (c) => c.parentId === finalParentId && c.name === sc.name
        );
        // 같은 트리에서 방금 추가한 신규 카테고리도 같이 검사
        const existingNew = newCategories.find(
          (c) => c.parentId === finalParentId && c.name === sc.name
        );

        if (existing) {
          scanIdToFinalId.set(sc.id, existing.id);
        } else if (existingNew) {
          scanIdToFinalId.set(sc.id, existingNew.id);
        } else {
          // 신규 카테고리 생성
          const newId = generateId();
          // order는 같은 부모 아래 마지막 순서 + 1 (기존 + 신규 합쳐서)
          const siblingsExisting = existingCategories.filter(
            (c) => c.parentId === finalParentId
          );
          const siblingsNew = newCategories.filter(
            (c) => c.parentId === finalParentId
          );
          const maxOrder = [...siblingsExisting, ...siblingsNew].reduce(
            (m, c) => Math.max(m, c.order),
            -1
          );
          newCategories.push({
            id: newId,
            name: sc.name,
            parentId: finalParentId,
            order: maxOrder + 1,
          });
          scanIdToFinalId.set(sc.id, newId);
        }
      }

      // 2) 프리셋 병합: stableId 기준 중복 체크
      const existingStableIds = new Set(
        existingPresets.map((p) => p.stableId).filter(Boolean)
      );
      const newPresets: PatternPreset[] = [];
      let skippedCount = 0;
      const now = new Date().toISOString();

      for (const sp of scanResult.presets) {
        if (existingStableIds.has(sp.stableId)) {
          skippedCount++;
          continue;
        }
        const finalCategoryId = scanIdToFinalId.get(sp.categoryId);
        // 사이즈 SpecList 초기화 (Drive 출처는 치수가 없음 → 빈 pieces로 모든 사이즈 0 등록)
        // 왜 모든 사이즈가 아닌 등록된 사이즈만? Phase 1은 단순화: svgPathBySize 키만 등록
        const sizesFromDrive = Object.keys(sp.svgPathBySize);

        // 단일 piece 가정 (Phase 1 J-8 기준)
        const pieceId = generateId();
        const piece = {
          id: pieceId,
          name: sp.presetName,
          svgPath: "", // local 경로 의미는 없음 — 절대경로는 svgPathBySize에 별도 저장
          svgData: "", // 인라인 데이터 없음 — getSvg()로 on-demand 로드
          // svgBySize: 두지 않음 (Drive 출처는 svgPathBySize 사용)
          svgPathBySize: { ...sp.svgPathBySize },
          svgSource: "drive" as const,
        };

        newPresets.push({
          id: generateId(),
          name: sp.presetName,
          pieces: [piece],
          // 사이즈별 치수는 일단 0으로 초기화 — 사용자가 PatternManage에서 입력
          sizes: sizesFromDrive.map((size) => ({
            size,
            pieces: [{ pieceId, width: 0, height: 0 }],
          })),
          categoryId: finalCategoryId,
          createdAt: now,
          updatedAt: now,
          // Drive 식별자 (stableId/driveFolder)
          driveFolder: sp.driveFolder,
          stableId: sp.stableId,
        });
      }

      // 신규 0개면 onImport 호출 생략하고 즉시 닫기
      // 이유: PatternManage의 handleDriveImport가 "신규 0개, 0개" 빈 alert를 띄워 사용자 혼란 → 여기서 차단
      if (newCategories.length === 0 && newPresets.length === 0) {
        if (skippedCount > 0) {
          alert(`모든 프리셋이 이미 존재합니다. ${skippedCount}개 스킵됨.`);
        } else {
          alert("가져올 신규 항목이 없습니다.");
        }
        onClose();
        return;
      }

      // 3) 부모 콜백 호출 — 부모가 영속화 + 토스트 표시
      await onImport({
        newCategories,
        newPresets,
        skippedCount,
        warnings: scanResult.warnings,
      });

      // 가져오기 성공 → 모달 닫기
      onClose();
    } catch (err) {
      console.error("가져오기 실패:", err);
      alert(`가져오기 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setImporting(false);
    }
  }, [scanResult, existingCategories, existingPresets, onImport, onClose]);

  // === 렌더링 ===
  return (
    <div className="drive-import-modal__backdrop" onClick={onClose}>
      {/* 내부 클릭이 backdrop으로 전파되지 않게 stopPropagation */}
      <div
        className="drive-import-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drive-import-modal__header">
          <h2 className="drive-import-modal__title">Drive에서 가져오기</h2>
          <button className="drive-import-modal__close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="drive-import-modal__body">
          {/* 1) 루트 경로 안내 */}
          {!drivePatternRoot ? (
            <div className="drive-import-empty">
              Drive 루트 경로가 설정되지 않았습니다.
              <br />
              좌측 메뉴 <b>설정</b>에서 Drive 패턴 루트 폴더를 먼저 지정하세요.
            </div>
          ) : (
            <>
              <p>
                <b>루트 경로:</b>{" "}
                <code className="settings-path">{drivePatternRoot}</code>
              </p>

              {/* 2) 스캔 결과 또는 시작 버튼 */}
              {!scanResult && !scanning && (
                <div style={{ marginTop: 16 }}>
                  <button
                    className="btn btn--primary"
                    onClick={handleScan}
                  >
                    스캔 시작
                  </button>
                </div>
              )}

              {scanning && (
                <div className="drive-import-empty">
                  폴더를 스캔하는 중입니다...
                  <br />
                  <span style={{ fontSize: 12 }}>
                    Drive for Desktop이 처음 다운로드하는 경우 시간이 걸릴 수 있습니다.
                  </span>
                </div>
              )}

              {scanResult && !scanResult.success && (
                <div className="load-error" style={{ marginTop: 12 }}>
                  스캔 실패: {scanResult.error}
                </div>
              )}

              {scanResult && scanResult.success && (
                <>
                  <div className="drive-import-summary">
                    <div className="drive-import-summary__item">
                      <div className="drive-import-summary__value">
                        {scanResult.categories.length}
                      </div>
                      <div className="drive-import-summary__label">카테고리</div>
                    </div>
                    <div className="drive-import-summary__item">
                      <div className="drive-import-summary__value">
                        {scanResult.presets.length}
                      </div>
                      <div className="drive-import-summary__label">프리셋</div>
                    </div>
                    <div className="drive-import-summary__item">
                      <div className="drive-import-summary__value">
                        {scanResult.warnings.length}
                      </div>
                      <div className="drive-import-summary__label">경고</div>
                    </div>
                  </div>

                  {previewSkipped > 0 && (
                    <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
                      ※ 이미 가져온 프리셋 <b>{previewSkipped}개</b>는 스킵됩니다
                      (stableId 중복).
                    </p>
                  )}

                  {scanResult.warnings.length > 0 && (
                    <div className="drive-import-warnings">
                      <div className="drive-import-warnings__title">
                        경고 ({scanResult.warnings.length}건)
                      </div>
                      <ul className="drive-import-warnings__list">
                        {scanResult.warnings.slice(0, 50).map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                        {scanResult.warnings.length > 50 && (
                          <li>... 외 {scanResult.warnings.length - 50}건</li>
                        )}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="drive-import-modal__footer">
          <button className="btn" onClick={onClose} disabled={importing}>
            닫기
          </button>
          {scanResult && scanResult.success && (() => {
            // 버튼 라벨/상태 분기 — 스캔 성공 후엔 항상 누를 수 있게 (importing만 막음)
            // 이유: 신규 0개여도 사용자가 확인차 누를 수 있어야 하고,
            //       handleImport 안에서 "이미 존재함" 안내 후 즉시 닫기 처리
            const newCount =
              scanResult.presets.length - previewSkipped;
            const skipCount = previewSkipped;
            const buttonLabel = importing
              ? "가져오는 중..."
              : newCount === 0
                ? "중복 확인 완료 (추가 없음)"
                : skipCount === 0
                  ? `${newCount}개 가져오기`
                  : `${newCount}개 추가 가져오기 (${skipCount}개 스킵)`;
            return (
              <button
                className="btn btn--primary"
                onClick={handleImport}
                disabled={importing}
              >
                {buttonLabel}
              </button>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

export default DriveImportModal;
