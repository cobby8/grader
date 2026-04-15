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

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
import { loadSettings } from "../stores/settingsStore";
import { scanDriveRoot, mergeDriveScanResult } from "../services/driveSync";

/** 편집 모드 상태 타입 */
type EditMode = "list" | "create" | "edit";

// === 유틸리티 함수 ===

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

  // === Drive 자동 동기화 상태 (옵션 4) ===
  // 왜 버튼/모달이 사라졌나: 사용자가 "가져오기 버튼 귀찮음 + 경고 부담" 피드백을 주어
  // "페이지 진입 시 자동 스캔·병합" 방식으로 리팩터했다 (옵션 4).
  // Settings의 driveSyncEnabled + drivePatternRoot 둘 다 있을 때만 동기화 실행.
  const [driveSyncEnabled, setDriveSyncEnabledState] = useState(false);
  const [drivePatternRoot, setDrivePatternRoot] = useState<string | undefined>(
    undefined
  );
  // 마지막 자동 스캔 시각 (epoch ms). 60초 쿨다운 유지.
  // 왜 useRef인가: 쿨다운 값은 화면을 다시 렌더링할 필요 없이 "단순히 기억"만 하면 되므로,
  // state가 아닌 ref가 더 적합(값 변경해도 리렌더 유발 안 함).
  const lastAutoScanRef = useRef<number>(0);
  // 현재 동기화 진행 중 플래그 — 중복 실행 방지
  const autoScanInFlightRef = useRef<boolean>(false);

  // === Settings에서 Drive 동기화 활성 여부 + 루트 경로 로드 ===
  // 왜 별도 useEffect인가: Settings는 presets와 독립이라 병렬 로드 가능.
  useEffect(() => {
    loadSettings().then((result) => {
      if (result.success) {
        setDriveSyncEnabledState(result.data.driveSyncEnabled);
        setDrivePatternRoot(result.data.drivePatternRoot);
      }
    });
  }, []);

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

  // === Drive 자동 동기화 (옵션 4) ===
  // 왜 useCallback + ref 조합인가:
  //   1) 쿨다운/진행중 체크는 ref로 (리렌더 없이 즉시 판정)
  //   2) 실제 병합 로직은 state/store에 의존하므로 useCallback의 deps로 최신값 추적
  //   3) alert 제거 — 사용자가 "경고 부담" 피드백을 주었기 때문. console만 사용.
  const runAutoSync = useCallback(async () => {
    // 선행 조건: 로드 성공 + 동기화 활성 + 루트 경로 존재
    if (!isLoadSuccess) return;
    if (!driveSyncEnabled) return;
    if (!drivePatternRoot) return;

    // 쿨다운: 마지막 스캔으로부터 60초 이내면 스킵
    // 왜 60초인가: 사용자가 페이지를 빠르게 왕복해도 스캔이 폭주하지 않도록.
    // 실측 스캔 시간이 5~10초대이므로 60초는 충분한 여유.
    const now = Date.now();
    const COOLDOWN_MS = 60 * 1000;
    if (now - lastAutoScanRef.current < COOLDOWN_MS) {
      console.info(
        `[Drive 자동 동기화] 쿨다운 중 (${Math.round(
          (COOLDOWN_MS - (now - lastAutoScanRef.current)) / 1000
        )}초 남음) — 스킵`
      );
      return;
    }

    // 중복 실행 방지 (스캔 중 재진입 차단)
    if (autoScanInFlightRef.current) return;
    autoScanInFlightRef.current = true;

    try {
      console.info("[Drive 자동 동기화] 스캔 시작:", drivePatternRoot);
      const scanResult = await scanDriveRoot(drivePatternRoot);

      if (!scanResult.success) {
        console.warn("[Drive 자동 동기화] 스캔 실패:", scanResult.error);
        return;
      }

      // 병합: 기존 치수(sizes)는 절대 덮어쓰지 않고, svgPathBySize만 최신화
      const merged = mergeDriveScanResult(scanResult, presets, categories);

      // 변경이 하나도 없으면 저장 생략 (불필요한 파일 I/O 방지)
      const hasChanges =
        merged.newPresetCount > 0 ||
        merged.updatedPresetCount > 0 ||
        merged.newCategoryCount > 0;

      if (!hasChanges) {
        console.info("[Drive 자동 동기화] 변경 없음");
      } else {
        // 카테고리 먼저 저장 (프리셋이 categoryId를 참조하므로 순서 중요)
        if (merged.newCategoryCount > 0) {
          setCategories(merged.mergedCategories);
          try {
            await saveCategories(merged.mergedCategories);
          } catch (err) {
            console.warn("[Drive 자동 동기화] 카테고리 저장 실패:", err);
            return;
          }
        }
        // 프리셋 저장
        setPresets(merged.mergedPresets);
        try {
          await savePresets(merged.mergedPresets);
        } catch (err) {
          console.warn("[Drive 자동 동기화] 프리셋 저장 실패:", err);
          return;
        }
        console.info(
          `[Drive 자동 동기화] 완료 — 신규 ${merged.newPresetCount}, 갱신 ${merged.updatedPresetCount}, 카테고리 ${merged.newCategoryCount}`
        );
      }

      if (merged.warnings.length > 0) {
        // 왜 console만: 사용자는 "경고 보고 싶지 않음" 피드백(Q3-B).
        // Settings에서 최근 경고 확인 기능은 Phase 2에서 추가 예정.
        console.warn(
          `[Drive 자동 동기화] 경고 ${merged.warnings.length}건:`,
          merged.warnings
        );
      }

      // 성공/변경없음 모두 마지막 스캔 시각 갱신 (실패만 쿨다운 갱신 안 함 → 재시도 허용)
      lastAutoScanRef.current = Date.now();
    } catch (err) {
      console.warn("[Drive 자동 동기화] 예외:", err);
    } finally {
      autoScanInFlightRef.current = false;
    }
  }, [
    isLoadSuccess,
    driveSyncEnabled,
    drivePatternRoot,
    presets,
    categories,
  ]);

  // === 페이지 진입(= isLoadSuccess 전환 or 설정 변경) 시 자동 동기화 트리거 ===
  // 왜 isLoadSuccess를 deps에 넣었나: 초기 로드가 끝나야 presets/categories가 채워지고,
  // 그 후에 병합해야 사용자 데이터와 정확히 매칭된다.
  // 왜 runAutoSync 자체를 deps에 넣지 않았나: presets/categories가 바뀔 때마다
  // runAutoSync의 레퍼런스가 변해 useEffect가 재실행되는데,
  // 자동 동기화가 presets를 갱신하면 다시 재실행되는 무한 루프 위험이 있다.
  // 쿨다운 가드가 실제 스캔은 막지만, useEffect가 매번 실행되는 자체를 피하기 위해
  // 설정 값(driveSyncEnabled/drivePatternRoot)과 로드 성공 여부만 의존성에 둔다.
  useEffect(() => {
    runAutoSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadSuccess, driveSyncEnabled, drivePatternRoot]);

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

  // === 현재 선택된 카테고리에 따라 프리셋 필터링 + 이름순 정렬 ===
  //
  // 왜 useMemo인가: presets/categories/selectedCategory가 바뀔 때만 재계산되어
  // 다른 state 변화(예: 드래그 오버, 폼 입력)로 인한 리렌더 때는 정렬 비용을 아낀다.
  //
  // 왜 이름순 정렬인가: 기존에는 presets 배열 삽입 순서(생성 시각)대로 보여서
  // 사용자가 "농구유니폼_V넥_스탠다드_암홀X"를 찾으려면 화면을 훑어야 했다.
  // 카테고리와 동일하게 한국어 자연 정렬(numeric)로 통일한다.
  const filteredPresets = useMemo(() => {
    const filtered = presets.filter((p) => {
      if (selectedCategory.type === "all") return true;
      if (selectedCategory.type === "uncategorized") return !p.categoryId;
      // 특정 카테고리 선택 시: 해당 카테고리 + 하위 카테고리의 프리셋 모두 표시
      return getPresetBelongsToCategory(p, selectedCategory.id, categories);
    });
    // 원본 배열 불변성 유지를 위해 복사 후 정렬
    return [...filtered].sort((a, b) =>
      a.name.localeCompare(b.name, "ko", { numeric: true, sensitivity: "base" })
    );
  }, [presets, categories, selectedCategory]);

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
      // 대표 사이즈: M > L > 첫 번째 사이즈 순으로 선택
      const representativeSize = sizeMap.has("M")
        ? "M"
        : sizeMap.has("L")
          ? "L"
          : sizeMap.keys().next().value!;

      const representativePath = sizeMap.get(representativeSize)!;
      // 원본 SVG를 그대로 저장 (Illustrator가 직접 처리하므로 보정 불필요)
      const representativeSvg = await readTextFile(representativePath);

      // 사이즈별 SVG 데이터를 읽어서 저장
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
        // 원본 SVG 그대로 저장
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

    // 치수 테이블 제거됨 — 빈 치수(0,0)로 초기화 (기존 데이터 구조 호환)
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
        // 원본 SVG 그대로 저장
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

    // 치수 테이블 제거됨 — 빈 치수(0,0)로 초기화 (기존 데이터 구조 호환)
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

  // === 카테고리 이름 변경 핸들러 제거 (2026-04-15) ===
  // 사용자 정책: 앱 내에서 폴더명/파일명 변경 기능 전체 제거.
  // Drive 카테고리는 Drive에서, Local 카테고리도 앱에서 rename 불가.
  // 필요 시 카테고리 삭제 후 새로 추가하는 것이 정책.

  // === Drive 출처 프리셋 판정 ===
  // 왜 헬퍼인가: 편집/삭제 버튼 비활성화 + 토스트 분기에 반복 사용된다.
  // piece 중 하나라도 svgSource="drive"면 Drive 출처로 간주(하이브리드 케이스 방어).
  const isDrivePreset = (preset: PatternPreset): boolean => {
    return preset.pieces.some((p) => p.svgSource === "drive");
  };

  // === Drive 출처 카테고리 판정 ===
  // 왜 헬퍼인가: "선택된 카테고리가 Drive면 + 새 프리셋 추가 버튼 비활성화" 분기에 사용.
  // source 필드가 "drive"이면 즉시 Drive로 판정.
  const isDriveCategoryById = (categoryId: string): boolean => {
    const cat = categories.find((c) => c.id === categoryId);
    return cat?.source === "drive";
  };

  // === 읽기 전용 안내 토스트 (alert로 fallback) ===
  // 토스트 시스템이 없으므로 alert로 대체 — 동일 문구 일관성 유지를 위해 헬퍼화.
  const showDriveReadonlyToast = () => {
    alert("이 항목은 Google Drive에서만 수정할 수 있습니다.");
  };

  // === 조각이 실제로 보유한 사이즈 키 집합 계산 ===
  //
  // 왜 별도 헬퍼인가: Local 프리셋은 사이즈 데이터를 `svgBySize`(인라인 문자열)에,
  // Drive 프리셋은 `svgPathBySize`(절대경로)에 저장한다. 두 출처 중 한 곳이라도
  // 사이즈가 있으면 "등록된 사이즈"로 간주해야 한다. 기존 코드는 `svgBySize`만
  // 확인하여 Drive 프리셋 편집 시 "단일 SVG"로 잘못 표시되는 버그가 있었다.
  const getRegisteredSizeKeys = (piece: PatternPiece): string[] => {
    const keys = new Set<string>();
    if (piece.svgBySize) Object.keys(piece.svgBySize).forEach((k) => keys.add(k));
    if (piece.svgPathBySize) Object.keys(piece.svgPathBySize).forEach((k) => keys.add(k));
    return Array.from(keys);
  };

  // === 사이즈 배지 텍스트 생성 ===
  const getSizeBadgeText = (piece: PatternPiece): string | null => {
    const count = getRegisteredSizeKeys(piece).length;
    if (count <= 1) return null;
    return `${count} 사이즈`;
  };

  // === 사이즈 목록 텍스트 생성 ===
  const getSizeListText = (piece: PatternPiece): string | null => {
    const sizeKeys = getRegisteredSizeKeys(piece);
    if (sizeKeys.length <= 1) return null;
    // SIZE_LIST에 정의된 순서대로 정렬 (5XS → 5XL 방향)
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

            {/* 프리셋 추가 버튼 (Drive 가져오기 버튼은 옵션 4에서 자동 동기화로 대체되어 제거됨) */}
            {/* 왜 조건부 비활성화: 현재 선택된 카테고리가 Drive 출처면 새 프리셋 생성을 막는다.
                Drive 카테고리는 SSOT가 Drive 폴더이므로 앱에서 만든 프리셋이 다음 동기화에서
                "고립"되거나 정합성을 깨뜨릴 수 있다. */}
            <div className="preset-actions">
              {(() => {
                const blocked =
                  selectedCategory.type === "category" &&
                  isDriveCategoryById(selectedCategory.id);
                return (
                  <button
                    className="btn btn--primary"
                    onClick={() => {
                      if (blocked) {
                        showDriveReadonlyToast();
                        return;
                      }
                      handleCreate();
                    }}
                    disabled={blocked}
                    title={
                      blocked
                        ? "Drive 카테고리에는 앱에서 프리셋을 추가할 수 없습니다"
                        : undefined
                    }
                  >
                    + 새 프리셋 추가
                  </button>
                );
              })()}
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
                      <h3 className="preset-card__name">
                        {preset.name}
                        {/* Drive 출처 프리셋 식별 뱃지 (1개 이상의 piece가 svgSource="drive"면 표시) */}
                        {preset.pieces.some((p) => p.svgSource === "drive") && (
                          <span
                            className="preset-card__drive-badge"
                            title={
                              preset.driveFolder
                                ? `Drive 폴더: ${preset.driveFolder}`
                                : "Drive 출처"
                            }
                          >
                            DRIVE
                          </span>
                        )}
                      </h3>
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
                      {/* 조각별 SVG 사이즈 현황 — 등록된 SVG 파일 목록을 한눈에 보여준다 */}
                      {preset.pieces.length > 0 && (
                        <div className="preset-card__pieces">
                          {preset.pieces.map((piece) => {
                            // Local(svgBySize) + Drive(svgPathBySize) 양쪽 합산해서 사이즈 집계
                            // 왜: Drive 프리셋은 svgBySize가 비어 있고 svgPathBySize에만 값이
                            // 들어있어서 기존 로직으로는 "1개 SVG"로 잘못 표시되었다.
                            const sizeKeys = getRegisteredSizeKeys(piece);
                            return (
                              <div key={piece.id} className="preset-card__piece">
                                <span className="preset-card__piece-name">{piece.name}</span>
                                {sizeKeys.length > 1 ? (
                                  // 여러 사이즈가 등록된 경우: 사이즈 수 + 목록
                                  <span className="preset-card__piece-sizes">
                                    {sizeKeys.length}사이즈: {sizeKeys.join(", ")}
                                  </span>
                                ) : (
                                  // 단일 SVG만 있는 경우
                                  <span className="preset-card__piece-sizes preset-card__piece-sizes--single">
                                    1개 SVG
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
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
                    {/* 편집/삭제 버튼 — Drive 출처 프리셋은 비활성화 + 토스트 안내.
                        왜: Drive 프리셋의 SSOT는 Drive 폴더이므로 앱 내 변경은
                        다음 동기화에서 무효화될 수 있다(이름/조각 구조 등). */}
                    <div className="preset-card__actions">
                      {(() => {
                        const isDrive = isDrivePreset(preset);
                        return (
                          <>
                            <button
                              className="btn btn--small"
                              onClick={() => {
                                if (isDrive) {
                                  showDriveReadonlyToast();
                                  return;
                                }
                                handleEdit(preset);
                              }}
                              disabled={isDrive}
                              title={
                                isDrive
                                  ? "Drive 프리셋은 앱에서 편집할 수 없습니다"
                                  : undefined
                              }
                            >
                              편집
                            </button>
                            <button
                              className="btn btn--small btn--danger"
                              onClick={() => {
                                if (isDrive) {
                                  showDriveReadonlyToast();
                                  return;
                                }
                                handleDelete(preset.id);
                              }}
                              disabled={isDrive}
                              title={
                                isDrive
                                  ? "Drive 프리셋은 앱에서 삭제할 수 없습니다"
                                  : undefined
                              }
                            >
                              삭제
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>

        {/* Drive 가져오기 모달은 옵션 4 자동 동기화로 대체되어 제거됨 */}
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

      {/* === 사이즈별 SVG 파일 현황 === */}
      {formPieces.length > 0 && (
        <div className="pattern-edit__svg-status">
          <h3>등록된 SVG 파일</h3>
          {formPieces.map((piece) => {
            // Local(svgBySize 인라인) + Drive(svgPathBySize 경로) 어느 쪽이라도 해당 사이즈가 있으면 "등록됨"
            // 왜 별도 함수 대신 인라인인가: 각 사이즈마다 boolean만 필요해서 헬퍼보다 단순하다.
            const hasSize = (size: string): boolean =>
              Boolean(piece.svgBySize?.[size]) || Boolean(piece.svgPathBySize?.[size]);
            const registeredKeys = getRegisteredSizeKeys(piece);
            const registeredCount = registeredKeys.length;
            return (
              <div key={piece.id} className="svg-status__piece">
                <strong>{piece.name}</strong>
                {registeredCount > 0 ? (
                  <div className="svg-status__sizes">
                    {SIZE_LIST.map((size) => (
                      <span
                        key={size}
                        className={`svg-status__size ${hasSize(size) ? "svg-status__size--ok" : "svg-status__size--missing"}`}
                      >
                        {size} {hasSize(size) ? "\u2713" : ""}
                      </span>
                    ))}
                    <div className="svg-status__count">
                      {registeredCount} / {SIZE_LIST.length} 사이즈 등록
                    </div>
                  </div>
                ) : (
                  <div>단일 SVG (사이즈별 파일 없음)</div>
                )}
              </div>
            );
          })}
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
