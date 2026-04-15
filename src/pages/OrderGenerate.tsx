/**
 * OrderGenerate 페이지 (신규 3단계 · Phase 4 통합판)
 *
 * 기존 SizeSelect + FileGenerate 두 페이지를 하나로 통합한 페이지.
 * 왜 통합했는가:
 *   - 재설계된 흐름(WorkSetup → PatternManage → OrderGenerate)은 이미
 *     "작업 폴더 / 기준 AI / 선택 프리셋"을 세션에 담고 있다.
 *   - 즉 SizeSelect의 1번(프리셋)·2번(디자인)은 이미 결정되어 있으므로
 *     다시 드롭다운을 보여줄 이유가 없다.
 *   - 남은 작업은 "어떤 사이즈로 몇 장 뽑을지" + "Illustrator로 실행" 뿐이다.
 *
 * 진입 가드:
 *   세션에 workFolder/baseAiPath가 없으면 /work로, selectedPresetId가 없으면 /pattern으로.
 *
 * 출력 규칙 (Phase 4 권장안):
 *   - 출력 위치: session.workFolder 아래에 직접 저장 (AppData/outputs/... 아님)
 *   - 파일명: `{baseAiName 확장자 제거}_{size}.eps`
 *   - 엔진: Illustrator 전용 (Python 폴백 제거). 설치 안 되어 있으면 에러.
 *
 * 설계:
 *   - 주문서(엑셀) 업로드는 옵션 — 없이 수동 체크만으로도 진행 가능.
 *   - baseSize는 페이지 로컬 state (기본 "L"). 세션에는 저장하지 않음.
 *   - "새 작업 시작" 버튼: 결과 화면에서 세션을 지우고 /work로 되돌려 다음 작업으로 바로 넘어간다.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { loadPresets } from "../stores/presetStore";
import { loadWorkSession, clearWorkSession } from "../stores/sessionStore";
import { resolveSvgContent } from "../services/svgResolver";
import type { PatternPreset } from "../types/pattern";
import type { WorkSession } from "../types/session";
import { SIZE_LIST } from "../types/pattern";
import type { OrderParseResult, OrderParseRawResult, OrderSize } from "../types/order";
import { toOrderParseResult } from "../types/order";
import type {
  GenerationResult,
  GenerationStatus,
  IllustratorGradingResult,
} from "../types/generation";

// ---------------------------------------------------------------------------
// 순수 헬퍼
// ---------------------------------------------------------------------------

/**
 * 절대 경로에서 "파일명(확장자 제외)"만 뽑는다.
 * 왜: 세션의 baseAiPath는 "G:\\...\\농구_V넥_XL.ai" 같은 풀패스인데,
 *    결과 파일명에는 확장자와 경로를 빼야 한다.
 * 윈도우와 POSIX 둘 다 대응하기 위해 역슬래시/슬래시 모두 분리한다.
 */
function getFileBaseName(absPath: string): string {
  if (!absPath) return "output";
  // 양쪽 구분자 모두 처리
  const parts = absPath.replace(/\\/g, "/").split("/");
  const fileName = parts[parts.length - 1] || absPath;
  // 확장자 제거
  return fileName.replace(/\.[^/.]+$/, "") || fileName || "output";
}

/** 파일시스템 금지 문자를 치환한다 (FileGenerate와 동일 규칙). */
function sanitizeFileName(name: string): string {
  return (
    name
      .replace(/\.[^/.]+$/, "") // 확장자 한 번 더 방어
      .replace(/[<>:"/\\|?*]/g, "_")
      .trim() || "output"
  );
}

// ---------------------------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------------------------

function OrderGenerate() {
  const navigate = useNavigate();

  // 세션/프리셋 로드 상태
  const [session, setSession] = useState<WorkSession | null>(null);
  const [preset, setPreset] = useState<PatternPreset | null>(null);
  const [loadingInit, setLoadingInit] = useState(true);

  // 사이즈 선택
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(new Set());
  // 기준 사이즈 (페이지 로컬 state, 기본 "L")
  const [baseSize, setBaseSize] = useState<string>("L");

  // 주문서(선택)
  const [orderResult, setOrderResult] = useState<OrderParseResult | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [sizeQuantities, setSizeQuantities] = useState<Map<string, number>>(new Map());

  // 실행 상태
  const [results, setResults] = useState<GenerationResult[]>([]);
  const [generating, setGenerating] = useState(false);
  const [globalError, setGlobalError] = useState<string>("");
  // 결과 화면에서 "작업 폴더 열기"에 사용
  const [outputDir, setOutputDir] = useState<string>("");

  // -------------------------------------------------------------------------
  // 초기 로드 + 세션 가드
  // -------------------------------------------------------------------------
  useEffect(() => {
    (async () => {
      const s = loadWorkSession();
      // 왜 이렇게 분기하나: 재설계 흐름에서 페이지는 세션을 전제로 한다.
      // 직접 URL 입력 등으로 들어왔을 때 이전 단계로 되돌린다.
      if (!s || !s.workFolder || !s.baseAiPath) {
        navigate("/work");
        return;
      }
      if (!s.selectedPresetId) {
        navigate("/pattern");
        return;
      }

      // 프리셋 실제 객체 조회
      const presetResult = await loadPresets();
      const p = presetResult.data.find((x) => x.id === s.selectedPresetId) || null;
      if (!p) {
        // 선택했던 프리셋이 사라진 경우 → 다시 선택하러 보냄
        navigate("/pattern");
        return;
      }

      setSession(s);
      setPreset(p);
      setLoadingInit(false);
    })();
  }, [navigate]);

  // -------------------------------------------------------------------------
  // 파생값
  // -------------------------------------------------------------------------
  // 프리셋에 등록된 사이즈 목록 (체크박스 활성화 기준)
  const availablePresetSizes = useMemo<string[]>(() => {
    if (!preset) return [];
    return preset.sizes.map((s) => s.size);
  }, [preset]);

  // 프리셋이 로드되면 baseSize 자동 보정 — 등록되지 않은 사이즈이면 "L" 또는 첫 번째
  useEffect(() => {
    if (availablePresetSizes.length === 0) return;
    if (!availablePresetSizes.includes(baseSize)) {
      const preferred = availablePresetSizes.includes("L")
        ? "L"
        : availablePresetSizes[0];
      setBaseSize(preferred);
    }
  }, [availablePresetSizes, baseSize]);

  // 세션에서 AI 파일명(확장자 제거) 추출 — 요약 카드와 출력 파일명에 사용
  const baseAiName = useMemo(
    () => (session ? getFileBaseName(session.baseAiPath) : ""),
    [session]
  );

  // 결과 통계
  const totalCount = results.length;
  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  const processingCount = results.filter((r) => r.status === "processing").length;
  const allDone =
    !generating && totalCount > 0 && successCount + errorCount === totalCount;

  // -------------------------------------------------------------------------
  // 사이즈 토글 핸들러
  // -------------------------------------------------------------------------
  function toggleSize(size: string) {
    setSelectedSizes((prev) => {
      const next = new Set(prev);
      if (next.has(size)) next.delete(size);
      else next.add(size);
      return next;
    });
  }
  function selectAllSizes() {
    // 프리셋에 치수가 등록된 사이즈만 대상
    setSelectedSizes(new Set(availablePresetSizes));
  }
  function clearAllSizes() {
    setSelectedSizes(new Set());
  }

  // -------------------------------------------------------------------------
  // 주문서(엑셀) 업로드 — SizeSelect의 로직을 그대로 이식
  // -------------------------------------------------------------------------
  async function handleExcelUpload() {
    try {
      const filePath = await open({
        title: "엑셀 주문서 선택",
        filters: [{ name: "엑셀 파일", extensions: ["xlsx"] }],
        multiple: false,
      });
      if (!filePath) return;

      setOrderLoading(true);
      setGlobalError("");

      // Python parse_order 호출
      const raw = await invoke<string>("run_python", {
        command: "parse_order",
        args: [filePath as string],
      });
      const parsed: OrderParseRawResult = JSON.parse(raw);
      const result = toOrderParseResult(parsed);

      if (!result.success) {
        setGlobalError(result.error || "엑셀 파싱에 실패했습니다.");
        setOrderLoading(false);
        return;
      }
      if (result.sizes.length === 0) {
        setGlobalError("엑셀에서 사이즈 정보를 찾을 수 없습니다.");
        setOrderLoading(false);
        return;
      }

      setOrderResult(result);

      // 수량 맵 구성
      const qtyMap = new Map<string, number>();
      result.sizes.forEach((s: OrderSize) => qtyMap.set(s.size, s.quantity));
      setSizeQuantities(qtyMap);

      // 추출된 사이즈 자동 체크 (프리셋 등록된 것만)
      const extracted = result.sizes.map((s: OrderSize) => s.size);
      const unknown = extracted.filter((s) => !availablePresetSizes.includes(s));
      if (unknown.length > 0) {
        setGlobalError(
          `주의: 주문서의 ${unknown.join(", ")} 사이즈는 프리셋에 등록되어 있지 않아 제외됩니다.`
        );
      }
      const valid = extracted.filter((s) => availablePresetSizes.includes(s));
      setSelectedSizes(new Set(valid));
    } catch (err) {
      setGlobalError(`엑셀 처리 중 오류: ${err}`);
    } finally {
      setOrderLoading(false);
    }
  }

  function resetOrderToManual() {
    // 주문서 기반 자동 체크만 해제 — 수동 선택은 남겨둔다
    setOrderResult(null);
    setSizeQuantities(new Map());
    setSelectedSizes(new Set());
  }

  // -------------------------------------------------------------------------
  // 결과 갱신 헬퍼
  // -------------------------------------------------------------------------
  function updateResult(size: string, patch: Partial<GenerationResult>) {
    setResults((prev) => prev.map((r) => (r.size === size ? { ...r, ...patch } : r)));
  }

  // -------------------------------------------------------------------------
  // 폼 유효성
  // -------------------------------------------------------------------------
  function validateForm(): string | null {
    if (!session || !preset) return "세션 정보가 없습니다. 처음부터 다시 시작해주세요.";
    if (selectedSizes.size === 0) return "생성할 사이즈를 1개 이상 선택해 주세요.";
    // 선택된 사이즈가 모두 프리셋에 등록되어 있는지 재검증
    for (const s of selectedSizes) {
      if (!availablePresetSizes.includes(s)) {
        return `선택한 사이즈 '${s}'가 프리셋에 등록되어 있지 않습니다.`;
      }
    }
    if (!availablePresetSizes.includes(baseSize)) {
      return `기준 사이즈 '${baseSize}'가 프리셋에 등록되어 있지 않습니다.`;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // 실행: 파일 생성 시작 (Illustrator 전용)
  // -------------------------------------------------------------------------
  async function handleStart() {
    const err = validateForm();
    if (err) {
      setGlobalError(err);
      return;
    }
    if (!session || !preset) return; // 타입 좁히기

    setGlobalError("");
    setGenerating(true);

    // 초기 결과 목록: 모든 사이즈가 pending
    const sizesArr = Array.from(selectedSizes);
    setResults(sizesArr.map((size) => ({ size, status: "pending" as GenerationStatus })));

    try {
      // 1) Illustrator 존재 확인 — 없으면 명확한 에러 후 종료 (Python 폴백 제거)
      const aiExePath = await invoke<string>("find_illustrator_exe").catch(() => null);
      if (!aiExePath) {
        setGlobalError(
          "Adobe Illustrator가 설치되지 않았거나 찾을 수 없습니다. 설치 후 재시도해주세요."
        );
        setGenerating(false);
        return;
      }

      // 2) scripts 경로 확보 (config.json, temp svg 위치)
      const scriptsDir = await invoke<string>("get_illustrator_scripts_path");
      const gradingJsxPath = scriptsDir + "\\grading.jsx";
      const configJsonPath = scriptsDir + "\\config.json";
      const resultJsonPath = scriptsDir + "\\result.json";

      // 출력 루트 = 작업 폴더 그대로
      // 왜: 재설계 취지(주문번호 폴더 안에 바로 떨어뜨리기)를 지키기 위함.
      const workFolder = session.workFolder;
      setOutputDir(workFolder);

      // 출력 파일명의 베이스 (baseAiName 확장자 제거 + sanitize)
      const baseFileName = sanitizeFileName(baseAiName);

      // 3) 각 사이즈 루프
      for (const targetSize of sizesArr) {
        updateResult(targetSize, { status: "processing" });

        try {
          // 3-a) 타겟 SVG 문자열 획득
          // 왜 resolveSvgContent: Drive 프리셋은 svgPathBySize(파일경로)만 있고,
          //   Local 프리셋은 svgBySize(인라인)만 있다. 양쪽을 통합 해석해야 한다.
          let targetSvgData: string | undefined;
          for (const piece of preset.pieces) {
            const svg = await resolveSvgContent(piece, targetSize);
            if (svg) {
              targetSvgData = svg;
              break;
            }
          }
          if (!targetSvgData) {
            throw new Error(
              `프리셋 "${preset.name}"에 사이즈 "${targetSize}"의 SVG 데이터가 없습니다.`
            );
          }

          // 3-b) 임시 SVG를 illustrator-scripts 폴더에 저장
          // 왜 Rust 커맨드: Tauri fs 플러그인은 앱 외부 절대 경로 쓰기 권한이 없음.
          const tempSvgPath = scriptsDir + `\\temp_pattern_${targetSize}.svg`;
          await invoke("write_file_absolute", {
            path: tempSvgPath,
            content: targetSvgData,
          });

          // 3-c) 출력 파일 경로 결정
          // 파일명 규칙: {baseAiName}_{size}.eps → 예: 농구_V넥_XL_M.eps
          const outputFileName = `${baseFileName}_${targetSize}.eps`;
          const outputFilePath = `${workFolder}\\${outputFileName}`;

          // 3-d) config.json 작성 (grading.jsx가 읽는 포맷)
          // 재설계 흐름에서는 "기준 AI 파일"이 곧 디자인 원본이다.
          // grading.jsx는 designAiPath가 있으면 레이어 기반으로 처리한다.
          const config: Record<string, string> = {
            patternSvgPath: tempSvgPath,
            outputPath: outputFilePath,
            resultJsonPath: resultJsonPath,
            patternLineColor: "auto",
            designAiPath: session.baseAiPath,
          };
          await invoke("write_file_absolute", {
            path: configJsonPath,
            content: JSON.stringify(config),
          });

          // 3-e) Illustrator 실행 (grading.jsx 호출 + result.json 폴링)
          const resultRaw = await invoke<string>("run_illustrator_script", {
            illustratorExe: aiExePath,
            scriptPath: gradingJsxPath,
            resultJsonPath: resultJsonPath,
            timeoutSecs: 60,
          });
          const result: IllustratorGradingResult = JSON.parse(resultRaw);

          if (result.success) {
            updateResult(targetSize, {
              status: "success",
              outputPath: result.outputPath,
            });
          } else {
            throw new Error(result.message || "Illustrator 처리 실패");
          }

          // 3-f) 임시 SVG 정리 (실패해도 무시)
          try {
            await invoke("remove_file_absolute", { path: tempSvgPath });
          } catch {
            /* 무시 */
          }
        } catch (e) {
          // 한 사이즈 실패해도 전체 중단하지 않고 다음으로 진행
          console.error(`사이즈 ${targetSize} 생성 실패:`, e);
          updateResult(targetSize, {
            status: "error",
            errorMessage: e instanceof Error ? e.message : "알 수 없는 오류",
          });
        }
      }

      // 4) config.json 정리
      try {
        await invoke("remove_file_absolute", { path: configJsonPath });
      } catch {
        /* 무시 */
      }
    } catch (e) {
      console.error("파일 생성 전체 실패:", e);
      setGlobalError(e instanceof Error ? e.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setGenerating(false);
    }
  }

  // -------------------------------------------------------------------------
  // 결과 화면 액션
  // -------------------------------------------------------------------------
  async function handleOpenFolder() {
    if (!outputDir) return;
    try {
      await openPath(outputDir);
    } catch (e) {
      setGlobalError(`폴더 열기 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * "새 작업 시작" — 세션 초기화 후 /work로.
   * 왜: 결과 화면에서 다음 주문번호로 바로 넘어갈 수 있도록.
   */
  function handleStartNewJob() {
    clearWorkSession();
    navigate("/work");
  }

  // -------------------------------------------------------------------------
  // 렌더
  // -------------------------------------------------------------------------
  if (loadingInit) {
    // 세션 가드 진행 중 깜빡임 방지
    return (
      <div className="page">
        <div className="page__placeholder">
          <p className="page__placeholder-text">작업 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (!session || !preset) {
    // 이 시점에 여기로 떨어지면 useEffect가 이미 navigate했음. 안전망.
    return null;
  }

  return (
    <div className="page">
      <h1 className="page__title">주문 생성</h1>
      <p className="page__description">
        선택한 사이즈별로 Illustrator 그레이딩을 실행해 EPS 파일을 생성합니다.
        결과는 작업 폴더에 바로 저장됩니다.
      </p>

      {/* 작업 요약 카드 */}
      <section className="size-section">
        <h2 className="size-section__title">작업 요약</h2>
        <div className="size-summary">
          <div className="size-summary__row">
            <span className="size-summary__label">기준 AI:</span>
            <span className="size-summary__value">{baseAiName}.ai</span>
          </div>
          <div className="size-summary__row">
            <span className="size-summary__label">작업 폴더:</span>
            <span className="size-summary__value">
              <code>{session.workFolder}</code>
            </span>
          </div>
          <div className="size-summary__row">
            <span className="size-summary__label">선택 패턴:</span>
            <span className="size-summary__value">
              {preset.name} (조각 {preset.pieces.length}개, 사이즈 {preset.sizes.length}개)
            </span>
          </div>
        </div>
      </section>

      {/* 사이즈 선택 */}
      <section className="size-section">
        <div className="size-section__header">
          <h2 className="size-section__title">생성할 사이즈</h2>
          <div className="size-actions">
            <button
              type="button"
              className="btn btn--small btn--excel"
              onClick={handleExcelUpload}
              disabled={orderLoading || generating}
            >
              {orderLoading ? "분석 중..." : "엑셀 주문서로 선택"}
            </button>
            {orderResult && (
              <button
                type="button"
                className="btn btn--small"
                onClick={resetOrderToManual}
                disabled={generating}
              >
                주문서 초기화
              </button>
            )}
            <button
              type="button"
              className="btn btn--small"
              onClick={selectAllSizes}
              disabled={generating}
            >
              전체 선택
            </button>
            <button
              type="button"
              className="btn btn--small"
              onClick={clearAllSizes}
              disabled={selectedSizes.size === 0 || generating}
            >
              전체 해제
            </button>
          </div>
        </div>

        {/* 주문서 파싱 요약 */}
        {orderResult && (
          <div className="order-summary">
            <div className="order-summary__header">
              <span className="order-summary__badge">엑셀 주문서</span>
              <span className="order-summary__info">
                시트: {orderResult.sourceSheet} / 형식:{" "}
                {orderResult.detectedFormat === "horizontal"
                  ? "가로형"
                  : orderResult.detectedFormat === "vertical"
                  ? "세로형"
                  : orderResult.detectedFormat === "table"
                  ? "표형"
                  : "자동감지"}{" "}
                / 총 {orderResult.totalQuantity}장
              </span>
            </div>
          </div>
        )}

        <div className="size-grid">
          {SIZE_LIST.map((size) => {
            const registered = availablePresetSizes.includes(size);
            const checked = selectedSizes.has(size);
            const isBase = size === baseSize;
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
                    ? "기준 사이즈"
                    : ""
                }
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!registered || generating}
                  onChange={() => toggleSize(size)}
                />
                <span className="size-cell__label">{size}</span>
                {quantity !== undefined && quantity > 0 && (
                  <span className="size-cell__qty">{quantity}장</span>
                )}
              </label>
            );
          })}
        </div>

        <div className="size-count">
          선택됨: <strong>{selectedSizes.size}개</strong> / 등록 사이즈{" "}
          {availablePresetSizes.length}개
          {orderResult && orderResult.totalQuantity > 0 && (
            <span className="size-count__total">
              {" "}
              (주문 총 {orderResult.totalQuantity}장)
            </span>
          )}
        </div>
      </section>

      {/* 기준 사이즈 */}
      <section className="size-section">
        <h2 className="size-section__title">기준 사이즈</h2>
        <p className="size-section__hint">
          기준 AI 파일이 어떤 사이즈로 작업된 것인지 선택하세요. 이 사이즈를 기준으로
          다른 사이즈가 비례 스케일링됩니다.
        </p>
        <select
          className="size-select"
          value={baseSize}
          onChange={(e) => setBaseSize(e.target.value)}
          disabled={generating}
        >
          {availablePresetSizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </section>

      {/* 전역 에러 */}
      {globalError && (
        <div className="design-error">
          <strong>오류:</strong> {globalError}
          <button
            className="design-error__close"
            onClick={() => setGlobalError("")}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
      )}

      {/* 실행 버튼 / 진행 표시 / 완료 후 액션 */}
      <div className="size-footer">
        {!generating && !allDone && (
          <button
            className="btn btn--primary btn--large"
            onClick={handleStart}
            disabled={selectedSizes.size === 0}
          >
            파일 생성 시작 ({selectedSizes.size}개)
          </button>
        )}
        {generating && (
          <span className="design-progress">
            Illustrator로 처리 중... ({successCount + errorCount}/{totalCount} 완료
            {processingCount > 0 ? `, ${processingCount}개 처리중` : ""})
          </span>
        )}
        {allDone && (
          <>
            {successCount > 0 && (
              <button className="btn btn--primary" onClick={handleOpenFolder}>
                📂 작업 폴더 열기
              </button>
            )}
            <button className="btn" onClick={handleStartNewJob}>
              ✨ 새 작업 시작
            </button>
          </>
        )}
      </div>

      {/* 결과 목록 */}
      {results.length > 0 && (
        <section className="size-section">
          <div className="size-section__header">
            <h2 className="size-section__title">생성 결과</h2>
            <div className="size-count">
              성공 <strong>{successCount}</strong> / 실패{" "}
              <strong>{errorCount}</strong> / 전체 <strong>{totalCount}</strong>
            </div>
          </div>
          <div className="gen-result-list">
            {results.map((r) => (
              <div key={r.size} className={`gen-result gen-result--${r.status}`}>
                <div className="gen-result__size">{r.size}</div>
                <div className="gen-result__status">
                  {r.status === "pending" && "대기중"}
                  {r.status === "processing" && "처리중..."}
                  {r.status === "success" && "✓ 완료"}
                  {r.status === "error" && "✗ 실패"}
                </div>
                <div className="gen-result__detail">
                  {r.status === "success" && r.outputPath && (
                    <code className="gen-result__path">{r.outputPath}</code>
                  )}
                  {r.status === "error" && (
                    <span className="gen-result__error">{r.errorMessage}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 출력 경로 */}
      {outputDir && (
        <div className="gen-output-path">
          <strong>저장 폴더:</strong> <code>{outputDir}</code>
        </div>
      )}
    </div>
  );
}

export default OrderGenerate;
