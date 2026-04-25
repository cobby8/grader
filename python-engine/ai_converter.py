"""
AI → SVG 자동 변환 모듈 (Phase 1: PyMuPDF 단독)

Illustrator(.ai) 파일을 SVG로 변환하는 반자동 모듈.
G드라이브에 SVG 없이 AI만 올라온 누락 상황을 앱 내장 기능으로 해결.

핵심 비유:
- AI 파일은 "두 가지 종류의 봉투" — 겉보기엔 같은 .ai지만 안의 형식이 다르다
  (1) PDF 호환 봉투: 첫 10바이트가 "%PDF-" → PyMuPDF가 바로 열 수 있다 (89%)
  (2) PostScript 봉투: 첫 10바이트가 "%!PS-Adobe" → Adobe 전용 확장 때문에 PyMuPDF 못 연다 (11%)
- 그래서 봉투를 열어보지 않고 우표(첫 10바이트)만 봐서 분기한다.

핵심 변환 단계:
1. 헤더 검사: 파일 첫 10바이트만 읽어서 PDF 호환/PostScript/unknown 분류
2. PyMuPDF 변환: PDF 호환만 처리, page.get_svg_image(text_as_path=True) 사용
3. atomic write: .tmp로 먼저 쓰고 os.replace로 원자적 교체 (앱 강제 종료에도 안전)
4. overwrite 정책: 기본 skip, 옵션 활성 시 .bak 백업 후 덮어쓰기
5. 배치 처리: 파일 단위 실패는 FAIL 기록만 하고 다음 파일 계속

🚨 시행착오 교훈 (lessons.md [2026-04-21] 항목 반영):
- AI 배치 변환은 헤더 바이트 검사 → 분기 처리가 필수
  (없으면 11%가 예측 불가능하게 실패)
- text_as_path=True 필수: Illustrator 외 환경에서 폰트 없어도 글자 모양 유지
- PostScript AI는 PyMuPDF/Ghostscript/Inkscape 모두 실패 → Phase 2(Illustrator COM)에서 처리

외부 검증 (2026-04-20 G드라이브 배치):
- 63개 AI 중 56개(89%) PDF 호환, 7개(11%) PostScript
- Phase 1은 PDF 호환 56개만 처리, 나머지는 "skipped_postscript"로 분류
"""

from __future__ import annotations

import os
import shutil
from typing import Any

import fitz  # PyMuPDF — PDF 호환 AI 파일 변환 엔진

# ========== 모듈 메타 정보 ==========
# 이 버전은 변환 결과 JSON에 포함되어, 추후 Phase 2/3 추가 시 호환성 추적에 사용
CONVERTER_VERSION = "1.0-pymupdf-pdf-compatible"

# AI 파일 헤더 시그니처 (첫 10바이트 검사용)
# %PDF- (5바이트): Illustrator가 "PDF 호환 모드"로 저장한 AI — PyMuPDF로 직접 변환 가능
HEADER_PDF_PREFIX = b"%PDF-"
# %!PS-Adobe (10바이트): PostScript 원본 모드 AI — Adobe 전용 확장 포함, Phase 1 범위 외
HEADER_POSTSCRIPT_PREFIX = b"%!PS-Adobe"


# ========== private 함수: 헤더 읽기 ==========

def _read_header(ai_path: str) -> bytes:
    """
    AI 파일의 첫 10바이트를 읽어 반환한다.

    바이너리 모드로 첫 10바이트만 읽기 때문에 큰 AI 파일도 빠르게 처리됨.
    파일 접근 실패(권한 부족/파일 없음 등) 시 빈 bytes 반환 → 호출자가 "unknown"으로 분류.

    Args:
        ai_path: AI 파일 절대 경로

    Returns:
        파일 첫 10바이트 (bytes). 읽기 실패 시 b"".
    """
    try:
        with open(ai_path, "rb") as f:
            # 첫 10바이트만 읽기 — %!PS-Adobe (10바이트) 까지 커버
            return f.read(10)
    except (IOError, OSError, PermissionError):
        # 파일을 못 열어도 배치는 계속되어야 하므로 빈 bytes 반환
        return b""


# ========== private 함수: AI 종류 분류 ==========

def _classify_ai(ai_path: str) -> str:
    """
    AI 파일의 헤더를 검사해 종류를 분류한다.

    헤더 첫 10바이트가:
    - "%PDF-"로 시작 → "pdf_compatible" (PyMuPDF로 변환 가능)
    - "%!PS-Adobe"로 시작 → "postscript" (Phase 1에선 skip)
    - 그 외(빈 bytes 포함) → "unknown" (파일 접근 실패 또는 비정상)

    Args:
        ai_path: AI 파일 절대 경로

    Returns:
        "pdf_compatible" | "postscript" | "unknown" 중 하나
    """
    header = _read_header(ai_path)

    if header.startswith(HEADER_PDF_PREFIX):
        return "pdf_compatible"
    if header.startswith(HEADER_POSTSCRIPT_PREFIX):
        return "postscript"
    return "unknown"


# ========== private 함수: PDF 호환 AI → SVG 변환 ==========

def _convert_pdf_compatible(
    ai_path: str,
    svg_path: str,
    overwrite: bool,
    backup: bool,
) -> dict:
    """
    PDF 호환 AI 파일 1개를 SVG로 변환한다.

    핵심 처리:
    1. overwrite 정책: 기존 SVG가 있고 overwrite=False면 skip (변환 안 함)
    2. backup 정책: 덮어쓸 때 backup=True면 .bak 파일로 원본 SVG 백업
    3. PyMuPDF 변환: page.get_svg_image(text_as_path=True)
       (text_as_path=True: 폰트 없는 환경에서도 글자 모양 유지)
    4. atomic write: .tmp 임시 파일에 쓰고 os.replace로 원자적 교체
       (변환 중 앱이 강제 종료되어도 svg_path 파일 자체는 손상되지 않음)

    Args:
        ai_path: AI 파일 절대 경로
        svg_path: 출력 SVG 절대 경로 (보통 같은 폴더, 확장자만 .svg)
        overwrite: True면 기존 SVG 덮어쓰기, False면 skip
        backup: True면 덮어쓰기 전 .bak 백업

    Returns:
        {
          "success": bool,
          "action": "converted" | "skipped_existing" | "overwritten",
          "svg_path": str,
          "warnings": list[str],
          "error": str (실패 시만)
        }
    """
    warnings: list[str] = []

    # 1. overwrite 정책: 기존 SVG 처리
    if os.path.exists(svg_path):
        if not overwrite:
            # 기본 동작: 이미 있는 SVG는 건드리지 않음
            return {
                "success": True,
                "action": "skipped_existing",
                "svg_path": svg_path,
                "warnings": [],
            }
        # 덮어쓰기 모드: 백업 옵션 처리
        if backup:
            try:
                # .bak로 복사 (메타데이터 포함). 같은 폴더에 svg_path + ".bak"
                shutil.copy2(svg_path, svg_path + ".bak")
            except (IOError, OSError) as e:
                # 백업 실패는 치명적이지 않음 → 경고만 남기고 진행
                warnings.append(f"백업 실패(계속 진행): {e}")
        action = "overwritten"
    else:
        action = "converted"

    # 2. PyMuPDF로 AI 열기 (헤더 검사로 PDF 호환만 들어왔으니 성공해야 정상)
    doc = None
    try:
        doc = fitz.open(ai_path)
        # AI는 단일 페이지가 일반적 (Illustrator 다중 아트보드라도 첫 페이지만 사용)
        if doc.page_count == 0:
            return {
                "success": False,
                "action": action,
                "svg_path": svg_path,
                "warnings": warnings,
                "error": "AI 파일에 페이지가 없습니다.",
            }
        page = doc[0]

        # 핵심 변환: text_as_path=True 필수
        # → 글자를 path로 변환해서 폰트 없는 환경에서도 모양 유지
        svg_text = page.get_svg_image(text_as_path=True)
    except Exception as e:
        # PyMuPDF 변환 자체가 실패한 경우 (파일 손상 등)
        return {
            "success": False,
            "action": action,
            "svg_path": svg_path,
            "warnings": warnings,
            "error": f"PyMuPDF 변환 실패: {type(e).__name__}: {e}",
        }
    finally:
        # doc 자원은 항상 닫기 (예외 발생해도)
        if doc is not None:
            try:
                doc.close()
            except Exception:
                pass

    # 3. atomic write: .tmp → os.replace
    # 이렇게 하면 변환 중 앱 강제 종료되어도 svg_path 파일 자체는 손상 안 됨
    tmp_path = svg_path + ".tmp"
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            f.write(svg_text)
        # os.replace는 POSIX에서 atomic, Windows에서도 원자적 교체 보장
        os.replace(tmp_path, svg_path)
    except (IOError, OSError) as e:
        # 쓰기 실패 시 .tmp 정리 시도
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass
        return {
            "success": False,
            "action": action,
            "svg_path": svg_path,
            "warnings": warnings,
            "error": f"SVG 쓰기 실패: {type(e).__name__}: {e}",
        }

    return {
        "success": True,
        "action": action,
        "svg_path": svg_path,
        "warnings": warnings,
    }


# ========== public 함수: 변환 시뮬레이션 ==========

def preview_ai_conversion(files: list[str]) -> dict:
    """
    AI 파일 목록의 헤더를 검사해 변환 가능 여부를 분류한다 (시뮬레이션).

    파일을 수정하지 않으며, 사용자에게 "이 배치를 실행하면 어떻게 될지"를 보여주는 용도.
    UI에서 "미리보기" 버튼 클릭 시 호출.

    각 파일에 대해:
    - 헤더 분류 결과 (pdf_compatible/postscript/unknown)
    - 같은 폴더에 SVG가 이미 있는지 여부 (existing_svg)

    Args:
        files: AI 파일 절대 경로 리스트

    Returns:
        {
          "success": True,
          "data": {
            "entries": [
              { "file": "...XL.ai", "kind": "pdf_compatible", "existing_svg": True },
              ...
            ],
            "summary": {
              "pdf_compatible": N,
              "postscript": M,
              "unknown": K,
              "existing_svg_conflict": Q  # PDF 호환 + 기존 SVG 있음 = 덮어쓰기 충돌 잠재 건수
            }
          }
        }
    """
    entries: list[dict] = []
    counts = {
        "pdf_compatible": 0,
        "postscript": 0,
        "unknown": 0,
    }
    # PDF 호환이면서 동시에 기존 SVG가 있는 경우만 카운트
    # (PostScript는 어차피 변환 안 하므로 충돌 없음)
    existing_svg_conflict = 0

    for ai_path in files:
        kind = _classify_ai(ai_path)
        # 같은 폴더에 SVG 짝이 있는지 확인 (확장자만 교체)
        svg_path = _ai_to_svg_path(ai_path)
        existing_svg = os.path.exists(svg_path)

        entries.append({
            "file": ai_path,
            "kind": kind,
            "existing_svg": existing_svg,
        })

        counts[kind] = counts.get(kind, 0) + 1
        if kind == "pdf_compatible" and existing_svg:
            existing_svg_conflict += 1

    return {
        "success": True,
        "data": {
            "entries": entries,
            "summary": {
                "pdf_compatible": counts["pdf_compatible"],
                "postscript": counts["postscript"],
                "unknown": counts["unknown"],
                "existing_svg_conflict": existing_svg_conflict,
            },
        },
    }


# ========== public 함수: 일괄 변환 실행 ==========

def convert_ai_batch(files: list[str], overwrite: bool) -> dict:
    """
    AI 파일 목록을 일괄 SVG 변환한다 (실제 파일 생성).

    PDF 호환만 처리, PostScript/unknown은 skip.
    파일 단위 실패는 FAIL로 기록하고 배치는 중단 없이 계속 진행한다.
    (한 파일 때문에 63개 배치가 전부 멈추면 안 되므로)

    Args:
        files: AI 파일 절대 경로 리스트
        overwrite: True면 기존 SVG 덮어쓰기 (자동 .bak 백업), False면 skip

    Returns:
        {
          "success": True,
          "data": {
            "total": N,
            "converted": K,         # 성공: 새로 만들거나 덮어쓴 건수
            "skipped_postscript": P,
            "skipped_unknown": U,
            "skipped_existing": Q,  # overwrite=False + 기존 SVG 있어서 skip
            "failed": F,
            "results": [
              { "file": "...XL.ai", "status": "PASS", "svg_path": "...XL.svg", "warnings": [] },
              { "file": "...FG.ai", "status": "SKIP", "reason": "postscript" },
              { "file": "...M.ai",  "status": "SKIP", "reason": "existing_svg" },
              { "file": "...broken.ai", "status": "FAIL", "error": "..." }
            ],
            "version": CONVERTER_VERSION
          }
        }
    """
    results: list[dict] = []
    counts = {
        "converted": 0,
        "skipped_postscript": 0,
        "skipped_unknown": 0,
        "skipped_existing": 0,
        "failed": 0,
    }

    for ai_path in files:
        kind = _classify_ai(ai_path)

        # 1. PostScript: Phase 1 범위 외 → skip(실패 아님)
        if kind == "postscript":
            results.append({
                "file": ai_path,
                "status": "SKIP",
                "reason": "postscript",
            })
            counts["skipped_postscript"] += 1
            continue

        # 2. Unknown: 파일 접근 실패 또는 알 수 없는 형식 → skip
        if kind == "unknown":
            results.append({
                "file": ai_path,
                "status": "SKIP",
                "reason": "unknown",
            })
            counts["skipped_unknown"] += 1
            continue

        # 3. PDF 호환: 실제 변환 시도
        svg_path = _ai_to_svg_path(ai_path)
        # backup=True 고정 (overwrite 모드일 때만 사용됨)
        # — 사용자가 실수로 덮어써도 .bak로 복구 가능
        conv_result = _convert_pdf_compatible(
            ai_path=ai_path,
            svg_path=svg_path,
            overwrite=overwrite,
            backup=True,
        )

        if not conv_result["success"]:
            # 파일 단위 실패 → FAIL 기록만, 배치 중단 없이 다음 파일로
            results.append({
                "file": ai_path,
                "status": "FAIL",
                "error": conv_result.get("error", "알 수 없는 오류"),
            })
            counts["failed"] += 1
            continue

        action = conv_result.get("action")
        if action == "skipped_existing":
            # 기존 SVG 보존 (overwrite=False 기본 정책)
            results.append({
                "file": ai_path,
                "status": "SKIP",
                "reason": "existing_svg",
            })
            counts["skipped_existing"] += 1
        else:
            # action == "converted" 또는 "overwritten"
            results.append({
                "file": ai_path,
                "status": "PASS",
                "svg_path": conv_result["svg_path"],
                "warnings": conv_result.get("warnings", []),
            })
            counts["converted"] += 1

    return {
        "success": True,
        "data": {
            "total": len(files),
            "converted": counts["converted"],
            "skipped_postscript": counts["skipped_postscript"],
            "skipped_unknown": counts["skipped_unknown"],
            "skipped_existing": counts["skipped_existing"],
            "failed": counts["failed"],
            "results": results,
            "version": CONVERTER_VERSION,
        },
    }


# ========== private 헬퍼: AI 경로 → SVG 경로 ==========

def _ai_to_svg_path(ai_path: str) -> str:
    """
    AI 파일 경로를 같은 폴더의 SVG 경로로 변환한다.

    예:
      "G:/.../XL.ai"  → "G:/.../XL.svg"
      "G:/.../XL.AI"  → "G:/.../XL.svg"  (확장자 대소문자 무시)

    Args:
        ai_path: AI 파일 절대 경로

    Returns:
        같은 폴더 + 같은 베이스명 + ".svg"
    """
    # os.path.splitext는 확장자만 분리 → "XL", ".ai"
    base, _ext = os.path.splitext(ai_path)
    # 항상 소문자 .svg로 통일 (Drive 스캔 일관성)
    return base + ".svg"
