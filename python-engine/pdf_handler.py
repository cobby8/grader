"""
PDF 파일 처리 모듈

승화전사 유니폼 디자인 파일(PDF)을 읽고 분석하는 기능을 제공한다.
주요 기능:
  - PDF 기본 정보 추출 (페이지 수, 크기, 파일 크기)
  - CMYK 색상 공간 검증 (기본)
  - CMYK 색상 공간 상세 분석 (벡터 연산자 감지 + 이미지별 색상 공간)
  - PDF 미리보기 이미지(PNG) 생성

PyMuPDF(fitz) 라이브러리를 사용한다.
"""

import fitz  # PyMuPDF
import os
import re
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


def _detect_vector_color_operators(content_bytes: bytes) -> dict[str, bool]:
    """
    PDF 콘텐츠 스트림 바이트 데이터에서 벡터 페인트 연산자를 감지한다.

    왜 필요한가:
      PDF는 벡터 페인트 색상을 다음 연산자로 지정한다:
        - k, K   : CMYK 채움/선 (소문자=fill, 대문자=stroke)
        - rg, RG : RGB 채움/선
        - g, G   : Grayscale 채움/선
      기존 방식(페이지 객체 딕셔너리에서 DeviceCMYK 문자열 검색)으로는
      reportlab 같은 도구가 생성한 벡터 CMYK PDF를 감지할 수 없었다.
      이 함수는 콘텐츠 스트림을 직접 파싱하여 실제 사용된 색상 연산자를 찾는다.

    구현 방법:
      - 콘텐츠 스트림은 이진 데이터지만 연산자는 ASCII이므로 bytes 패턴 매칭 사용
      - 정규식 경계: 앞에 공백 또는 줄바꿈, 뒤에 공백/줄바꿈/탭
      - 연산자 앞에는 반드시 숫자 인자(4개=CMYK, 3개=RGB, 1개=Gray)가 있음

    반환:
      {"cmyk": True/False, "rgb": True/False, "gray": True/False}
    """
    result = {"cmyk": False, "rgb": False, "gray": False}

    if not content_bytes:
        return result

    # 콘텐츠 스트림을 ASCII-safe 문자열로 변환 (디코딩 실패 시 ignore)
    try:
        text = content_bytes.decode("latin-1", errors="ignore")
    except Exception:
        return result

    # CMYK: "숫자 숫자 숫자 숫자 k" 또는 "K" (경계 포함)
    # 예: "0.5 0.3 0.2 0.1 k\n"
    # 숫자는 정수 또는 소수, 앞뒤에 공백/줄바꿈
    num_pattern = r"[-+]?\d*\.?\d+"
    ws = r"[\s\r\n]"
    cmyk_re = re.compile(
        rf"(?:^|{ws}){num_pattern}{ws}+{num_pattern}{ws}+{num_pattern}{ws}+{num_pattern}{ws}+[kK]{ws}"
    )
    rgb_re = re.compile(
        rf"(?:^|{ws}){num_pattern}{ws}+{num_pattern}{ws}+{num_pattern}{ws}+(?:rg|RG){ws}"
    )
    # grayscale g/G는 더 주의해야 함 — 많은 다른 의미와 혼동되지 않도록
    # "숫자 g" 또는 "숫자 G" (연산자로서) 감지
    gray_re = re.compile(
        rf"(?:^|{ws}){num_pattern}{ws}+[gG]{ws}"
    )

    # 검색 (빠르게 첫 매치만 확인)
    if cmyk_re.search(text):
        result["cmyk"] = True
    if rgb_re.search(text):
        result["rgb"] = True
    if gray_re.search(text):
        result["gray"] = True

    return result


def _scan_form_xobjects(doc) -> dict[str, bool]:
    """
    문서 전체의 Form XObject 내부 스트림에서 벡터 페인트 연산자를 감지한다.

    왜 필요한가:
      pdf_grader.generate_graded_pdf는 PyMuPDF의 show_pdf_page를 사용해
      원본 PDF를 Form XObject로 래핑하여 새 PDF에 삽입한다. 그 결과:
        - 새 페이지의 top-level 콘텐츠 스트림에는 "/fzFrm0 Do" 같은
          Form XObject 호출만 남고 실제 색상 연산자(k, K)는 포함되지 않음
        - 실제 CMYK 연산자는 Form XObject 내부 스트림에 그대로 보존됨
      기존 페이지별 page.read_contents() 스캔만으로는 이 경우를 놓치므로
      문서 전체 xref를 돌면서 Form XObject의 스트림도 함께 검사한다.

    구현 방법(방법 A - 간단):
      - doc.xref_length()로 전체 xref 수를 얻고 1부터 순회
      - doc.xref_get_key(xref, "Subtype")로 객체 타입 확인
      - "/Form"인 경우에만 doc.xref_stream(xref)로 바이트 스트림 추출
      - 기존 _detect_vector_color_operators를 재사용하여 연산자 감지
      - 중첩된 Form XObject도 자연스럽게 처리됨(모든 xref를 돌기 때문)

    에러 처리:
      - xref_get_key / xref_stream 실패 시 해당 객체만 건너뜀
      - 전체 xref 수가 많아도 단순 순회이므로 선형 시간에 안전하게 동작

    반환:
      {"cmyk": bool, "rgb": bool, "gray": bool}
    """
    result = {"cmyk": False, "rgb": False, "gray": False}

    try:
        xref_count = doc.xref_length()
    except Exception:
        # xref_length 자체가 실패하면 빈 결과 반환 (안전 폴백)
        return result

    for xref in range(1, xref_count):
        try:
            # xref_get_key는 (type, value) 튜플을 반환한다.
            # 예: ("name", "/Form") 또는 ("null", "null")
            subtype_key = doc.xref_get_key(xref, "Subtype")
            if not subtype_key or subtype_key[1] != "/Form":
                continue

            # Form XObject의 스트림 바이트 추출
            stream = doc.xref_stream(xref)
            if not stream:
                continue

            # 기존 벡터 연산자 감지 로직 재사용
            detected = _detect_vector_color_operators(stream)
            if detected["cmyk"]:
                result["cmyk"] = True
            if detected["rgb"]:
                result["rgb"] = True
            if detected["gray"]:
                result["gray"] = True

            # 이미 세 가지 모두 감지했다면 조기 종료 (최적화)
            if result["cmyk"] and result["rgb"] and result["gray"]:
                break
        except Exception:
            # 개별 xref 처리 실패는 무시하고 다음 객체로 진행
            continue

    return result


def analyze_color_space_detailed(pdf_path: str) -> dict[str, Any]:
    """
    PDF의 색상 공간을 페이지별/객체별로 상세 분석한다.

    기존 get_pdf_info보다 정밀한 감지:
      1. 콘텐츠 스트림을 직접 읽어서 벡터 페인트 연산자(k, K, rg, RG, g, G) 감지
      2. 페이지 리소스 딕셔너리에서 ColorSpace / ICCBased 프로파일 확인
      3. 각 이미지를 extract_image으로 읽어서 colorspace 필드 확인

    반환:
      {
        "success": True,
        "overall": "CMYK" | "RGB" | "Mixed" | "Grayscale" | "Unknown",
        "pages": [
          {
            "page_num": 0,
            "vector_cmyk": True,
            "vector_rgb": False,
            "vector_gray": False,
            "image_count": 3,
            "image_color_spaces": ["CMYK", "CMYK", "RGB"],
            "has_icc_profile": False
          },
          ...
        ],
        "warnings": ["RGB 이미지가 1개 포함되어 있습니다"],
        "has_vector_cmyk": True,
        "has_vector_rgb": False,
        "has_image_cmyk": True,
        "has_image_rgb": True,
        "has_icc_profile": False
      }
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"파일을 찾을 수 없습니다: {pdf_path}")

    doc = fitz.open(pdf_path)

    pages_info: list[dict[str, Any]] = []
    warnings: list[str] = []

    # 전역 집계
    has_vector_cmyk = False
    has_vector_rgb = False
    has_vector_gray = False
    has_image_cmyk = False
    has_image_rgb = False
    has_image_gray = False
    has_icc_profile = False

    total_rgb_images = 0
    total_cmyk_images = 0

    for page_num in range(len(doc)):
        page = doc[page_num]

        # (A) 벡터 연산자 감지: 페이지의 콘텐츠 스트림 바이트를 직접 읽어온다.
        # page.read_contents()는 모든 contents 스트림을 합쳐서 바이트로 반환한다.
        try:
            content_bytes = page.read_contents()
        except Exception:
            content_bytes = b""

        vector_flags = _detect_vector_color_operators(content_bytes)

        if vector_flags["cmyk"]:
            has_vector_cmyk = True
        if vector_flags["rgb"]:
            has_vector_rgb = True
        if vector_flags["gray"]:
            has_vector_gray = True

        # (B) 이미지별 색상 공간 조사
        image_color_spaces: list[str] = []
        image_list = page.get_images(full=True)
        for img_info in image_list:
            xref = img_info[0]
            try:
                img_data = doc.extract_image(xref)
                cs = img_data.get("colorspace", 0)
                # colorspace 값: 1=Gray, 3=RGB, 4=CMYK
                if cs == 4:
                    image_color_spaces.append("CMYK")
                    has_image_cmyk = True
                    total_cmyk_images += 1
                elif cs == 3:
                    image_color_spaces.append("RGB")
                    has_image_rgb = True
                    total_rgb_images += 1
                elif cs == 1:
                    image_color_spaces.append("Gray")
                    has_image_gray = True
                else:
                    image_color_spaces.append("Unknown")
            except Exception:
                image_color_spaces.append("Unknown")

        # (C) ICC 프로파일 감지: 페이지 리소스 객체 문자열에서 검색
        # xref_object는 객체의 textual 표현을 반환한다 (PDF 사전 구조).
        page_has_icc = False
        try:
            page_obj_str = doc.xref_object(page.xref)
            if "ICCBased" in page_obj_str or "/ICC" in page_obj_str:
                page_has_icc = True
                has_icc_profile = True
        except Exception:
            pass

        pages_info.append({
            "page_num": page_num,
            "vector_cmyk": vector_flags["cmyk"],
            "vector_rgb": vector_flags["rgb"],
            "vector_gray": vector_flags["gray"],
            "image_count": len(image_list),
            "image_color_spaces": image_color_spaces,
            "has_icc_profile": page_has_icc,
        })

    # (C2) Form XObject 내부 스트림 스캔 (그레이딩 결과 PDF 대응)
    # 이유: pdf_grader의 show_pdf_page 출력은 원본을 Form XObject로 래핑하므로
    # 페이지의 최상위 콘텐츠 스트림(page.read_contents)만으로는 CMYK 연산자를
    # 찾지 못한다. 문서 전체의 Form XObject 스트림을 추가로 스캔하여 보완한다.
    form_flags = _scan_form_xobjects(doc)
    if form_flags["cmyk"]:
        has_vector_cmyk = True
    if form_flags["rgb"]:
        has_vector_rgb = True
    if form_flags["gray"]:
        has_vector_gray = True

    # 페이지별 플래그도 Form XObject 결과로 보완 (단일 페이지 PDF가 대부분이므로
    # 페이지 구분 없이 "문서 전체" 감지 결과를 모든 페이지에 반영한다)
    if form_flags["cmyk"] or form_flags["rgb"] or form_flags["gray"]:
        for page_info in pages_info:
            if form_flags["cmyk"]:
                page_info["vector_cmyk"] = True
            if form_flags["rgb"]:
                page_info["vector_rgb"] = True
            if form_flags["gray"]:
                page_info["vector_gray"] = True

    doc.close()

    # (D) 전체 색상 공간 판정
    # 우선순위: Mixed > CMYK > RGB > Grayscale > Unknown
    any_cmyk = has_vector_cmyk or has_image_cmyk
    any_rgb = has_vector_rgb or has_image_rgb
    any_gray_only = (has_vector_gray or has_image_gray) and not any_cmyk and not any_rgb

    if any_cmyk and any_rgb:
        overall = "Mixed"
    elif any_cmyk:
        overall = "CMYK"
    elif any_rgb:
        overall = "RGB"
    elif any_gray_only:
        overall = "Grayscale"
    else:
        overall = "Unknown"

    # (E) 사용자 경고 메시지 생성
    if total_rgb_images > 0 and any_cmyk:
        warnings.append(
            f"RGB 이미지가 {total_rgb_images}개 포함되어 있습니다. "
            f"인쇄 품질을 위해 CMYK로 변환해 주세요."
        )
    elif overall == "RGB":
        warnings.append(
            "이 PDF는 RGB 색상만 사용합니다. 인쇄 시 색상 차이가 발생할 수 있습니다."
        )
    elif overall == "Unknown":
        warnings.append(
            "색상 공간을 특정할 수 없습니다. 벡터 오브젝트가 없거나 비표준 형식일 수 있습니다."
        )

    if has_vector_rgb:
        warnings.append("벡터 RGB 색상이 감지되었습니다.")

    return {
        "success": True,
        "overall": overall,
        "pages": pages_info,
        "warnings": warnings,
        "has_vector_cmyk": has_vector_cmyk,
        "has_vector_rgb": has_vector_rgb,
        "has_image_cmyk": has_image_cmyk,
        "has_image_rgb": has_image_rgb,
        "has_icc_profile": has_icc_profile,
        "total_rgb_images": total_rgb_images,
        "total_cmyk_images": total_cmyk_images,
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
