/**
 * PatternManage 페이지
 * SVG 패턴(옷 조각) 프리셋을 등록하고 관리하는 페이지.
 *
 * 두 가지 화면(모드)이 있다:
 * 1) 목록 모드: 등록된 프리셋 카드 목록 + "새 프리셋 추가" 버튼
 * 2) 편집 모드: 프리셋 이름 입력, 조각 추가/삭제, 사이즈별 치수 입력
 *
 * 개선사항 (2026-04-08):
 * - SVG 다중 파일 선택 지원
 * - 드래그 앤 드롭 지원 (Tauri onDragDropEvent)
 * - 폴더 업로드 → 파일명에서 사이즈 자동 추출 → svgBySize로 그룹핑
 */

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { PatternPreset, PatternPiece, SizeSpec } from "../types/pattern";
import { SIZE_LIST } from "../types/pattern";
import { loadPresets, savePresets, generateId } from "../stores/presetStore";

/** 편집 모드 상태 타입 */
type EditMode = "list" | "create" | "edit";

// === 유틸리티 함수 ===

/**
 * 파일명에서 사이즈를 추출한다.
 * 예: "농구유니폼_U넥_스탠다드_암홀X_2XL.svg" → "2XL"
 * 마지막 언더스코어(_) 이후, .svg 확장자 이전 부분을 사이즈 키워드와 매칭.
 */
function extractSizeFromFilename(filename: string): string | null {
  // .svg 확장자 제거
  const nameWithoutExt = filename.replace(/\.svg$/i, "");
  // 마지막 _ 이후 부분 추출
  const lastPart = nameWithoutExt.split("_").pop() || "";
  // 사이즈 키워드와 매칭 (대소문자 무시)
  const normalized = lastPart.toUpperCase().replace(/\s/g, "");
  // 긴 키워드부터 매칭해야 "5XL"이 "XL"로 잘못 매칭되지 않는다
  const sizes = [
    "5XS", "4XS", "3XS", "2XS", "XS",
    "S", "M", "L",
    "XL", "2XL", "3XL", "4XL", "5XL",
  ];
  if (sizes.includes(normalized)) return normalized;
  return null;
}

/**
 * 파일명에서 사이즈 부분을 제거하여 조각명을 추출한다.
 * 예: "농구유니폼_U넥_스탠다드_암홀X_2XL.svg" → "농구유니폼_U넥_스탠다드_암홀X"
 */
function extractPieceNameFromFilename(filename: string): string {
  const nameWithoutExt = filename.replace(/\.svg$/i, "");
  const parts = nameWithoutExt.split("_");
  const lastPart = parts[parts.length - 1] || "";
  const normalized = lastPart.toUpperCase().replace(/\s/g, "");
  const sizes = [
    "5XS", "4XS", "3XS", "2XS", "XS",
    "S", "M", "L",
    "XL", "2XL", "3XL", "4XL", "5XL",
  ];
  // 마지막 부분이 사이즈면 제거하고 나머지를 조각명으로
  if (sizes.includes(normalized)) {
    return parts.slice(0, -1).join("_");
  }
  // 사이즈가 아니면 전체를 조각명으로
  return nameWithoutExt;
}

/**
 * 경로에서 파일명만 추출한다.
 * 예: "C:/path/to/file.svg" → "file.svg"
 */
function getFilenameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || "unknown.svg";
}

/**
 * 경로에서 폴더명만 추출한다.
 * 예: "C:/path/to/폴더명" → "폴더명"
 */
function getFolderNameFromPath(dirPath: string): string {
  // 끝에 슬래시가 있으면 제거
  const cleaned = dirPath.replace(/[\\/]+$/, "");
  return cleaned.split(/[\\/]/).pop() || "프리셋";
}

function PatternManage() {
  // === 상태 관리 ===
  const [presets, setPresets] = useState<PatternPreset[]>([]); // 전체 프리셋 목록
  const [mode, setMode] = useState<EditMode>("list");          // 현재 화면 모드
  const [editingId, setEditingId] = useState<string | null>(null); // 편집 중인 프리셋 ID

  // 편집 폼 상태
  const [formName, setFormName] = useState("");                // 프리셋 이름
  const [formPieces, setFormPieces] = useState<PatternPiece[]>([]); // 패턴 조각 목록
  const [formSizes, setFormSizes] = useState<SizeSpec[]>([]);  // 사이즈별 치수

  const [loading, setLoading] = useState(true);  // 초기 로딩 상태
  const [saving, setSaving] = useState(false);   // 저장 중 상태

  // 드래그앤드롭 상태
  const [isDragOver, setIsDragOver] = useState(false); // 드래그 오버 중인지
  const dropZoneRef = useRef<HTMLDivElement>(null);     // 드롭존 DOM 참조

  // === 앱 시작 시 프리셋 로드 ===
  useEffect(() => {
    loadPresets()
      .then((data) => setPresets(data))
      .finally(() => setLoading(false));
  }, []);

  // === Tauri 드래그앤드롭 이벤트 리스닝 ===
  // 편집 모드일 때만 리스닝 (목록 모드에서는 불필요)
  useEffect(() => {
    if (mode === "list") return;

    let unlisten: (() => void) | null = null;

    const setupDragDrop = async () => {
      try {
        unlisten = await getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type === "over") {
            // 드래그가 웹뷰 위에 있을 때 시각 피드백
            setIsDragOver(true);
          } else if (event.payload.type === "leave") {
            // 드래그가 웹뷰를 떠날 때
            setIsDragOver(false);
          } else if (event.payload.type === "drop") {
            // 파일이 드롭되었을 때
            setIsDragOver(false);
            const paths: string[] = event.payload.paths;
            if (paths.length > 0) {
              handleDroppedPaths(paths);
            }
          }
        });
      } catch (err) {
        console.warn("드래그앤드롭 이벤트 등록 실패 (무시):", err);
      }
    };

    setupDragDrop();

    // 클린업: 리스너 해제
    return () => {
      if (unlisten) unlisten();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // === 프리셋 저장 (presets 상태가 바뀔 때마다 파일에 자동 저장) ===
  const persistPresets = useCallback(async (updated: PatternPreset[]) => {
    setPresets(updated);
    try {
      await savePresets(updated);
    } catch (err) {
      console.error("자동 저장 실패:", err);
    }
  }, []);

  // === 새 프리셋 생성 모드 진입 ===
  const handleCreate = () => {
    setFormName("");
    setFormPieces([]);
    // 13개 사이즈에 대해 빈 치수 배열로 초기화
    setFormSizes(SIZE_LIST.map((size) => ({ size, pieces: [] })));
    setEditingId(null);
    setMode("create");
  };

  // === 기존 프리셋 편집 모드 진입 ===
  const handleEdit = (preset: PatternPreset) => {
    setFormName(preset.name);
    setFormPieces([...preset.pieces]);
    // 기존 데이터 복원, 누락된 사이즈가 있으면 빈 배열로 채움
    const sizeMap = new Map(preset.sizes.map((s) => [s.size, s]));
    setFormSizes(
      SIZE_LIST.map((size) => sizeMap.get(size) || { size, pieces: [] })
    );
    setEditingId(preset.id);
    setMode("edit");
  };

  // === 프리셋 삭제 ===
  const handleDelete = async (id: string) => {
    const updated = presets.filter((p) => p.id !== id);
    await persistPresets(updated);
  };

  // === SVG 파일 여러 개 선택 및 추가 (다중 선택) ===
  const handleAddPieces = async () => {
    try {
      // Tauri 파일 다이얼로그로 SVG 파일 다중 선택
      const result = await open({
        title: "패턴 조각 SVG 파일 선택 (여러 개 가능)",
        filters: [{ name: "SVG 파일", extensions: ["svg"] }],
        multiple: true,  // 다중 선택 활성화
      });

      if (!result) return; // 사용자가 취소한 경우

      // result는 multiple=true일 때 string[] 또는 string
      const filePaths: string[] = Array.isArray(result) ? result : [result];
      if (filePaths.length === 0) return;

      // 선택한 파일들을 조각으로 추가
      await addSvgFilesAsPieces(filePaths);
    } catch (err) {
      console.error("SVG 파일 추가 실패:", err);
    }
  };

  // === 폴더 선택 → 내부 SVG 파일 스캔 → 사이즈별 그룹핑 ===
  const handleAddFolder = async () => {
    try {
      // 폴더 선택 다이얼로그
      const dirPath = await open({
        title: "패턴 폴더 선택 (SVG 파일이 들어있는 폴더)",
        directory: true,  // 폴더 선택 모드
        multiple: false,
      });

      if (!dirPath) return;

      // Rust 커맨드로 폴더 내 SVG 파일 목록 가져오기
      const svgFiles: string[] = await invoke("list_svg_files", {
        dirPath: dirPath as string,
      });

      if (svgFiles.length === 0) {
        alert("선택한 폴더에 SVG 파일이 없습니다.");
        return;
      }

      // 폴더명으로 프리셋 이름 자동 설정 (이름이 비어있을 때만)
      if (!formName.trim()) {
        setFormName(getFolderNameFromPath(dirPath as string));
      }

      // 사이즈 추출이 가능한지 확인하여 그룹핑 또는 개별 추가 결정
      await addSvgFilesWithSizeGrouping(svgFiles);
    } catch (err) {
      console.error("폴더 등록 실패:", err);
    }
  };

  // === 드롭된 파일/폴더 경로 처리 ===
  const handleDroppedPaths = async (paths: string[]) => {
    try {
      // 각 경로가 폴더인지 파일인지 확인
      // 간단한 접근: 경로 중 하나라도 폴더면 폴더 모드로 처리
      // (Tauri에서는 드롭 시 파일 경로만 전달, 폴더일 수도 있음)

      const allSvgPaths: string[] = [];

      for (const p of paths) {
        // 폴더인 경우: Rust 커맨드로 내부 SVG 파일 목록 가져오기
        try {
          const svgFiles: string[] = await invoke("list_svg_files", {
            dirPath: p,
          });
          // list_svg_files가 성공하면 폴더임
          allSvgPaths.push(...svgFiles);

          // 폴더명으로 프리셋 이름 자동 설정 (비어있을 때)
          if (!formName.trim()) {
            setFormName(getFolderNameFromPath(p));
          }
        } catch {
          // 폴더가 아닌 경우 → 파일로 간주
          const filename = getFilenameFromPath(p);
          if (filename.toLowerCase().endsWith(".svg")) {
            allSvgPaths.push(p);
          }
        }
      }

      if (allSvgPaths.length === 0) {
        alert("SVG 파일이 없습니다. SVG 파일이나 SVG가 포함된 폴더를 드롭하세요.");
        return;
      }

      // 사이즈 그룹핑 시도
      await addSvgFilesWithSizeGrouping(allSvgPaths);
    } catch (err) {
      console.error("드롭 처리 실패:", err);
    }
  };

  // === SVG 파일들을 사이즈별로 그룹핑하여 조각으로 추가 ===
  const addSvgFilesWithSizeGrouping = async (filePaths: string[]) => {
    // 파일명에서 사이즈를 추출하여 조각명별로 그룹핑
    // { "농구유니폼_U넥_스탠다드_암홀X": { "2XL": "path", "L": "path", ... } }
    const grouped = new Map<string, Map<string, string>>();
    const ungrouped: string[] = []; // 사이즈 추출 실패한 파일

    for (const fp of filePaths) {
      const filename = getFilenameFromPath(fp);
      const size = extractSizeFromFilename(filename);

      if (size) {
        const pieceName = extractPieceNameFromFilename(filename);
        if (!grouped.has(pieceName)) {
          grouped.set(pieceName, new Map());
        }
        grouped.get(pieceName)!.set(size, fp);
      } else {
        ungrouped.push(fp);
      }
    }

    const newPieces: PatternPiece[] = [];

    // 1) 사이즈 그룹핑된 조각 처리
    for (const [pieceName, sizeMap] of grouped) {
      // 대표 SVG: M사이즈를 우선, 없으면 L, 없으면 첫 번째
      const representativeSize = sizeMap.has("M")
        ? "M"
        : sizeMap.has("L")
          ? "L"
          : sizeMap.keys().next().value!;

      const representativePath = sizeMap.get(representativeSize)!;
      const representativeSvg = await readTextFile(representativePath);

      // 모든 사이즈의 SVG 데이터를 읽어서 svgBySize에 저장
      const svgBySize: Record<string, string> = {};
      for (const [size, path] of sizeMap) {
        try {
          svgBySize[size] = await readTextFile(path);
        } catch (err) {
          console.warn(`SVG 읽기 실패 (${size}): ${path}`, err);
        }
      }

      const newPiece: PatternPiece = {
        id: generateId(),
        name: pieceName,
        svgPath: representativePath,
        svgData: representativeSvg,  // 대표 SVG (미리보기용)
        svgBySize,                    // 사이즈별 SVG 전체
      };
      newPieces.push(newPiece);
    }

    // 2) 사이즈 추출 실패한 파일들은 개별 조각으로 추가
    for (const fp of ungrouped) {
      try {
        const svgData = await readTextFile(fp);
        const filename = getFilenameFromPath(fp);
        const defaultName = filename.replace(/\.svg$/i, "");

        const newPiece: PatternPiece = {
          id: generateId(),
          name: defaultName,
          svgPath: fp,
          svgData,
        };
        newPieces.push(newPiece);
      } catch (err) {
        console.warn(`SVG 읽기 실패: ${fp}`, err);
      }
    }

    if (newPieces.length === 0) return;

    // 폼 상태에 추가
    const updatedPieces = [...formPieces, ...newPieces];
    setFormPieces(updatedPieces);

    // 모든 사이즈의 pieces 배열에 새 조각들의 빈 치수를 추가
    setFormSizes((prev) =>
      prev.map((sizeSpec) => ({
        ...sizeSpec,
        pieces: [
          ...sizeSpec.pieces,
          ...newPieces.map((np) => ({
            pieceId: np.id,
            width: 0,
            height: 0,
          })),
        ],
      }))
    );
  };

  // === SVG 파일들을 개별 조각으로 추가 (다중 선택 시 사용) ===
  const addSvgFilesAsPieces = async (filePaths: string[]) => {
    // 파일명에 사이즈 키워드가 있는지 확인하여 자동 그룹핑 시도
    const hasSizeInAny = filePaths.some((fp) => {
      const filename = getFilenameFromPath(fp);
      return extractSizeFromFilename(filename) !== null;
    });

    // 사이즈 키워드가 있는 파일이 있으면 그룹핑 모드로 전환
    if (hasSizeInAny && filePaths.length > 1) {
      await addSvgFilesWithSizeGrouping(filePaths);
      return;
    }

    // 사이즈 키워드 없으면 개별 조각으로 추가
    const newPieces: PatternPiece[] = [];

    for (const fp of filePaths) {
      try {
        const svgData = await readTextFile(fp);
        const filename = getFilenameFromPath(fp);
        const defaultName = filename.replace(/\.svg$/i, "");

        const newPiece: PatternPiece = {
          id: generateId(),
          name: defaultName,
          svgPath: fp,
          svgData,
        };
        newPieces.push(newPiece);
      } catch (err) {
        console.warn(`SVG 읽기 실패: ${fp}`, err);
      }
    }

    if (newPieces.length === 0) return;

    const updatedPieces = [...formPieces, ...newPieces];
    setFormPieces(updatedPieces);

    setFormSizes((prev) =>
      prev.map((sizeSpec) => ({
        ...sizeSpec,
        pieces: [
          ...sizeSpec.pieces,
          ...newPieces.map((np) => ({
            pieceId: np.id,
            width: 0,
            height: 0,
          })),
        ],
      }))
    );
  };

  // === 패턴 조각 삭제 ===
  const handleRemovePiece = (pieceId: string) => {
    setFormPieces((prev) => prev.filter((p) => p.id !== pieceId));
    // 사이즈 치수에서도 해당 조각 제거
    setFormSizes((prev) =>
      prev.map((sizeSpec) => ({
        ...sizeSpec,
        pieces: sizeSpec.pieces.filter((p) => p.pieceId !== pieceId),
      }))
    );
  };

  // === 조각 이름 수정 ===
  const handlePieceNameChange = (pieceId: string, newName: string) => {
    setFormPieces((prev) =>
      prev.map((p) => (p.id === pieceId ? { ...p, name: newName } : p))
    );
  };

  // === 사이즈별 치수 입력 ===
  const handleDimensionChange = (
    sizeIndex: number,
    pieceId: string,
    field: "width" | "height",
    value: string
  ) => {
    const numValue = parseFloat(value) || 0;
    setFormSizes((prev) => {
      const updated = [...prev];
      const sizeSpec = { ...updated[sizeIndex] };
      sizeSpec.pieces = sizeSpec.pieces.map((p) =>
        p.pieceId === pieceId ? { ...p, [field]: numValue } : p
      );
      updated[sizeIndex] = sizeSpec;
      return updated;
    });
  };

  // === 프리셋 저장 (생성 또는 수정) ===
  const handleSave = async () => {
    if (!formName.trim()) return; // 이름 없으면 저장 안함

    setSaving(true);
    try {
      const now = new Date().toISOString();

      if (mode === "create") {
        // 새 프리셋 생성
        const newPreset: PatternPreset = {
          id: generateId(),
          name: formName.trim(),
          pieces: formPieces,
          sizes: formSizes,
          createdAt: now,
          updatedAt: now,
        };
        await persistPresets([...presets, newPreset]);
      } else if (mode === "edit" && editingId) {
        // 기존 프리셋 수정
        const updated = presets.map((p) =>
          p.id === editingId
            ? {
                ...p,
                name: formName.trim(),
                pieces: formPieces,
                sizes: formSizes,
                updatedAt: now,
              }
            : p
        );
        await persistPresets(updated);
      }

      setMode("list"); // 목록으로 돌아감
    } finally {
      setSaving(false);
    }
  };

  // === 편집 취소 ===
  const handleCancel = () => {
    setMode("list");
  };

  // === 사이즈 배지 텍스트 생성 ===
  // svgBySize가 있는 조각의 경우 "13 사이즈" 같은 배지를 표시
  const getSizeBadgeText = (piece: PatternPiece): string | null => {
    if (!piece.svgBySize) return null;
    const count = Object.keys(piece.svgBySize).length;
    if (count <= 1) return null;
    return `${count} 사이즈`;
  };

  // === 사이즈 목록 텍스트 생성 ===
  const getSizeListText = (piece: PatternPiece): string | null => {
    if (!piece.svgBySize) return null;
    const sizeKeys = Object.keys(piece.svgBySize);
    if (sizeKeys.length <= 1) return null;
    // SIZE_LIST 순서대로 정렬
    const sorted = [...sizeKeys].sort((a, b) => {
      const idxA = SIZE_LIST.indexOf(a as typeof SIZE_LIST[number]);
      const idxB = SIZE_LIST.indexOf(b as typeof SIZE_LIST[number]);
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });
    return sorted.join(", ");
  };

  // === 로딩 화면 ===
  if (loading) {
    return (
      <div className="page">
        <h1 className="page__title">패턴 관리</h1>
        <p className="page__description">프리셋 데이터를 불러오는 중...</p>
      </div>
    );
  }

  // === 목록 모드 렌더링 ===
  if (mode === "list") {
    return (
      <div className="page">
        <h1 className="page__title">패턴 관리</h1>
        <p className="page__description">
          SVG 형식의 옷 패턴(조각) 파일을 등록하고 관리합니다.
          등록된 패턴은 프리셋으로 저장되어 반복 사용할 수 있습니다.
        </p>

        {/* 프리셋 추가 버튼 */}
        <div className="preset-actions">
          <button className="btn btn--primary" onClick={handleCreate}>
            + 새 프리셋 추가
          </button>
        </div>

        {/* 프리셋이 없을 때 안내 */}
        {presets.length === 0 ? (
          <div className="page__placeholder">
            <div className="page__placeholder-icon">&#x2702;</div>
            <p className="page__placeholder-text">
              등록된 패턴 프리셋이 없습니다
            </p>
            <p className="preset-empty__hint">
              위의 "새 프리셋 추가" 버튼을 눌러 첫 번째 프리셋을 만들어보세요
            </p>
          </div>
        ) : (
          /* 프리셋 카드 목록 */
          <div className="preset-grid">
            {presets.map((preset) => (
              <div key={preset.id} className="preset-card">
                <div className="preset-card__header">
                  <h3 className="preset-card__name">{preset.name}</h3>
                </div>
                <div className="preset-card__body">
                  <div className="preset-card__info">
                    <span className="preset-card__stat">
                      조각 {preset.pieces.length}개
                    </span>
                    <span className="preset-card__stat">
                      사이즈{" "}
                      {
                        /* 치수가 입력된 사이즈만 카운트 */
                        preset.sizes.filter((s) =>
                          s.pieces.some((p) => p.width > 0 || p.height > 0)
                        ).length
                      }
                      개
                    </span>
                  </div>
                  <div className="preset-card__date">
                    생성: {new Date(preset.createdAt).toLocaleDateString("ko-KR")}
                  </div>
                </div>
                {/* SVG 미리보기 썸네일: 첫 번째 조각의 SVG */}
                {preset.pieces.length > 0 && (
                  <div
                    className="preset-card__preview"
                    dangerouslySetInnerHTML={{
                      __html: preset.pieces[0].svgData,
                    }}
                  />
                )}
                <div className="preset-card__actions">
                  <button
                    className="btn btn--small"
                    onClick={() => handleEdit(preset)}
                  >
                    편집
                  </button>
                  <button
                    className="btn btn--small btn--danger"
                    onClick={() => handleDelete(preset.id)}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // === 편집/생성 모드 렌더링 ===
  return (
    <div className="page">
      <h1 className="page__title">
        {mode === "create" ? "새 프리셋 만들기" : "프리셋 편집"}
      </h1>

      {/* 프리셋 이름 입력 */}
      <div className="form-group">
        <label className="form-group__label" htmlFor="preset-name">
          프리셋 이름
        </label>
        <input
          id="preset-name"
          className="form-group__input"
          type="text"
          placeholder="예: 반팔 티셔츠, 긴팔 져지"
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
        />
      </div>

      {/* === 패턴 조각 섹션 === */}
      <div className="form-section">
        <div className="form-section__header">
          <h2 className="form-section__title">패턴 조각</h2>
        </div>

        {/* 드래그앤드롭 존 */}
        <div
          ref={dropZoneRef}
          className={`drop-zone ${isDragOver ? "drop-zone--active" : ""}`}
        >
          <div className="drop-zone__icon">
            {/* 폴더+파일 아이콘 텍스트 */}
            &#128193;
          </div>
          <p className="drop-zone__text">
            SVG 파일 또는 폴더를 여기에 드래그하세요
          </p>
          <p className="drop-zone__hint">
            폴더를 드롭하면 내부 SVG 파일을 자동 스캔하고, 파일명에서 사이즈를 추출합니다
          </p>
          <div className="drop-zone__buttons">
            <button className="btn btn--primary btn--small" onClick={handleAddPieces}>
              파일 선택 (다중)
            </button>
            <button className="btn btn--small" onClick={handleAddFolder}>
              폴더로 등록
            </button>
          </div>
        </div>

        {/* 추가된 조각 목록 */}
        {formPieces.length > 0 && (
          <div className="piece-list">
            {formPieces.map((piece) => {
              const sizeBadge = getSizeBadgeText(piece);
              const sizeList = getSizeListText(piece);
              return (
                <div key={piece.id} className="piece-item">
                  {/* SVG 미리보기 */}
                  <div
                    className="piece-item__preview"
                    dangerouslySetInnerHTML={{ __html: piece.svgData }}
                  />
                  <div className="piece-item__info">
                    <div className="piece-item__name-row">
                      <input
                        className="piece-item__name-input"
                        type="text"
                        value={piece.name}
                        onChange={(e) =>
                          handlePieceNameChange(piece.id, e.target.value)
                        }
                        placeholder="조각 이름"
                      />
                      {/* 사이즈 배지: svgBySize가 있으면 "13 사이즈" 표시 */}
                      {sizeBadge && (
                        <span className="piece-item__size-badge">
                          {sizeBadge}
                        </span>
                      )}
                    </div>
                    {/* 사이즈 목록 표시 */}
                    {sizeList && (
                      <span className="piece-item__size-list">
                        {sizeList}
                      </span>
                    )}
                    {!sizeList && (
                      <span className="piece-item__path" title={piece.svgPath}>
                        {piece.svgPath.split(/[\\/]/).pop()}
                      </span>
                    )}
                  </div>
                  <button
                    className="btn btn--small btn--danger"
                    onClick={() => handleRemovePiece(piece.id)}
                  >
                    삭제
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* === 사이즈별 치수 입력 테이블 === */}
      {formPieces.length > 0 && (
        <div className="form-section">
          <h2 className="form-section__title">사이즈별 치수 (mm)</h2>
          <p className="form-section__hint">
            각 사이즈별로 패턴 조각의 가로(W)와 세로(H)를 밀리미터 단위로
            입력하세요. 필요한 사이즈만 입력하면 됩니다.
          </p>

          <div className="size-table-wrapper">
            <table className="size-table">
              <thead>
                <tr>
                  <th className="size-table__th size-table__th--size">
                    사이즈
                  </th>
                  {/* 각 조각별 가로/세로 컬럼 */}
                  {formPieces.map((piece) => (
                    <th
                      key={piece.id}
                      className="size-table__th"
                      colSpan={2}
                    >
                      {piece.name}
                    </th>
                  ))}
                </tr>
                {/* W / H 소제목 행 */}
                <tr>
                  <th className="size-table__th size-table__th--sub"></th>
                  {formPieces.map((piece) => (
                    <Fragment key={piece.id}>
                      <th className="size-table__th size-table__th--sub">W</th>
                      <th className="size-table__th size-table__th--sub">H</th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {formSizes.map((sizeSpec, sizeIdx) => (
                  <tr key={sizeSpec.size}>
                    <td className="size-table__td size-table__td--size">
                      {sizeSpec.size}
                    </td>
                    {formPieces.map((piece) => {
                      // 이 사이즈에서 이 조각의 치수 찾기
                      const dim = sizeSpec.pieces.find(
                        (p) => p.pieceId === piece.id
                      );
                      return (
                        <Fragment key={piece.id}>
                          <td className="size-table__td">
                            <input
                              className="size-table__input"
                              type="number"
                              min="0"
                              step="0.1"
                              value={dim?.width || ""}
                              onChange={(e) =>
                                handleDimensionChange(
                                  sizeIdx,
                                  piece.id,
                                  "width",
                                  e.target.value
                                )
                              }
                              placeholder="0"
                            />
                          </td>
                          <td className="size-table__td">
                            <input
                              className="size-table__input"
                              type="number"
                              min="0"
                              step="0.1"
                              value={dim?.height || ""}
                              onChange={(e) =>
                                handleDimensionChange(
                                  sizeIdx,
                                  piece.id,
                                  "height",
                                  e.target.value
                                )
                              }
                              placeholder="0"
                            />
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 저장/취소 버튼 */}
      <div className="form-actions">
        <button
          className="btn btn--primary"
          onClick={handleSave}
          disabled={!formName.trim() || saving}
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        <button className="btn" onClick={handleCancel}>
          취소
        </button>
      </div>
    </div>
  );
}

export default PatternManage;
