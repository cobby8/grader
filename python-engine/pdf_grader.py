"""
PDF 그레이딩 모듈

기준 사이즈 PDF를 타겟 사이즈의 스케일 비율에 맞게 확대/축소하여
새로운 PDF 파일을 생성한다. CMYK 색상 공간을 보존하는 것이 핵심.

구현 방식 (v3 - 새 문서 + show_pdf_page clip):
  1. 원본 PDF를 열고, 새 빈 문서를 생성한다.
  2. 아트보드 영역을 결정한다 (TrimBox 우선, 없으면 crop 파라미터 사용).
  3. show_pdf_page의 clip 파라미터로 아트보드만 클리핑하여 새 페이지에 복사한다.
  4. target rect 크기를 스케일된 크기로 지정하면 자동 스케일링된다.

v2(CTM 직접 삽입) 대비 개선점:
  - CropBox/MediaBox 순서 문제 완전 해소 (새 문서라 충돌 없음)
  - CTM 스트림 삽입 불필요 (show_pdf_page가 자동 스케일)
  - 축소 사이즈에서 "CropBox not in MediaBox" 에러 발생하지 않음
  - 원본과 동일 출력 버그 해결 (새 문서에 확실히 반영)

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
    새 문서 + show_pdf_page clip 방식으로 PDF를 스케일링한다.

    왜 이 방식인가:
      이전 CTM 직접 삽입 방식은 두 가지 버그가 있었다:
      1) 축소 사이즈에서 "CropBox not in MediaBox" ValueError 발생
         - set_mediabox(축소된 크기) 호출 시 기존 CropBox보다 작아서 에러
      2) 출력 파일이 원본과 거의 동일 (스케일 미적용)
         - update_stream이 첫 xref만 교체하고 나머지는 원본 유지

      새 문서 방식은 이 두 문제를 근본적으로 해결한다:
      - 빈 문서에 새 페이지를 만드므로 CropBox/MediaBox 충돌 없음
      - show_pdf_page가 clip 영역을 target rect로 확실히 스케일링

    Args:
      source_pdf_path: 원본 기준 사이즈 디자인 PDF 경로
      output_pdf_path: 출력할 그레이딩 PDF 경로
      scale_x: 가로 스케일 비율 (1.0 = 원본 유지)
      scale_y: 세로 스케일 비율
      crop_width_pt: (선택) 아트보드 가로 크기 pt. 지정 시 clip으로 크롭.
      crop_height_pt: (선택) 아트보드 세로 크기 pt. 지정 시 clip으로 크롭.

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
        "method": "clip"  (사용된 방식 표시)
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

    # 4. 원본 PDF 열기 + 새 빈 문서 생성
    # 원본은 읽기 전용으로 사용하고, 결과는 새 문서에 담는다 (원본 보호)
    src_doc = fitz.open(source_pdf_path)
    out_doc = fitz.open()  # 새 빈 문서

    # 원본 첫 페이지 크기 기록 (반환값용)
    first_page = src_doc[0]
    original_rect = first_page.rect

    for page_num in range(len(src_doc)):
        src_page = src_doc[page_num]

        # Step 1: 아트보드(클리핑) 영역 결정
        # crop 파라미터가 주어지면 아트보드 영역만 클리핑한다.
        # Illustrator PDF: TrimBox = 아트보드, MediaBox = 아트보드 + 밖 요소
        if crop_width_pt and crop_height_pt:
            trimbox = src_page.trimbox
            mediabox = src_page.mediabox

            if trimbox != mediabox:
                # TrimBox가 별도로 존재 → Illustrator 아트보드 (가장 정확)
                artboard = trimbox
            else:
                # TrimBox 없음 → 지정된 crop 크기로 좌상단 기준 크롭
                artboard = fitz.Rect(
                    mediabox.x0,
                    mediabox.y0,
                    mediabox.x0 + crop_width_pt,
                    mediabox.y0 + crop_height_pt,
                )
        else:
            # crop 미지정 → 페이지 전체를 아트보드로 사용
            artboard = src_page.rect

        # Step 2: 스케일 후 새 페이지 크기 계산
        new_w = artboard.width * scale_x
        new_h = artboard.height * scale_y

        # Step 3: 새 페이지 생성 + show_pdf_page로 클리핑 복사
        # show_pdf_page의 clip 파라미터가 핵심:
        #   - clip=artboard → 아트보드 영역만 잘라서 가져옴 (밖 요소 제거)
        #   - target rect(0,0,new_w,new_h) → 자동으로 스케일링됨
        #   - keep_proportion=False → 가로/세로 독립 스케일 허용
        # CMYK 색상 공간, 이미지, 폰트 등 모든 리소스가 그대로 보존된다.
        new_page = out_doc.new_page(width=new_w, height=new_h)

        new_page.show_pdf_page(
            fitz.Rect(0, 0, new_w, new_h),  # target: 새 페이지 전체
            src_doc,                          # source: 원본 문서
            page_num,                         # 원본 페이지 번호
            clip=artboard,                    # 아트보드 영역만 클리핑
            keep_proportion=False,            # 가로/세로 독립 스케일
        )

    # 저장 전에 페이지 수를 지역 변수로 저장 (close 이후 사용 불가 방지)
    total_pages = len(out_doc)

    # 크롭 후 첫 페이지의 기준 크기 (반환값용)
    if crop_width_pt and crop_height_pt:
        # 아트보드 크기를 정확히 계산 (TrimBox or crop 파라미터 기반)
        first_src = src_doc[0]
        trimbox = first_src.trimbox
        mediabox = first_src.mediabox
        if trimbox != mediabox:
            src_width_pt = trimbox.width
            src_height_pt = trimbox.height
        else:
            src_width_pt = crop_width_pt
            src_height_pt = crop_height_pt
    else:
        src_width_pt = original_rect.width
        src_height_pt = original_rect.height

    # 5. PDF 저장 (출력 최적화 설정)
    # clean=True 사용 가능 (CTM 수동 삽입이 아니므로 안전)
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
        # PyMuPDF 구버전은 deflate_images/deflate_fonts를 지원하지 않을 수 있다.
        out_doc.save(
            output_pdf_path,
            deflate=True,
            garbage=4,
            clean=True,
        )

    out_doc.close()
    src_doc.close()

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
        "method": "clip",
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
