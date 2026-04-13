"""
PDF 그레이딩 모듈

기준 사이즈 PDF를 타겟 사이즈의 스케일 비율에 맞게 확대/축소하여
새로운 PDF 파일을 생성한다. CMYK 색상 공간을 보존하는 것이 핵심.

구현 방식 (v2 - CTM 직접 삽입):
  1. 원본 PDF를 열어 첫 페이지 크기를 얻는다.
  2. (선택) CropBox를 설정하여 아트보드 밖 요소를 제거한다.
  3. 콘텐츠 스트림 앞에 CTM 변환 행렬(cm 연산자)을 삽입한다.
  4. MediaBox를 스케일된 크기로 조정한다.
  5. 결과를 별도 경로에 저장한다 (원본 보호).

이전 방식(show_pdf_page)과의 차이:
  - show_pdf_page: 원본을 Form XObject로 래핑 → 사각형 중복 발생
  - CTM 직접 삽입: 원본 콘텐츠 스트림을 직접 변환 → 깨끗한 출력

주의사항:
  - PyMuPDF는 /DeviceCMYK, ICCBased CMYK 프로파일 모두 보존한다.
  - 이미지 리소스도 원본 색상 공간(DeviceCMYK, DeviceN 등) 그대로 유지됨.
  - 래스터화(픽셀 이미지로 변환)는 절대 하지 않는다 → 인쇄 품질 저하 방지.
"""

import fitz  # PyMuPDF
import os
from typing import Any


# PDF 단위 변환 상수 (1pt = 1/72 inch = 0.352778 mm)
PT_TO_MM = 25.4 / 72.0
MM_TO_PT = 72.0 / 25.4


def generate_graded_pdf(
    source_pdf_path: str,
    output_pdf_path: str,
    scale_x: float,
    scale_y: float,
    crop_width_pt: float | None = None,
    crop_height_pt: float | None = None,
) -> dict[str, Any]:
    """
    CropBox + CTM 직접 삽입 방식으로 PDF를 스케일링한다.

    왜 이 방식인가:
      기존 show_pdf_page 방식은 원본을 Form XObject로 래핑하여 새 PDF에 삽입했다.
      이 과정에서 사각형 중복이 발생하고, 아트보드 밖 요소도 포함되었다.
      CTM 직접 삽입 방식은 원본 콘텐츠 스트림을 그대로 두고, 앞에 변환 행렬만
      추가하므로 Form XObject 래핑 없이 깨끗한 출력이 가능하다.

    Args:
      source_pdf_path: 원본 기준 사이즈 디자인 PDF 경로
      output_pdf_path: 출력할 그레이딩 PDF 경로
      scale_x: 가로 스케일 비율 (1.0 = 원본 유지)
      scale_y: 세로 스케일 비율
      crop_width_pt: (선택) 아트보드 가로 크기 pt. 지정 시 CropBox로 크롭.
      crop_height_pt: (선택) 아트보드 세로 크기 pt. 지정 시 CropBox로 크롭.

    Returns:
      {
        "success": True,
        "output_path": "C:/.../XL.pdf",
        "source_width_mm": 420.0,   (크롭 적용 후 기준 크기)
        "source_height_mm": 594.0,
        "output_width_mm": 441.0,
        "output_height_mm": 641.5,
        "page_count": 1,
        "scale_x": 1.05,
        "scale_y": 1.08,
        "file_size_bytes": ...,
        "original_size_bytes": ...,
        "compression_ratio": ...,
        "method": "ctm"  (사용된 방식 표시)
      }
    """
    # 1. 원본 존재 확인
    if not os.path.exists(source_pdf_path):
        raise FileNotFoundError(f"원본 PDF를 찾을 수 없습니다: {source_pdf_path}")

    # 2. 스케일 값 검증 (0이나 음수는 불가)
    if scale_x <= 0 or scale_y <= 0:
        return {
            "success": False,
            "error": f"유효하지 않은 스케일 값입니다: scale_x={scale_x}, scale_y={scale_y}",
        }

    # 3. 출력 디렉토리 자동 생성
    output_dir = os.path.dirname(output_pdf_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    # 4. 원본 PDF 열기 (doc를 수정한 뒤 다른 경로로 저장 → 원본 보호)
    doc = fitz.open(source_pdf_path)

    # 원본 첫 페이지 크기 기록 (반환값용)
    first_page = doc[0]
    original_rect = first_page.rect

    for page_num in range(len(doc)):
        page = doc[page_num]

        # Step 1: CropBox 적용 (아트보드 밖 요소 제거)
        # crop 파라미터가 주어지면 해당 크기로 크롭한다.
        # 아트보드가 페이지 중앙에 있다고 가정하지 않고,
        # detect_artboard에서 구한 좌표를 사용한다.
        if crop_width_pt and crop_height_pt:
            # TrimBox가 있으면 그걸 사용, 없으면 MediaBox 좌상단 기준
            trimbox = page.trimbox
            mediabox = page.mediabox

            if trimbox != mediabox:
                # TrimBox 기반 크롭 (Illustrator 아트보드)
                artboard_rect = trimbox
            else:
                # TrimBox 없음 → 지정된 crop 크기로 좌상단 기준 크롭
                # PDF 좌표계: 원점이 왼쪽 하단이지만 PyMuPDF는 상단 기준
                artboard_rect = fitz.Rect(
                    mediabox.x0,
                    mediabox.y0,
                    mediabox.x0 + crop_width_pt,
                    mediabox.y0 + crop_height_pt,
                )

            # CropBox 설정 (아트보드 영역만 보이게)
            # 중요: set_mediabox를 set_cropbox보다 먼저 호출해야 함
            # (PyMuPDF에서 CropBox가 MediaBox보다 크면 ValueError)
            page.set_cropbox(artboard_rect)

        # Step 2: 현재 페이지 크기 가져오기 (CropBox 적용 후)
        rect = page.rect

        # Step 3: CTM 변환 행렬 삽입
        # clean_contents()로 여러 콘텐츠 스트림을 하나로 합친 뒤,
        # 앞에 cm 연산자를 추가한다.
        page.clean_contents()

        # 콘텐츠 스트림 xref 목록 (clean 후 하나만 있을 것)
        xrefs = page.get_contents()
        if not xrefs:
            # 콘텐츠가 없는 빈 페이지 → 스킵
            continue

        # 기존 콘텐츠 스트림 바이트 읽기
        old_stream = page.read_contents()

        # CTM 변환 행렬: scale_x 0 0 scale_y tx ty cm
        # tx, ty는 CropBox가 있을 때 원점 이동이 필요한 경우를 위해
        # CropBox가 적용되면 PyMuPDF가 자동으로 좌표를 조정하므로 tx=ty=0
        tx = 0.0
        ty = 0.0

        # q ... Q로 그래픽 상태를 보존 (스케일이 후속 요소에 영향 주지 않도록)
        ctm_cmd = f"q {scale_x} 0 0 {scale_y} {tx} {ty} cm\n".encode("latin-1")
        end_cmd = b"\nQ"

        new_stream = ctm_cmd + old_stream + end_cmd

        # 첫 번째 콘텐츠 스트림을 교체
        doc.update_stream(xrefs[0], new_stream)

        # Step 4: MediaBox를 스케일된 크기로 조정
        new_width = rect.width * scale_x
        new_height = rect.height * scale_y
        new_rect = fitz.Rect(0, 0, new_width, new_height)

        # set_mediabox를 먼저 호출 (CropBox보다 작으면 에러나므로)
        page.set_mediabox(new_rect)
        page.set_cropbox(new_rect)

    # 저장 전에 페이지 수를 지역 변수로 저장 (close 이후 사용 불가 방지)
    total_pages = len(doc)

    # 크롭 후 첫 페이지의 기준 크기 (반환값용)
    # CropBox가 적용되었다면 그 크기가, 아니면 원본 크기가 사용됨
    if crop_width_pt and crop_height_pt:
        src_width_pt = crop_width_pt
        src_height_pt = crop_height_pt
    else:
        src_width_pt = original_rect.width
        src_height_pt = original_rect.height

    # 5. PDF 저장 (출력 최적화 설정)
    # clean=False: 이미 수동으로 스트림을 수정했으므로 재정규화하지 않음
    # (clean=True로 하면 우리가 삽입한 CTM이 제거될 수 있음)
    try:
        doc.save(
            output_pdf_path,
            deflate=True,
            deflate_images=True,
            deflate_fonts=True,
            garbage=4,
            clean=False,  # 중요: CTM 스트림 보존
        )
    except TypeError:
        # PyMuPDF 구버전은 deflate_images/deflate_fonts를 지원하지 않을 수 있다.
        doc.save(
            output_pdf_path,
            deflate=True,
            garbage=4,
            clean=False,
        )

    doc.close()

    # 6. 파일 크기 측정 (원본 vs 결과) - 압축률 리포트용
    try:
        original_size_bytes = os.path.getsize(source_pdf_path)
    except OSError:
        original_size_bytes = 0
    try:
        file_size_bytes = os.path.getsize(output_pdf_path)
    except OSError:
        file_size_bytes = 0

    # 압축률: 결과 파일 / 원본 파일 비율
    compression_ratio = (
        round(file_size_bytes / original_size_bytes, 3)
        if original_size_bytes > 0
        else 0.0
    )

    # 7. 결과 반환
    return {
        "success": True,
        "output_path": output_pdf_path,
        "source_width_mm": round(src_width_pt * PT_TO_MM, 2),
        "source_height_mm": round(src_height_pt * PT_TO_MM, 2),
        "output_width_mm": round(src_width_pt * scale_x * PT_TO_MM, 2),
        "output_height_mm": round(src_height_pt * scale_y * PT_TO_MM, 2),
        "page_count": total_pages,
        "scale_x": scale_x,
        "scale_y": scale_y,
        "file_size_bytes": file_size_bytes,
        "original_size_bytes": original_size_bytes,
        "compression_ratio": compression_ratio,
        "method": "ctm",
    }


def generate_graded_pdf_legacy(
    source_pdf_path: str,
    output_pdf_path: str,
    scale_x: float,
    scale_y: float,
) -> dict[str, Any]:
    """
    [레거시] show_pdf_page 방식 — 폴백용으로 보존.

    문제점: Form XObject 래핑으로 인한 사각형 중복 + 아트보드 밖 요소 포함.
    새 코드에서는 generate_graded_pdf(CTM 방식)를 사용할 것.
    """
    # 1. 원본 존재 확인
    if not os.path.exists(source_pdf_path):
        raise FileNotFoundError(f"원본 PDF를 찾을 수 없습니다: {source_pdf_path}")

    # 2. 스케일 값 검증
    if scale_x <= 0 or scale_y <= 0:
        return {
            "success": False,
            "error": f"유효하지 않은 스케일 값입니다: scale_x={scale_x}, scale_y={scale_y}",
        }

    # 3. 출력 디렉토리 자동 생성
    output_dir = os.path.dirname(output_pdf_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    # 4. 원본 PDF 열기
    src_doc = fitz.open(source_pdf_path)
    out_doc = fitz.open()

    first_page = src_doc[0]
    src_rect = first_page.rect
    src_width_pt = src_rect.width
    src_height_pt = src_rect.height

    # 5. show_pdf_page로 스케일 복사
    for page_num in range(len(src_doc)):
        src_page = src_doc[page_num]
        page_rect = src_page.rect

        target_width_pt = page_rect.width * scale_x
        target_height_pt = page_rect.height * scale_y

        new_page = out_doc.new_page(
            width=target_width_pt,
            height=target_height_pt,
        )

        target_rect = fitz.Rect(0, 0, target_width_pt, target_height_pt)
        new_page.show_pdf_page(
            target_rect,
            src_doc,
            page_num,
            keep_proportion=False,
        )

    total_pages = len(out_doc)

    # 6. 저장
    try:
        out_doc.save(
            output_pdf_path,
            deflate=True,
            deflate_images=True,
            deflate_fonts=True,
            garbage=4,
            clean=True,
        )
    except TypeError:
        out_doc.save(
            output_pdf_path,
            deflate=True,
            garbage=4,
            clean=True,
        )

    out_doc.close()
    src_doc.close()

    # 7. 파일 크기 측정
    try:
        original_size_bytes = os.path.getsize(source_pdf_path)
    except OSError:
        original_size_bytes = 0
    try:
        file_size_bytes = os.path.getsize(output_pdf_path)
    except OSError:
        file_size_bytes = 0

    compression_ratio = (
        round(file_size_bytes / original_size_bytes, 3)
        if original_size_bytes > 0
        else 0.0
    )

    return {
        "success": True,
        "output_path": output_pdf_path,
        "source_width_mm": round(src_width_pt * PT_TO_MM, 2),
        "source_height_mm": round(src_height_pt * PT_TO_MM, 2),
        "output_width_mm": round(src_width_pt * scale_x * PT_TO_MM, 2),
        "output_height_mm": round(src_height_pt * scale_y * PT_TO_MM, 2),
        "page_count": total_pages,
        "scale_x": scale_x,
        "scale_y": scale_y,
        "file_size_bytes": file_size_bytes,
        "original_size_bytes": original_size_bytes,
        "compression_ratio": compression_ratio,
        "method": "legacy_show_pdf_page",
    }
