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
import { useNavigate } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import type { PatternPreset, PatternPiece, PatternCategory, SizeSpec } from "../types/pattern";
import { SIZE_LIST, getSizeRangeText } from "../types/pattern";
import { countSvgPieces } from "../services/svgResolver";
import { getSvg } from "../stores/svgCacheStore";
import { loadPresets, savePresets, generateId } from "../stores/presetStore";
// 즐겨찾기 저장소 — Phase 3 신규 (⭐ 토글 + 필터)
import {
  loadFavorites,
  saveFavorites,
  getFavoriteKey,
} from "../stores/favoritesStore";
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
// 세션 저장소 — 2단계 "패턴 선택" 진입 가드 + selectedPresetId 저장용
import { loadWorkSession, updateWorkSession } from "../stores/sessionStore";
import type { WorkSession } from "../types/session";
// Phase 1-5: SVG 표준화 모달 — 카드 ⋮ 메뉴에서 열림
// 왜 여기서 import: PatternManage가 이 모달을 조건부 렌더하므로 소유자가 맞다.
import SvgStandardizeModal from "../components/SvgStandardizeModal";

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

/**
 * PresetCardPieceCount — 카드에 "조각 N개"를 실제 SVG 기반으로 표시하는 컴포넌트.
 *
 * 왜 별도 컴포넌트인가:
 *   - Drive 프리셋은 svgBySize가 비어 있고 svgPathBySize(경로)만 있어서
 *     실제 SVG 문자열을 디스크에서 await로 읽어야 한다.
 *   - 각 카드가 독립적으로 로드되도록 하여 한 카드의 I/O 지연이 다른 카드 렌더를 막지 않게 한다.
 *   - svgCacheStore가 LRU 캐시를 제공하므로 재방문 시 즉시 반환된다.
 *
 * 로직:
 *   1) Local (svgBySize에 첫 사이즈 문자열 존재) → 동기 계산, 즉시 표시.
 *   2) Drive (svgPathBySize만 존재) → 첫 번째 사이즈 경로를 getSvg로 비동기 로드 → countSvgPieces.
 *   3) 로드 전/실패 시 "조각 …개"로 표시(노이즈 최소화). 실패해도 앱 흐름 영향 없음.
 *
 * 비유:
 *   상품 카드가 재고를 서로 다른 창고에서 꺼내 표기하는 것과 같다 — 각자 비동기로 꺼내며,
 *   한 카드가 늦어도 옆 카드는 이미 숫자를 보여주고 있다.
 */
function PresetCardPieceCount({ preset }: { preset: PatternPreset }) {
  // 왜 useState인가: 비동기 로드가 완료되면 숫자를 갱신해야 하므로 리렌더 트리거가 필요.
  // 초기값은 첫 piece의 svgBySize에서 동기 계산 가능하면 즉시 세팅(깜빡임 최소).
  const [count, setCount] = useState<number | null>(() => {
    // Local 프리셋: 첫 조각의 svgBySize 중 임의의 사이즈 1개에서 즉시 계산
    const firstPiece = preset.pieces[0];
    if (!firstPiece) return 0;
    const inline = firstPiece.svgBySize
      ? Object.values(firstPiece.svgBySize)[0]
      : undefined;
    if (inline) return countSvgPieces(inline);
    // svgData(대표 인라인)도 있으면 활용
    if (firstPiece.svgData) return countSvgPieces(firstPiece.svgData);
    return null; // Drive 프리셋 → 비동기 로드 대기
  });

  useEffect(() => {
    // 이미 동기로 계산됐으면 스킵
    if (count !== null) return;
    const firstPiece = preset.pieces[0];
    if (!firstPiece) {
      setCount(0);
      return;
    }
    // Drive 프리셋의 첫 사이즈 경로를 뽑아 비동기 로드
    const firstPath = firstPiece.svgPathBySize
      ? Object.values(firstPiece.svgPathBySize)[0]
      : undefined;
    if (!firstPath) {
      // 경로도 없으면 세기 불가 → 안전한 fallback
      setCount(0);
      return;
    }
    // 언마운트 후 setState 방지 (비동기 레이스)
    let cancelled = false;
    getSvg(firstPath)
      .then((svg) => {
        if (cancelled) return;
        setCount(countSvgPieces(svg));
      })
      .catch(() => {
        if (cancelled) return;
        // Drive 파일이 사라지거나 권한 문제 등 — 카드 전체 깨짐 방지용 0
        setCount(0);
      });
    return () => {
      cancelled = true;
    };
    // preset.id 기준으로만 재실행 — 같은 preset 내 참조 변경은 무시
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset.id]);

  return (
    <span className="preset-card__stat">
      {/* 로드 전에는 빈 말줄임으로 레이아웃만 유지 */}
      조각 {count === null ? "…" : count}개
    </span>
  );
}

function PatternManage() {
  // === 라우터 네비게이션 (세션 없을 때 /work로 되돌리기 + "다음" 버튼용) ===
  const navigate = useNavigate();

  // === 작업 세션 상태 ===
  // 왜 상태로 들고 있나: selectedPresetId를 UI에서 "하이라이트"로 쓰려면 리렌더가 필요하기 때문.
  // sessionStorage는 저장소일 뿐이고, 화면에 반영되려면 React state로 복사해야 한다.
  // null: 아직 로드 전 (로딩 화면), undefined: 로드 후 세션 없음(관리 모드), WorkSession: 선택 모드
  const [session, setSession] = useState<WorkSession | null | undefined>(null);
  // 선택 모드 여부 — 세션이 있으면 true. "관리"가 아닌 "선택"이 주 목적이 된다.
  const isSelectMode = !!session;
  // 현재 선택된 프리셋 ID (선택 모드에서만 의미). 카드 하이라이트 + "다음" 버튼 활성화 조건.
  const [selectedPresetId, setSelectedPresetId] = useState<string | undefined>(undefined);

  // === 상태 관리 ===
  const [presets, setPresets] = useState<PatternPreset[]>([]); // 전체 프리셋 목록
  const [categories, setCategories] = useState<PatternCategory[]>([]); // 카테고리 목록
  const [mode, setMode] = useState<EditMode>("list");          // 현재 화면 모드
  // 편집 중인 프리셋 ID — 진입 경로 제거로 항상 null이지만, 편집 폼 JSX 내부에서 참조되어 유지.
  const [editingId] = useState<string | null>(null);

  // 카테고리 트리 선택 상태 (기본: 전체)
  const [selectedCategory, setSelectedCategory] = useState<SelectedCategory>({ type: "all" });

  // === 즐겨찾기 상태 (Phase 3 신규) ===
  // 왜 Set인가: "해당 프리셋이 즐겨찾기인가?"는 has()로 O(1) 조회가 필요하기 때문.
  // 파일에는 배열로 저장되지만 런타임은 Set으로 관리하고 저장 직전에 배열로 변환한다.
  // (자동차로 치면 "디스크=차고에 주차된 배열", "메모리=빠른 조회용 해시맵".)
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(new Set());
  // 즐겨찾기만 보기 필터 토글 (기본 OFF)
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

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

  // === Phase 1-5: SVG 표준화 모달 상태 ===
  // 왜 두 개로 나눴나:
  //   - openMenuPresetId: 카드 ⋮ 메뉴 드롭다운이 열려있는 카드 ID (한 번에 하나만)
  //   - standardizeTarget: 모달이 렌더될 대상 프리셋 (null이면 모달 닫힘)
  // 둘을 분리해야 "메뉴 클릭 → 메뉴 닫힘 + 모달 열림" 전환이 깔끔하다.
  const [openMenuPresetId, setOpenMenuPresetId] = useState<string | null>(null);
  const [standardizeTarget, setStandardizeTarget] =
    useState<PatternPreset | null>(null);

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

  // === 작업 세션 로드 — 진입 가드 + 초기 선택 복원 ===
  //
  // 왜 필요한가: 워크플로우 재설계(Phase 2)에서 /pattern은 "세션을 이미 만든 사용자"만
  // 도달해야 하는 "2단계" 페이지다. 세션 없이 직접 /pattern을 치고 들어오면 기준 AI 파일이
  // 없는 상태이므로 /work로 되돌려 보낸다. 단, 관리 목적(편집/삭제)으로도 쓰일 수 있으니
  // "세션이 전혀 없는" 경우에는 관리 모드로 폴백(undefined)하여 계속 사용 가능하게 둔다.
  //
  // 진입 시나리오:
  //   1) /work에서 "다음" → 세션 있음 → 선택 모드 (isSelectMode=true)
  //   2) 사이드바에서 "패턴" 직접 클릭 + 세션 없음 → 관리 모드 (isSelectMode=false)
  //   3) 사이드바에서 "패턴" 직접 클릭 + 세션 있음(이전 작업) → 선택 모드로 복원
  useEffect(() => {
    const s = loadWorkSession();
    if (s) {
      setSession(s);
      // 세션에 이미 선택한 프리셋이 있으면 복원 (뒤로 돌아왔을 때 하이라이트 유지)
      setSelectedPresetId(s.selectedPresetId);
    } else {
      // 세션 없음 = 관리 모드. 리다이렉트하지 않고 기존 동작 유지.
      setSession(undefined);
    }
  }, []);

  // === 즐겨찾기 로드 (페이지 진입 시 1회) ===
  // 왜 별도 useEffect인가: favorites.json은 presets/categories와 독립이라 병렬 로드가
  // 안전하고 빠르다. 실패해도 앱 동작에 치명적이지 않아 경고만 찍고 빈 Set을 유지한다.
  useEffect(() => {
    loadFavorites().then((result) => {
      if (result.success) {
        setFavoriteKeys(new Set(result.data));
      } else {
        // 실패해도 앱은 사용 가능해야 함 — 빈 Set으로 두고 경고만
        console.warn("즐겨찾기 로드 실패:", result.error);
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

  // === 즐겨찾기 토글 (Phase 3 신규) ===
  // 왜 이벤트를 인자로 받는가: 카드 onClick(선택 모드의 선택 동작)과 별 아이콘 클릭이
  // 같은 영역에 겹치므로, stopPropagation으로 "카드 선택"이 동시에 일어나지 않게 막아야 한다.
  // (엘리베이터 버튼을 누르면 층 표시등이 켜지지만, 그 버튼 눌렀다고 문 자체가 닫히지는 않아야 하는 것과 같다.)
  const handleToggleFavorite = useCallback(
    async (preset: PatternPreset, e: React.MouseEvent) => {
      e.stopPropagation(); // 카드 클릭(선택) 전파 차단
      const key = getFavoriteKey(preset);
      // 낙관적 업데이트: 먼저 UI 반영 후 저장. 저장 실패 시 롤백.
      const next = new Set(favoriteKeys);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      setFavoriteKeys(next);
      try {
        await saveFavorites(Array.from(next));
      } catch (err) {
        // 저장 실패 시 이전 상태로 롤백
        console.error("즐겨찾기 저장 실패:", err);
        setFavoriteKeys(favoriteKeys);
        alert(`즐겨찾기 저장 실패: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [favoriteKeys]
  );

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

  // === Phase 1-5: 카드 ⋮ 메뉴 바깥 클릭 시 닫기 ===
  // 왜 document-level listener 인가: 드롭다운 바깥 어디를 눌러도 닫혀야
  // 자연스럽다 (GitHub/Gmail 방식). 메뉴가 열려 있을 때만 등록해서 불필요한
  // 리스너 실행을 피한다.
  useEffect(() => {
    if (openMenuPresetId === null) return;
    const onDocClick = () => {
      // 메뉴 내부 버튼 클릭은 e.stopPropagation()으로 여기 도달 못함.
      // 여기까지 왔다 = 메뉴 바깥 클릭.
      setOpenMenuPresetId(null);
    };
    // capture 단계에 붙이면 카드 클릭(선택)보다 먼저 실행되어 메뉴가 먼저 닫힘
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [openMenuPresetId]);

  // === Phase 1-5: driveFolder(상대경로) + drivePatternRoot(절대경로) 합성 ===
  // 왜 필요: preset.driveFolder는 "농구유니폼/1. 단면 유니폼..." 같은 상대 경로.
  // Python에 넘길 때는 루트까지 합친 절대 경로여야 한다.
  // driveSync.ts의 joinPath는 private이라 여기에 작은 버전을 둔다.
  const buildAbsoluteDriveFolder = useCallback(
    (root: string | undefined, relative: string): string => {
      if (!root) return relative;  // 방어적 기본값
      const sep = root.includes("\\") ? "\\" : "/";
      const trimmedRoot =
        root.endsWith("\\") || root.endsWith("/") ? root.slice(0, -1) : root;
      const trimmedRel = relative.startsWith("\\") || relative.startsWith("/")
        ? relative.slice(1)
        : relative;
      return `${trimmedRoot}${sep}${trimmedRel}`;
    },
    []
  );

  // === (보완 수정 [2026-04-22]) 프리셋 첫 조각의 svgPathBySize 맵 추출 ===
  //
  // 왜 필요: SvgStandardizeModal이 양면 상의가 아닐 때(단면 등)
  // XL → 2XL → L → M → S 순서로 fallback 기준 파일을 선택할 수 있도록
  // 패턴의 사이즈별 SVG 절대 경로 맵을 넘겨줘야 한다.
  //
  // 왜 첫 조각만: Phase 1은 1 pattern = 1 piece 가정. 상/하의 세트 등
  // 복합 프리셋 확장은 Phase 3에서 다시 설계.
  const getPieceSvgPathBySize = useCallback(
    (preset: PatternPreset): Record<string, string> => {
      const firstPiece = preset.pieces?.[0];
      return firstPiece?.svgPathBySize ?? {};  // 비어있으면 빈 객체
    },
    []
  );

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
      // 1) 카테고리 필터
      let categoryOk = true;
      if (selectedCategory.type === "all") categoryOk = true;
      else if (selectedCategory.type === "uncategorized") categoryOk = !p.categoryId;
      else categoryOk = getPresetBelongsToCategory(p, selectedCategory.id, categories);
      if (!categoryOk) return false;

      // 2) 즐겨찾기 필터 (토글 ON일 때만 적용)
      // 왜 여기서 필터링하는가: 카테고리 + 즐겨찾기 필터를 합쳐 한 번의 배열 순회로 처리하여
      // 별도 useMemo 체인을 늘리지 않기 위해. (간단한 조건을 분리하기보다는 묶어두는 편이 가독성↑)
      if (showFavoritesOnly) {
        const key = getFavoriteKey(p);
        if (!favoriteKeys.has(key)) return false;
      }
      return true;
    });
    // 원본 배열 불변성 유지를 위해 복사 후 정렬
    return [...filtered].sort((a, b) =>
      a.name.localeCompare(b.name, "ko", { numeric: true, sensitivity: "base" })
    );
  }, [presets, categories, selectedCategory, showFavoritesOnly, favoriteKeys]);

  // === 빵가루 경로 계산 ===
  const breadcrumb =
    selectedCategory.type === "category"
      ? getCategoryPath(categories, selectedCategory.id)
      : null;

  // === 프리셋 카드 선택 (선택 모드 전용) ===
  // 왜: 선택 모드에서 사용자가 카드를 클릭하면 즉시 세션에 저장해야
  // "다음" 버튼 누르기 전에 새로고침해도 선택이 유지된다.
  // 동일 카드를 다시 클릭해도 토글하지 않는다(선택 해제는 다른 카드 클릭으로).
  const handleSelectPreset = (presetId: string) => {
    if (!isSelectMode) return; // 관리 모드에서는 카드 클릭 무시 (기존 동작 보존)
    setSelectedPresetId(presetId);
    // 세션에 즉시 반영 — 페이지 리로드/뒤로가기 대비
    updateWorkSession({ selectedPresetId: presetId });
  };

  // === "다음: 파일 생성" — 선택 모드 전용 ===
  const handleNextToGenerate = () => {
    if (!selectedPresetId) return; // 가드 — 버튼은 disabled지만 안전망
    // 이미 handleSelectPreset에서 세션에 저장됐지만, 혹시 누락되었을 경우 한 번 더 확정.
    updateWorkSession({ selectedPresetId });
    navigate("/generate");
  };

  // 편집 진입 핸들러(handleCreate/handleEdit/handleDelete)는 카드 간소화(2026-04-15)로
  // 호출 경로가 모두 사라져 제거됐다. 편집 폼 JSX 자체는 남아 있지만 진입 경로가 없어
  // mode가 "list" 이외의 값이 될 일은 없다. 필요 시 git history에서 복원 가능.


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

  // Drive 출처 판정/토스트 헬퍼들은 카드 간소화(편집/삭제 버튼 + 새 프리셋 추가 버튼 제거,
  // 2026-04-15)로 인해 호출부가 사라져 제거됐다. 필요 시 git history에서 복원 가능.


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
    // SIZE_LIST에 정의된 순서대로 정렬 (5XS → 5XL 방향, 작은→큰 순)
    // 이유: Set 반복 순서는 삽입 순서라 무작위로 보일 수 있음. 사용자가 카드에서
    // "5XS, 4XS, ..., 5XL" 순으로 보기를 원함. SIZE_LIST에 없는 값은 뒤로.
    return Array.from(keys).sort((a, b) => {
      const idxA = SIZE_LIST.indexOf(a as typeof SIZE_LIST[number]);
      const idxB = SIZE_LIST.indexOf(b as typeof SIZE_LIST[number]);
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });
  };

  // === 프리셋 전체의 등록 사이즈 키 집합 ===
  //
  // 왜 별도 헬퍼인가: 간소화된 카드에서 "5XS ~ 5XL" 같은 범위를 표기하려면
  // piece 단위가 아닌 "이 프리셋이 가진 모든 사이즈"의 합집합이 필요하다.
  // 조각별로는 사이즈가 다를 수 있지만(예: 일부 조각만 2XL 등록), 프리셋 관점에서는
  // 등록된 최소~최대로 요약한다. 비유: 여러 카탈로그 페이지의 사이즈를 모은
  // "상품 라벨"의 sizes 표시와 같다.
  const getPresetSizeKeys = (preset: PatternPreset): string[] => {
    const keys = new Set<string>();
    for (const piece of preset.pieces) {
      for (const k of getRegisteredSizeKeys(piece)) keys.add(k);
    }
    // SIZE_LIST 순서 유지
    return Array.from(keys).sort((a, b) => {
      const idxA = SIZE_LIST.indexOf(a as typeof SIZE_LIST[number]);
      const idxB = SIZE_LIST.indexOf(b as typeof SIZE_LIST[number]);
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });
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
  // 세션 판정이 끝나기 전에도 로딩 표시 (session === null)
  if (loading || session === null) {
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
        {/* 타이틀/설명: 선택 모드냐 관리 모드냐에 따라 문구가 달라진다.
            선택 모드는 "그레이딩할 패턴 고르기"가 목적이고,
            관리 모드는 기존처럼 "프리셋 등록/관리"가 목적이다. */}
        <h1 className="page__title">
          {isSelectMode ? "패턴 선택" : "패턴 관리"}
        </h1>
        <p className="page__description">
          {isSelectMode
            ? "그레이딩할 패턴 프리셋을 하나 선택한 뒤, 오른쪽 아래 \u201C다음\u201D 버튼을 눌러주세요."
            : "SVG 형식의 옷 패턴(조각) 파일을 등록하고 관리합니다. 등록된 패턴은 프리셋으로 저장되어 반복 사용할 수 있습니다."}
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

            {/* "+ 새 프리셋 추가" 버튼은 사용자 요청(2026-04-15)으로 제거됨.
                Drive 자동 동기화가 기본이 되면서 앱 내 수동 추가 경로는 가려둔다.
                편집 폼(mode === "create" | "edit") 자체는 추후 재진입 경로를 열어둘 가능성을 위해 유지. */}

            {/* 툴바 — 즐겨찾기 필터 토글 (Phase 3 신규)
                왜 빵가루 바로 아래인가: 카테고리 컨텍스트를 본 직후 "이 카테고리 안에서
                즐겨찾기만 보기"가 자연스러운 시선 흐름이기 때문. */}
            <div className="pattern-toolbar">
              <button
                type="button"
                className={
                  "pattern-toolbar__fav-filter" +
                  (showFavoritesOnly ? " pattern-toolbar__fav-filter--active" : "")
                }
                onClick={() => setShowFavoritesOnly((v) => !v)}
                aria-pressed={showFavoritesOnly}
                title={
                  showFavoritesOnly
                    ? "모든 프리셋 보기"
                    : "즐겨찾기(★)한 프리셋만 보기"
                }
              >
                {/* 별 아이콘은 CSS가 아닌 유니코드로 간단히 표현 */}
                <span className="pattern-toolbar__fav-icon" aria-hidden="true">★</span>
                {showFavoritesOnly ? "즐겨찾기만 보는 중" : "즐겨찾기만 보기"}
                {/* 즐겨찾기 개수 뱃지 — 몇 개를 표시할지 미리 알려줌 */}
                <span className="pattern-toolbar__fav-count">
                  {favoriteKeys.size}
                </span>
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
                    ? "Google Drive 동기화를 통해 프리셋이 자동으로 등록됩니다 (설정에서 확인)"
                    : "다른 카테고리를 선택해 보세요"}
                </p>
              </div>
            ) : (
              /* 프리셋 카드 목록 */
              <div className="preset-grid">
                {filteredPresets.map((preset) => {
                  // 선택 모드에서 현재 카드가 선택됐는지 여부 — 하이라이트 + 체크 아이콘 렌더링 근거
                  const isSelected =
                    isSelectMode && selectedPresetId === preset.id;
                  // 카드 전체 클릭 핸들러 — 선택 모드에서만 의미 있음.
                  // 관리 모드에서는 onClick=undefined로 두어 커서/포커스가 바뀌지 않도록 한다.
                  const cardClickHandler = isSelectMode
                    ? () => handleSelectPreset(preset.id)
                    : undefined;
                  return (
                  <div
                    key={preset.id}
                    className={
                      "preset-card" +
                      (isSelected ? " preset-card--selected" : "") +
                      (isSelectMode ? " preset-card--selectable" : "")
                    }
                    onClick={cardClickHandler}
                    // 접근성: 선택 모드일 때만 버튼처럼 동작 (키보드 Enter/Space 선택 허용)
                    role={isSelectMode ? "button" : undefined}
                    tabIndex={isSelectMode ? 0 : undefined}
                    onKeyDown={
                      isSelectMode
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleSelectPreset(preset.id);
                            }
                          }
                        : undefined
                    }
                    aria-pressed={isSelectMode ? isSelected : undefined}
                  >
                    {/* 선택 체크 표시 — 선택 모드에서 선택된 카드에만 나타난다 (좌상단) */}
                    {isSelected && (
                      <div className="preset-card__check" aria-hidden="true">
                        ✓
                      </div>
                    )}
                    {/* ⭐ 즐겨찾기 토글 (우상단) — Phase 3 신규
                        왜 항상 렌더링: 켜져있지 않아도 빈 별(outline)로 표시해
                        "클릭하면 즐겨찾기가 된다"는 힌트를 준다.
                        stopPropagation은 handleToggleFavorite 내부에서 처리. */}
                    {(() => {
                      const favKey = getFavoriteKey(preset);
                      const isFav = favoriteKeys.has(favKey);
                      return (
                        <button
                          type="button"
                          className={
                            "preset-card__fav-toggle" +
                            (isFav ? " preset-card__fav-toggle--active" : "")
                          }
                          onClick={(e) => handleToggleFavorite(preset, e)}
                          aria-label={isFav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                          aria-pressed={isFav}
                          title={isFav ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                        >
                          {/* 유니코드 별 — 켜짐: ★(채움) / 꺼짐: ☆(테두리) */}
                          {isFav ? "★" : "☆"}
                        </button>
                      );
                    })()}
                    {/* ⋮ 더보기 메뉴 (Phase 1-5) — 즐겨찾기 별 왼쪽.
                        stopPropagation으로 카드 선택 이벤트 차단.
                        바깥 클릭 시 document 리스너가 자동으로 닫는다. */}
                    <button
                      type="button"
                      className="preset-card__menu-toggle"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuPresetId((cur) =>
                          cur === preset.id ? null : preset.id
                        );
                      }}
                      aria-label="더 많은 옵션"
                      aria-haspopup="menu"
                      aria-expanded={openMenuPresetId === preset.id}
                      title="더 많은 옵션"
                    >
                      ⋮
                    </button>
                    {openMenuPresetId === preset.id && (
                      <div
                        className="preset-card__menu"
                        role="menu"
                        // 메뉴 내부 클릭은 document 리스너(바깥 감지)로 전파되지 않게 차단
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="preset-card__menu-item"
                          role="menuitem"
                          // Drive 연동 프리셋(driveFolder 있음)만 활성화.
                          // Local 프리셋은 G드라이브 경로가 없어 표준화 불가.
                          disabled={!preset.driveFolder || !drivePatternRoot}
                          title={
                            !preset.driveFolder || !drivePatternRoot
                              ? "Drive 연동 프리셋만 표준화할 수 있습니다"
                              : undefined
                          }
                          onClick={() => {
                            setStandardizeTarget(preset);
                            setOpenMenuPresetId(null);
                          }}
                        >
                          📐 SVG 표준화
                        </button>
                      </div>
                    )}
                    {/* 간소화된 카드 — 패턴명 / 조각 수(실제 SVG 파싱) / 사이즈 범위
                        Drive vs Local 구분은 사용자 요청으로 표시하지 않음 (UI 통일) */}
                    <div className="preset-card__title-row">
                      <h3 className="preset-card__name">{preset.name}</h3>
                    </div>
                    <div className="preset-card__meta-row">
                      {/* 조각 수: 실제 SVG 내부 path/polyline/polygon 개수
                          PresetCardPieceCount 내부에서 비동기 로드 + countSvgPieces 계산.
                          컴포넌트 경계를 둔 이유: 카드별 독립 상태 + 각 카드의 useEffect 분리. */}
                      <PresetCardPieceCount preset={preset} />
                      {/* 사이즈 범위 — "5XS ~ 5XL" 등 */}
                      <span className="preset-card__stat">
                        {getSizeRangeText(getPresetSizeKeys(preset))}
                      </span>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </main>
        </div>

        {/* Drive 가져오기 모달은 옵션 4 자동 동기화로 대체되어 제거됨 */}

        {/* Phase 1-5: SVG 표준화 모달 — 카드 ⋮ 메뉴에서 선택 시 렌더.
            standardizeTarget이 null이면 렌더 안 함 (언마운트 = 상태 초기화).
            (보완 수정 [2026-04-22]) 기준 사이즈 드롭다운 제거 → 모달 내부에서
            resolveBaseFile()로 자동 결정. 필요한 입력은 driveFolder / svgPathBySize /
            drivePatternRoot 3가지. */}
        {standardizeTarget && standardizeTarget.driveFolder && drivePatternRoot && (
          <SvgStandardizeModal
            presetName={standardizeTarget.name}
            driveFolder={buildAbsoluteDriveFolder(
              drivePatternRoot,
              standardizeTarget.driveFolder
            )}
            svgPathBySize={getPieceSvgPathBySize(standardizeTarget)}
            drivePatternRoot={drivePatternRoot}
            onClose={() => setStandardizeTarget(null)}
            onComplete={() => {
              // 실행 완료 시 Drive 재스캔 트리거.
              // 쿨다운(60초) 무시하기 위해 lastAutoScanRef를 0으로 리셋.
              // 근거: 사용자가 명시적으로 실행한 작업이므로 즉시 UI 반영이 기대됨.
              lastAutoScanRef.current = 0;
              runAutoSync();
            }}
          />
        )}

        {/* "다음: 파일 생성" 고정 푸터 버튼 — 선택 모드에서만 표시.
            WorkSetup과 동일한 .size-footer 클래스를 재사용해 디자인 일관성 유지. */}
        {isSelectMode && (
          <div className="size-footer">
            <button
              className="btn btn--primary btn--large"
              onClick={handleNextToGenerate}
              disabled={!selectedPresetId}
              title={
                !selectedPresetId
                  ? "먼저 패턴 프리셋을 하나 선택해주세요"
                  : undefined
              }
            >
              다음: 파일 생성 →
            </button>
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
