/**
 * SizeSelect 페이지 (4단계 파트 1)
 *
 * 사용자가 그레이딩 작업에 필요한 4가지 요소를 선택한다:
 *   1) 패턴 프리셋 (2단계에서 등록)
 *   2) 디자인 파일 (3단계에서 등록)
 *   3) 기준 사이즈 (디자인 PDF가 어떤 사이즈로 그려졌는지)
 *   4) 생성할 타겟 사이즈 목록 (5XS~5XL 체크박스)
 *
 * 선택 완료 후 "다음 단계" 버튼을 누르면 generationStore에 요청을 저장하고
 * FileGenerate 페이지로 이동한다.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { loadPresets } from "../stores/presetStore";
import { loadDesigns } from "../stores/designStore";
import { saveGenerationRequest, loadGenerationRequest } from "../stores/generationStore";
import type { PatternPreset } from "../types/pattern";
import type { DesignFile } from "../types/design";
import { SIZE_LIST } from "../types/pattern";
import type { OrderParseResult, OrderParseRawResult, OrderSize } from "../types/order";
import { toOrderParseResult } from "../types/order";

function SizeSelect() {
  const navigate = useNavigate();

  // 2단계/3단계에서 등록한 데이터 로드
  const [presets, setPresets] = useState<PatternPreset[]>([]);
  const [designs, setDesigns] = useState<DesignFile[]>([]);

  // 사용자 선택 상태
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [selectedDesignId, setSelectedDesignId] = useState<string>("");
  // 기준 사이즈: 디자이너가 어떤 사이즈로 작업했는지. 기본값 "L"
  const [baseSize, setBaseSize] = useState<string>("L");
  // 타겟 사이즈 선택 (중복 가능): Set으로 관리
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(new Set());

  // 에러 메시지 (폼 유효성)
  const [errorMessage, setErrorMessage] = useState<string>("");

  // 엑셀 주문서 관련 상태
  // 엑셀에서 추출한 결과 (null이면 수동 모드)
  const [orderResult, setOrderResult] = useState<OrderParseResult | null>(null);
  // 엑셀 파싱 중 로딩 표시
  const [orderLoading, setOrderLoading] = useState(false);
  // 사이즈별 수량 맵 (엑셀에서 추출한 참고 정보)
  const [sizeQuantities, setSizeQuantities] = useState<Map<string, number>>(new Map());

  // 초기 로드: 기존 데이터 + 이전 선택 복원
  useEffect(() => {
    (async () => {
      // 프리셋/디자인 병렬 로드 (속도)
      const [presetList, designList] = await Promise.all([
        loadPresets(),
        loadDesigns(),
      ]);
      setPresets(presetList);
      setDesigns(designList);

      // sessionStorage에 이전 선택이 있으면 복원
      const prev = loadGenerationRequest();
      if (prev) {
        // 이전 ID가 여전히 유효할 때만 복원
        if (presetList.some((p) => p.id === prev.presetId)) {
          setSelectedPresetId(prev.presetId);
        }
        if (designList.some((d) => d.id === prev.designFileId)) {
          setSelectedDesignId(prev.designFileId);
        }
        if (prev.baseSize) setBaseSize(prev.baseSize);
        if (prev.selectedSizes?.length) {
          setSelectedSizes(new Set(prev.selectedSizes));
        }
      }
    })();
  }, []);

  // 현재 선택된 프리셋/디자인 객체 (미리보기/요약 표시용)
  const selectedPreset = useMemo(
    () => presets.find((p) => p.id === selectedPresetId) || null,
    [presets, selectedPresetId]
  );
  const selectedDesign = useMemo(
    () => designs.find((d) => d.id === selectedDesignId) || null,
    [designs, selectedDesignId]
  );

  // 프리셋이 가진 사이즈 목록 (기준 사이즈 드롭다운 옵션용)
  // 사용자는 프리셋에 실제로 등록된 사이즈 중에서만 선택할 수 있어야 함
  const availablePresetSizes = useMemo<string[]>(() => {
    if (!selectedPreset) return [];
    return selectedPreset.sizes.map((s) => s.size);
  }, [selectedPreset]);

  // 프리셋이 바뀔 때 기준 사이즈가 새 프리셋에 없으면 첫 번째 사이즈로 자동 변경
  useEffect(() => {
    if (availablePresetSizes.length === 0) return;
    if (!availablePresetSizes.includes(baseSize)) {
      // "L" 우선 선택, 없으면 첫 번째
      const preferred = availablePresetSizes.includes("L")
        ? "L"
        : availablePresetSizes[0];
      setBaseSize(preferred);
    }
  }, [availablePresetSizes, baseSize]);

  /** 엑셀 주문서 파일 선택 및 파싱 */
  async function handleExcelUpload() {
    try {
      // Tauri 파일 다이얼로그로 xlsx 파일 선택
      const filePath = await open({
        title: "엑셀 주문서 선택",
        filters: [{ name: "엑셀 파일", extensions: ["xlsx"] }],
        multiple: false,
      });

      // 사용자가 취소한 경우
      if (!filePath) return;

      setOrderLoading(true);
      setErrorMessage("");

      // Python parse_order 호출
      const raw = await invoke<string>("run_python", {
        command: "parse_order",
        args: [filePath as string],
      });
      const parsed: OrderParseRawResult = JSON.parse(raw);
      const result = toOrderParseResult(parsed);

      if (!result.success) {
        setErrorMessage(result.error || "엑셀 파싱에 실패했습니다.");
        setOrderLoading(false);
        return;
      }

      if (result.sizes.length === 0) {
        setErrorMessage("엑셀에서 사이즈 정보를 찾을 수 없습니다.");
        setOrderLoading(false);
        return;
      }

      // 파싱 결과 저장
      setOrderResult(result);

      // 수량 맵 구성 (사이즈 옆에 "12장" 표시용)
      const qtyMap = new Map<string, number>();
      result.sizes.forEach((s: OrderSize) => qtyMap.set(s.size, s.quantity));
      setSizeQuantities(qtyMap);

      // 추출된 사이즈로 체크박스 자동 선택
      const extractedSizes = result.sizes.map((s: OrderSize) => s.size);
      // 프리셋에 없는 사이즈 경고
      const unknownSizes = extractedSizes.filter(
        (s: string) => !availablePresetSizes.includes(s)
      );
      if (unknownSizes.length > 0) {
        setErrorMessage(
          `주의: 엑셀에서 추출한 사이즈 중 프리셋에 없는 것이 있습니다: ${unknownSizes.join(", ")}. 해당 사이즈는 선택에서 제외됩니다.`
        );
      }

      // 프리셋에 등록된 사이즈만 체크
      const validSizes = extractedSizes.filter((s: string) =>
        availablePresetSizes.includes(s)
      );
      setSelectedSizes(new Set(validSizes));
    } catch (err) {
      setErrorMessage(`엑셀 파일 처리 중 오류: ${err}`);
    } finally {
      setOrderLoading(false);
    }
  }

  /** 수동 선택 모드로 돌아가기 (엑셀 결과 초기화) */
  function resetToManual() {
    setOrderResult(null);
    setSizeQuantities(new Map());
    setSelectedSizes(new Set());
  }

  /** 개별 사이즈 체크박스 토글 */
  function toggleSize(size: string) {
    setSelectedSizes((prev) => {
      const next = new Set(prev);
      if (next.has(size)) {
        next.delete(size);
      } else {
        next.add(size);
      }
      return next;
    });
  }

  /** 모든 사이즈 선택 (프리셋에 등록된 사이즈만) */
  function selectAllSizes() {
    // 프리셋에 치수 데이터가 있는 사이즈만 대상
    setSelectedSizes(new Set(availablePresetSizes));
  }

  /** 모든 사이즈 해제 */
  function clearAllSizes() {
    setSelectedSizes(new Set());
  }

  /** 폼 유효성 검사 */
  function validateForm(): string | null {
    if (!selectedPresetId) return "패턴 프리셋을 선택해 주세요.";
    if (!selectedDesignId) return "디자인 파일을 선택해 주세요.";
    if (!baseSize) return "기준 사이즈를 선택해 주세요.";
    if (selectedSizes.size === 0) return "생성할 사이즈를 1개 이상 선택해 주세요.";
    // 기준 사이즈가 프리셋에 등록되어 있는지
    if (selectedPreset && !availablePresetSizes.includes(baseSize)) {
      return `기준 사이즈 '${baseSize}'가 프리셋에 등록되어 있지 않습니다.`;
    }
    // 선택한 타겟 사이즈가 프리셋에 모두 존재하는지
    for (const s of selectedSizes) {
      if (!availablePresetSizes.includes(s)) {
        return `선택한 사이즈 '${s}'가 프리셋에 등록되어 있지 않습니다. 패턴 관리에서 치수를 먼저 입력하세요.`;
      }
    }
    return null;
  }

  /** "다음 단계" 버튼: 유효성 검사 후 generationStore에 저장하고 FileGenerate로 이동 */
  function handleNext() {
    const err = validateForm();
    if (err) {
      setErrorMessage(err);
      return;
    }
    setErrorMessage("");

    // 생성 요청을 sessionStorage에 저장
    saveGenerationRequest({
      presetId: selectedPresetId,
      designFileId: selectedDesignId,
      baseSize: baseSize,
      selectedSizes: Array.from(selectedSizes),
    });

    // FileGenerate 페이지로 이동
    navigate("/generate");
  }

  // 프리셋 또는 디자인이 아예 없을 때는 안내 화면 표시
  const noPresets = presets.length === 0;
  const noDesigns = designs.length === 0;

  return (
    <div className="page">
      <h1 className="page__title">사이즈 선택</h1>
      <p className="page__description">
        그레이딩할 패턴, 디자인, 기준 사이즈, 그리고 생성할 사이즈를 선택하세요.
      </p>

      {/* 프리셋 혹은 디자인이 없으면 선행 단계 안내 */}
      {(noPresets || noDesigns) && (
        <div className="design-error">
          <strong>선행 등록 필요:</strong>{" "}
          {noPresets && "패턴 프리셋이 등록되지 않았습니다. "}
          {noDesigns && "디자인 파일이 등록되지 않았습니다. "}
          좌측 메뉴에서 먼저 등록해 주세요.
        </div>
      )}

      {/* 1. 패턴 프리셋 선택 */}
      <section className="size-section">
        <h2 className="size-section__title">1. 패턴 프리셋</h2>
        <select
          className="size-select"
          value={selectedPresetId}
          onChange={(e) => setSelectedPresetId(e.target.value)}
          disabled={noPresets}
        >
          <option value="">-- 프리셋 선택 --</option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name} ({preset.pieces.length}개 조각, {preset.sizes.length}개 사이즈)
            </option>
          ))}
        </select>

        {/* 선택된 프리셋 요약 */}
        {selectedPreset && (
          <div className="size-summary">
            <div className="size-summary__row">
              <span className="size-summary__label">조각:</span>
              <span className="size-summary__value">
                {selectedPreset.pieces.map((p) => p.name).join(", ") || "(없음)"}
              </span>
            </div>
            <div className="size-summary__row">
              <span className="size-summary__label">등록된 사이즈:</span>
              <span className="size-summary__value">
                {availablePresetSizes.join(", ") || "(없음)"}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* 2. 디자인 파일 선택 */}
      <section className="size-section">
        <h2 className="size-section__title">2. 디자인 파일</h2>
        <select
          className="size-select"
          value={selectedDesignId}
          onChange={(e) => setSelectedDesignId(e.target.value)}
          disabled={noDesigns}
        >
          <option value="">-- 디자인 파일 선택 --</option>
          {designs.map((design) => (
            <option key={design.id} value={design.id}>
              {design.name} ({design.pageWidth}×{design.pageHeight}mm, {design.colorSpace})
            </option>
          ))}
        </select>

        {/* 선택된 디자인 요약 */}
        {selectedDesign && (
          <div className="size-summary">
            <div className="size-summary__row">
              <span className="size-summary__label">크기:</span>
              <span className="size-summary__value">
                {selectedDesign.pageWidth} × {selectedDesign.pageHeight} mm
              </span>
            </div>
            <div className="size-summary__row">
              <span className="size-summary__label">색상 공간:</span>
              <span
                className={
                  selectedDesign.cmykVerified
                    ? "size-summary__value size-summary__value--ok"
                    : "size-summary__value size-summary__value--warn"
                }
              >
                {selectedDesign.colorSpace}
                {selectedDesign.cmykVerified ? " ✓" : " ⚠"}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* 3. 기준 사이즈 */}
      <section className="size-section">
        <h2 className="size-section__title">3. 기준 사이즈</h2>
        <p className="size-section__hint">
          이 디자인 파일이 어떤 사이즈로 작업된 것인지 선택하세요. 이 사이즈를
          기준으로 다른 사이즈가 비례 확대/축소됩니다.
        </p>
        <select
          className="size-select"
          value={baseSize}
          onChange={(e) => setBaseSize(e.target.value)}
          disabled={!selectedPreset}
        >
          {!selectedPreset && <option value="">프리셋을 먼저 선택하세요</option>}
          {availablePresetSizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </section>

      {/* 4. 생성할 사이즈 체크박스 그리드 */}
      <section className="size-section">
        <div className="size-section__header">
          <h2 className="size-section__title">4. 생성할 사이즈</h2>
          <div className="size-actions">
            {/* 엑셀 주문서 업로드 버튼 */}
            <button
              type="button"
              className="btn btn--small btn--excel"
              onClick={handleExcelUpload}
              disabled={!selectedPreset || orderLoading}
            >
              {orderLoading ? "분석 중..." : "엑셀 주문서로 선택"}
            </button>
            {/* 엑셀 모드일 때 수동 모드 복귀 버튼 */}
            {orderResult && (
              <button
                type="button"
                className="btn btn--small"
                onClick={resetToManual}
              >
                수동 선택으로 돌아가기
              </button>
            )}
            <button
              type="button"
              className="btn btn--small"
              onClick={selectAllSizes}
              disabled={!selectedPreset}
            >
              전체 선택
            </button>
            <button
              type="button"
              className="btn btn--small"
              onClick={clearAllSizes}
              disabled={selectedSizes.size === 0}
            >
              전체 해제
            </button>
          </div>
        </div>

        {/* 엑셀 파싱 결과 요약 (엑셀 모드일 때만 표시) */}
        {orderResult && (
          <div className="order-summary">
            <div className="order-summary__header">
              <span className="order-summary__badge">엑셀 주문서</span>
              <span className="order-summary__info">
                시트: {orderResult.sourceSheet} / 형식: {
                  orderResult.detectedFormat === "horizontal" ? "가로형"
                  : orderResult.detectedFormat === "vertical" ? "세로형"
                  : orderResult.detectedFormat === "table" ? "표형"
                  : "자동감지"
                } / 총 {orderResult.totalQuantity}장
              </span>
            </div>
          </div>
        )}

        <div className="size-grid">
          {SIZE_LIST.map((size) => {
            // 프리셋에 등록된 사이즈만 체크 가능
            const registered = availablePresetSizes.includes(size);
            const checked = selectedSizes.has(size);
            const isBase = size === baseSize;
            // 엑셀에서 추출한 수량 (있으면 표시)
            const quantity = sizeQuantities.get(size);
            return (
              <label
                key={size}
                className={`size-cell ${!registered ? "size-cell--disabled" : ""} ${
                  checked ? "size-cell--checked" : ""
                } ${isBase ? "size-cell--base" : ""}`}
                title={
                  !registered
                    ? "이 사이즈는 프리셋에 치수가 등록되지 않았습니다"
                    : isBase
                    ? "기준 사이즈 (원본 복사)"
                    : ""
                }
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!registered}
                  onChange={() => toggleSize(size)}
                />
                <span className="size-cell__label">{size}</span>
                {/* 수량 배지: 엑셀에서 수량이 추출된 경우에만 표시 */}
                {quantity !== undefined && quantity > 0 && (
                  <span className="size-cell__qty">{quantity}장</span>
                )}
              </label>
            );
          })}
        </div>

        <div className="size-count">
          선택됨: <strong>{selectedSizes.size}개</strong> / 전체 {SIZE_LIST.length}개
          {/* 엑셀 모드에서는 총 수량도 표시 */}
          {orderResult && orderResult.totalQuantity > 0 && (
            <span className="size-count__total">
              {" "}(주문 총 {orderResult.totalQuantity}장)
            </span>
          )}
        </div>
      </section>

      {/* 에러 메시지 */}
      {errorMessage && (
        <div className="design-error">
          <strong>오류:</strong> {errorMessage}
          <button
            className="design-error__close"
            onClick={() => setErrorMessage("")}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
      )}

      {/* 다음 단계 버튼 */}
      <div className="size-footer">
        <button
          className="btn btn--primary btn--large"
          onClick={handleNext}
          disabled={
            !selectedPresetId ||
            !selectedDesignId ||
            !baseSize ||
            selectedSizes.size === 0
          }
        >
          다음: 파일 생성 →
        </button>
      </div>
    </div>
  );
}

export default SizeSelect;
