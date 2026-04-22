"""
SVG 일괄 표준화 모듈 (U넥 양면유니폼 스탠다드 전용)

디자이너가 12개 사이즈 SVG를 그릴 때 발생하는 구조 차이(변종 A/B/C형)를
2XL 정답지 좌표계로 자동 표준화한다.

핵심 비유:
- 원본 .bak SVG = 종이에 도장 6개를 제각각 다른 위치에 찍어둔 상태
  (각 도장에는 transform 정보가 붙어 있어서, 같은 그림이라도 위치/각도가 다르다)
- 우리는 도장을 종이에서 떼어내서(평탄화) → 새 종이(2XL 좌표계)에 다시 배치한다.
- "방안 A 마진": 절단선이 패턴 양쪽 끝에서 28.52만큼 안쪽에 들어오도록 통일

핵심 변환 단계:
1. 평탄화: transform matrix를 path 좌표 자체에 적용 (도장 정보를 그림에 녹임)
2. 분류: bbox 높이/X 위치로 큰패턴/작은패턴/절단선 자동 식별
3. 평행이동: 큰패턴은 (313.58, 2665.92) 고정, 작은패턴은 X만 고정 + Y는 큰패턴 밑단 정렬
4. 절단선 재작성: 패턴 X 범위 ± 28.52, Y는 2XL 원본 그대로 사용 (사이즈 무관)
5. 위/아래 쌍: 위쪽 좌표 + Y 오프셋 → 아래쪽 좌표
6. 4개 그룹 구조 SVG 출력

🚨 시행착오 교훈 (절대 변경 금지):
- 작은 절단선 Y는 작은 패턴이 이동해도 따라가지 않는다 (2XL 원본 상수 사용)
- 단순 Tx swap 금지 (변종 A/B/C 모두 다름) → bbox 측정 기반 분류
- cubic bezier는 svgpathtools로 정확 처리 (직선 근사 금지)
- 작은 패턴 Y는 큰 패턴 밑단과 동적 정렬 (사이즈마다 다름)

원본 4개 스크립트 통합:
- measure_bbox.py (bbox 측정)
- preview_layout.py (시뮬레이션)
- svg_converter.py (단일 변환)
- batch_convert.py (일괄 변환)
"""

from __future__ import annotations

import os
import re
import shutil
import xml.etree.ElementTree as ET
from typing import Any

from svgpathtools import Arc, CubicBezier, Line, Path, QuadraticBezier, parse_path

# ========== 모듈 메타 정보 ==========
NORMALIZER_VERSION = "1.0-uneck-double-sided"
SUPPORTED_PATTERN = "U넥 양면유니폼 스탠다드"

# ========== 2XL 정답지 좌표 (모든 사이즈에 강제 적용) ==========
# viewBox: 모든 사이즈가 동일한 캔버스를 사용
ARTBOARD_WIDTH = 4478.74
ARTBOARD_HEIGHT = 5669.29
VIEW_BOX = f"0 0 {ARTBOARD_WIDTH} {ARTBOARD_HEIGHT}"

# 큰 패턴 시작점 (M 좌표) - 위쪽 쌍 기준, 모든 사이즈 동일
PATTERN_X_OFFSET_LARGE = 313.58
PATTERN_Y_OFFSET_LARGE = 2665.92

# 작은 패턴 시작점 (X만 고정, Y는 동적 계산)
PATTERN_X_OFFSET_SMALL = 2761.24
# 작은 패턴 Y 임시값 (Y 보정 전 단계에서만 사용, 최종값은 큰 패턴 밑단 정렬로 계산)
_SMALL_TARGET_START_Y_2XL = 303.76

# 패턴 좌우 마진 (절단선이 패턴보다 28.52만큼 안쪽에 들어옴)
CUT_LINE_MARGIN = 28.52

# 절단선 Y 좌표 (위쪽 쌍) - 모든 사이즈 동일 (2XL 원본 상수)
CUT_LINE_Y_LARGE_TOP = (2581.08, 2595.25)
CUT_LINE_Y_SMALL_TOP = (2578.98, 2593.15)  # ⭐ 작은 패턴 이동과 무관

# 절단선 Y 좌표 (아래쪽 쌍) - 모든 사이즈 동일 (2XL 원본 상수)
CUT_LINE_Y_LARGE_BOTTOM = (5324.66, 5338.83)
CUT_LINE_Y_SMALL_BOTTOM = (5316.82, 5330.99)  # ⭐ 작은 패턴 이동과 무관

# Y 오프셋 (위쪽 좌표 + 오프셋 = 아래쪽 좌표)
Y_OFFSET_PATTERN_LARGE = 2743.59
Y_OFFSET_PATTERN_SMALL = 2743.58
Y_OFFSET_CUT_LINE_SMALL = 2737.84  # 작은 절단선용 (현재 코드에선 직접 사용 안 함)

# SVG 네임스페이스
_SVG_NS = {"svg": "http://www.w3.org/2000/svg"}

# 절단선 판단 임계값 (높이가 이 값 미만이면 수평선 = 절단선)
_CUTTING_LINE_HEIGHT_THRESHOLD = 5.0


# ========================================================================
# Private 헬퍼 함수
# ========================================================================

def _parse_transform_matrix(transform_str: str | None) -> tuple[float, ...] | None:
    """
    transform="matrix(a,b,c,d,e,f)" 문자열에서 6개 숫자를 추출한다.

    Args:
      transform_str: SVG path의 transform 속성 문자열 (없으면 None)

    Returns:
      (a, b, c, d, e, f) 튜플 또는 None (matrix가 없거나 형식 오류 시)
    """
    if not transform_str:
        return None
    # matrix(...) 안의 숫자 부분만 정규식으로 캐치
    m = re.search(r"matrix\s*\(\s*([\-0-9eE\.\s,]+)\s*\)", transform_str)
    if not m:
        return None
    nums = re.split(r"[\s,]+", m.group(1).strip())
    nums = [float(x) for x in nums if x]
    if len(nums) != 6:
        return None
    return tuple(nums)


def _apply_matrix_to_path(path_obj: Path, matrix: tuple[float, ...] | None) -> Path:
    """
    affine matrix를 path의 모든 점에 적용하여 좌표계를 평탄화한다.

    SVG matrix(a,b,c,d,e,f)의 의미:
      x' = a*x + c*y + e
      y' = b*x + d*y + f
    svgpathtools는 점을 복소수(x + yi)로 표현하므로 그에 맞춰 변환.

    Args:
      path_obj: svgpathtools Path 객체
      matrix: (a, b, c, d, e, f) 또는 None (None이면 원본 그대로 반환)

    Returns:
      평탄화된 새 Path 객체
    """
    if matrix is None:
        return path_obj
    a, b, c, d, e, f = matrix

    def tp(p: complex) -> complex:
        # 복소수 점 (x+yi)을 affine 변환 후 새 복소수로 반환
        x, y = p.real, p.imag
        return complex(a * x + c * y + e, b * x + d * y + f)

    new_segs = []
    for seg in path_obj:
        cls_name = seg.__class__.__name__
        # 각 segment 종류별로 control point까지 모두 변환 (cubic bezier 등)
        if cls_name == "Line":
            new_segs.append(Line(tp(seg.start), tp(seg.end)))
        elif cls_name == "CubicBezier":
            new_segs.append(CubicBezier(
                tp(seg.start), tp(seg.control1), tp(seg.control2), tp(seg.end)))
        elif cls_name == "QuadraticBezier":
            new_segs.append(QuadraticBezier(tp(seg.start), tp(seg.control), tp(seg.end)))
        elif cls_name == "Arc":
            # Arc는 시작/끝점만 변환 (radius/rotation은 변경되지 않음)
            new_segs.append(Arc(
                tp(seg.start), seg.radius, seg.rotation,
                seg.large_arc, seg.sweep, tp(seg.end)))
    return Path(*new_segs)


def _translate_path(path_obj: Path, dx: float, dy: float) -> Path:
    """
    path의 모든 점을 (dx, dy)만큼 평행이동한다.

    Args:
      path_obj: svgpathtools Path 객체
      dx: X축 이동량
      dy: Y축 이동량

    Returns:
      평행이동된 새 Path 객체
    """
    def tp(p: complex) -> complex:
        return complex(p.real + dx, p.imag + dy)

    new_segs = []
    for seg in path_obj:
        cls_name = seg.__class__.__name__
        if cls_name == "Line":
            new_segs.append(Line(tp(seg.start), tp(seg.end)))
        elif cls_name == "CubicBezier":
            new_segs.append(CubicBezier(
                tp(seg.start), tp(seg.control1), tp(seg.control2), tp(seg.end)))
        elif cls_name == "QuadraticBezier":
            new_segs.append(QuadraticBezier(tp(seg.start), tp(seg.control), tp(seg.end)))
        elif cls_name == "Arc":
            new_segs.append(Arc(
                tp(seg.start), seg.radius, seg.rotation,
                seg.large_arc, seg.sweep, tp(seg.end)))
    return Path(*new_segs)


def _path_to_d_string(path_obj: Path, decimals: int = 2) -> str:
    """
    Path 객체를 SVG d 속성 문자열로 변환한다.

    출력 형식 (2XL 정답지 형식과 동일):
    - 절대좌표 사용 (대문자 명령)
    - 소수 둘째 자리까지
    - 수평/수직 직선은 H/V 명령으로 단순화
    - 매 segment마다 명령 문자 명시 (생략 안 함)

    Args:
      path_obj: svgpathtools Path 객체
      decimals: 소수점 자릿수 (기본 2)

    Returns:
      d 속성에 들어갈 문자열
    """
    if len(path_obj) == 0:
        return ""

    parts: list[str] = []
    last_end: complex | None = None

    for seg in path_obj:
        # 첫 segment거나 이전 끝점과 다르면 M(이동) 명령 추가
        if last_end is None or abs(seg.start - last_end) > 1e-6:
            parts.append(f"M{seg.start.real:.{decimals}f},{seg.start.imag:.{decimals}f}")

        cls_name = seg.__class__.__name__
        if cls_name == "Line":
            dx = seg.end.real - seg.start.real
            dy = seg.end.imag - seg.start.imag
            # 수평선이면 H, 수직선이면 V, 그 외는 L
            if abs(dy) < 1e-6:
                parts.append(f"H{seg.end.real:.{decimals}f}")
            elif abs(dx) < 1e-6:
                parts.append(f"V{seg.end.imag:.{decimals}f}")
            else:
                parts.append(f"L{seg.end.real:.{decimals}f},{seg.end.imag:.{decimals}f}")
        elif cls_name == "CubicBezier":
            parts.append(
                f"C{seg.control1.real:.{decimals}f},{seg.control1.imag:.{decimals}f} "
                f"{seg.control2.real:.{decimals}f},{seg.control2.imag:.{decimals}f} "
                f"{seg.end.real:.{decimals}f},{seg.end.imag:.{decimals}f}")
        elif cls_name == "QuadraticBezier":
            parts.append(
                f"Q{seg.control.real:.{decimals}f},{seg.control.imag:.{decimals}f} "
                f"{seg.end.real:.{decimals}f},{seg.end.imag:.{decimals}f}")
        elif cls_name == "Arc":
            large = 1 if seg.large_arc else 0
            sweep = 1 if seg.sweep else 0
            parts.append(
                f"A{seg.radius.real:.{decimals}f},{seg.radius.imag:.{decimals}f} "
                f"{seg.rotation:.{decimals}f} {large} {sweep} "
                f"{seg.end.real:.{decimals}f},{seg.end.imag:.{decimals}f}")
        last_end = seg.end

    return "".join(parts)


def _extract_pattern_paths(svg_path: str) -> tuple[
    dict[str, Any] | None, dict[str, Any] | None, list[Path]
]:
    """
    SVG 파일에서 모든 path를 평탄화하여 큰패턴/작은패턴/절단선으로 자동 분류한다.

    분류 규칙:
    - bbox 높이 < 5 → 절단선 (수평선이라 거의 0)
    - 나머지는 패턴: 폭(width)이 더 큰 쪽이 큰 패턴 (앞판). 폭이 거의 같으면(±5) x_min이 더 작은 쪽이 큰 패턴
    - 패턴이 4개(12 path 4그룹 구조)인 경우: 위쪽 쌍(y_min 작은 2개)만 채택 → 6 path 입력과 동일한 의미의 결과 반환
      → 이미 변환된 SVG를 다시 normalize 해도 동일 결과(idempotent)를 보장한다.

    변종 A/B/C 모두 동일 처리 (그룹 구조는 무시).

    Args:
      svg_path: 분석할 SVG 파일 경로 (.bak 또는 .svg)

    Returns:
      (big_pattern, small_pattern, cutting_lines) 튜플
      big/small_pattern은 {"path": Path, "x_min": .., "x_max": .., "y_min": .., "y_max": ..}
      cutting_lines는 평탄화된 Path 리스트 (4그룹 구조면 위쪽 절단선 4개만 포함)
      추출 실패 시 (None, None, []) 또는 부분 None 반환
    """
    tree = ET.parse(svg_path)
    root = tree.getroot()
    all_paths = root.findall(".//svg:path", _SVG_NS)

    # 1단계: 모든 path를 절단선/패턴으로 분리 (개수 무관)
    pattern_entries: list[dict[str, Any]] = []
    cut_entries: list[dict[str, Any]] = []  # 정렬을 위해 일단 dict로 보관

    for p_el in all_paths:
        d = p_el.get("d", "")
        transform = p_el.get("transform", "")
        if not d:
            continue

        # 1) d 파싱 → 2) transform 평탄화 → 3) bbox 측정
        path_obj = parse_path(d)
        matrix = _parse_transform_matrix(transform)
        flat = _apply_matrix_to_path(path_obj, matrix)

        try:
            x_min, x_max, y_min, y_max = flat.bbox()
        except (ValueError, IndexError):
            # bbox 계산 실패 path는 건너뜀
            continue

        entry = {
            "path": flat,
            "x_min": x_min, "x_max": x_max,
            "y_min": y_min, "y_max": y_max,
            "width": x_max - x_min,
            "height": y_max - y_min,
        }

        if entry["height"] < _CUTTING_LINE_HEIGHT_THRESHOLD:
            cut_entries.append(entry)
        else:
            pattern_entries.append(entry)

    # 2단계: 4그룹 구조(패턴 4개) 처리 - 위쪽 쌍만 사용
    # 변환된 SVG / 기준 2XL.svg는 큰패턴 2개(위/아래) + 작은패턴 2개(위/아래) 구조
    if len(pattern_entries) >= 4:
        # y_min 기준 오름차순 정렬 → 앞 2개가 위쪽 쌍
        pattern_entries.sort(key=lambda e: e["y_min"])
        pattern_entries = pattern_entries[:2]

        # 절단선도 위쪽만 채택 (y_min 기준 절반 이하)
        # 4그룹 구조에선 절단선이 8개(위 4 + 아래 4) — 위쪽 4개만 남기면 6 path 의미와 일치
        if len(cut_entries) >= 8:
            cut_entries.sort(key=lambda e: e["y_min"])
            cut_entries = cut_entries[:4]

    # 3단계: 큰/작은 패턴 결정 (폭 비교 우선, 폭이 같으면 x_min 작은 쪽이 큰 패턴)
    big_pattern: dict[str, Any] | None = None
    small_pattern: dict[str, Any] | None = None

    if len(pattern_entries) == 1:
        # 패턴 1개만 있으면 "big_pattern"으로만 반환 (small_pattern은 None)
        big_pattern = pattern_entries[0]
    elif len(pattern_entries) >= 2:
        a, b = pattern_entries[0], pattern_entries[1]
        # 폭이 더 큰 쪽이 큰 패턴(앞판). 폭 차이가 매우 작아도(0.1mm) 큰 패턴은 큰 패턴.
        # 폭이 정확히 같은 극단적 경우만 x_min 비교 폴백 (실데이터에선 거의 발생 안 함)
        if abs(a["width"] - b["width"]) < 0.001:
            big_pattern, small_pattern = (a, b) if a["x_min"] < b["x_min"] else (b, a)
        else:
            big_pattern, small_pattern = (a, b) if a["width"] > b["width"] else (b, a)

    # 4단계: cutting_lines를 Path 리스트로 변환 (기존 호출 측 호환)
    cutting_lines: list[Path] = [e["path"] for e in cut_entries]

    return big_pattern, small_pattern, cutting_lines


def _build_normalized_svg(
    big_d_top: str, small_d_top: str,
    big_cl1_top: str, big_cl2_top: str,
    small_cl1_top: str, small_cl2_top: str,
    big_d_btm: str, small_d_btm: str,
    big_cl1_btm: str, big_cl2_btm: str,
    small_cl1_btm: str, small_cl2_btm: str,
) -> str:
    """
    표준화된 SVG 문자열을 4개 그룹 구조로 조립한다.

    그룹 구조 (2XL 정답지와 동일):
    - G1: 큰 패턴 (위) + 큰 절단선 2개
    - G2: 작은 패턴 (위) + 작은 절단선 2개
    - G3: 큰 패턴 (아래) + 큰 절단선 2개
    - G4: 작은 패턴 (아래) + 작은 절단선 2개

    Returns:
      완성된 SVG XML 문자열
    """
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg id="_레이어_1" xmlns="http://www.w3.org/2000/svg" version="1.1" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="{VIEW_BOX}">
  <defs>
    <style>
      .st0 {{
        fill: none;
        stroke: #231916;
        stroke-miterlimit: 10;
        stroke-width: .2px;
      }}
    </style>
  </defs>
  <g>
    <path class="st0" d="{big_d_top}"/>
    <path class="st0" d="{big_cl1_top}"/>
    <path class="st0" d="{big_cl2_top}"/>
  </g>
  <g>
    <path class="st0" d="{small_d_top}"/>
    <path class="st0" d="{small_cl1_top}"/>
    <path class="st0" d="{small_cl2_top}"/>
  </g>
  <g>
    <path class="st0" d="{big_d_btm}"/>
    <path class="st0" d="{big_cl1_btm}"/>
    <path class="st0" d="{big_cl2_btm}"/>
  </g>
  <g>
    <path class="st0" d="{small_d_btm}"/>
    <path class="st0" d="{small_cl1_btm}"/>
    <path class="st0" d="{small_cl2_btm}"/>
  </g>
</svg>
'''


# ========================================================================
# Public 함수 - 디버깅용
# ========================================================================

def measure_svg_bboxes(svg_path: str) -> dict[str, Any]:
    """
    SVG 파일의 모든 path bbox를 측정한다 (디버깅/검증용).

    각 path는 transform 평탄화 후 절대좌표 기준 bbox를 측정.

    Args:
      svg_path: SVG 파일 경로

    Returns:
      {
        "success": True,
        "data": {
          "file": svg_path,
          "path_count": N,
          "paths": [{"index": 0, "x_min": .., "x_max": .., "y_min": .., "y_max": ..,
                     "width": .., "height": ..}, ...]
        }
      }
      또는 {"success": False, "error": "..."}
    """
    if not os.path.exists(svg_path):
        return {"success": False, "error": f"파일 없음: {svg_path}"}

    try:
        tree = ET.parse(svg_path)
        root = tree.getroot()
        all_paths = root.findall(".//svg:path", _SVG_NS)

        results = []
        for idx, p_el in enumerate(all_paths):
            d = p_el.get("d", "")
            transform = p_el.get("transform", "")
            if not d:
                continue

            path_obj = parse_path(d)
            matrix = _parse_transform_matrix(transform)
            flat = _apply_matrix_to_path(path_obj, matrix)

            try:
                x_min, x_max, y_min, y_max = flat.bbox()
            except (ValueError, IndexError) as e:
                results.append({"index": idx, "error": f"bbox 실패: {e}"})
                continue

            results.append({
                "index": idx,
                "x_min": round(x_min, 2),
                "x_max": round(x_max, 2),
                "y_min": round(y_min, 2),
                "y_max": round(y_max, 2),
                "width": round(x_max - x_min, 2),
                "height": round(y_max - y_min, 2),
                "has_transform": matrix is not None,
            })

        return {
            "success": True,
            "data": {
                "file": svg_path,
                "path_count": len(results),
                "paths": results,
            },
        }
    except Exception as e:
        return {"success": False, "error": f"측정 실패: {e}"}


def classify_svg_paths(svg_path: str) -> dict[str, Any]:
    """
    SVG 파일의 path들을 큰패턴/작은패턴/절단선으로 분류한 결과를 반환한다 (디버깅용).

    Args:
      svg_path: SVG 파일 경로

    Returns:
      {
        "success": True,
        "data": {
          "big_pattern": {"x_min", "x_max", "y_min", "y_max", "width", "height"} | None,
          "small_pattern": ... | None,
          "cutting_line_count": N,
        }
      }
      또는 {"success": False, "error": "..."}
    """
    if not os.path.exists(svg_path):
        return {"success": False, "error": f"파일 없음: {svg_path}"}

    try:
        big, small, cuts = _extract_pattern_paths(svg_path)

        def _summary(p: dict[str, Any] | None) -> dict[str, Any] | None:
            if p is None:
                return None
            return {
                "x_min": round(p["x_min"], 2),
                "x_max": round(p["x_max"], 2),
                "y_min": round(p["y_min"], 2),
                "y_max": round(p["y_max"], 2),
                "width": round(p["x_max"] - p["x_min"], 2),
                "height": round(p["y_max"] - p["y_min"], 2),
            }

        return {
            "success": True,
            "data": {
                "big_pattern": _summary(big),
                "small_pattern": _summary(small),
                "cutting_line_count": len(cuts),
            },
        }
    except Exception as e:
        return {"success": False, "error": f"분류 실패: {e}"}


def preview_normalization(
    target_files: list[str],
    base_file_path: str | None = None,
) -> dict[str, Any]:
    """
    여러 SVG 파일에 대한 표준화 결과를 시뮬레이션한다 (실제 파일 수정 없음).

    각 파일의 큰패턴/작은패턴 변환 후 예상 좌표를 계산해서 반환.
    UI에서 "변환 미리보기" 버튼에 사용.

    Args:
      target_files: 시뮬레이션 대상 SVG 파일 경로 리스트
      base_file_path: 기준 파일 경로 (현재 미사용, 미래 확장용)

    Returns:
      {
        "success": True,
        "data": {
          "previews": [
            {
              "file": "...",
              "status": "OK"|"FAIL",
              "big_width": ..,
              "small_width": ..,
              "big_x_range": (x_min, x_max),
              "small_x_range": (x_min, x_max),
              "small_y_align_offset": .., (Y 보정량)
              "viewbox_ok": True,
              "no_x_collision": True,
              "error": "..." (FAIL 시),
            }, ...
          ]
        }
      }
    """
    previews = []
    for svg_path in target_files:
        if not os.path.exists(svg_path):
            previews.append({"file": svg_path, "status": "FAIL",
                             "error": "파일 없음"})
            continue

        try:
            big, small, _ = _extract_pattern_paths(svg_path)
            if big is None or small is None:
                previews.append({"file": svg_path, "status": "FAIL",
                                 "error": "패턴 path 2개 추출 실패"})
                continue

            # 큰 패턴 평행이동 시뮬레이션
            big_flat = big["path"]
            big_start = big_flat[0].start
            big_dx = PATTERN_X_OFFSET_LARGE - big_start.real
            big_dy = PATTERN_Y_OFFSET_LARGE - big_start.imag
            big_translated = _translate_path(big_flat, big_dx, big_dy)
            bx_min, bx_max, by_min, by_max = big_translated.bbox()

            # 작은 패턴 평행이동 + Y 보정 시뮬레이션
            small_flat = small["path"]
            small_start = small_flat[0].start
            sm_dx = PATTERN_X_OFFSET_SMALL - small_start.real
            sm_dy = _SMALL_TARGET_START_Y_2XL - small_start.imag
            small_pre = _translate_path(small_flat, sm_dx, sm_dy)
            _, _, _, pre_y_max = small_pre.bbox()
            small_y_align = by_max - pre_y_max  # Y 보정량
            small_translated = _translate_path(small_pre, 0, small_y_align)
            sx_min, sx_max, sy_min, sy_max = small_translated.bbox()

            # 검증: viewBox 안에 있는지 + 큰/작은 패턴 X 충돌 없는지
            viewbox_ok = (
                bx_min >= 0 and bx_max <= ARTBOARD_WIDTH
                and by_min >= 0 and by_max <= ARTBOARD_HEIGHT
                and sx_min >= 0 and sx_max <= ARTBOARD_WIDTH
                and sy_min >= 0 and sy_max <= ARTBOARD_HEIGHT
            )
            no_collision = bx_max < sx_min

            previews.append({
                "file": svg_path,
                "status": "OK",
                "big_width": round(bx_max - bx_min, 2),
                "small_width": round(sx_max - sx_min, 2),
                "big_x_range": (round(bx_min, 2), round(bx_max, 2)),
                "small_x_range": (round(sx_min, 2), round(sx_max, 2)),
                "small_y_align_offset": round(small_y_align, 2),
                "gap_between_patterns": round(sx_min - bx_max, 2),
                "viewbox_ok": viewbox_ok,
                "no_x_collision": no_collision,
            })
        except Exception as e:
            previews.append({"file": svg_path, "status": "FAIL",
                             "error": f"시뮬레이션 실패: {e}"})

    return {"success": True, "data": {"previews": previews}}


# ========================================================================
# Public 함수 - 핵심 변환
# ========================================================================

def normalize_svg(
    input_path: str,
    base_file_path: str | None = None,
    output_path: str | None = None,
    backup: bool = True,
) -> dict[str, Any]:
    """
    단일 SVG 파일을 2XL 정답지 좌표계로 표준화한다 (핵심 함수).

    처리 단계:
    1. 입력 파일 존재 확인
    2. backup=True면 input.svg → input.svg.bak 으로 백업 (이미 있으면 덮지 않음)
    3. .bak에서 path 추출 → 평탄화 → 큰/작은/절단선 분류
    4. 큰 패턴: (313.58, 2665.92)으로 평행이동
    5. 작은 패턴: X=2761.24, Y는 큰 패턴 밑단과 정렬
    6. 절단선 4종 새로 작성 (마진 28.52, Y는 2XL 원본 상수)
    7. 위/아래 쌍 만들어서 4그룹 SVG로 출력

    Args:
      input_path: 변환할 SVG 파일 경로 (예: "양면유니폼_U넥_스탠다드_L.svg")
      base_file_path: 기준 파일 경로 (현재 미사용, 미래 확장용)
      output_path: 출력 경로 (None이면 input_path 덮어씀 = 표준 사용 패턴)
      backup: True면 변환 전 .bak 백업 생성 (기본 True)

    Returns:
      {
        "success": True,
        "data": {
          "input": input_path,
          "output": output_path,
          "backup": backup_path | None,
          "big_width": ..,
          "small_width": ..,
          "small_y_align_offset": .., (Y 보정량 - 사이즈마다 다름)
          "checks": {
            "xml_valid": True,
            "viewbox_ok": True,
            "no_x_collision": True,
            "big_cl_margin_ok": True,
            "small_cl_margin_ok": True,
            "bottom_align_ok": True,
          },
          "version": "1.0-uneck-double-sided",
        }
      }
      또는 {"success": False, "error": "..."}
    """
    # 1) 입력 파일 확인
    if not os.path.exists(input_path):
        return {"success": False, "error": f"파일 없음: {input_path}"}

    # 2) 백업 처리 (이미 .bak가 있으면 그것을 소스로 사용 = 멱등성)
    backup_path: str | None = None
    if backup:
        backup_path = input_path + ".bak"
        if not os.path.exists(backup_path):
            # 최초 1회만 .bak 생성
            shutil.copy2(input_path, backup_path)
        # .bak가 이미 있으면 그것이 "원본 진리"
        source_path = backup_path
    else:
        source_path = input_path

    # 3) 출력 경로 결정 (None이면 입력 덮어쓰기)
    if output_path is None:
        output_path = input_path

    try:
        # 4) path 추출 (변종 A/B/C 무관)
        big, small, _cuts = _extract_pattern_paths(source_path)
        if big is None or small is None:
            return {"success": False,
                    "error": f"패턴 path 추출 실패 (큰={big is not None}, 작은={small is not None})"}

        big_flat = big["path"]
        small_flat = small["path"]

        # 5) 큰 패턴 평행이동: 시작점을 (313.58, 2665.92)으로
        big_start = big_flat[0].start
        big_dx = PATTERN_X_OFFSET_LARGE - big_start.real
        big_dy = PATTERN_Y_OFFSET_LARGE - big_start.imag
        big_translated = _translate_path(big_flat, big_dx, big_dy)
        bx_min, bx_max, by_min, by_max = big_translated.bbox()

        # 6) 작은 패턴: X 고정, Y는 큰 패턴 밑단과 정렬
        # 1단계: X만 맞추고 Y는 임시값(2XL 기본)으로 평행이동
        small_start = small_flat[0].start
        sm_dx_pre = PATTERN_X_OFFSET_SMALL - small_start.real
        sm_dy_pre = _SMALL_TARGET_START_Y_2XL - small_start.imag
        small_pre = _translate_path(small_flat, sm_dx_pre, sm_dy_pre)
        _, _, _, pre_y_max = small_pre.bbox()

        # 2단계: 작은 패턴 밑단을 큰 패턴 밑단에 맞추는 Y 보정
        # ⭐ 핵심: 사이즈마다 패턴 높이가 다르므로 보정량도 다름
        small_y_align = by_max - pre_y_max
        small_translated = _translate_path(small_pre, 0, small_y_align)
        sx_min, sx_max, sy_min, sy_max = small_translated.bbox()

        # 7) 패턴 d 문자열 변환
        big_d_top = _path_to_d_string(big_translated)
        small_d_top = _path_to_d_string(small_translated)

        # 8) 큰 절단선 (위쪽): X 범위 = 큰 패턴 X 범위 ± 28.52
        big_cl_x_end = bx_max - CUT_LINE_MARGIN  # 우측 끝 (M 시작점)
        big_cl_x_start = bx_min + CUT_LINE_MARGIN  # 좌측 끝 (H 도착점)
        big_cl1_top = f"M{big_cl_x_end:.2f},{CUT_LINE_Y_LARGE_TOP[0]:.2f}H{big_cl_x_start:.2f}"
        big_cl2_top = f"M{big_cl_x_end:.2f},{CUT_LINE_Y_LARGE_TOP[1]:.2f}H{big_cl_x_start:.2f}"

        # 9) 작은 절단선 (위쪽):
        # X 범위는 작은 패턴 ± 28.52, ⭐ Y는 2XL 원본 상수 (작은 패턴 이동과 무관)
        small_cl_x_end = sx_max - CUT_LINE_MARGIN
        small_cl_x_start = sx_min + CUT_LINE_MARGIN
        small_cl1_top = f"M{small_cl_x_end:.2f},{CUT_LINE_Y_SMALL_TOP[0]:.2f}H{small_cl_x_start:.2f}"
        small_cl2_top = f"M{small_cl_x_end:.2f},{CUT_LINE_Y_SMALL_TOP[1]:.2f}H{small_cl_x_start:.2f}"

        # 10) 패턴 (아래쪽): 위쪽 + Y 오프셋
        big_translated_btm = _translate_path(big_translated, 0, Y_OFFSET_PATTERN_LARGE)
        big_d_btm = _path_to_d_string(big_translated_btm)
        bbx, bbx2, bby, bby2 = big_translated_btm.bbox()

        small_translated_btm = _translate_path(small_translated, 0, Y_OFFSET_PATTERN_SMALL)
        small_d_btm = _path_to_d_string(small_translated_btm)
        sbx, sbx2, sby, sby2 = small_translated_btm.bbox()

        # 11) 절단선 (아래쪽): Y는 2XL 원본 상수 그대로
        big_cl1_btm = f"M{big_cl_x_end:.2f},{CUT_LINE_Y_LARGE_BOTTOM[0]:.2f}H{big_cl_x_start:.2f}"
        big_cl2_btm = f"M{big_cl_x_end:.2f},{CUT_LINE_Y_LARGE_BOTTOM[1]:.2f}H{big_cl_x_start:.2f}"
        small_cl1_btm = f"M{small_cl_x_end:.2f},{CUT_LINE_Y_SMALL_BOTTOM[0]:.2f}H{small_cl_x_start:.2f}"
        small_cl2_btm = f"M{small_cl_x_end:.2f},{CUT_LINE_Y_SMALL_BOTTOM[1]:.2f}H{small_cl_x_start:.2f}"

        # 12) SVG 조립 + 저장
        svg_str = _build_normalized_svg(
            big_d_top, small_d_top,
            big_cl1_top, big_cl2_top, small_cl1_top, small_cl2_top,
            big_d_btm, small_d_btm,
            big_cl1_btm, big_cl2_btm, small_cl1_btm, small_cl2_btm,
        )
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(svg_str)

        # 13) 자동 검증
        checks: dict[str, bool] = {}

        # XML 파싱 가능?
        try:
            ET.parse(output_path)
            checks["xml_valid"] = True
        except Exception:
            checks["xml_valid"] = False

        # viewBox 안에 모두 있는지
        checks["viewbox_ok"] = all([
            bx_min >= 0, bx_max <= ARTBOARD_WIDTH,
            by_min >= 0, by_max <= ARTBOARD_HEIGHT,
            sx_min >= 0, sx_max <= ARTBOARD_WIDTH,
            sy_min >= 0, sy_max <= ARTBOARD_HEIGHT,
            bbx >= 0, bbx2 <= ARTBOARD_WIDTH,
            bby >= 0, bby2 <= ARTBOARD_HEIGHT,
            sbx >= 0, sbx2 <= ARTBOARD_WIDTH,
            sby >= 0, sby2 <= ARTBOARD_HEIGHT,
        ])

        # 큰/작은 패턴 X 충돌 없음?
        checks["no_x_collision"] = bx_max < sx_min and bbx2 < sbx

        # 절단선 마진 정확?
        checks["big_cl_margin_ok"] = (
            abs((big_cl_x_start - bx_min) - CUT_LINE_MARGIN) < 0.01
            and abs((bx_max - big_cl_x_end) - CUT_LINE_MARGIN) < 0.01
        )
        checks["small_cl_margin_ok"] = (
            abs((small_cl_x_start - sx_min) - CUT_LINE_MARGIN) < 0.01
            and abs((sx_max - small_cl_x_end) - CUT_LINE_MARGIN) < 0.01
        )

        # 큰/작은 패턴 밑단 정렬?
        checks["bottom_align_ok"] = abs(by_max - sy_max) < 0.05

        all_ok = all(checks.values())

        return {
            "success": all_ok,
            "data": {
                "input": input_path,
                "output": output_path,
                "backup": backup_path,
                "big_width": round(bx_max - bx_min, 2),
                "small_width": round(sx_max - sx_min, 2),
                "small_y_align_offset": round(small_y_align, 2),
                "gap_between_patterns": round(sx_min - bx_max, 2),
                "checks": checks,
                "version": NORMALIZER_VERSION,
            },
            **({"error": "검증 실패 (checks 항목 확인)"} if not all_ok else {}),
        }

    except Exception as e:
        import traceback
        return {
            "success": False,
            "error": f"변환 실패: {e}",
            "trace": traceback.format_exc(),
        }


def normalize_batch(
    folder_path: str,
    base_file_path: str | None = None,
    backup: bool = True,
) -> dict[str, Any]:
    """
    폴더 내 모든 SVG 파일을 일괄 표준화한다 (핵심 함수).

    처리 규칙:
    - folder_path 내 모든 .svg 파일 대상 (.bak/.tmp 등 제외)
    - 각 파일을 normalize_svg()로 변환
    - base_file_path와 같은 파일은 건너뜀 (이미 정답지)
    - 결과는 파일별로 집계

    Args:
      folder_path: 변환 대상 폴더 경로
      base_file_path: 기준 파일 경로 (이 파일은 건너뜀, 보통 2XL.svg)
      backup: True면 각 파일마다 .bak 백업 생성 (기본 True)

    Returns:
      {
        "success": True,
        "data": {
          "folder": folder_path,
          "total_count": N,
          "pass_count": X,
          "fail_count": Y,
          "skipped_count": Z,
          "results": [
            {"file": "...", "status": "PASS"|"FAIL"|"SKIP", "data"|"error": ...}, ...
          ],
          "version": "1.0-uneck-double-sided",
        }
      }
      또는 {"success": False, "error": "..."}
    """
    if not os.path.isdir(folder_path):
        return {"success": False, "error": f"폴더 없음: {folder_path}"}

    # SVG 파일 목록 수집 (.bak는 제외)
    try:
        all_files = os.listdir(folder_path)
    except OSError as e:
        return {"success": False, "error": f"폴더 읽기 실패: {e}"}

    svg_files = sorted([
        os.path.join(folder_path, f)
        for f in all_files
        if f.lower().endswith(".svg") and not f.lower().endswith(".bak")
    ])

    if not svg_files:
        return {
            "success": True,
            "data": {
                "folder": folder_path,
                "total_count": 0, "pass_count": 0, "fail_count": 0, "skipped_count": 0,
                "results": [],
                "version": NORMALIZER_VERSION,
            },
        }

    # 기준 파일 경로 정규화 (비교용)
    base_norm: str | None = None
    if base_file_path:
        base_norm = os.path.normcase(os.path.abspath(base_file_path))

    results = []
    pass_count = 0
    fail_count = 0
    skipped_count = 0

    for svg_path in svg_files:
        # 기준 파일은 건너뜀 (이미 정답지)
        if base_norm and os.path.normcase(os.path.abspath(svg_path)) == base_norm:
            results.append({
                "file": svg_path, "status": "SKIP",
                "reason": "기준 파일 (변환 대상 아님)",
            })
            skipped_count += 1
            continue

        result = normalize_svg(svg_path, base_file_path=base_file_path,
                               output_path=None, backup=backup)
        if result.get("success"):
            results.append({"file": svg_path, "status": "PASS",
                            "data": result.get("data")})
            pass_count += 1
        else:
            results.append({"file": svg_path, "status": "FAIL",
                            "error": result.get("error", "알 수 없는 오류"),
                            "data": result.get("data")})
            fail_count += 1

    return {
        "success": fail_count == 0,
        "data": {
            "folder": folder_path,
            "total_count": len(svg_files),
            "pass_count": pass_count,
            "fail_count": fail_count,
            "skipped_count": skipped_count,
            "results": results,
            "version": NORMALIZER_VERSION,
        },
    }


# ========================================================================
# CLI 진입점 (단위 테스트용)
# ========================================================================

if __name__ == "__main__":
    """
    사용법:
      python svg_normalizer.py measure <svg_path>
      python svg_normalizer.py classify <svg_path>
      python svg_normalizer.py preview <svg_path> [<svg_path2> ...]
      python svg_normalizer.py normalize <svg_path>
      python svg_normalizer.py batch <folder_path> [<base_svg>]
    """
    import json
    import sys

    if len(sys.argv) < 2:
        print("Usage: python svg_normalizer.py <command> <args>")
        print("  measure <svg_path>")
        print("  classify <svg_path>")
        print("  preview <svg_path> [...]")
        print("  normalize <svg_path>")
        print("  batch <folder_path> [<base_svg>]")
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "measure" and len(sys.argv) >= 3:
        result = measure_svg_bboxes(sys.argv[2])
    elif cmd == "classify" and len(sys.argv) >= 3:
        result = classify_svg_paths(sys.argv[2])
    elif cmd == "preview" and len(sys.argv) >= 3:
        result = preview_normalization(sys.argv[2:])
    elif cmd == "normalize" and len(sys.argv) >= 3:
        result = normalize_svg(sys.argv[2])
    elif cmd == "batch" and len(sys.argv) >= 3:
        base = sys.argv[3] if len(sys.argv) >= 4 else None
        result = normalize_batch(sys.argv[2], base_file_path=base)
    else:
        print(f"알 수 없는 명령: {cmd}")
        sys.exit(1)

    print(json.dumps(result, ensure_ascii=False, indent=2))
