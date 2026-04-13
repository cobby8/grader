"""
SVG Bounding Box 계산 모듈

SVG 파일 내부의 실제 도형 요소(polyline, polygon, path, rect, circle, ellipse, line)를
파싱하여 전체 bounding box를 계산한다.

배경:
  Illustrator에서 SVG를 내보내면 viewBox는 아트보드 크기로 고정되고,
  실제 패턴 도형은 아트보드보다 작다. 사이즈별 SVG는 viewBox가 동일하지만
  내부 도형 크기가 다르므로, viewBox가 아닌 도형 좌표에서 직접 크기를 추출해야 한다.

  예시:
    - viewBox: 4337×3401 (모든 사이즈 공통 = 아트보드)
    - 실제 도형: XS=3318×2348, M=3492×2461, L=3542×2518 (사이즈별 다름)
"""

import re
import xml.etree.ElementTree as ET
from typing import Optional


# SVG XML 네임스페이스 — SVG 태그를 찾을 때 이 접두사가 필요하다
SVG_NS = {"svg": "http://www.w3.org/2000/svg"}

# 파싱 대상 도형 태그 목록
SHAPE_TAGS = [
    "svg:polyline",
    "svg:polygon",
    "svg:path",
    "svg:rect",
    "svg:circle",
    "svg:ellipse",
    "svg:line",
]


def _parse_points(points_str: str) -> Optional[tuple[float, float, float, float]]:
    """
    polyline/polygon의 points 속성에서 bounding box를 계산한다.

    points 형식: "100,200 300,400 500,600" 또는 "100 200 300 400"
    좌표는 x,y 쌍으로 번갈아 나온다.

    반환: (min_x, min_y, max_x, max_y) 또는 좌표가 부족하면 None
    """
    # 모든 숫자(소수점, 음수 포함)를 추출한다
    coords = re.findall(r"-?[\d.]+", points_str)
    if len(coords) < 4:
        return None

    # 짝수 인덱스 = x좌표, 홀수 인덱스 = y좌표
    xs = [float(coords[i]) for i in range(0, len(coords), 2)]
    ys = [float(coords[i]) for i in range(1, len(coords), 2)]
    return (min(xs), min(ys), max(xs), max(ys))


def _parse_rect(elem: ET.Element) -> Optional[tuple[float, float, float, float]]:
    """
    <rect x="10" y="20" width="100" height="200"> 에서 bounding box를 계산한다.
    """
    try:
        x = float(elem.get("x", "0"))
        y = float(elem.get("y", "0"))
        w = float(elem.get("width", "0"))
        h = float(elem.get("height", "0"))
        if w <= 0 or h <= 0:
            return None
        return (x, y, x + w, y + h)
    except (ValueError, TypeError):
        return None


def _parse_circle(elem: ET.Element) -> Optional[tuple[float, float, float, float]]:
    """
    <circle cx="100" cy="200" r="50"> → bbox = (50, 150, 150, 250)
    """
    try:
        cx = float(elem.get("cx", "0"))
        cy = float(elem.get("cy", "0"))
        r = float(elem.get("r", "0"))
        if r <= 0:
            return None
        return (cx - r, cy - r, cx + r, cy + r)
    except (ValueError, TypeError):
        return None


def _parse_ellipse(elem: ET.Element) -> Optional[tuple[float, float, float, float]]:
    """
    <ellipse cx="100" cy="200" rx="80" ry="60"> → bbox 계산
    """
    try:
        cx = float(elem.get("cx", "0"))
        cy = float(elem.get("cy", "0"))
        rx = float(elem.get("rx", "0"))
        ry = float(elem.get("ry", "0"))
        if rx <= 0 or ry <= 0:
            return None
        return (cx - rx, cy - ry, cx + rx, cy + ry)
    except (ValueError, TypeError):
        return None


def _parse_line(elem: ET.Element) -> Optional[tuple[float, float, float, float]]:
    """
    <line x1="10" y1="20" x2="300" y2="400"> → bbox 계산
    """
    try:
        x1 = float(elem.get("x1", "0"))
        y1 = float(elem.get("y1", "0"))
        x2 = float(elem.get("x2", "0"))
        y2 = float(elem.get("y2", "0"))
        return (min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2))
    except (ValueError, TypeError):
        return None


def _parse_path_bbox(d_attr: str) -> Optional[tuple[float, float, float, float]]:
    """
    <path d="M 100 200 L 300 400 C ..."> 에서 bounding box를 추정한다.

    SVG path는 매우 복잡할 수 있지만, 실용적 접근으로:
    - M, L, H, V, C, S, Q, T, A 명령의 좌표를 모두 추출
    - 제어점도 포함하므로 정확한 bbox보다 약간 클 수 있지만,
      패턴 SVG(주로 polyline이 핵심)에서는 충분히 정확하다.

    방법: path 명령어를 순차적으로 파싱하여 모든 좌표점을 수집한다.
    """
    if not d_attr or not d_attr.strip():
        return None

    all_xs: list[float] = []
    all_ys: list[float] = []

    # 현재 위치 추적 (상대 좌표 처리용)
    cur_x, cur_y = 0.0, 0.0
    # 서브패스 시작점 (Z 명령 시 돌아갈 위치)
    start_x, start_y = 0.0, 0.0

    # path 명령어와 숫자를 토큰으로 분리
    # 예: "M100,200L300-400" → ["M", "100", "200", "L", "300", "-400"]
    tokens = re.findall(r"[MmLlHhVvCcSsQqTtAaZz]|-?[\d]*\.?\d+(?:[eE][+-]?\d+)?", d_attr)

    i = 0
    cmd = ""

    def _next_num() -> float:
        """다음 숫자 토큰을 꺼낸다."""
        nonlocal i
        while i < len(tokens):
            tok = tokens[i]
            i += 1
            try:
                return float(tok)
            except ValueError:
                continue
        return 0.0

    while i < len(tokens):
        tok = tokens[i]

        # 알파벳이면 새 명령
        if tok.isalpha():
            cmd = tok
            i += 1
        else:
            # 알파벳이 아니면 이전 명령의 반복 (예: L 뒤에 좌표 여러 쌍)
            pass

        if cmd == "":
            i += 1
            continue

        if cmd in ("M", "m"):
            x, y = _next_num(), _next_num()
            if cmd == "m":
                x += cur_x
                y += cur_y
            cur_x, cur_y = x, y
            start_x, start_y = x, y
            all_xs.append(x)
            all_ys.append(y)
            # M 이후 추가 좌표는 L처럼 동작
            cmd = "L" if cmd == "M" else "l"

        elif cmd in ("L", "l"):
            x, y = _next_num(), _next_num()
            if cmd == "l":
                x += cur_x
                y += cur_y
            cur_x, cur_y = x, y
            all_xs.append(x)
            all_ys.append(y)

        elif cmd in ("H", "h"):
            x = _next_num()
            if cmd == "h":
                x += cur_x
            cur_x = x
            all_xs.append(x)
            all_ys.append(cur_y)

        elif cmd in ("V", "v"):
            y = _next_num()
            if cmd == "v":
                y += cur_y
            cur_y = y
            all_xs.append(cur_x)
            all_ys.append(y)

        elif cmd in ("C", "c"):
            # 3차 베지어: 6개 숫자 (x1 y1 x2 y2 x y)
            coords = [_next_num() for _ in range(6)]
            if cmd == "c":
                for j in range(0, 6, 2):
                    coords[j] += cur_x
                    coords[j + 1] += cur_y
            # 제어점과 끝점 모두 bbox에 포함 (약간 과대추정 가능하나 안전)
            all_xs.extend([coords[0], coords[2], coords[4]])
            all_ys.extend([coords[1], coords[3], coords[5]])
            cur_x, cur_y = coords[4], coords[5]

        elif cmd in ("S", "s"):
            # 부드러운 3차 베지어: 4개 숫자 (x2 y2 x y)
            coords = [_next_num() for _ in range(4)]
            if cmd == "s":
                for j in range(0, 4, 2):
                    coords[j] += cur_x
                    coords[j + 1] += cur_y
            all_xs.extend([coords[0], coords[2]])
            all_ys.extend([coords[1], coords[3]])
            cur_x, cur_y = coords[2], coords[3]

        elif cmd in ("Q", "q"):
            # 2차 베지어: 4개 숫자 (x1 y1 x y)
            coords = [_next_num() for _ in range(4)]
            if cmd == "q":
                for j in range(0, 4, 2):
                    coords[j] += cur_x
                    coords[j + 1] += cur_y
            all_xs.extend([coords[0], coords[2]])
            all_ys.extend([coords[1], coords[3]])
            cur_x, cur_y = coords[2], coords[3]

        elif cmd in ("T", "t"):
            # 부드러운 2차 베지어: 2개 숫자 (x y)
            x, y = _next_num(), _next_num()
            if cmd == "t":
                x += cur_x
                y += cur_y
            cur_x, cur_y = x, y
            all_xs.append(x)
            all_ys.append(y)

        elif cmd in ("A", "a"):
            # 호(arc): 7개 숫자 (rx ry x-rotation large-arc sweep x y)
            # rx, ry, rotation, flags는 건너뛰고 끝점만 수집
            _next_num()  # rx
            _next_num()  # ry
            _next_num()  # x-rotation
            _next_num()  # large-arc-flag
            _next_num()  # sweep-flag
            x, y = _next_num(), _next_num()
            if cmd == "a":
                x += cur_x
                y += cur_y
            cur_x, cur_y = x, y
            all_xs.append(x)
            all_ys.append(y)

        elif cmd in ("Z", "z"):
            # 서브패스 닫기 → 시작점으로 복귀
            cur_x, cur_y = start_x, start_y

        else:
            # 알 수 없는 명령은 건너뛴다
            i += 1

    if not all_xs or not all_ys:
        return None

    return (min(all_xs), min(all_ys), max(all_xs), max(all_ys))


def get_svg_bounding_box(svg_path: str) -> dict:
    """
    SVG 파일 내 실제 도형 요소의 bounding box를 계산한다.

    1. SVG를 XML로 파싱
    2. 모든 도형 요소(polyline, polygon, path, rect, circle, ellipse, line) 검색
    3. 각 요소의 좌표에서 전체 min/max x/y 계산
    4. bounding box 크기(width, height)와 viewBox 크기를 함께 반환

    반환:
      성공 시: {success, min_x, min_y, max_x, max_y, width, height, viewbox_width, viewbox_height, element_count}
      실패 시: {success: False, error: "..."}
    """
    try:
        # XML 파싱
        tree = ET.parse(svg_path)
        root = tree.getroot()
    except ET.ParseError as e:
        return {"success": False, "error": f"SVG XML 파싱 실패: {e}"}
    except FileNotFoundError:
        return {"success": False, "error": f"파일을 찾을 수 없습니다: {svg_path}"}

    # viewBox에서 원래 아트보드 크기 추출 (참고용)
    viewbox_width = 0.0
    viewbox_height = 0.0
    vb = root.get("viewBox", "")
    if vb:
        parts = vb.strip().split()
        if len(parts) >= 4:
            try:
                viewbox_width = float(parts[2])
                viewbox_height = float(parts[3])
            except ValueError:
                pass

    # 모든 도형 요소에서 bounding box 수집
    global_min_x = float("inf")
    global_min_y = float("inf")
    global_max_x = float("-inf")
    global_max_y = float("-inf")
    element_count = 0

    for tag in SHAPE_TAGS:
        elements = root.findall(f".//{tag}", SVG_NS)
        for elem in elements:
            bbox = None
            local_name = tag.split(":")[-1]  # "svg:polyline" → "polyline"

            if local_name in ("polyline", "polygon"):
                points = elem.get("points", "")
                if points:
                    bbox = _parse_points(points)

            elif local_name == "rect":
                bbox = _parse_rect(elem)

            elif local_name == "circle":
                bbox = _parse_circle(elem)

            elif local_name == "ellipse":
                bbox = _parse_ellipse(elem)

            elif local_name == "line":
                bbox = _parse_line(elem)

            elif local_name == "path":
                d = elem.get("d", "")
                if d:
                    bbox = _parse_path_bbox(d)

            # bbox가 유효하면 전역 bbox에 병합
            if bbox is not None:
                min_x, min_y, max_x, max_y = bbox
                global_min_x = min(global_min_x, min_x)
                global_min_y = min(global_min_y, min_y)
                global_max_x = max(global_max_x, max_x)
                global_max_y = max(global_max_y, max_y)
                element_count += 1

    # 도형을 하나도 찾지 못한 경우
    if element_count == 0:
        return {
            "success": False,
            "error": "SVG 파일에서 도형 요소를 찾지 못했습니다.",
            "viewbox_width": round(viewbox_width, 2),
            "viewbox_height": round(viewbox_height, 2),
        }

    width = global_max_x - global_min_x
    height = global_max_y - global_min_y

    return {
        "success": True,
        "min_x": round(global_min_x, 2),
        "min_y": round(global_min_y, 2),
        "max_x": round(global_max_x, 2),
        "max_y": round(global_max_y, 2),
        "width": round(width, 2),
        "height": round(height, 2),
        "viewbox_width": round(viewbox_width, 2),
        "viewbox_height": round(viewbox_height, 2),
        "element_count": element_count,
    }
