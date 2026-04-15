/**
 * CategoryTree 컴포넌트
 *
 * 패턴 프리셋을 폴더처럼 분류하는 트리 네비게이션.
 * 재귀적으로 카테고리를 렌더링하며, 접기/펼치기/추가/삭제 기능을 제공한다.
 *
 * 구조:
 *  [전체]          ← 모든 프리셋 표시 (특수 항목)
 *  [미분류]        ← categoryId가 없는 프리셋 (특수 항목)
 *  📁 농구         ← 루트 카테고리
 *    📁 상의       ← 하위 카테고리
 *    📁 하의
 *  📁 축구
 *  [+ 카테고리]    ← 루트 카테고리 추가 버튼
 *
 * 사용자 상호작용 규칙(2026-04-15 변경):
 *  - 더블클릭 = 펼침/접힘 토글 (이전: 이름 편집 모드 → 제거됨)
 *  - 앱 내에서 카테고리/파일 이름 변경 기능은 전체 제거 (Drive/Local 모두)
 *  - Drive 출처 카테고리(source="drive")는 +/× 버튼이 비활성화된다.
 */

import { useState } from "react";
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
}: {
  category: PatternCategory;
  categories: PatternCategory[];
  selected: SelectedCategory;
  presetCountByCategory: Map<string, number>;
  depth: number;
  onSelect: (sel: SelectedCategory) => void;
  onAddCategory: (parentId: string | null) => void;
  onDeleteCategory: (id: string) => void;
}) {
  // 이 노드가 펼쳐져 있는지 (기본: 접힘)
  const [expanded, setExpanded] = useState(false);

  // 자식 카테고리 목록
  const children = getChildCategories(categories, category.id);
  const hasChildNodes = children.length > 0;

  // 현재 선택 여부
  const isSelected =
    selected.type === "category" && selected.id === category.id;

  // 이 카테고리의 프리셋 수
  const count = presetCountByCategory.get(category.id) || 0;

  // Drive 출처 여부 — Drive 카테고리는 앱 내에서 수정/추가/삭제를 막는다.
  // 왜: Drive 폴더가 진실의 원천(SSOT)이므로 앱 내 변경은 동기화 다음 라운드에 사라진다.
  const isDriveCategory = category.source === "drive";

  // 토글 핸들러 — 행 클릭 또는 더블클릭 어디서든 펼침/접힘 가능하도록 분리
  const toggleExpanded = () => setExpanded((prev) => !prev);

  // Drive 카테고리에서 막힌 액션을 눌렀을 때 안내
  const showReadonlyToast = () => {
    // alert를 토스트 대용으로 사용 — 토스트 시스템 부재 시 가장 단순한 fallback
    alert("이 항목은 Google Drive에서만 수정할 수 있습니다.");
  };

  return (
    <div className="cat-tree__node">
      {/* 노드 행 */}
      <div
        className={`cat-tree__row ${isSelected ? "cat-tree__row--selected" : ""}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect({ type: "category", id: category.id })}
        // 더블클릭: 이전엔 rename 진입이었으나, 이제는 펼침/접힘 토글로 통일.
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (hasChildNodes) toggleExpanded();
        }}
      >
        {/* 접기/펼치기 화살표 (자식이 있을 때만) */}
        <span
          className="cat-tree__toggle"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildNodes) toggleExpanded();
          }}
        >
          {hasChildNodes ? (expanded ? "\u25BE" : "\u25B8") : "\u00A0"}
        </span>

        {/* 폴더 아이콘 */}
        <span className="cat-tree__icon">
          {expanded && hasChildNodes ? "\uD83D\uDCC2" : "\uD83D\uDCC1"}
        </span>

        {/* 카테고리 이름 — rename UI는 제거됨, 표시 전용 */}
        <span className="cat-tree__name">{category.name}</span>

        {/* 프리셋 수 배지 */}
        {count > 0 && (
          <span className="cat-tree__count">{count}</span>
        )}

        {/* 액션 버튼들 (호버 시 표시) */}
        <span className="cat-tree__actions">
          {/* 하위 카테고리 추가 — Drive 카테고리는 비활성화 */}
          <button
            className="cat-tree__action-btn"
            title={
              isDriveCategory
                ? "Drive 카테고리는 앱에서 수정할 수 없습니다"
                : "하위 카테고리 추가"
            }
            disabled={isDriveCategory}
            onClick={(e) => {
              e.stopPropagation();
              if (isDriveCategory) {
                showReadonlyToast();
                return;
              }
              onAddCategory(category.id);
            }}
          >
            +
          </button>
          {/* 삭제 — Drive 카테고리는 비활성화 */}
          <button
            className="cat-tree__action-btn cat-tree__action-btn--danger"
            title={
              isDriveCategory
                ? "Drive 카테고리는 앱에서 삭제할 수 없습니다"
                : "카테고리 삭제"
            }
            disabled={isDriveCategory}
            onClick={(e) => {
              e.stopPropagation();
              if (isDriveCategory) {
                showReadonlyToast();
                return;
              }
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

      {/* 루트 카테고리 추가 버튼 (루트 추가는 항상 가능 — 사용자가 만든 Local 루트) */}
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
