"""
PDF 파일 처리 모듈

승화전사 유니폼 디자인 파일(PDF)을 읽고 분석하는 기능을 제공한다.
주요 기능:
  - PDF 기본 정보 추출 (페이지 수, 크기, 파일 크기)
  - CMYK 색상 공간 검증
  - PDF 미리보기 이미지(PNG) 생성

PyMuPDF(fitz) 라이브러리를 사용한다.
"""

import fitz  # PyMuPDF
import os
import json
from typing import Any


def get_pdf_info(pdf_path: str) -> dict[str, Any]:
    """
    PDF 파일의 기본 정보를 추출하여 딕셔너리로 반환한다.

    반환 값:
      - page_count: 페이지 수
      - page_width_mm: 첫 페이지 가로 크기 (mm)
      - page_height_mm: 첫 페이지 세로 크기 (mm)
      - file_size: 파일 크기 (bytes)
      - color_spaces: 발견된 색상 공간 목록
      - has_cmyk: CMYK 색상이 있는지 여부
      - has_rgb: RGB 색상이 있는지 여부
    """
    # 파일 존재 여부 확인
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"파일을 찾을 수 없습니다: {pdf_path}")

    # 파일 크기 (bytes)
    file_size = os.path.getsize(pdf_path)

    doc = fitz.open(pdf_path)

    # 첫 페이지 크기를 기준으로 사용 (포인트 -> mm 변환)
    # 1 포인트 = 0.352778mm
    first_page = doc[0]
    rect = first_page.rect
    # 포인트 단위를 mm로 변환
    pt_to_mm = 25.4 / 72.0
    page_width_mm = round(rect.width * pt_to_mm, 1)
    page_height_mm = round(rect.height * pt_to_mm, 1)

    # 색상 공간 분석: 페이지 내 이미지와 오브젝트의 색상 공간을 확인
    color_spaces = set()
    has_cmyk = False
    has_rgb = False

    for page_num in range(len(doc)):
        page = doc[page_num]

        # 페이지의 이미지 목록에서 색상 공간 확인
        image_list = page.get_images(full=True)
        for img_info in image_list:
            # img_info[8]이 colorspace (예: "DeviceCMYK", "DeviceRGB" 등)
            xref = img_info[0]
            try:
                # xref로 이미지 정보 추출
                img_data = doc.extract_image(xref)
                cs = img_data.get("colorspace", 0)
                # colorspace 값: 1=Gray, 3=RGB, 4=CMYK
                if cs == 4:
                    color_spaces.add("CMYK")
                    has_cmyk = True
                elif cs == 3:
                    color_spaces.add("RGB")
                    has_rgb = True
                elif cs == 1:
                    color_spaces.add("Gray")
            except Exception:
                pass

        # 페이지 내용 스트림에서 색상 공간 키워드 검색
        # PDF 내용 스트림에는 /DeviceCMYK, /DeviceRGB 등의 색상 공간 지정이 포함됨
        try:
            page_text = page.get_text("rawdict")
            # rawdict에서 블록의 색상 정보 확인은 복잡하므로,
            # 대신 페이지 리소스에서 ColorSpace 확인
            xref = page.xref
            page_obj = doc.xref_object(xref)

            if "DeviceCMYK" in page_obj or "ICCBased" in page_obj:
                color_spaces.add("CMYK")
                has_cmyk = True
            if "DeviceRGB" in page_obj:
                color_spaces.add("RGB")
                has_rgb = True
        except Exception:
            pass

    # 문서를 닫기 전에 페이지 수를 먼저 지역 변수에 저장한다.
    # 이유: doc.close() 이후에는 len(doc) 호출 시 0이 반환되어
    # 딕셔너리 반환값의 page_count가 항상 0이 되는 버그를 방지하기 위함.
    page_count = len(doc)

    doc.close()

    # 색상 공간 종합 판단
    if has_cmyk and has_rgb:
        color_space_result = "Mixed"
    elif has_cmyk:
        color_space_result = "CMYK"
    elif has_rgb:
        color_space_result = "RGB"
    else:
        # 색상 공간을 특정할 수 없는 경우 (벡터만 있거나 비어있는 경우)
        color_space_result = "Unknown"

    return {
        "success": True,
        "page_count": page_count,  # close 전에 저장한 값 사용
        "page_width_mm": page_width_mm,
        "page_height_mm": page_height_mm,
        "file_size": file_size,
        "color_spaces": sorted(list(color_spaces)),
        "color_space": color_space_result,
        "has_cmyk": has_cmyk,
        "has_rgb": has_rgb,
    }


def verify_cmyk(pdf_path: str) -> dict[str, Any]:
    """
    PDF의 색상 공간이 CMYK인지 검증한다.

    반환 값:
      - is_cmyk: 순수 CMYK인지 여부
      - has_rgb: RGB 색상이 포함되어 있는지
      - message: 사용자에게 보여줄 메시지
      - color_space: "CMYK" | "RGB" | "Mixed" | "Unknown"
    """
    info = get_pdf_info(pdf_path)

    has_cmyk = info["has_cmyk"]
    has_rgb = info["has_rgb"]

    if has_cmyk and not has_rgb:
        # 순수 CMYK - 최상의 상태
        return {
            "success": True,
            "is_cmyk": True,
            "has_rgb": False,
            "color_space": "CMYK",
            "message": "CMYK 색상이 정상적으로 보존되어 있습니다.",
        }
    elif has_cmyk and has_rgb:
        # CMYK와 RGB가 혼합 - 경고
        return {
            "success": True,
            "is_cmyk": False,
            "has_rgb": True,
            "color_space": "Mixed",
            "message": "RGB 색상이 일부 포함되어 있습니다. 인쇄 품질을 위해 CMYK로 변환하여 저장하는 것을 권장합니다.",
        }
    elif has_rgb and not has_cmyk:
        # 순수 RGB - 주의 필요
        return {
            "success": True,
            "is_cmyk": False,
            "has_rgb": True,
            "color_space": "RGB",
            "message": "RGB 색상만 사용된 파일입니다. 인쇄 시 색상 차이가 발생할 수 있습니다. CMYK로 저장하면 더 정확합니다.",
        }
    else:
        # 색상 공간 불명 (벡터 전용 등)
        return {
            "success": True,
            "is_cmyk": False,
            "has_rgb": False,
            "color_space": "Unknown",
            "message": "색상 공간을 확인할 수 없습니다. 벡터 전용 PDF일 수 있습니다.",
        }


def generate_preview(pdf_path: str, output_path: str, dpi: int = 150) -> dict[str, Any]:
    """
    PDF의 첫 페이지를 PNG 이미지로 변환하여 미리보기를 생성한다.

    Args:
      pdf_path: 원본 PDF 파일 경로
      output_path: 미리보기 PNG 저장 경로
      dpi: 해상도 (기본 150dpi - 미리보기용으로 충분)

    반환 값:
      - preview_path: 생성된 미리보기 이미지 경로
      - width: 이미지 가로 픽셀
      - height: 이미지 세로 픽셀
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"파일을 찾을 수 없습니다: {pdf_path}")

    doc = fitz.open(pdf_path)
    first_page = doc[0]

    # DPI에 맞춰 변환 행렬 설정 (기본 72dpi에서 목표 dpi로 스케일)
    zoom = dpi / 72.0
    matrix = fitz.Matrix(zoom, zoom)

    # 페이지를 픽스맵(비트맵)으로 렌더링
    pixmap = first_page.get_pixmap(matrix=matrix)

    # 출력 디렉토리가 없으면 생성
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    # PNG로 저장
    pixmap.save(output_path)

    result = {
        "success": True,
        "preview_path": output_path,
        "width": pixmap.width,
        "height": pixmap.height,
    }

    doc.close()
    return result
