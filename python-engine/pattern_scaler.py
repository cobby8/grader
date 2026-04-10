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
