"""
패턴 스케일러 모듈

패턴 프리셋의 기준 사이즈와 타겟 사이즈 치수를 비교하여
그레이딩에 사용할 스케일 비율을 계산한다.

승화전사 유니폼 그레이딩 원리:
  디자이너가 L 사이즈 기준으로 만든 PDF를 XL 사이즈에 맞게 늘리거나,
  S 사이즈에 맞게 줄이는 방식. 이때 프리셋에 등록된 사이즈별 가로/세로
  치수 데이터를 이용해 정확한 비율을 산출한다.

MVP 전략: 복잡한 클리핑/마스킹 없이 단순 비례 스케일링만 수행.
  - 프리셋의 모든 조각 치수 변화율 중 대표값(평균) 사용
  - 가로/세로 각각 독립적으로 비율 계산
  - 이후 pdf_grader.py에서 이 비율로 PDF 페이지를 확대/축소
"""

from typing import Any
from svg_parser import extract_piece_bboxes


def _get_size_spec(preset: dict[str, Any], size_name: str) -> dict[str, Any] | None:
    """
    프리셋에서 특정 사이즈의 SizeSpec을 찾아 반환한다.
    찾지 못하면 None을 반환한다.
    """
    sizes = preset.get("sizes", [])
    for spec in sizes:
        if spec.get("size") == size_name:
            return spec
    return None


def _avg_dimensions(size_spec: dict[str, Any]) -> tuple[float, float]:
    """
    SizeSpec에 등록된 조각들의 가로/세로 평균 치수를 반환한다.
    pieces 배열이 비어 있거나 값이 0이면 (0, 0)을 반환한다.
    """
    pieces = size_spec.get("pieces", [])
    if not pieces:
        return 0.0, 0.0

    # 가로/세로 치수 합산 (0인 값은 제외)
    total_w = 0.0
    total_h = 0.0
    count_w = 0
    count_h = 0
    for p in pieces:
        w = float(p.get("width", 0) or 0)
        h = float(p.get("height", 0) or 0)
        if w > 0:
            total_w += w
            count_w += 1
        if h > 0:
            total_h += h
            count_h += 1

    avg_w = (total_w / count_w) if count_w > 0 else 0.0
    avg_h = (total_h / count_h) if count_h > 0 else 0.0
    return avg_w, avg_h


def calculate_scale_factor(
    preset: dict[str, Any],
    base_size: str,
    target_size: str,
) -> dict[str, Any]:
    """
    기준 사이즈 대비 타겟 사이즈의 스케일 비율을 계산한다.

    Args:
      preset: 패턴 프리셋 딕셔너리 (PatternPreset 구조, sizes 배열 포함)
      base_size: 기준 사이즈명 (예: "L")
      target_size: 타겟 사이즈명 (예: "XL")

    Returns:
      {
        "success": True,
        "base_size": "L",
        "target_size": "XL",
        "scale_x": 1.05,      # 가로 확대 비율
        "scale_y": 1.08,      # 세로 확대 비율
        "base_avg_width": 520.0,
        "base_avg_height": 750.0,
        "target_avg_width": 546.0,
        "target_avg_height": 810.0
      }

    실패 시:
      { "success": False, "error": "..." }
    """
    # 1. 기준/타겟 사이즈 SizeSpec 찾기
    base_spec = _get_size_spec(preset, base_size)
    target_spec = _get_size_spec(preset, target_size)

    if base_spec is None:
        return {
            "success": False,
            "error": f"기준 사이즈 '{base_size}' 데이터가 프리셋에 없습니다.",
        }
    if target_spec is None:
        return {
            "success": False,
            "error": f"타겟 사이즈 '{target_size}' 데이터가 프리셋에 없습니다.",
        }

    # 2. 각 사이즈의 대표 치수(조각 평균) 계산
    base_w, base_h = _avg_dimensions(base_spec)
    target_w, target_h = _avg_dimensions(target_spec)

    # 3. 0 분모 방지 - 기준 치수가 0이면 스케일 불가
    if base_w <= 0 or base_h <= 0:
        return {
            "success": False,
            "error": (
                f"기준 사이즈 '{base_size}'의 조각 치수가 등록되지 않았거나 0입니다. "
                "패턴 관리 페이지에서 사이즈별 가로/세로 치수를 입력해 주세요."
            ),
        }
    if target_w <= 0 or target_h <= 0:
        return {
            "success": False,
            "error": (
                f"타겟 사이즈 '{target_size}'의 조각 치수가 등록되지 않았거나 0입니다. "
                "패턴 관리 페이지에서 해당 사이즈 치수를 입력해 주세요."
            ),
        }

    # 4. 비율 계산 (target / base)
    # 같은 사이즈일 경우 1.0이 되어 원본 그대로 복사됨
    scale_x = target_w / base_w
    scale_y = target_h / base_h

    return {
        "success": True,
        "base_size": base_size,
        "target_size": target_size,
        "scale_x": round(scale_x, 6),
        "scale_y": round(scale_y, 6),
        "base_avg_width": round(base_w, 2),
        "base_avg_height": round(base_h, 2),
        "target_avg_width": round(target_w, 2),
        "target_avg_height": round(target_h, 2),
    }


def calculate_piece_scale_factors(
    base_svg_path: str,
    target_svg_path: str,
) -> dict[str, Any]:
    """
    기준(XL)/타겟(XS) SVG에서 각 조각을 추출하고 1:1 매칭한다.
    매칭 방법: X좌표 순서로 정렬 후 인덱스 매칭.

    왜 필요한가:
      기존 방식은 전체 PDF를 하나의 비율로 축소하여 약 4% 오차가 발생했다.
      조각별로 독립적인 scale_x, scale_y를 계산하면 각 조각이 정확한 크기가 된다.

    Args:
      base_svg_path: 기준 사이즈(XL) 패턴 SVG 파일 경로
      target_svg_path: 타겟 사이즈(XS) 패턴 SVG 파일 경로

    Returns:
      성공: {
        "success": True,
        "pieces": [
          {
            "index": 0,
            "base_bbox": {...}, "target_bbox": {...},
            "scale_x": 0.87, "scale_y": 0.91,
            "base_width": ..., "base_height": ...,
            "target_width": ..., "target_height": ...
          }, ...
        ],
        "piece_count": 3,
        "base_viewbox": {...}, "target_viewbox": {...}
      }
      실패: {"success": False, "error": "..."}
    """
    # 1. 기준/타겟 SVG에서 조각별 bbox 추출
    base_result = extract_piece_bboxes(base_svg_path)
    if not base_result.get("success"):
        return {
            "success": False,
            "error": f"기준 SVG 파싱 실패: {base_result.get('error', '알 수 없는 오류')}",
        }

    target_result = extract_piece_bboxes(target_svg_path)
    if not target_result.get("success"):
        return {
            "success": False,
            "error": f"타겟 SVG 파싱 실패: {target_result.get('error', '알 수 없는 오류')}",
        }

    base_pieces = base_result["pieces"]
    target_pieces = target_result["pieces"]

    # 2. 조각 수 검증 — 기준과 타겟이 같아야 1:1 매칭 가능
    if len(base_pieces) != len(target_pieces):
        return {
            "success": False,
            "error": (
                f"기준 SVG({len(base_pieces)}개)와 타겟 SVG({len(target_pieces)}개)의 "
                "조각 수가 다릅니다. 같은 패턴 프리셋의 SVG인지 확인하세요."
            ),
        }

    if len(base_pieces) == 0:
        return {"success": False, "error": "기준 SVG에서 조각을 찾지 못했습니다."}

    # 3. 조각별 scale_x, scale_y 계산 (이미 X 중심 좌표로 정렬된 상태)
    matched_pieces: list[dict] = []
    for i, (bp, tp) in enumerate(zip(base_pieces, target_pieces)):
        bw = bp["width"]
        bh = bp["height"]
        tw = tp["width"]
        th = tp["height"]

        # 0 분모 방지 — 기준 조각의 크기가 0이면 스케일 불가
        sx = tw / bw if bw > 0 else 1.0
        sy = th / bh if bh > 0 else 1.0

        matched_pieces.append({
            "index": i,
            "base_bbox": bp["bbox"],
            "target_bbox": tp["bbox"],
            "scale_x": round(sx, 6),
            "scale_y": round(sy, 6),
            "base_width": bw,
            "base_height": bh,
            "target_width": tw,
            "target_height": th,
        })

    return {
        "success": True,
        "pieces": matched_pieces,
        "piece_count": len(matched_pieces),
        "base_viewbox": base_result["viewbox"],
        "target_viewbox": target_result["viewbox"],
    }
