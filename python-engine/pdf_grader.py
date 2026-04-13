"""
PDF 그레이딩 모듈

기준 사이즈 PDF를 타겟 사이즈의 스케일 비율에 맞게 확대/축소하여
새로운 PDF 파일을 생성한다. CMYK 색상 공간을 보존하는 것이 핵심.

구현 방식 (v3 - 새 문서 + show_pdf_page clip):
  1. 원본 PDF를 열고, 새 빈 문서를 생성한다.
  2. 아트보드 영역을 결정한다 (TrimBox 우선, 없으면 crop 파라미터 사용).
  3. show_pdf_page의 clip 파라미터로 아트보드만 클리핑하여 새 페이지에 복사한다.
  4. target rect 크기를 스케일된 크기로 지정하면 자동 스케일링된다.

v4 추가 — SVG 패턴 클리핑 마스크 + bleed:
  5. (선택) 타겟 사이즈 패턴 SVG에서 윤곽선을 추출한다.
  6. SVG 좌표를 PDF 페이지 좌표로 변환한다.
  7. 클리핑 경로를 콘텐츠 스트림 앞에 삽입한다 (PDF W 연산자).
  8. bleed(3mm)만큼 클리핑 경로를 확장하여 재단 여유를 둔다.

주의사항:
  - PyMuPDF는 /DeviceCMYK, ICCBased CMYK 프로파일 모두 보존한다.
  - 이미지 리소스도 원본 색상 공간(DeviceCMYK, DeviceN 등) 그대로 유지됨.
  - 래스터화(픽셀 이미지로 변환)는 절대 하지 않는다 → 인쇄 품질 저하 방지.
  - 클리핑은 색상에 영향 없음 (경로만 정의하므로 CMYK 100% 보존).
"""

import fitz  # PyMuPDF
import os
from typing import Any
from pattern_scaler import calculate_piece_scale_factors


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
    선택적으로 SVG 패턴 클리핑 마스크 + bleed를 적용한다.

    왜 이 방식인가:
      이전 CTM 직접 삽입 방식은 두 가지 버그가 있었다:
      1) 축소 사이즈에서 "CropBox not in MediaBox" ValueError 발생
      2) 출력 파일이 원본과 거의 동일 (스케일 미적용)
      새 문서 방식은 이 두 문제를 근본적으로 해결한다.

    클리핑 마스크 (v4 신규):
      clip_svg_path가 주어지면, 해당 SVG의 패턴 윤곽선을 PDF 클리핑 마스크로 적용한다.
      이렇게 하면 디자인이 패턴 형태로 잘린다 (사각형이 아니라 실제 옷 조각 모양).
      bleed_mm만큼 경로를 확장하여 재단 시 여유를 둔다.

    Args:
      source_pdf_path: 원본 기준 사이즈 디자인 PDF 경로
      output_pdf_path: 출력할 그레이딩 PDF 경로
      scale_x: 가로 스케일 비율 (1.0 = 원본 유지)
      scale_y: 세로 스케일 비율
      crop_width_pt: (선택) 아트보드 가로 크기 pt. 지정 시 clip으로 크롭.
      crop_height_pt: (선택) 아트보드 세로 크기 pt. 지정 시 clip으로 크롭.
      clip_svg_path: (선택) 타겟 사이즈 패턴 SVG 파일 경로. 클리핑 마스크에 사용.
      bleed_mm: 클리핑 경로 바깥 여유 (mm). 기본 3mm.

    Returns:
      {
        "success": True,
        "output_path": "...",
        "source_width_mm": ..., "source_height_mm": ...,
        "output_width_mm": ..., "output_height_mm": ...,
        "page_count": 1,
        "scale_x": ..., "scale_y": ...,
        "file_size_bytes": ..., "original_size_bytes": ...,
        "compression_ratio": ...,
        "method": "scale+clip"
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
    use_clean = True
    try:
        out_doc.save(
            output_pdf_path,
            deflate=True,
            deflate_images=True,
            deflate_fonts=True,
            garbage=4,
            clean=use_clean,
        )
    except TypeError:
        # PyMuPDF 구버전은 deflate_images/deflate_fonts를 지원하지 않을 수 있다.
        out_doc.save(
            output_pdf_path,
            deflate=True,
            garbage=4,
            clean=use_clean,
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
        "method": "scale+clip",
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


def generate_graded_pdf_by_pieces(
    source_pdf_path: str,
    output_pdf_path: str,
    base_svg_path: str,
    target_svg_path: str,
) -> dict[str, Any]:
    """
    조각별 채워넣기 방식으로 그레이딩 PDF를 생성한다.

    핵심 개념:
      기존 방식은 디자인 PDF 전체를 하나의 비율로 축소해서 약 4% 오차가 발생했다.
      새 방식은 각 패턴 조각(앞판/뒷판/칼라 등)마다 디자인의 해당 영역만 잘라내어
      타겟 크기로 정밀 배치한다.

    처리 순서:
      1. base/target SVG에서 조각별 bbox 추출 + 매칭
      2. SVG bbox를 PDF 좌표로 비율 매핑 (viewBox→PDF 변환)
      3. 출력 PDF 생성 (기준 PDF와 같은 페이지 크기 유지)
      4. 각 조각마다 show_pdf_page(clip=base_clip, target=target_rect) 호출
      5. 저장

    CMYK 보존: show_pdf_page 사용이므로 자동 보존된다.

    Args:
      source_pdf_path: 원본 기준 사이즈 디자인 PDF 경로
      output_pdf_path: 출력할 그레이딩 PDF 경로
      base_svg_path: 기준 사이즈(XL) 패턴 SVG 파일 경로
      target_svg_path: 타겟 사이즈(XS) 패턴 SVG 파일 경로

    Returns:
      성공: {
        "success": True, "output_path": "...",
        "source_width_mm": ..., "source_height_mm": ...,
        "output_width_mm": ..., "output_height_mm": ...,
        "piece_count": 3, "file_size_bytes": ..., ...
      }
      실패: {"success": False, "error": "..."}
    """
    # 1. 원본 PDF 존재 확인
    if not os.path.exists(source_pdf_path):
        raise FileNotFoundError(f"원본 PDF를 찾을 수 없습니다: {source_pdf_path}")

    # 2. 출력 디렉토리 자동 생성
    output_dir = os.path.dirname(output_pdf_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    # 3. 조각별 매칭 + 비율 계산
    piece_data = calculate_piece_scale_factors(base_svg_path, target_svg_path)
    if not piece_data.get("success"):
        return {
            "success": False,
            "error": piece_data.get("error", "조각별 매칭 실패"),
        }

    # 4. 원본 PDF 열기
    src_doc = fitz.open(source_pdf_path)
    src_page = src_doc[0]
    pdf_rect = src_page.rect  # 원본 PDF 페이지 크기 (pt)

    # 5. SVG → PDF 좌표 변환 함수
    # SVG와 PDF의 아트보드 크기가 다르므로 (SVG: 1530x1200mm, PDF: 1580x2000mm),
    # SVG 좌표를 PDF 좌표로 변환할 때 아트보드 비율을 반영해야 한다.
    # SVG 원본 viewBox(보정 전)에서 좌표의 "아트보드 내 상대 비율"을 구하고,
    # 그 비율을 PDF 크기에 적용한다.
    pdf_w = pdf_rect.width
    pdf_h = pdf_rect.height

    # SVG→PDF 좌표 변환: 아트보드 비율 매핑
    #
    # 핵심 원리:
    # - SVG 좌표는 pt 단위 (Illustrator SVG 기본)
    # - SVG 원본 viewBox = "0 0 W H" (보정 전)
    # - 디자인 PDF에서도 같은 Illustrator 좌표계를 사용
    # - 하지만 SVG 아트보드와 PDF 아트보드 크기가 다름
    # - SVG에서 좌표 x가 "아트보드의 30%"이면, PDF에서도 "아트보드의 30%"
    #
    # 따라서: SVG 좌표 / SVG_viewBox_크기 = PDF 좌표 / PDF_크기
    #         PDF_x = SVG_x * (PDF_w / SVG_vb_w)
    #         PDF_y = PDF_h - SVG_y * (PDF_h / SVG_vb_h)  [Y 반전]
    #
    # 원본 viewBox를 구하는 방법:
    # normalize_svg_artboard는 viewBox를 확장하지만 원본 크기를 보존하지 않음.
    # 그래서 도형 좌표의 전체 범위 + 마진으로 원본 viewBox를 역추정한다.
    # (모든 도형이 원본 viewBox 안에 있으므로, 전체 범위 ≈ 원본 viewBox)

    # 기준 SVG의 모든 조각에서 전체 좌표 범위 구하기
    all_max_x = max(pc["base_bbox"]["max_x"] for pc in piece_data["pieces"])
    all_max_y = max(pc["base_bbox"]["max_y"] for pc in piece_data["pieces"])

    # 원본 viewBox 추정: 도형 최대값에 약간의 여유 (보통 viewBox가 도형보다 약간 큼)
    # Illustrator SVG는 보통 아트보드 = viewBox이고, 도형이 아트보드 안에 있음
    svg_vb_w = all_max_x * 1.08  # 8% 마진 (아트보드가 도형보다 약간 큼)
    svg_vb_h = all_max_y * 1.07  # 7% 마진

    # SVG → PDF 스케일 비율 (아트보드 크기 비율)
    scale_x_ratio = pdf_w / svg_vb_w if svg_vb_w > 0 else 1.0
    scale_y_ratio = pdf_h / svg_vb_h if svg_vb_h > 0 else 1.0

    def svg_to_pdf_rect(svg_bbox: dict) -> fitz.Rect:
        """
        SVG bbox를 PDF Rect로 변환한다.
        SVG 좌표를 아트보드 비율로 스케일링 + Y축 반전.
        """
        # SVG 좌표를 PDF 크기에 비례하여 변환
        px0 = svg_bbox["min_x"] * scale_x_ratio
        px1 = svg_bbox["max_x"] * scale_x_ratio
        # Y축 반전: SVG는 위→아래, PDF는 아래→위
        py0 = pdf_h - (svg_bbox["max_y"] * scale_y_ratio)
        py1 = pdf_h - (svg_bbox["min_y"] * scale_y_ratio)
        return fitz.Rect(px0, py0, px1, py1)

    # 6. 출력 PDF 생성 — 기준 PDF와 같은 페이지 크기 유지
    # 이유: 공장에서 동일 아트보드 크기로 작업하는 것이 편하다.
    out_doc = fitz.open()
    out_page = out_doc.new_page(width=pdf_rect.width, height=pdf_rect.height)

    # 7. 각 조각마다 show_pdf_page 호출
    for piece in piece_data["pieces"]:
        # 기준 조각의 PDF clip 영역 (원본 디자인에서 잘라낼 부분)
        base_clip = svg_to_pdf_rect(piece["base_bbox"])

        # 타겟 조각의 PDF target 영역 (출력 PDF에서 배치할 위치)
        target_rect = svg_to_pdf_rect(piece["target_bbox"])

        # show_pdf_page: base_clip 영역을 target_rect 위치에 배치
        # keep_proportion=False → 가로/세로 독립 스케일 허용
        # clip → 원본에서 해당 조각 부분만 잘라냄
        out_page.show_pdf_page(
            target_rect,       # 출력 위치 및 크기
            src_doc,           # 원본 문서
            0,                 # 원본 첫 페이지
            clip=base_clip,    # 원본에서 잘라낼 영역
            keep_proportion=False,
        )

    # 8. PDF 저장 (최적화 설정)
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
        # PyMuPDF 구버전 호환
        out_doc.save(
            output_pdf_path,
            deflate=True,
            garbage=4,
            clean=True,
        )

    out_doc.close()
    src_doc.close()

    # 9. 파일 크기 측정
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

    # 10. 결과 반환
    return {
        "success": True,
        "output_path": output_pdf_path,
        "source_width_mm": round(pdf_rect.width * PT_TO_MM, 2),
        "source_height_mm": round(pdf_rect.height * PT_TO_MM, 2),
        "output_width_mm": round(pdf_rect.width * PT_TO_MM, 2),
        "output_height_mm": round(pdf_rect.height * PT_TO_MM, 2),
        "page_count": 1,
        "piece_count": piece_data["piece_count"],
        "file_size_bytes": file_size_bytes,
        "original_size_bytes": original_size_bytes,
        "compression_ratio": compression_ratio,
        "method": "piece_wise",
    }
