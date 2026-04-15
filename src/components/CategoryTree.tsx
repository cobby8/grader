/**
 * CategoryTree 컴포넌트
 *
 * 패턴 프리셋을 폴더처럼 분류하는 트리 네비게이션.
 * 재귀적으로 카테고리를 렌더링하며, 접기/펼치기/추가/삭제/이름변경 기능을 제공한다.
 *
 * 구조:
 *  [전체]          ← 모든 프리셋 표시 (특수 항목)
 *  [미분류]        ← categoryId가 없는 프리셋 (특수 항목)
 *  📁 농구         ← 루트 카테고리
 *    📁 상의       ← 하위 카테고리
 *    📁 하의
 *  📁 축구
 *  [+ 카테고리]    ← 루트 카테고리 추가 버튼
 */

import { useState, useRef, useEffect } from "react";
import type { PatternCategory } from "../types/pattern";
import { getChildCategories } from "../stores/categoryStore";

/** 선택 상태를 나타내는 특수 값 */
export type SelectedCategory =
  | { type: "all" }                    // 전체
  | { type: "uncategorized" }          // 미분류
  | { type: "category"; id: string };  // 특정 카테고리

interface CategoryTreeProps {
  categories: PatternCategory[];       // 전체 카테고리 목록
  selected: SelectedCategory;          // 현재 선택된 항목
  presetCountByCategory: Map<string, number>; // 카테고리별 프리셋 수
  uncategorizedCount: number;          // 미분류 프리셋 수
  totalCount: number;                  // 전체 프리셋 수
  onSelect: (sel: SelectedCategory) => void;  // 선택 변경 콜백
  onAddCategory: (parentId: string | null) => void;    // 카테고리 추가
  onDeleteCategory: (id: string) => void;              // 카테고리 삭제
  onRenameCategory: (id: string, newName: string) => void; // 카테고리 이름 변경
}

/** 개별 트리 노드 컴포넌트 (재귀적으로 자식을 렌더링) */
function TreeNode({
  category,
  categories,
  selected,
  presetCountByCategory,
  depth,
  onSelect,
  onAddCategory,
  onDeleteCategory,
  onRenameCategory,
}: {
  category: PatternCategory;
  categories: PatternCategory[];
  selected: SelectedCategory;
  presetCountByCategory: Map<string, number>;
  depth: number;
  onSelect: (sel: SelectedCategory) => void;
  onAddCategory: (parentId: string | null) => void;
  onDeleteCategory: (id: string) => void;
  onRenameCategory: (id: string, newName: string) => void;
}) {
  // 이 노드가 펼쳐져 있는지 (기본: 접힘)
  const [expanded, setExpanded] = useState(false);
  // 이름 편집 모드인지
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(category.name);
  const inputRef = useRef<HTMLInputElement>(null);

  // 자식 카테고리 목록
  const children = getChildCategories(categories, category.id);
  const hasChildNodes = children.length > 0;

  // 현재 선택 여부
  const isSelected =
    selected.type === "category" && selected.id === category.id;

  // 이 카테고리의 프리셋 수
  const count = presetCountByCategory.get(category.id) || 0;

  // 편집 모드 진입 시 input에 포커스
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // 이름 변경 확정
  const commitRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== category.name) {
      onRenameCategory(category.id, trimmed);
    } else {
      setEditName(category.name); // 원래 이름으로 복원
    }
    setEditing(false);
  };

  return (
    <div className="cat-tree__node">
      {/* 노드 행 */}
      <div
        className={`cat-tree__row ${isSelected ? "cat-tree__row--selected" : ""}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect({ type: "category", id: category.id })}
        onDoubleClick={() => {
          // 더블클릭으로 이름 편집 진입
          setEditName(category.name);
          setEditing(true);
        }}
      >
        {/* 접기/펼치기 화살표 (자식이 있을 때만) */}
        <span
          className="cat-tree__toggle"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          {hasChildNodes ? (expanded ? "\u25BE" : "\u25B8") : "\u00A0"}
        </span>

        {/* 폴더 아이콘 */}
        <span className="cat-tree__icon">
          {expanded && hasChildNodes ? "\uD83D\uDCC2" : "\uD83D\uDCC1"}
        </span>

        {/* 카테고리 이름 (편집 모드 or 표시 모드) */}
        {editing ? (
          <input
            ref={inputRef}
            className="cat-tree__edit-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setEditName(category.name);
                setEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="cat-tree__name">{category.name}</span>
        )}

        {/* 프리셋 수 배지 */}
        {count > 0 && (
          <span className="cat-tree__count">{count}</span>
        )}

        {/* 액션 버튼들 (호버 시 표시) */}
        <span className="cat-tree__actions">
          {/* 하위 카테고리 추가 */}
          <button
            className="cat-tree__action-btn"
            title="하위 카테고리 추가"
            onClick={(e) => {
              e.stopPropagation();
              onAddCategory(category.id);
            }}
          >
            +
          </button>
          {/* 삭제 */}
          <button
            className="cat-tree__action-btn cat-tree__action-btn--danger"
            title="카테고리 삭제"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteCategory(category.id);
            }}
          >
            &times;
          </button>
        </span>
      </div>

      {/* 자식 카테고리 (재귀) */}
      {expanded && hasChildNodes && (
        <div className="cat-tree__children">
          {children.map((child) => (
            <TreeNode
              key={child.id}
              category={child}
              categories={categories}
              selected={selected}
              presetCountByCategory={presetCountByCategory}
              depth={depth + 1}
              onSelect={onSelect}
              onAddCategory={onAddCategory}
              onDeleteCategory={onDeleteCategory}
              onRenameCategory={onRenameCategory}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** CategoryTree 메인 컴포넌트 */
function CategoryTree({
  categories,
  selected,
  presetCountByCategory,
  uncategorizedCount,
  totalCount,
  onSelect,
  onAddCategory,
  onDeleteCategory,
  onRenameCategory,
}: CategoryTreeProps) {
  // 루트 카테고리 (parentId === null)
  const rootCategories = getChildCategories(categories, null);

  return (
    <div className="cat-tree">
      {/* "전체" 특수 항목 */}
      <div
        className={`cat-tree__row cat-tree__row--special ${
          selected.type === "all" ? "cat-tree__row--selected" : ""
        }`}
        onClick={() => onSelect({ type: "all" })}
      >
        <span className="cat-tree__toggle">{"\u00A0"}</span>
        <span className="cat-tree__icon">{"\uD83D\uDCCB"}</span>
        <span className="cat-tree__name">전체</span>
        {totalCount > 0 && (
          <span className="cat-tree__count">{totalCount}</span>
        )}
      </div>

      {/* 루트 카테고리들 */}
      {rootCategories.map((cat) => (
        <TreeNode
          key={cat.id}
          category={cat}
          categories={categories}
          selected={selected}
          presetCountByCategory={presetCountByCategory}
          depth={0}
          onSelect={onSelect}
          onAddCategory={onAddCategory}
          onDeleteCategory={onDeleteCategory}
          onRenameCategory={onRenameCategory}
        />
      ))}

      {/* "미분류" 특수 항목 */}
      <div
        className={`cat-tree__row cat-tree__row--special ${
          selected.type === "uncategorized" ? "cat-tree__row--selected" : ""
        }`}
        onClick={() => onSelect({ type: "uncategorized" })}
      >
        <span className="cat-tree__toggle">{"\u00A0"}</span>
        <span className="cat-tree__icon">{"\uD83D\uDCC4"}</span>
        <span className="cat-tree__name">미분류</span>
        {uncategorizedCount > 0 && (
          <span className="cat-tree__count">{uncategorizedCount}</span>
        )}
      </div>

      {/* 루트 카테고리 추가 버튼 */}
      <div className="cat-tree__add-root">
        <button
          className="cat-tree__add-btn"
          onClick={() => onAddCategory(null)}
        >
          + 카테고리
        </button>
      </div>
    </div>
  );
}

export default CategoryTree;
export type { CategoryTreeProps };
