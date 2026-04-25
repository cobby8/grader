"""
Python 엔진 CLI 엔트리포인트

Tauri(Rust)에서 subprocess로 호출하기 위한 CLI 인터페이스.
모든 명령의 결과는 JSON 형식으로 stdout에 출력된다.

사용법:
  python main.py get_pdf_info "C:/path/to/file.pdf"
  python main.py verify_cmyk "C:/path/to/file.pdf"
  python main.py generate_preview "C:/path/to/file.pdf" "C:/path/to/preview.png" [dpi]
  python main.py calc_scale "C:/path/to/preset.json" "L" "XL"
  python main.py generate_graded "C:/src.pdf" "C:/out.pdf" 1.05 1.08
  python main.py parse_order "C:/path/to/order.xlsx"
  python main.py --help
"""

import sys
import json
import io

# Windows 콘솔(cp949)에서도 한글이 깨지지 않도록 stdout을 UTF-8로 재설정
# Tauri에서 subprocess로 실행할 때도 이 설정이 적용됨
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

from pdf_handler import (
    get_pdf_info,
    verify_cmyk,
    generate_preview,
    analyze_color_space_detailed,
    detect_artboard,
)
from pattern_scaler import calculate_scale_factor
from pdf_grader import generate_graded_pdf, generate_graded_pdf_by_pieces
from order_parser import parse_order_excel
from svg_parser import get_svg_bounding_box, normalize_svg_artboard, extract_svg_paths_for_clipping, extract_piece_bboxes
from pattern_scaler import calculate_piece_scale_factors
# SVG 일괄 표준화 모듈 (Phase 1-3 신규)
# - measure_svg_bboxes: 디버깅용 path별 bbox 측정
# - preview_normalization: 변환 시뮬레이션 (파일 미수정)
# - normalize_batch: 폴더 일괄 변환 (파일 수정 + 백업)
from svg_normalizer import (
    measure_svg_bboxes,
    preview_normalization,
    normalize_batch,
)
# AI → SVG 자동 변환 모듈 (Phase 1-A 신규, PyMuPDF 단독)
# - preview_ai_conversion: 헤더 검사로 변환 가능 여부 분류 (파일 미수정)
# - convert_ai_batch: PDF 호환 AI를 SVG로 일괄 변환 (atomic write + .bak 백업)
from ai_converter import (
    preview_ai_conversion,
    convert_ai_batch,
)


def print_json(data: dict) -> None:
    """결과를 JSON으로 stdout에 출력한다. Rust에서 이 출력을 파싱한다."""
    print(json.dumps(data, ensure_ascii=False))


def print_error(message: str) -> None:
    """에러를 JSON 형식으로 출력한다."""
    print_json({"success": False, "error": message})


def _expand_ai_files(arg: str) -> list[str]:
    """
    AI 파일 인자를 절대 경로 리스트로 확장한다 (AI→SVG 변환 CLI 전용).

    입력 형태:
    - 폴더 경로 → 폴더 내 .ai/.AI 파일 수집(비재귀)
    - ';' 구분자 포함 → split하여 각 파일 절대 경로화
    - 단일 파일 경로 → [그 파일] 반환

    존재하지 않는 파일은 조용히 제외 (한 줄 JSON 원칙).
    .ai 확장자 대소문자 무시(.AI도 인식).

    Args:
        arg: CLI 1번째 인자 (폴더/세미콜론 구분 파일 목록/단일 파일)

    Returns:
        절대 경로 리스트 (존재하는 파일만)
    """
    import os as _os_ai
    result: list[str] = []

    # 1. 폴더 경로면 → 폴더 내 .ai 파일 수집 (비재귀)
    if _os_ai.path.isdir(arg):
        try:
            for name in sorted(_os_ai.listdir(arg)):
                # 확장자 대소문자 무시 (.ai / .AI 모두 인식)
                if name.lower().endswith(".ai"):
                    full = _os_ai.path.join(arg, name)
                    if _os_ai.path.isfile(full):
                        result.append(_os_ai.path.abspath(full))
        except OSError:
            # 폴더 읽기 실패는 빈 리스트 반환 (배치 안전)
            return []
        return result

    # 2. ';' 구분자가 있으면 → split (Windows 경로 ',' 충돌 회피)
    if ";" in arg:
        for piece in arg.split(";"):
            piece = piece.strip()
            if not piece:
                continue
            # 존재 여부 체크 후 절대 경로화 (없는 파일 조용히 제외)
            if _os_ai.path.isfile(piece):
                result.append(_os_ai.path.abspath(piece))
        return result

    # 3. 단일 파일 경로
    if _os_ai.path.isfile(arg):
        result.append(_os_ai.path.abspath(arg))
    # 존재하지 않으면 빈 리스트 반환 (한 줄 JSON 원칙 — 경고 출력 안 함)
    return result


def show_help() -> None:
    """도움말을 표시한다."""
    help_text = {
        "success": True,
        "type": "help",
        "commands": {
            "get_pdf_info <pdf_path>": "PDF 파일의 기본 정보를 추출합니다 (페이지 수, 크기, 색상 공간 등)",
            "verify_cmyk <pdf_path>": "PDF의 색상 공간이 CMYK인지 검증합니다",
            "analyze_color <pdf_path>": "PDF의 색상 공간을 페이지별/객체별로 상세 분석합니다 (벡터+이미지+ICC)",
            "generate_preview <pdf_path> <output_path> [dpi]": "PDF 첫 페이지를 PNG 미리보기로 변환합니다 (기본 150dpi)",
            "calc_scale <preset_json_path> <base_size> <target_size>": "프리셋 JSON 파일에서 기준/타겟 사이즈 비율을 계산합니다",
            "detect_artboard <pdf_path>": "PDF의 아트보드(TrimBox/CropBox) 크기를 감지합니다 (Illustrator 등)",
            "generate_graded <src_pdf> <out_pdf> <scale_x> <scale_y> [crop_w_pt] [crop_h_pt]": "원본 PDF를 스케일링하여 새 PDF 생성 (아트보드 크롭 + CMYK 보존)",
            "extract_clip_paths <svg_path>": "SVG 파일에서 PDF 클리핑용 경로를 추출합니다 (디버깅용)",
            "parse_order <excel_path>": "엑셀 주문서에서 사이즈 목록과 수량을 자동 추출합니다 (xlsx)",
            "svg_bbox <svg_path>": "SVG 파일 내 실제 도형의 bounding box를 계산합니다 (viewBox가 아닌 실제 크기)",
            "normalize_artboard <svg_path> <target_w_mm> <target_h_mm>": "SVG 아트보드(viewBox)를 목표 크기(mm)로 보정합니다 (패턴 좌표 유지, 중앙 배치)",
            "extract_piece_bboxes <svg_path>": "SVG에서 각 도형의 개별 bounding box를 추출합니다 (조각별 그레이딩용)",
            "generate_by_pieces <src_pdf> <out_pdf> <base_svg> <target_svg>": "조각별 채워넣기 방식으로 그레이딩 PDF 생성 (CMYK 보존)",
            "measure_svg <svg_path>": "[SVG 표준화] 모든 path의 bbox를 측정합니다 (디버깅용)",
            "preview_normalize <folder_or_files> <base_file>": "[SVG 표준화] 변환 시뮬레이션 (파일 미수정). 첫 인자가 폴더면 내부 SVG 모두 수집, 파일이면 ';' 구분 가능",
            "normalize_batch <folder> <base_file> [--no-backup]": "[SVG 표준화] 폴더 내 SVG 일괄 변환. 기본 백업(.bak) 생성, --no-backup 시 백업 생략",
            "ai_convert_preview <file_or_files>": "[AI→SVG] 변환 시뮬레이션 (파일 미수정). ; 구분자로 다중 파일 또는 폴더 경로 가능",
            "ai_convert_batch <file_or_files> [--overwrite]": "[AI→SVG] AI 일괄 변환. 기본은 기존 SVG 유지, --overwrite 시 .bak 백업 후 덮어쓰기",
        },
        "examples": [
            'python main.py get_pdf_info "C:/designs/front.pdf"',
            'python main.py verify_cmyk "C:/designs/front.pdf"',
            'python main.py analyze_color "C:/designs/front.pdf"',
            'python main.py generate_preview "C:/designs/front.pdf" "C:/temp/preview.png" 150',
            'python main.py calc_scale "C:/temp/preset.json" "L" "XL"',
            'python main.py detect_artboard "C:/designs/front.pdf"',
            'python main.py generate_graded "C:/src.pdf" "C:/out.pdf" 1.05 1.08',
            'python main.py generate_graded "C:/src.pdf" "C:/out.pdf" 1.05 1.08 595.28 841.89',
            'python main.py generate_graded "C:/src.pdf" "C:/out.pdf" 1.05 1.08 595.28 841.89 "C:/pattern_XS.svg" 3.0',
            'python main.py extract_clip_paths "C:/patterns/front_XS.svg"',
            'python main.py parse_order "C:/orders/order.xlsx"',
            'python main.py svg_bbox "C:/patterns/front_L.svg"',
            'python main.py normalize_artboard "C:/patterns/front_L.svg" 1580 2000',
            'python main.py extract_piece_bboxes "C:/patterns/front_XL.svg"',
            'python main.py generate_by_pieces "C:/src.pdf" "C:/out.pdf" "C:/base_XL.svg" "C:/target_XS.svg"',
            'python main.py measure_svg "C:/patterns/U넥_L.svg"',
            'python main.py preview_normalize "C:/patterns/" "C:/patterns/U넥_2XL.svg"',
            'python main.py normalize_batch "C:/patterns/" "C:/patterns/U넥_2XL.svg"',
            'python main.py normalize_batch "C:/patterns/" "C:/patterns/U넥_2XL.svg" --no-backup',
            'python main.py ai_convert_preview "G:/공유 드라이브/디자인/00. 2026 커스텀용 패턴 SVG/U넥/스탠다드/"',
            'python main.py ai_convert_preview "C:/temp/XL.ai;C:/temp/2XL.ai"',
            'python main.py ai_convert_batch "C:/temp/" --overwrite',
        ],
    }
    print_json(help_text)


def main() -> None:
    """CLI 메인 함수. 인자를 파싱하여 적절한 함수를 호출한다."""
    args = sys.argv[1:]

    # 인자가 없거나 --help이면 도움말 표시
    if not args or args[0] in ("--help", "-h", "help"):
        show_help()
        return

    command = args[0]

    try:
        if command == "get_pdf_info":
            # PDF 정보 추출
            if len(args) < 2:
                print_error("PDF 파일 경로가 필요합니다. 예: python main.py get_pdf_info file.pdf")
                sys.exit(1)
            result = get_pdf_info(args[1])
            print_json(result)

        elif command == "verify_cmyk":
            # CMYK 검증 (기본 - 호환성 유지)
            if len(args) < 2:
                print_error("PDF 파일 경로가 필요합니다. 예: python main.py verify_cmyk file.pdf")
                sys.exit(1)
            result = verify_cmyk(args[1])
            print_json(result)

        elif command == "analyze_color":
            # 5단계 신규: 색상 공간 상세 분석
            # 페이지별 벡터 연산자 + 이미지 색상 공간 + ICC 프로파일 감지
            if len(args) < 2:
                print_error("PDF 파일 경로가 필요합니다. 예: python main.py analyze_color file.pdf")
                sys.exit(1)
            result = analyze_color_space_detailed(args[1])
            print_json(result)

        elif command == "generate_preview":
            # 미리보기 생성
            if len(args) < 3:
                print_error("PDF 경로와 출력 경로가 필요합니다. 예: python main.py generate_preview input.pdf output.png")
                sys.exit(1)
            # DPI는 선택적 (기본 150)
            dpi = int(args[3]) if len(args) >= 4 else 150
            result = generate_preview(args[1], args[2], dpi)
            print_json(result)

        elif command == "calc_scale":
            # 프리셋 JSON 파일에서 기준/타겟 사이즈 비율 계산
            # 사용: calc_scale <preset_json_path> <base_size> <target_size>
            if len(args) < 4:
                print_error(
                    "인자가 부족합니다. 예: python main.py calc_scale preset.json L XL"
                )
                sys.exit(1)
            preset_path = args[1]
            base_size = args[2]
            target_size = args[3]

            import os as _os
            if not _os.path.exists(preset_path):
                print_error(f"프리셋 JSON 파일을 찾을 수 없습니다: {preset_path}")
                sys.exit(1)

            # JSON 파일 읽기 (UTF-8)
            with open(preset_path, "r", encoding="utf-8") as f:
                preset_data = json.load(f)

            result = calculate_scale_factor(preset_data, base_size, target_size)
            print_json(result)
            if not result.get("success"):
                sys.exit(1)

        elif command == "parse_order":
            # 엑셀 주문서에서 사이즈/수량 자동 추출
            if len(args) < 2:
                print_error("엑셀 파일 경로가 필요합니다. 예: python main.py parse_order order.xlsx")
                sys.exit(1)
            import os as _os2
            if not _os2.path.exists(args[1]):
                print_error(f"엑셀 파일을 찾을 수 없습니다: {args[1]}")
                sys.exit(1)
            result = parse_order_excel(args[1])
            print_json(result)
            if not result.get("success"):
                sys.exit(1)

        elif command == "svg_bbox":
            # SVG 파일 내 실제 도형의 bounding box 계산
            # viewBox(아트보드)가 아닌, polyline 등 도형의 실제 크기를 추출
            if len(args) < 2:
                print_error("SVG 파일 경로가 필요합니다. 예: python main.py svg_bbox pattern.svg")
                sys.exit(1)
            import os as _os3
            if not _os3.path.exists(args[1]):
                print_error(f"SVG 파일을 찾을 수 없습니다: {args[1]}")
                sys.exit(1)
            result = get_svg_bounding_box(args[1])
            print_json(result)
            if not result.get("success"):
                sys.exit(1)

        elif command == "normalize_artboard":
            # SVG 아트보드(viewBox)를 목표 크기(mm)로 보정
            # 패턴 도형의 좌표는 변경하지 않고, 아트보드만 확장하여 중앙 배치
            if len(args) < 4:
                print_error(
                    "인자가 부족합니다. 예: python main.py normalize_artboard pattern.svg 1580 2000"
                )
                sys.exit(1)
            svg_path = args[1]
            try:
                target_w = float(args[2])
                target_h = float(args[3])
            except ValueError:
                print_error("목표 크기는 숫자(mm)여야 합니다.")
                sys.exit(1)
            import os as _os4
            if not _os4.path.exists(svg_path):
                print_error(f"SVG 파일을 찾을 수 없습니다: {svg_path}")
                sys.exit(1)
            result = normalize_svg_artboard(svg_path, target_w, target_h)
            print_json(result)
            if not result.get("success"):
                sys.exit(1)

        elif command == "detect_artboard":
            # PDF의 아트보드(TrimBox/CropBox) 크기를 감지
            if len(args) < 2:
                print_error("PDF 파일 경로가 필요합니다. 예: python main.py detect_artboard file.pdf")
                sys.exit(1)
            result = detect_artboard(args[1])
            print_json(result)

        elif command == "generate_graded":
            # 원본 PDF를 주어진 비율로 확대/축소하여 새 PDF 생성 (CTM 직접 삽입)
            # 사용: generate_graded <src_pdf> <out_pdf> <scale_x> <scale_y> [crop_w_pt] [crop_h_pt]
            if len(args) < 5:
                print_error(
                    "인자가 부족합니다. 예: python main.py generate_graded src.pdf out.pdf 1.05 1.08"
                )
                sys.exit(1)
            src_pdf = args[1]
            out_pdf = args[2]
            try:
                scale_x = float(args[3])
                scale_y = float(args[4])
            except ValueError:
                print_error("스케일 값은 실수(숫자)여야 합니다.")
                sys.exit(1)

            # crop 파라미터는 선택적 (하위 호환: 없으면 크롭 없이 전체 스케일링)
            crop_w_pt = None
            crop_h_pt = None
            if len(args) >= 7:
                try:
                    crop_w_pt = float(args[5])
                    crop_h_pt = float(args[6])
                except ValueError:
                    print_error("크롭 크기는 실수(숫자, pt 단위)여야 합니다.")
                    sys.exit(1)

            result = generate_graded_pdf(
                src_pdf, out_pdf, scale_x, scale_y,
                crop_width_pt=crop_w_pt, crop_height_pt=crop_h_pt,
            )
            print_json(result)
            if not result.get("success"):
                sys.exit(1)

        elif command == "extract_clip_paths":
            # SVG 파일에서 PDF 클리핑용 경로를 추출 (디버깅/테스트용)
            if len(args) < 2:
                print_error("SVG 파일 경로가 필요합니다. 예: python main.py extract_clip_paths pattern.svg")
                sys.exit(1)
            import os as _os_clip2
            if not _os_clip2.path.exists(args[1]):
                print_error(f"SVG 파일을 찾을 수 없습니다: {args[1]}")
                sys.exit(1)
            result = extract_svg_paths_for_clipping(args[1])
            print_json(result)
            if not result.get("success"):
                sys.exit(1)

        elif command == "extract_piece_bboxes":
            # SVG에서 각 도형의 개별 bounding box 추출 (조각별 그레이딩용)
            if len(args) < 2:
                print_error("SVG 파일 경로가 필요합니다. 예: python main.py extract_piece_bboxes pattern.svg")
                sys.exit(1)
            import os as _os_piece
            if not _os_piece.path.exists(args[1]):
                print_error(f"SVG 파일을 찾을 수 없습니다: {args[1]}")
                sys.exit(1)
            result = extract_piece_bboxes(args[1])
            print_json(result)
            if not result.get("success"):
                sys.exit(1)

        elif command == "generate_by_pieces":
            # 조각별 채워넣기 방식으로 그레이딩 PDF 생성
            # 사용: generate_by_pieces <src_pdf> <out_pdf> <base_svg> <target_svg>
            if len(args) < 5:
                print_error(
                    "인자가 부족합니다. 예: python main.py generate_by_pieces src.pdf out.pdf base.svg target.svg"
                )
                sys.exit(1)
            src_pdf = args[1]
            out_pdf = args[2]
            base_svg = args[3]
            target_svg = args[4]

            import os as _os_pieces
            if not _os_pieces.path.exists(src_pdf):
                print_error(f"원본 PDF를 찾을 수 없습니다: {src_pdf}")
                sys.exit(1)
            if not _os_pieces.path.exists(base_svg):
                print_error(f"기준 SVG를 찾을 수 없습니다: {base_svg}")
                sys.exit(1)
            if not _os_pieces.path.exists(target_svg):
                print_error(f"타겟 SVG를 찾을 수 없습니다: {target_svg}")
                sys.exit(1)

            result = generate_graded_pdf_by_pieces(
                src_pdf, out_pdf, base_svg, target_svg
            )
            print_json(result)
            if not result.get("success"):
                sys.exit(1)

        elif command == "measure_svg":
            # [SVG 표준화] 단일 SVG의 모든 path bbox를 측정 (디버깅용)
            # 사용: measure_svg <svg_path>
            if len(args) < 2:
                print_error("SVG 파일 경로가 필요합니다. 예: python main.py measure_svg pattern.svg")
                sys.exit(1)
            import os as _os_meas
            if not _os_meas.path.exists(args[1]):
                print_error(f"SVG 파일을 찾을 수 없습니다: {args[1]}")
                sys.exit(1)
            result = measure_svg_bboxes(args[1])
            print_json(result)
            if not result.get("success"):
                sys.exit(1)

        elif command == "preview_normalize":
            # [SVG 표준화] 변환 시뮬레이션 (파일 미수정)
            # 사용: preview_normalize <folder_or_files> <base_file>
            # 첫 인자가 디렉터리면 내부 .svg를 자동 수집 (.bak 제외, base 파일 제외)
            # 첫 인자가 파일이면 그 파일만 (또는 ';' 로 구분된 다중 파일)
            if len(args) < 3:
                print_error(
                    "인자가 부족합니다. 예: python main.py preview_normalize folder base.svg"
                )
                sys.exit(1)
            target_arg = args[1]
            base_file = args[2]

            import os as _os_prev
            # 입력 분기: 폴더 vs 파일(들)
            target_files: list[str] = []
            if _os_prev.path.isdir(target_arg):
                # 폴더이면 내부 .svg 수집 (.bak 제외)
                try:
                    files_in_folder = _os_prev.listdir(target_arg)
                except OSError as e:
                    print_error(f"폴더 읽기 실패: {e}")
                    sys.exit(1)
                # base 파일과 동일한 경로는 제외
                base_norm = _os_prev.path.normcase(_os_prev.path.abspath(base_file))
                for f in sorted(files_in_folder):
                    if not f.lower().endswith(".svg"):
                        continue
                    if f.lower().endswith(".bak"):
                        continue
                    full = _os_prev.path.join(target_arg, f)
                    if _os_prev.path.normcase(_os_prev.path.abspath(full)) == base_norm:
                        continue
                    target_files.append(full)
            else:
                # 파일 또는 ';' 로 구분된 파일 목록
                # (Windows 경로에 콤마가 들어갈 수 있어 ';' 채택)
                for piece in target_arg.split(";"):
                    piece = piece.strip()
                    if not piece:
                        continue
                    if not _os_prev.path.exists(piece):
                        print_error(f"SVG 파일을 찾을 수 없습니다: {piece}")
                        sys.exit(1)
                    target_files.append(piece)

            if not target_files:
                print_error("시뮬레이션 대상 SVG 파일이 없습니다.")
                sys.exit(1)

            result = preview_normalization(target_files, base_file_path=base_file)
            print_json(result)
            if not result.get("success"):
                sys.exit(1)

        elif command == "normalize_batch":
            # [SVG 표준화] 폴더 내 SVG 일괄 변환 (파일 수정 + 백업)
            # 사용: normalize_batch <folder> <base_file> [--no-backup]
            if len(args) < 3:
                print_error(
                    "인자가 부족합니다. 예: python main.py normalize_batch folder base.svg [--no-backup]"
                )
                sys.exit(1)
            folder_path = args[1]
            base_file = args[2]
            # 옵션 파싱: --no-backup 플래그 (위치 무관, 4번째 인자에 자주 옴)
            backup = True
            for opt in args[3:]:
                if opt == "--no-backup":
                    backup = False
                else:
                    print_error(f"알 수 없는 옵션: {opt} (지원: --no-backup)")
                    sys.exit(1)

            import os as _os_batch
            if not _os_batch.path.isdir(folder_path):
                print_error(f"폴더를 찾을 수 없습니다: {folder_path}")
                sys.exit(1)
            if not _os_batch.path.exists(base_file):
                print_error(f"기준 SVG 파일을 찾을 수 없습니다: {base_file}")
                sys.exit(1)

            result = normalize_batch(folder_path, base_file_path=base_file, backup=backup)
            print_json(result)
            if not result.get("success"):
                sys.exit(1)

        elif command == "ai_convert_preview":
            # [AI→SVG] 변환 시뮬레이션 (파일 미수정)
            # 사용: ai_convert_preview <file_or_files_or_folder>
            # - 폴더 경로면 내부 .ai 파일 수집(비재귀)
            # - ';' 구분자로 다중 파일 가능
            # - 단일 파일도 OK
            # - 존재하지 않는 파일은 조용히 제외 (한 줄 JSON 원칙 준수)
            if len(args) < 2:
                print_error(
                    "인자가 부족합니다. 예: python main.py ai_convert_preview 'file1.ai;file2.ai' (또는 폴더 경로)"
                )
                sys.exit(1)
            files = _expand_ai_files(args[1])
            result = preview_ai_conversion(files)
            print_json(result)
            if not result.get("success"):
                sys.exit(1)

        elif command == "ai_convert_batch":
            # [AI→SVG] 일괄 변환 (실제 파일 생성)
            # 사용: ai_convert_batch <file_or_files_or_folder> [--overwrite]
            # - 기본: 기존 SVG가 있으면 skip
            # - --overwrite: .bak 백업 후 덮어쓰기
            if len(args) < 2:
                print_error(
                    "인자가 부족합니다. 예: python main.py ai_convert_batch 'folder_or_files' [--overwrite]"
                )
                sys.exit(1)
            files = _expand_ai_files(args[1])
            # 옵션 파싱: --overwrite 플래그 (위치 무관)
            overwrite = False
            for opt in args[2:]:
                if opt == "--overwrite":
                    overwrite = True
                else:
                    print_error(f"알 수 없는 옵션: {opt} (지원: --overwrite)")
                    sys.exit(1)
            result = convert_ai_batch(files, overwrite=overwrite)
            print_json(result)
            if not result.get("success"):
                sys.exit(1)

        else:
            print_error(f"알 수 없는 명령입니다: {command}. --help로 사용법을 확인하세요.")
            sys.exit(1)

    except FileNotFoundError as e:
        print_error(str(e))
        sys.exit(1)
    except Exception as e:
        print_error(f"처리 중 오류 발생: {type(e).__name__}: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
