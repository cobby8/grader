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
// 참고: Tauri fs 플러그인은 AppData 범위 밖 절대 경로에 대한 쓰기 권한이 없다.
// illustrator-scripts/ 폴더처럼 앱 외부 경로에 파일을 쓸 때는
// Rust 커맨드(write_file_absolute 등)를 사용한다.
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
  IllustratorGradingResult,
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

/**
 * 파일 크기를 사람이 읽기 쉬운 형식으로 변환한다.
 * DesignUpload의 동일 함수와 같은 구현 (공통 util로 빼지 않고 중복 허용 - 단순함 우선).
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  // 어떤 엔진으로 처리하는지 (진행 메시지 표시용)
  const [engineName, setEngineName] = useState<string>("");

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
      const [presetResult, designResult] = await Promise.all([
        loadPresets(),
        loadDesigns(),
      ]);
      // 읽기 전용이므로 data만 꺼냄
      const p = presetResult.data.find((x) => x.id === req.presetId) || null;
      const d = designResult.data.find((x) => x.id === req.designFileId) || null;
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
   * Illustrator가 설치되어 있으면 grading.jsx를 호출하여 처리하고,
   * 없으면 기존 Python 엔진으로 폴백한다.
   *
   * Illustrator 방식 단계:
   *   1. 출력 디렉토리 생성
   *   2. Illustrator 존재 확인 + illustrator-scripts 경로 확보
   *   3. 각 사이즈마다: 타겟 SVG 임시 파일 저장 -> config.json 작성 -> grading.jsx 실행 -> 결과 확인
   *
   * Python 폴백 단계:
   *   1. 출력 디렉토리 생성
   *   2. 프리셋 JSON 임시 파일 저장
   *   3. 각 사이즈마다: calc_scale -> generate_graded
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

      // 절대 경로 확보
      const appData = await appDataDir();
      const absOutputDir = await join(appData, "outputs", timestampDir);
      setOutputDir(absOutputDir);

      // 2) Illustrator 존재 확인 — 없으면 Python 폴백
      const aiExePath = await invoke<string>("find_illustrator_exe").catch(
        () => null
      );

      if (aiExePath) {
        // ===== Illustrator 방식 =====
        setEngineName("Illustrator");
        await handleStartIllustrator(
          aiExePath,
          absOutputDir,
          timestampDir,
          request,
          preset,
          design
        );
      } else {
        // ===== Python 폴백 =====
        setEngineName("Python");
        await handleStartPythonFallback(
          absOutputDir,
          timestampDir,
          request,
          preset,
          design
        );
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

  /**
   * Illustrator 방식으로 각 사이즈별 그레이딩 수행.
   *
   * 흐름:
   *   1. illustrator-scripts/ 폴더 경로 확보
   *   2. 각 사이즈마다:
   *      a. 타겟 사이즈 SVG를 임시 파일로 저장
   *      b. config.json 작성 (grading.jsx와 같은 폴더)
   *      c. run_illustrator_script 호출 (내부에서 result.json 폴링)
   *      d. 결과 파싱하여 상태 업데이트
   */
  async function handleStartIllustrator(
    aiExePath: string,
    absOutputDir: string,
    _timestampDir: string,
    req: GenerationRequest,
    pst: PatternPreset,
    dsg: DesignFile
  ) {
    // illustrator-scripts/ 폴더 절대 경로
    const scriptsDir = await invoke<string>("get_illustrator_scripts_path");
    // grading.jsx 절대 경로
    const gradingJsxPath = scriptsDir + "\\grading.jsx";
    // config.json은 grading.jsx와 같은 폴더에 매번 덮어쓰기
    const configJsonPath = scriptsDir + "\\config.json";
    // result.json도 같은 폴더
    const resultJsonPath = scriptsDir + "\\result.json";

    const baseFileName = sanitizeFileName(dsg.name);

    for (const targetSize of req.selectedSizes) {
      // 상태: 처리중
      updateResult(targetSize, { status: "processing" });

      try {
        // 2-a) 타겟 사이즈의 SVG 데이터를 가져온다
        // 프리셋의 첫 번째 조각(pieces[0])에서 svgBySize를 찾는다
        // 왜 pieces[0]인가: 현재 MVP에서는 단일 조각(앞판)만 사용하기 때문
        let targetSvgData: string | undefined;
        for (const piece of pst.pieces) {
          if (piece.svgBySize && piece.svgBySize[targetSize]) {
            targetSvgData = piece.svgBySize[targetSize];
            break;
          }
        }

        if (!targetSvgData) {
          throw new Error(
            `프리셋 "${pst.name}"에 사이즈 "${targetSize}"의 SVG 데이터가 없습니다.`
          );
        }

        // 2-b) 타겟 SVG를 임시 파일로 저장
        // illustrator-scripts/ 폴더에 저장하여 Illustrator가 접근 가능하게 함
        const tempSvgPath = scriptsDir + `\\temp_pattern_${targetSize}.svg`;
        // Rust 커맨드로 절대 경로에 파일 쓰기 (Tauri fs 플러그인은 앱 외부 경로 권한 없음)
        await invoke('write_file_absolute', { path: tempSvgPath, content: targetSvgData });

        // 2-c) 출력 EPS 경로 결정
        // 왜 EPS인가: 승화전사 업체에서 EPS 파일을 요구하는 경우가 대부분이다.
        const outputFileName = `${baseFileName}_${targetSize}.eps`;
        const outputFilePath = await join(absOutputDir, outputFileName);

        // 2-d) config.json 작성 (grading.jsx가 읽는 형식)
        // AI 파일 경로가 있으면 designAiPath로 전달 (레이어 기반 정밀 처리)
        // 없으면 designPdfPath만 전달 (기존 PDF 폴백 방식)
        // storedPath 확장자가 .ai면 AI 파일로 판정
        const isAiFile = dsg.storedPath.toLowerCase().endsWith(".ai");
        const config: Record<string, string> = {
          patternSvgPath: tempSvgPath,           // 타겟 사이즈 SVG (틀)
          outputPath: outputFilePath,            // 출력 파일 경로 (.eps — 확장자로 형식 자동 판별)
          resultJsonPath: resultJsonPath,         // 결과 마커 파일 경로
          patternLineColor: "auto",               // 패턴선 색 자동 전환 (배경 밝기 따라 흰/검). UI 노출 없음 — 필요 시 "keep"/"white"/"black"로 수동 덮어쓰기
        };
        if (isAiFile) {
          // AI 파일: 레이어 기반 처리 (요소 레이어만 복사, 몸판에서 색상 추출)
          config.designAiPath = dsg.storedPath;
        } else {
          // PDF: 기존 폴백 방식 (전체 복사, 면적 기준 색상 추출)
          config.designPdfPath = dsg.storedPath;
        }
        // Rust 커맨드로 절대 경로에 config.json 쓰기
        await invoke('write_file_absolute', { path: configJsonPath, content: JSON.stringify(config) });

        // 2-e) Illustrator로 grading.jsx 실행
        // run_illustrator_script는 내부에서 result.json을 폴링하여 완료를 감지한다
        // 타임아웃 60초 (사이즈당 10~30초 예상, 여유 확보)
        const resultRaw = await invoke<string>("run_illustrator_script", {
          illustratorExe: aiExePath,
          scriptPath: gradingJsxPath,
          resultJsonPath: resultJsonPath,
          timeoutSecs: 60,
        });

        // 2-f) 결과 파싱
        const result: IllustratorGradingResult = JSON.parse(resultRaw);

        if (result.success) {
          // 성공
          updateResult(targetSize, {
            status: "success",
            outputPath: result.outputPath,
          });
        } else {
          // Illustrator 내부에서 실패
          throw new Error(result.message || "Illustrator 처리 실패");
        }

        // 2-g) 임시 SVG 파일 정리 (실패해도 무시)
        try {
          await invoke('remove_file_absolute', { path: tempSvgPath });
        } catch {
          // 무시
        }
      } catch (err) {
        // 한 사이즈 실패해도 전체 중단하지 않고 다음으로 진행
        console.error(`사이즈 ${targetSize} Illustrator 생성 실패:`, err);
        updateResult(targetSize, {
          status: "error",
          errorMessage:
            err instanceof Error ? err.message : "알 수 없는 오류",
        });
      }
    }

    // config.json 정리 (마지막 사이즈 처리 후)
    try {
      await invoke('remove_file_absolute', { path: configJsonPath });
    } catch {
      // 무시
    }
  }

  /**
   * Python 폴백 방식 (기존 로직).
   * Illustrator가 없는 환경에서 calc_scale + generate_graded를 사용한다.
   */
  async function handleStartPythonFallback(
    absOutputDir: string,
    timestampDir: string,
    req: GenerationRequest,
    pst: PatternPreset,
    dsg: DesignFile
  ) {
    const baseFileName = sanitizeFileName(dsg.name);
    const presetJsonRel = `outputs/${timestampDir}/_preset.json`;
    await writeTextFile(presetJsonRel, JSON.stringify(pst), {
      baseDir: BaseDirectory.AppData,
    });
    const presetJsonAbs = await join(absOutputDir, "_preset.json");

    for (const targetSize of req.selectedSizes) {
      // 상태: 처리중
      updateResult(targetSize, { status: "processing" });

      try {
        // Python calc_scale 호출 -> 가로/세로 비율 계산
        const scale = await callPython<CalcScaleResult>("calc_scale", [
          presetJsonAbs,
          req.baseSize,
          targetSize,
        ]);

        // 출력 PDF 경로 결정
        const outputFileName = `${baseFileName}_${targetSize}.pdf`;
        const outputAbs = await join(absOutputDir, outputFileName);

        // Python generate_graded 호출 -> 단순 비례 스케일링 PDF 생성
        const graded = await callPython<GenerateGradedResult>(
          "generate_graded",
          [
            dsg.storedPath,
            outputAbs,
            String(scale.scale_x),
            String(scale.scale_y),
          ]
        );

        // 상태: 성공
        updateResult(targetSize, {
          status: "success",
          outputPath: graded.output_path,
          scaleX: scale.scale_x,
          scaleY: scale.scale_y,
          outputWidthMm: graded.output_width_mm,
          outputHeightMm: graded.output_height_mm,
          fileSizeBytes: graded.file_size_bytes,
          originalSizeBytes: graded.original_size_bytes,
          compressionRatio: graded.compression_ratio,
        });
      } catch (err) {
        console.error(`사이즈 ${targetSize} Python 생성 실패:`, err);
        updateResult(targetSize, {
          status: "error",
          errorMessage:
            err instanceof Error ? err.message : "알 수 없는 오류",
        });
      }
    }

    // 임시 프리셋 JSON 파일 정리
    try {
      await remove(presetJsonRel, { baseDir: BaseDirectory.AppData });
    } catch {
      // 무시
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
              {engineName ? `${engineName}로 처리 중` : "생성 중"}... ({successCount + errorCount}/{totalCount} 완료
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
                      {r.outputWidthMm}×{r.outputHeightMm}mm
                      {/* 5단계 신규: 파일 크기 및 압축률 표시 */}
                      {typeof r.fileSizeBytes === "number" && r.fileSizeBytes > 0 && (
                        <span className="gen-result__size-info">
                          {" · "}
                          {formatFileSize(r.fileSizeBytes)}
                          {typeof r.compressionRatio === "number" &&
                            r.compressionRatio > 0 && (
                              <span
                                className="gen-result__ratio"
                                title={`원본 대비 ${(r.compressionRatio * 100).toFixed(0)}%`}
                              >
                                {" "}
                                ({(r.compressionRatio * 100).toFixed(0)}%)
                              </span>
                            )}
                        </span>
                      )}
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
