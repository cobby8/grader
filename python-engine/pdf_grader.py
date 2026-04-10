"""
PDF 그레이딩 모듈

기준 사이즈 PDF를 타겟 사이즈의 스케일 비율에 맞게 확대/축소하여
새로운 PDF 파일을 생성한다. CMYK 색상 공간을 보존하는 것이 핵심.

MVP 구현 전략:
  1. PyMuPDF(fitz)로 원본 PDF를 열어 첫 페이지 크기를 얻는다.
  2. scale_x, scale_y를 적용한 새 페이지 크기를 계산한다.
  3. 빈 PDF 문서(pdf_out)에 새 크기의 빈 페이지를 만든다.
  4. show_pdf_page()로 원본 페이지를 새 페이지의 전체 영역에 그려넣는다.
     -> PyMuPDF의 show_pdf_page는 원본 콘텐츠 스트림을 그대로 복사하므로
        벡터 오브젝트의 CMYK 색상 공간이 변환 없이 유지된다.
  5. 결과를 PDF로 저장한다.

주의사항:
  - PyMuPDF는 /DeviceCMYK, ICCBased CMYK 프로파일 모두 보존한다.
  - 이미지 리소스도 원본 색상 공간(DeviceCMYK, DeviceN 등) 그대로 유지됨.
  - 래스터화(픽셀 이미지로 변환)는 절대 하지 않는다 -> 인쇄 품질 저하 방지.
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
) -> dict[str, Any]:
    """
    원본 PDF를 주어진 스케일 비율에 맞춰 확대/축소한 새 PDF를 생성한다.

    Args:
      source_pdf_path: 원본 기준 사이즈 디자인 PDF 경로
      output_pdf_path: 출력할 그레이딩 PDF 경로
      scale_x: 가로 스케일 비율 (1.0 = 원본 유지)
      scale_y: 세로 스케일 비율

    Returns:
      {
        "success": True,
        "output_path": "C:/.../XL.pdf",
        "source_width_mm": 420.0,
        "source_height_mm": 594.0,
        "output_width_mm": 441.0,
        "output_height_mm": 641.5,
        "page_count": 1,
        "scale_x": 1.05,
        "scale_y": 1.08
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

    # 4. 원본 PDF 열기
    src_doc = fitz.open(source_pdf_path)
    # 빈 출력 문서 생성 (나중에 save로 저장)
    out_doc = fitz.open()

    # 원본 첫 페이지 크기 (포인트 단위)
    first_page = src_doc[0]
    src_rect = first_page.rect
    src_width_pt = src_rect.width
    src_height_pt = src_rect.height

    # 5. 모든 페이지를 스케일된 크기로 복사
    # 대부분 디자인 PDF는 1페이지지만 다중 페이지도 안전 처리
    for page_num in range(len(src_doc)):
        src_page = src_doc[page_num]
        page_rect = src_page.rect

        # 타겟 페이지 크기 = 원본 크기 × 스케일 비율
        target_width_pt = page_rect.width * scale_x
        target_height_pt = page_rect.height * scale_y

        # 출력 문서에 같은 비율로 확대된 새 페이지 생성
        new_page = out_doc.new_page(
            width=target_width_pt,
            height=target_height_pt,
        )

        # show_pdf_page()로 원본 페이지를 새 페이지의 전체 영역에 "확대 배치"
        # - 내부적으로 XObject 폼으로 원본을 재사용 (벡터/CMYK/폰트 그대로 유지)
        # - target rect가 원본보다 크면 자동으로 확대, 작으면 축소됨
        target_rect = fitz.Rect(0, 0, target_width_pt, target_height_pt)
        new_page.show_pdf_page(
            target_rect,         # 그릴 영역 (전체 새 페이지)
            src_doc,             # 원본 문서
            page_num,            # 원본 페이지 번호
            keep_proportion=False,  # 비율 무시 (x/y 독립 스케일을 정확히 적용)
        )

    # 저장 전에 페이지 수를 지역 변수로 저장 (close 이후 len() 사용 불가 방지)
    total_pages = len(out_doc)

    # 6. PDF 저장
    # deflate=True: 스트림 압축 / garbage=4: 미사용 객체 정리 / clean=True: 콘텐츠 정규화
    # 이 옵션들은 구조만 최적화하며 색상 공간은 변환하지 않는다.
    out_doc.save(
        output_pdf_path,
        deflate=True,
        garbage=4,
        clean=True,
    )

    # 출력 후 문서 닫기
    out_doc.close()
    src_doc.close()

    # 7. 결과 반환 (mm 단위로도 표기)
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
    }
