/**
 * PatternManage 페이지
 * SVG 패턴(옷 조각) 프리셋을 등록하고 관리하는 페이지.
 *
 * 세 가지 화면(모드)이 있다:
 * 1) 목록 모드: 좌측 카테고리 트리 + 우측 프리셋 카드 목록
 * 2) 편집 모드: 프리셋 이름 입력, 카테고리 선택, 조각 추가/삭제, 사이즈별 치수 입력
 * 3) 생성 모드: 편집 모드와 동일하지만 새 프리셋 생성
 *
 * 개선사항:
 * - (2026-04-08) SVG 다중 파일 선택 + 드래그앤드롭 + 폴더 업로드/사이즈 자동 추출
 * - (2026-04-08) 폴더 트리형 카테고리 분류 시스템 추가
 */

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { PatternPreset, PatternPiece, PatternCategory, SizeSpec } from "../types/pattern";
import { SIZE_LIST } from "../types/pattern";
import { loadPresets, savePresets, generateId } from "../stores/presetStore";
import {
  loadCategories,
  saveCategories,
  getCategoryPath,
  getCategoryOptions,
  hasChildren,
  getNextOrder,
} from "../stores/categoryStore";
import CategoryTree, { type SelectedCategory } from "../components/CategoryTree";

/** 편집 모드 상태 타입 */
type EditMode = "list" | "create" | "edit";

// === 유틸리티 함수 ===

/** SVG에서 추출한 치수 (mm 단위) */
interface SvgDimensions {
  width: number;
  height: number;
}

/**
 * SVG의 길이 값(예: "520mm", "710px", "100")을 mm 단위 숫자로 변환한다.
 * 패턴 SVG는 보통 mm 단위이므로 mm를 기본으로 취급한다.
 * 단위가 없으면 px(96dpi)로 간주하여 변환한다.
 */
function parseLength(value: string): number {
  const match = value.trim().match(/^([\d.]+)\s*(mm|cm|in|pt|px)?$/i);
  if (!match) return 0;

  const num = parseFloat(match[1]);
  if (isNaN(num) || num <= 0) return 0;

  const unit = (match[2] || "px").toLowerCase();
  switch (unit) {
    case "mm": return num;
    case "cm": return num * 10;
    case "in": return num * 25.4;
    case "pt": return num * 0.3528;
    case "px": return num * 0.2646; // 96dpi 기준: 1px = 25.4/96 mm
    default:   return num * 0.2646;
  }
}

/**
 * SVG 문자열에서 너비/높이를 mm 단위로 추출한다.
 *
 * 추출 우선순위:
 * 1) <svg> 태그의 width/height 속성 (단위 포함 시 변환)
 * 2) viewBox 속성의 3번째/4번째 값 (단위 없으므로 mm로 간주)
 *
 * 패턴 SVG는 대부분 mm 단위로 작업되므로,
 * viewBox만 있을 때는 해당 값을 mm로 간주한다.
 * 파싱 실패 시 {width: 0, height: 0}을 반환하여 사용자가 수동 입력할 수 있게 한다.
 */
function parseSvgDimensions(svgData: string): SvgDimensions {
  // DOMParser로 SVG를 파싱한다
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgData, "image/svg+xml");
  const svg = doc.querySelector("svg");

  if (!svg) return { width: 0, height: 0 };

  // 1단계: width/height 속성에서 추출 (단위 변환 포함)
  const widthAttr = svg.getAttribute("width");
  const heightAttr = svg.getAttribute("height");

  if (widthAttr && heightAttr) {
    const w = parseLength(widthAttr);
    const h = parseLength(heightAttr);
    if (w > 0 && h > 0) {
      return {
        width: Math.round(w * 100) / 100,  // 소수점 2자리로 반올림
        height: Math.round(h * 100) / 100,
      };
    }
  }

  // 2단계: viewBox에서 추출 (width/height 없거나 파싱 실패 시)
  const viewBox = svg.getAttribute("viewBox");
  if (viewBox) {
    // viewBox="minX minY width height" — 공백 또는 쉼표로 구분
    const parts = viewBox.trim().split(/[\s,]+/);
    if (parts.length >= 4) {
      const vbWidth = parseFloat(parts[2]);
      const vbHeight = parseFloat(parts[3]);
      // 패턴 SVG의 viewBox는 보통 mm 기준이므로 그대로 사용
      if (vbWidth > 0 && vbHeight > 0) {
        return {
          width: Math.round(vbWidth * 100) / 100,
          height: Math.round(vbHeight * 100) / 100,
        };
      }
    }
  }

  // 파싱 실패: 0으로 반환하여 사용자가 수동 입력
  return { width: 0, height: 0 };
}

/**
 * 파일명에서 사이즈를 추출한다.
 * 예: "농구유니폼_U넥_스탠다드_암홀X_2XL.svg" → "2XL"
 * 마지막 언더스코어(_) 이후, .svg 확장자 이전 부분을 사이즈 키워드와 매칭.
 */
function extractSizeFromFilename(filename: string): string | null {
  const nameWithoutExt = filename.replace(/\.svg$/i, "");
  const lastPart = nameWithoutExt.split("_").pop() || "";
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
  if (sizes.includes(normalized)) {
    return parts.slice(0, -1).join("_");
  }
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
  const cleaned = dirPath.replace(/[\\/]+$/, "");
  return cleaned.split(/[\\/]/).pop() || "프리셋";
}

function PatternManage() {
  // === 상태 관리 ===
  const [presets, setPresets] = useState<PatternPreset[]>([]); // 전체 프리셋 목록
  const [categories, setCategories] = useState<PatternCategory[]>([]); // 카테고리 목록
  const [mode, setMode] = useState<EditMode>("list");          // 현재 화면 모드
  const [editingId, setEditingId] = useState<string | null>(null); // 편집 중인 프리셋 ID

  // 카테고리 트리 선택 상태 (기본: 전체)
  const [selectedCategory, setSelectedCategory] = useState<SelectedCategory>({ type: "all" });

  // 편집 폼 상태
  const [formName, setFormName] = useState("");                // 프리셋 이름
  const [formPieces, setFormPieces] = useState<PatternPiece[]>([]); // 패턴 조각 목록
  const [formSizes, setFormSizes] = useState<SizeSpec[]>([]);  // 사이즈별 치수
  const [formCategoryId, setFormCategoryId] = useState<string>(""); // 선택된 카테고리 ID ("" = 미분류)

  const [loading, setLoading] = useState(true);  // 초기 로딩 상태
  const [saving, setSaving] = useState(false);   // 저장 중 상태
  // 로드 성공 여부: false이면 저장을 차단하여 데이터 유실 방지
  const [isLoadSuccess, setIsLoadSuccess] = useState(false);
  // 로드 에러 메시지 (사용자에게 표시)
  const [loadError, setLoadError] = useState<string | null>(null);

  // 드래그앤드롭 상태
  const [isDragOver, setIsDragOver] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // === 앱 시작 시 프리셋 + 카테고리 로드 ===
  useEffect(() => {
    Promise.all([loadPresets(), loadCategories()])
      .then(([presetResult, categoryResult]) => {
        // 둘 다 성공해야 정상 상태로 전환
        if (presetResult.success && categoryResult.success) {
          setPresets(presetResult.data);
          setCategories(categoryResult.data);
          setIsLoadSuccess(true);
          setLoadError(null);
        } else {
          // 하나라도 실패하면 에러 표시 + 저장 차단
          const errors: string[] = [];
          if (!presetResult.success) errors.push(`프리셋: ${presetResult.error}`);
          if (!categoryResult.success) errors.push(`카테고리: ${categoryResult.error}`);
          setLoadError(errors.join(" / "));
          setIsLoadSuccess(false);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // === Tauri 드래그앤드롭 이벤트 리스닝 ===
  useEffect(() => {
    if (mode === "list") return;

    let unlisten: (() => void) | null = null;

    const setupDragDrop = async () => {
      try {
        unlisten = await getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type === "over") {
            setIsDragOver(true);
          } else if (event.payload.type === "leave") {
            setIsDragOver(false);
          } else if (event.payload.type === "drop") {
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

    return () => {
      if (unlisten) unlisten();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // === 프리셋 저장 (로드 실패 시 차단) ===
  const persistPresets = useCallback(async (updated: PatternPreset[]) => {
    if (!isLoadSuccess) {
      alert("데이터 로드에 실패한 상태에서는 저장할 수 없습니다. 앱을 재시작해주세요.");
      return;
    }
    setPresets(updated);
    try {
      await savePresets(updated);
    } catch (err) {
      console.error("자동 저장 실패:", err);
      alert(`저장 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [isLoadSuccess]);

  // === 카테고리 저장 (로드 실패 시 차단) ===
  const persistCategories = useCallback(async (updated: PatternCategory[]) => {
    if (!isLoadSuccess) {
      alert("데이터 로드에 실패한 상태에서는 저장할 수 없습니다. 앱을 재시작해주세요.");
      return;
    }
    setCategories(updated);
    try {
      await saveCategories(updated);
    } catch (err) {
      console.error("카테고리 저장 실패:", err);
      alert(`저장 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [isLoadSuccess]);

  // === 카테고리별 프리셋 수 계산 (트리 표시용) ===
  const presetCountByCategory = new Map<string, number>();
  let uncategorizedCount = 0;
  for (const p of presets) {
    if (p.categoryId) {
      presetCountByCategory.set(
        p.categoryId,
        (presetCountByCategory.get(p.categoryId) || 0) + 1
      );
    } else {
      uncategorizedCount++;
    }
  }

  // === 현재 선택된 카테고리에 따라 프리셋 필터링 ===
  const filteredPresets = presets.filter((p) => {
    if (selectedCategory.type === "all") return true;
    if (selectedCategory.type === "uncategorized") return !p.categoryId;
    // 특정 카테고리 선택 시: 해당 카테고리 + 하위 카테고리의 프리셋 모두 표시
    return getPresetBelongsToCategory(p, selectedCategory.id, categories);
  });

  // === 빵가루 경로 계산 ===
  const breadcrumb =
    selectedCategory.type === "category"
      ? getCategoryPath(categories, selectedCategory.id)
      : null;

  // === 새 프리셋 생성 모드 진입 ===
  const handleCreate = () => {
    setFormName("");
    setFormPieces([]);
    setFormSizes(SIZE_LIST.map((size) => ({ size, pieces: [] })));
    setEditingId(null);
    // 현재 선택된 카테고리를 기본 카테고리로 설정
    setFormCategoryId(
      selectedCategory.type === "category" ? selectedCategory.id : ""
    );
    setMode("create");
  };

  // === 기존 프리셋 편집 모드 진입 ===
  const handleEdit = (preset: PatternPreset) => {
    setFormName(preset.name);
    setFormPieces([...preset.pieces]);
    const sizeMap = new Map(preset.sizes.map((s) => [s.size, s]));
    setFormSizes(
      SIZE_LIST.map((size) => sizeMap.get(size) || { size, pieces: [] })
    );
    setFormCategoryId(preset.categoryId || "");
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
      const result = await open({
        title: "패턴 조각 SVG 파일 선택 (여러 개 가능)",
        filters: [{ name: "SVG 파일", extensions: ["svg"] }],
        multiple: true,
      });

      if (!result) return;

      const filePaths: string[] = Array.isArray(result) ? result : [result];
      if (filePaths.length === 0) return;

      await addSvgFilesAsPieces(filePaths);
    } catch (err) {
      console.error("SVG 파일 추가 실패:", err);
    }
  };

  // === 폴더 선택 → 내부 SVG 파일 스캔 → 사이즈별 그룹핑 ===
  const handleAddFolder = async () => {
    try {
      const dirPath = await open({
        title: "패턴 폴더 선택 (SVG 파일이 들어있는 폴더)",
        directory: true,
        multiple: false,
      });

      if (!dirPath) return;

      const svgFiles: string[] = await invoke("list_svg_files", {
        dirPath: dirPath as string,
      });

      if (svgFiles.length === 0) {
        alert("선택한 폴더에 SVG 파일이 없습니다.");
        return;
      }

      if (!formName.trim()) {
        setFormName(getFolderNameFromPath(dirPath as string));
      }

      await addSvgFilesWithSizeGrouping(svgFiles);
    } catch (err) {
      console.error("폴더 등록 실패:", err);
    }
  };

  // === 드롭된 파일/폴더 경로 처리 ===
  const handleDroppedPaths = async (paths: string[]) => {
    try {
      const allSvgPaths: string[] = [];

      for (const p of paths) {
        try {
          const svgFiles: string[] = await invoke("list_svg_files", {
            dirPath: p,
          });
          allSvgPaths.push(...svgFiles);

          if (!formName.trim()) {
            setFormName(getFolderNameFromPath(p));
          }
        } catch {
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

      await addSvgFilesWithSizeGrouping(allSvgPaths);
    } catch (err) {
      console.error("드롭 처리 실패:", err);
    }
  };

  // === SVG 파일들을 사이즈별로 그룹핑하여 조각으로 추가 ===
  const addSvgFilesWithSizeGrouping = async (filePaths: string[]) => {
    const grouped = new Map<string, Map<string, string>>();
    const ungrouped: string[] = [];

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

    for (const [pieceName, sizeMap] of grouped) {
      const representativeSize = sizeMap.has("M")
        ? "M"
        : sizeMap.has("L")
          ? "L"
          : sizeMap.keys().next().value!;

      const representativePath = sizeMap.get(representativeSize)!;
      const representativeSvg = await readTextFile(representativePath);

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
        svgData: representativeSvg,
        svgBySize,
      };
      newPieces.push(newPiece);
    }

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

    const updatedPieces = [...formPieces, ...newPieces];
    setFormPieces(updatedPieces);

    // 사이즈별 SVG에서 치수를 자동 추출하여 테이블에 채운다.
    // 해당 사이즈의 SVG가 있으면 그 SVG에서, 없으면 대표 SVG에서 크기를 읽는다.
    setFormSizes((prev) =>
      prev.map((sizeSpec) => ({
        ...sizeSpec,
        pieces: [
          ...sizeSpec.pieces,
          ...newPieces.map((np) => {
            // 이 사이즈 전용 SVG가 있으면 그것에서 크기 추출
            const svgForSize = np.svgBySize?.[sizeSpec.size];
            const dims = parseSvgDimensions(svgForSize || np.svgData || "");
            return {
              pieceId: np.id,
              width: dims.width,
              height: dims.height,
            };
          }),
        ],
      }))
    );
  };

  // === SVG 파일들을 개별 조각으로 추가 ===
  const addSvgFilesAsPieces = async (filePaths: string[]) => {
    const hasSizeInAny = filePaths.some((fp) => {
      const filename = getFilenameFromPath(fp);
      return extractSizeFromFilename(filename) !== null;
    });

    if (hasSizeInAny && filePaths.length > 1) {
      await addSvgFilesWithSizeGrouping(filePaths);
      return;
    }

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

    // 개별 SVG에서도 치수를 자동 추출하여 기본값으로 채운다.
    // 사이즈별 SVG가 없으므로, 대표 svgData에서 크기를 읽어 모든 사이즈에 동일하게 적용.
    setFormSizes((prev) =>
      prev.map((sizeSpec) => ({
        ...sizeSpec,
        pieces: [
          ...sizeSpec.pieces,
          ...newPieces.map((np) => {
            const dims = parseSvgDimensions(np.svgData || "");
            return {
              pieceId: np.id,
              width: dims.width,
              height: dims.height,
            };
          }),
        ],
      }))
    );
  };

  // === 패턴 조각 삭제 ===
  const handleRemovePiece = (pieceId: string) => {
    setFormPieces((prev) => prev.filter((p) => p.id !== pieceId));
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
    if (!formName.trim()) return;

    setSaving(true);
    try {
      const now = new Date().toISOString();

      if (mode === "create") {
        const newPreset: PatternPreset = {
          id: generateId(),
          name: formName.trim(),
          pieces: formPieces,
          sizes: formSizes,
          categoryId: formCategoryId || undefined,  // 빈 문자열이면 undefined (미분류)
          createdAt: now,
          updatedAt: now,
        };
        await persistPresets([...presets, newPreset]);
      } else if (mode === "edit" && editingId) {
        const updated = presets.map((p) =>
          p.id === editingId
            ? {
                ...p,
                name: formName.trim(),
                pieces: formPieces,
                sizes: formSizes,
                categoryId: formCategoryId || undefined,
                updatedAt: now,
              }
            : p
        );
        await persistPresets(updated);
      }

      setMode("list");
    } finally {
      setSaving(false);
    }
  };

  // === 편집 취소 ===
  const handleCancel = () => {
    setMode("list");
  };

  // === 카테고리 추가 ===
  const handleAddCategory = (parentId: string | null) => {
    const name = prompt("새 카테고리 이름을 입력하세요:");
    if (!name || !name.trim()) return;

    const newCat: PatternCategory = {
      id: generateId(),
      name: name.trim(),
      parentId,
      order: getNextOrder(categories, parentId),
    };
    persistCategories([...categories, newCat]);
  };

  // === 카테고리 삭제 ===
  const handleDeleteCategory = (id: string) => {
    // 하위 카테고리가 있는지 확인
    if (hasChildren(categories, id)) {
      alert("하위 카테고리가 있어서 삭제할 수 없습니다.\n하위 카테고리를 먼저 삭제하세요.");
      return;
    }
    // 이 카테고리에 속한 프리셋이 있는지 확인
    const hasPresets = presets.some((p) => p.categoryId === id);
    if (hasPresets) {
      alert("이 카테고리에 프리셋이 있어서 삭제할 수 없습니다.\n프리셋을 다른 카테고리로 이동하거나 삭제하세요.");
      return;
    }
    // 삭제 진행
    const updated = categories.filter((c) => c.id !== id);
    persistCategories(updated);
    // 삭제한 카테고리가 선택 중이면 전체로 이동
    if (selectedCategory.type === "category" && selectedCategory.id === id) {
      setSelectedCategory({ type: "all" });
    }
  };

  // === 카테고리 이름 변경 ===
  const handleRenameCategory = (id: string, newName: string) => {
    const updated = categories.map((c) =>
      c.id === id ? { ...c, name: newName } : c
    );
    persistCategories(updated);
  };

  // === 사이즈 배지 텍스트 생성 ===
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
    const sorted = [...sizeKeys].sort((a, b) => {
      const idxA = SIZE_LIST.indexOf(a as typeof SIZE_LIST[number]);
      const idxB = SIZE_LIST.indexOf(b as typeof SIZE_LIST[number]);
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });
    return sorted.join(", ");
  };

  // === 카테고리 드롭다운 옵션 (편집 폼용) ===
  const categoryOptions = getCategoryOptions(categories);

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

        {/* 로드 실패 시 경고 배너 */}
        {loadError && (
          <div className="load-error">
            데이터 로드 실패: {loadError}
            <br />앱을 재시작해주세요. 이 상태에서는 저장이 비활성화됩니다.
          </div>
        )}

        {/* 좌측 트리 + 우측 프리셋 목록 레이아웃 */}
        <div className="pattern-layout">
          {/* 좌측: 카테고리 트리 */}
          <aside className="pattern-layout__sidebar">
            <CategoryTree
              categories={categories}
              selected={selectedCategory}
              presetCountByCategory={presetCountByCategory}
              uncategorizedCount={uncategorizedCount}
              totalCount={presets.length}
              onSelect={setSelectedCategory}
              onAddCategory={handleAddCategory}
              onDeleteCategory={handleDeleteCategory}
              onRenameCategory={handleRenameCategory}
            />
          </aside>

          {/* 우측: 프리셋 목록 */}
          <main className="pattern-layout__content">
            {/* 빵가루 경로 표시 */}
            {breadcrumb && breadcrumb.length > 0 && (
              <div className="pattern-breadcrumb">
                {breadcrumb.map((cat, idx) => (
                  <span key={cat.id}>
                    {idx > 0 && <span className="pattern-breadcrumb__sep">&gt;</span>}
                    <span
                      className="pattern-breadcrumb__item"
                      onClick={() => setSelectedCategory({ type: "category", id: cat.id })}
                    >
                      {cat.name}
                    </span>
                  </span>
                ))}
              </div>
            )}
            {selectedCategory.type === "all" && (
              <div className="pattern-breadcrumb">
                <span className="pattern-breadcrumb__item">전체</span>
              </div>
            )}
            {selectedCategory.type === "uncategorized" && (
              <div className="pattern-breadcrumb">
                <span className="pattern-breadcrumb__item">미분류</span>
              </div>
            )}

            {/* 프리셋 추가 버튼 */}
            <div className="preset-actions">
              <button className="btn btn--primary" onClick={handleCreate}>
                + 새 프리셋 추가
              </button>
            </div>

            {/* 프리셋이 없을 때 안내 */}
            {filteredPresets.length === 0 ? (
              <div className="page__placeholder">
                <div className="page__placeholder-icon">&#x2702;</div>
                <p className="page__placeholder-text">
                  {presets.length === 0
                    ? "등록된 패턴 프리셋이 없습니다"
                    : "이 카테고리에 프리셋이 없습니다"}
                </p>
                <p className="preset-empty__hint">
                  {presets.length === 0
                    ? '위의 "새 프리셋 추가" 버튼을 눌러 첫 번째 프리셋을 만들어보세요'
                    : "새 프리셋을 추가하거나 기존 프리셋의 카테고리를 변경하세요"}
                </p>
              </div>
            ) : (
              /* 프리셋 카드 목록 */
              <div className="preset-grid">
                {filteredPresets.map((preset) => (
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
                            preset.sizes.filter((s) =>
                              s.pieces.some((p) => p.width > 0 || p.height > 0)
                            ).length
                          }
                          개
                        </span>
                      </div>
                      {/* 카테고리 태그 (있을 때만) */}
                      {preset.categoryId && (
                        <div className="preset-card__category">
                          {getCategoryPath(categories, preset.categoryId)
                            .map((c) => c.name)
                            .join(" > ")}
                        </div>
                      )}
                      <div className="preset-card__date">
                        생성: {new Date(preset.createdAt).toLocaleDateString("ko-KR")}
                      </div>
                    </div>
                    {/* SVG 미리보기 썸네일 */}
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
          </main>
        </div>
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

      {/* 카테고리 선택 드롭다운 */}
      <div className="form-group">
        <label className="form-group__label" htmlFor="preset-category">
          카테고리
        </label>
        <select
          id="preset-category"
          className="form-group__input"
          value={formCategoryId}
          onChange={(e) => setFormCategoryId(e.target.value)}
        >
          {/* 미분류 옵션 */}
          <option value="">미분류</option>
          {/* 계층 구조로 카테고리 옵션 표시 */}
          {categoryOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
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
                      {sizeBadge && (
                        <span className="piece-item__size-badge">
                          {sizeBadge}
                        </span>
                      )}
                    </div>
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

/**
 * 프리셋이 특정 카테고리(또는 그 하위 카테고리)에 속하는지 확인한다.
 * 카테고리를 선택했을 때 해당 카테고리 + 하위 카테고리의 프리셋을 모두 보여주기 위해.
 */
function getPresetBelongsToCategory(
  preset: PatternPreset,
  categoryId: string,
  categories: PatternCategory[]
): boolean {
  if (!preset.categoryId) return false;
  if (preset.categoryId === categoryId) return true;

  // 프리셋의 카테고리에서 부모를 타고 올라가며 일치하는지 확인
  let current = categories.find((c) => c.id === preset.categoryId);
  while (current && current.parentId) {
    if (current.parentId === categoryId) return true;
    current = categories.find((c) => c.id === current!.parentId);
  }
  return false;
}

export default PatternManage;
