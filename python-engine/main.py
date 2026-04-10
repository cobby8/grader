"""
Python 엔진 CLI 엔트리포인트

Tauri(Rust)에서 subprocess로 호출하기 위한 CLI 인터페이스.
모든 명령의 결과는 JSON 형식으로 stdout에 출력된다.

사용법:
  python main.py get_pdf_info "C:/path/to/file.pdf"
  python main.py verify_cmyk "C:/path/to/file.pdf"
  python main.py generate_preview "C:/path/to/file.pdf" "C:/path/to/preview.png" [dpi]
  python main.py --help
"""

import sys
import json
import io

# Windows 콘솔(cp949)에서도 한글이 깨지지 않도록 stdout을 UTF-8로 재설정
# Tauri에서 subprocess로 실행할 때도 이 설정이 적용됨
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

from pdf_handler import get_pdf_info, verify_cmyk, generate_preview


def print_json(data: dict) -> None:
    """결과를 JSON으로 stdout에 출력한다. Rust에서 이 출력을 파싱한다."""
    print(json.dumps(data, ensure_ascii=False))


def print_error(message: str) -> None:
    """에러를 JSON 형식으로 출력한다."""
    print_json({"success": False, "error": message})


def show_help() -> None:
    """도움말을 표시한다."""
    help_text = {
        "success": True,
        "type": "help",
        "commands": {
            "get_pdf_info <pdf_path>": "PDF 파일의 기본 정보를 추출합니다 (페이지 수, 크기, 색상 공간 등)",
            "verify_cmyk <pdf_path>": "PDF의 색상 공간이 CMYK인지 검증합니다",
            "generate_preview <pdf_path> <output_path> [dpi]": "PDF 첫 페이지를 PNG 미리보기로 변환합니다 (기본 150dpi)",
        },
        "examples": [
            'python main.py get_pdf_info "C:/designs/front.pdf"',
            'python main.py verify_cmyk "C:/designs/front.pdf"',
            'python main.py generate_preview "C:/designs/front.pdf" "C:/temp/preview.png" 150',
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
            # CMYK 검증
            if len(args) < 2:
                print_error("PDF 파일 경로가 필요합니다. 예: python main.py verify_cmyk file.pdf")
                sys.exit(1)
            result = verify_cmyk(args[1])
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
