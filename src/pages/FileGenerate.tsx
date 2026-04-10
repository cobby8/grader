/**
 * FileGenerate 페이지 (4단계 파트 2)
 *
 * SizeSelect 페이지에서 저장한 생성 요청을 바탕으로 Python 엔진을 호출하여
 * 사이즈별 그레이딩 PDF를 생성한다.
 *
 * 처리 흐름:
 *   1) generationStore에서 GenerationRequest 로드 (없으면 SizeSelect로 되돌림)
 *   2) presetStore/designStore에서 실제 프리셋/디자인 데이터 로드
 *   3) 사용자가 "파일 생성 시작" 클릭 → 출력 폴더 경로 확정
 *   4) 프리셋 JSON을 임시 파일로 저장 (Python이 읽을 수 있도록)
 *   5) 각 타겟 사이즈마다 순차적으로:
 *      a. Python calc_scale 호출 → scale_x, scale_y
 *      b. Python generate_graded 호출 → 출력 PDF 생성
 *      c. 진행 상태 UI 업데이트
 *   6) 완료 후 결과 목록 + 폴더 열기 버튼 표시
 *
 * 파일 출력 위치:
 *   {AppData}/com.grader.app/outputs/{timestamp}/{디자인명}_{사이즈}.pdf
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import {
  exists,
  mkdir,
  writeTextFile,
  remove,
  BaseDirectory,
} from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { loadPresets } from "../stores/presetStore";
import { loadDesigns } from "../stores/designStore";
import {
  loadGenerationRequest,
  clearGenerationRequest,
} from "../stores/generationStore";
import type { PatternPreset } from "../types/pattern";
import type { DesignFile } from "../types/design";
import type {
  GenerationRequest,
  GenerationResult,
  GenerationStatus,
  CalcScaleResult,
  GenerateGradedResult,
} from "../types/generation";

/**
 * Python 엔진 호출 헬퍼
 * DesignUpload 페이지와 동일 패턴. 실패 시 예외 throw.
 */
async function callPython<T extends { success: boolean; error?: string }>(
  command: string,
  args: string[]
): Promise<T> {
  const raw = await invoke<string>("run_python", { command, args });
  if (!raw || !raw.trim()) {
    throw new Error("Python 엔진이 빈 응답을 반환했습니다.");
  }
  const result = JSON.parse(raw.trim()) as T;
  if (!result.success) {
    throw new Error(result.error || "Python 처리 실패");
  }
  return result;
}

/**
 * 타임스탬프 기반 출력 디렉토리명을 생성한다.
 * 예: "2026-04-10_14-32-05"
 */
function getTimestampDirName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

/** 파일명으로 사용할 수 없는 문자 제거 */
function sanitizeFileName(name: string): string {
  // 확장자 제거 + 파일 시스템 금지 문자 치환
  return name
    .replace(/\.[^/.]+$/, "") // 확장자 제거
    .replace(/[<>:"/\\|?*]/g, "_")
    .trim() || "design";
}

function FileGenerate() {
  const navigate = useNavigate();

  // SizeSelect에서 전달된 요청
  const [request, setRequest] = useState<GenerationRequest | null>(null);
  // 실제 데이터 (요청의 ID를 풀어서 객체로 저장)
  const [preset, setPreset] = useState<PatternPreset | null>(null);
  const [design, setDesign] = useState<DesignFile | null>(null);

  // 생성 진행 상태
  const [results, setResults] = useState<GenerationResult[]>([]);
  const [generating, setGenerating] = useState(false);
  const [globalError, setGlobalError] = useState<string>("");
  // 완료 후 결과 출력 디렉토리 (폴더 열기 버튼용)
  const [outputDir, setOutputDir] = useState<string>("");

  // 초기 로드: sessionStorage에서 요청 읽고 프리셋/디자인 객체 매칭
  useEffect(() => {
    const req = loadGenerationRequest();
    if (!req) {
      // 요청 데이터가 없으면 SizeSelect로 되돌려보냄
      navigate("/size");
      return;
    }
    setRequest(req);

    (async () => {
      const [presetList, designList] = await Promise.all([
        loadPresets(),
        loadDesigns(),
      ]);
      const p = presetList.find((x) => x.id === req.presetId) || null;
      const d = designList.find((x) => x.id === req.designFileId) || null;
      setPreset(p);
      setDesign(d);

      // 초기 결과 목록: 모든 사이즈가 pending 상태
      setResults(
        req.selectedSizes.map((size) => ({
          size,
          status: "pending" as GenerationStatus,
        }))
      );
    })();
  }, [navigate]);

  /**
   * 특정 사이즈의 결과를 업데이트하는 헬퍼.
   * 불변성을 유지하며 해당 항목만 교체한다.
   */
  function updateResult(size: string, patch: Partial<GenerationResult>) {
    setResults((prev) =>
      prev.map((r) => (r.size === size ? { ...r, ...patch } : r))
    );
  }

  /**
   * "파일 생성 시작" 핸들러
   *
   * 단계:
   *   1. 출력 디렉토리(AppData/outputs/{timestamp}) 생성
   *   2. 프리셋 JSON을 임시 파일로 저장 (Python이 읽을 수 있도록)
   *   3. 각 사이즈 순차 처리: calc_scale → generate_graded
   *   4. 임시 프리셋 파일 삭제
   */
  async function handleStart() {
    if (!request || !preset || !design) {
      setGlobalError("요청 데이터가 완전하지 않습니다. 사이즈 선택 페이지로 돌아가세요.");
      return;
    }

    setGenerating(true);
    setGlobalError("");

    try {
      // 1) 출력 디렉토리 준비: AppData/outputs/{timestamp}/
      const timestampDir = getTimestampDirName();
      const relOutputDir = `outputs/${timestampDir}`;

      // outputs/ 상위 폴더 존재 보장
      const outputsRootExists = await exists("outputs", {
        baseDir: BaseDirectory.AppData,
      });
      if (!outputsRootExists) {
        await mkdir("outputs", {
          baseDir: BaseDirectory.AppData,
          recursive: true,
        });
      }
      // timestamp 하위 폴더 생성
      await mkdir(relOutputDir, {
        baseDir: BaseDirectory.AppData,
        recursive: true,
      });

      // 절대 경로 확보 (Python에게 넘길 경로)
      const appData = await appDataDir();
      const absOutputDir = await join(appData, "outputs", timestampDir);
      setOutputDir(absOutputDir);

      // 2) 프리셋 JSON을 임시 파일로 기록
      // Python calc_scale이 파일 경로로 JSON을 읽음
      const tempPresetRel = `outputs/${timestampDir}/_preset.json`;
      const tempPresetAbs = await join(absOutputDir, "_preset.json");
      await writeTextFile(tempPresetRel, JSON.stringify(preset), {
        baseDir: BaseDirectory.AppData,
      });

      // 3) 각 사이즈 순차 처리
      const baseFileName = sanitizeFileName(design.name);

      for (const targetSize of request.selectedSizes) {
        // 상태: 처리중
        updateResult(targetSize, { status: "processing" });

        try {
          // 3-a) 스케일 비율 계산
          const scale = await callPython<CalcScaleResult>("calc_scale", [
            tempPresetAbs,
            request.baseSize,
            targetSize,
          ]);

          // 3-b) 출력 PDF 경로 결정: {디자인명}_{사이즈}.pdf
          const outputFileName = `${baseFileName}_${targetSize}.pdf`;
          const outputAbs = await join(absOutputDir, outputFileName);

          // 3-c) Python generate_graded 호출
          const graded = await callPython<GenerateGradedResult>(
            "generate_graded",
            [
              design.storedPath, // 원본 기준 디자인 PDF (AppData/designs/{id}.pdf)
              outputAbs,
              scale.scale_x.toString(),
              scale.scale_y.toString(),
            ]
          );

          // 상태: 성공
          updateResult(targetSize, {
            status: "success",
            outputPath: graded.output_path,
            scaleX: graded.scale_x,
            scaleY: graded.scale_y,
            outputWidthMm: graded.output_width_mm,
            outputHeightMm: graded.output_height_mm,
          });
        } catch (err) {
          // 한 사이즈 실패해도 전체 중단하지 않고 다음으로 진행
          console.error(`사이즈 ${targetSize} 생성 실패:`, err);
          updateResult(targetSize, {
            status: "error",
            errorMessage:
              err instanceof Error ? err.message : "알 수 없는 오류",
          });
        }
      }

      // 4) 임시 프리셋 파일 정리 (실패해도 무시)
      try {
        await remove(tempPresetRel, { baseDir: BaseDirectory.AppData });
      } catch {
        // 무시
      }
    } catch (err) {
      console.error("파일 생성 실패:", err);
      setGlobalError(
        err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다."
      );
    } finally {
      setGenerating(false);
    }
  }

  /** 출력 폴더를 OS 파일 탐색기로 연다 */
  async function handleOpenFolder() {
    if (!outputDir) return;
    try {
      await openPath(outputDir);
    } catch (err) {
      console.error("폴더 열기 실패:", err);
      setGlobalError(
        `폴더 열기 실패: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /** 사이즈 선택 페이지로 돌아가기 */
  function handleBack() {
    navigate("/size");
  }

  /** 다시 생성 (선택 초기화) */
  function handleReset() {
    clearGenerationRequest();
    navigate("/size");
  }

  // 결과 통계
  const totalCount = results.length;
  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  const processingCount = results.filter((r) => r.status === "processing").length;
  const allDone = !generating && totalCount > 0 && successCount + errorCount === totalCount;

  return (
    <div className="page">
      <h1 className="page__title">파일 생성</h1>
      <p className="page__description">
        선택한 사이즈별로 CMYK PDF 파일을 자동 생성합니다. 원본 디자인이 지정한
        기준 사이즈 대비 비례 스케일링되며, 색상 공간은 유지됩니다.
      </p>

      {/* 요청 정보가 없을 때 */}
      {!request && (
        <div className="page__placeholder">
          <p className="page__placeholder-text">생성 요청 정보를 불러오는 중...</p>
        </div>
      )}

      {/* 요청 요약 */}
      {request && preset && design && (
        <section className="size-section">
          <h2 className="size-section__title">생성 요약</h2>
          <div className="size-summary">
            <div className="size-summary__row">
              <span className="size-summary__label">프리셋:</span>
              <span className="size-summary__value">{preset.name}</span>
            </div>
            <div className="size-summary__row">
              <span className="size-summary__label">디자인:</span>
              <span className="size-summary__value">{design.name}</span>
            </div>
            <div className="size-summary__row">
              <span className="size-summary__label">기준 사이즈:</span>
              <span className="size-summary__value">{request.baseSize}</span>
            </div>
            <div className="size-summary__row">
              <span className="size-summary__label">생성할 사이즈:</span>
              <span className="size-summary__value">
                {request.selectedSizes.join(", ")} ({request.selectedSizes.length}개)
              </span>
            </div>
          </div>
        </section>
      )}

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

      {/* 실행 버튼 영역 */}
      {request && (
        <div className="size-footer">
          {!generating && !allDone && (
            <>
              <button className="btn" onClick={handleBack} disabled={generating}>
                ← 이전
              </button>
              <button
                className="btn btn--primary btn--large"
                onClick={handleStart}
                disabled={generating || !preset || !design}
              >
                파일 생성 시작
              </button>
            </>
          )}
          {generating && (
            <span className="design-progress">
              생성 중... ({successCount + errorCount}/{totalCount} 완료
              {processingCount > 0 ? `, ${processingCount}개 처리중` : ""})
            </span>
          )}
          {allDone && (
            <>
              <button className="btn" onClick={handleReset}>
                처음으로
              </button>
              {successCount > 0 && (
                <button
                  className="btn btn--primary"
                  onClick={handleOpenFolder}
                >
                  📂 출력 폴더 열기
                </button>
              )}
            </>
          )}
        </div>
      )}

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
                  {r.status === "success" && (
                    <>
                      {r.outputWidthMm}×{r.outputHeightMm}mm (스케일{" "}
                      {r.scaleX?.toFixed(3)}×{r.scaleY?.toFixed(3)})
                    </>
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

      {/* 출력 경로 표시 */}
      {outputDir && (
        <div className="gen-output-path">
          <strong>출력 경로:</strong> <code>{outputDir}</code>
        </div>
      )}
    </div>
  );
}

export default FileGenerate;
