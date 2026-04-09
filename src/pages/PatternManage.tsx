/**
 * PatternManage 페이지
 * 1단계: SVG 패턴(옷 조각) 프리셋을 등록하고 관리하는 페이지.
 *
 * 두 가지 화면(모드)이 있다:
 * 1) 목록 모드: 등록된 프리셋 카드 목록 + "새 프리셋 추가" 버튼
 * 2) 편집 모드: 프리셋 이름 입력, 조각 추가/삭제, 사이즈별 치수 입력
 */

import { useState, useEffect, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import type { PatternPreset, PatternPiece, SizeSpec } from "../types/pattern";
import { SIZE_LIST } from "../types/pattern";
import { loadPresets, savePresets, generateId } from "../stores/presetStore";

/** 편집 모드 상태 타입 */
type EditMode = "list" | "create" | "edit";

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

  // === 앱 시작 시 프리셋 로드 ===
  useEffect(() => {
    loadPresets()
      .then((data) => setPresets(data))
      .finally(() => setLoading(false));
  }, []);

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

  // === SVG 파일 선택 및 추가 ===
  const handleAddPiece = async () => {
    try {
      // Tauri 파일 다이얼로그로 SVG 파일 선택
      const filePath = await open({
        title: "패턴 조각 SVG 파일 선택",
        filters: [{ name: "SVG 파일", extensions: ["svg"] }],
        multiple: false,
      });

      if (!filePath) return; // 사용자가 취소한 경우

      // SVG 파일 내용 읽기
      const svgData = await readTextFile(filePath as string);

      // 파일명에서 확장자를 제거하여 기본 이름으로 사용
      const fileName = (filePath as string).split(/[\\/]/).pop() || "조각";
      const defaultName = fileName.replace(/\.svg$/i, "");

      // 새 조각 생성
      const newPiece: PatternPiece = {
        id: generateId(),
        name: defaultName,
        svgPath: filePath as string,
        svgData,
      };

      const updatedPieces = [...formPieces, newPiece];
      setFormPieces(updatedPieces);

      // 모든 사이즈의 pieces 배열에 새 조각의 빈 치수를 추가
      setFormSizes((prev) =>
        prev.map((sizeSpec) => ({
          ...sizeSpec,
          pieces: [
            ...sizeSpec.pieces,
            { pieceId: newPiece.id, width: 0, height: 0 },
          ],
        }))
      );
    } catch (err) {
      console.error("SVG 파일 추가 실패:", err);
    }
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
          <button className="btn btn--primary btn--small" onClick={handleAddPiece}>
            + 조각 추가 (SVG)
          </button>
        </div>

        {formPieces.length === 0 ? (
          <p className="form-section__empty">
            아직 추가된 조각이 없습니다. "조각 추가" 버튼으로 SVG 파일을
            선택하세요.
          </p>
        ) : (
          <div className="piece-list">
            {formPieces.map((piece) => (
              <div key={piece.id} className="piece-item">
                {/* SVG 미리보기 */}
                <div
                  className="piece-item__preview"
                  dangerouslySetInnerHTML={{ __html: piece.svgData }}
                />
                <div className="piece-item__info">
                  <input
                    className="piece-item__name-input"
                    type="text"
                    value={piece.name}
                    onChange={(e) =>
                      handlePieceNameChange(piece.id, e.target.value)
                    }
                    placeholder="조각 이름"
                  />
                  <span className="piece-item__path" title={piece.svgPath}>
                    {piece.svgPath.split(/[\\/]/).pop()}
                  </span>
                </div>
                <button
                  className="btn btn--small btn--danger"
                  onClick={() => handleRemovePiece(piece.id)}
                >
                  삭제
                </button>
              </div>
            ))}
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

// React에서 Fragment를 사용하기 위해 import (테이블에서 여러 td를 묶을 때 필요)
import { Fragment } from "react";

export default PatternManage;
