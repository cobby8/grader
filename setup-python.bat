@echo off
REM ============================================================
REM  Grader - Python 엔진 자동 설치 스크립트
REM  직원용: 더블클릭 또는 우클릭 > 관리자 권한으로 실행
REM ============================================================
REM  동작: 현재 폴더 아래 python-engine\ 로 이동해서
REM        venv 생성 + requirements.txt 설치
REM  로그: setup-python.log (현재 폴더)
REM ============================================================

setlocal EnableExtensions EnableDelayedExpansion

REM 콘솔 한글 출력 대비 UTF-8 코드페이지 설정
chcp 65001 >nul

REM 스크립트가 있는 폴더로 작업 위치 이동 (Program Files든 어디든 대응)
cd /d "%~dp0"

REM 로그 파일 경로 (스크립트 폴더 기준)
set "LOGFILE=%~dp0setup-python.log"

REM 로그 초기화
echo === Grader Python 엔진 설치 로그 === > "%LOGFILE%"
echo 시작 시각: %date% %time% >> "%LOGFILE%"
echo 설치 경로: %~dp0 >> "%LOGFILE%"
echo. >> "%LOGFILE%"

echo.
echo ============================================================
echo   Grader - Python 엔진 자동 설치
echo ============================================================
echo.
echo 설치 위치: %~dp0
echo 로그 파일: %LOGFILE%
echo.

REM -------------------------------------------------------------
REM  1) Python 설치 여부 확인
REM -------------------------------------------------------------
echo [1/4] Python 설치 여부를 확인합니다...
python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo [에러] Python 을 찾을 수 없습니다.
    echo.
    echo   해결 방법:
    echo   1. https://www.python.org/downloads/ 에서 Python 3.9 이상 설치
    echo   2. 설치 시 "Add python.exe to PATH" 체크박스를 반드시 체크
    echo   3. 설치 후 새 명령창에서 다시 실행
    echo.
    echo [에러] Python 미설치 또는 PATH 미등록 >> "%LOGFILE%"
    pause
    exit /b 1
)

REM Python 버전 표시 및 로그 기록
for /f "tokens=*" %%v in ('python --version 2^>^&1') do set "PYVER=%%v"
echo     확인됨: !PYVER!
echo Python 버전: !PYVER! >> "%LOGFILE%"

REM Python 3.8 미만 경고 (간이 체크)
python -c "import sys; sys.exit(0 if sys.version_info >= (3,9) else 1)" >nul 2>&1
if errorlevel 1 (
    echo.
    echo [경고] Python 3.9 이상 권장. 현재: !PYVER!
    echo        설치는 계속 진행하지만 호환성 문제가 생길 수 있습니다.
    echo.
    echo [경고] Python 3.9 미만 >> "%LOGFILE%"
)

REM -------------------------------------------------------------
REM  2) python-engine 폴더 존재 확인
REM -------------------------------------------------------------
echo.
echo [2/4] python-engine 폴더를 확인합니다...
if not exist "%~dp0python-engine" (
    echo.
    echo [에러] python-engine 폴더를 찾을 수 없습니다.
    echo        예상 위치: %~dp0python-engine
    echo.
    echo        Grader 프로그램이 올바르게 설치되었는지 확인하고
    echo        이 스크립트는 설치 폴더 루트에서 실행해야 합니다.
    echo.
    echo [에러] python-engine 폴더 없음 >> "%LOGFILE%"
    pause
    exit /b 1
)
echo     확인됨: %~dp0python-engine
echo python-engine 경로: %~dp0python-engine >> "%LOGFILE%"

REM python-engine 으로 이동
cd /d "%~dp0python-engine"

REM -------------------------------------------------------------
REM  3) venv 생성 (이미 있으면 덮어쓰기 안 함)
REM -------------------------------------------------------------
echo.
echo [3/4] 가상 환경(venv)을 생성합니다... (1~2분 소요)
if exist "venv\Scripts\python.exe" (
    echo     기존 venv 감지 - 재사용합니다.
    echo 기존 venv 재사용 >> "%LOGFILE%"
) else (
    python -m venv venv >> "%LOGFILE%" 2>&1
    if errorlevel 1 (
        echo.
        echo [에러] venv 생성 실패.
        echo.
        echo   가능한 원인:
        echo   1. 쓰기 권한 부족 - 스크립트를 "관리자 권한으로 실행" 해주세요
        echo      (파일 우클릭 -^> 관리자 권한으로 실행)
        echo   2. Python 설치 손상 - Python 재설치 필요
        echo   3. 디스크 공간 부족
        echo.
        echo   자세한 에러는 로그 파일을 확인하세요:
        echo   %LOGFILE%
        echo.
        echo [에러] venv 생성 실패 >> "%LOGFILE%"
        pause
        exit /b 1
    )
    echo     venv 생성 완료.
    echo venv 생성 성공 >> "%LOGFILE%"
)

REM -------------------------------------------------------------
REM  4) pip 업그레이드 + 패키지 설치
REM -------------------------------------------------------------
echo.
echo [4/4] 패키지를 설치합니다... (2~4분 소요, 인터넷 필요)

if not exist "requirements.txt" (
    echo.
    echo [에러] requirements.txt 파일이 없습니다.
    echo        설치가 손상되었을 수 있습니다. Grader 를 재설치 해주세요.
    echo.
    echo [에러] requirements.txt 없음 >> "%LOGFILE%"
    pause
    exit /b 1
)

echo     - pip 업그레이드 중...
call "venv\Scripts\python.exe" -m pip install --upgrade pip >> "%LOGFILE%" 2>&1
if errorlevel 1 (
    echo.
    echo [경고] pip 업그레이드 실패. 계속 진행합니다.
    echo        원인이 네트워크 문제일 수 있습니다.
    echo [경고] pip 업그레이드 실패 >> "%LOGFILE%"
)

echo     - requirements.txt 설치 중...
call "venv\Scripts\pip.exe" install -r requirements.txt >> "%LOGFILE%" 2>&1
if errorlevel 1 (
    echo.
    echo [에러] 패키지 설치 실패.
    echo.
    echo   가능한 원인:
    echo   1. 인터넷 연결 확인 (회사 프록시/방화벽 문제 포함)
    echo   2. 관리자 권한 필요 - 스크립트를 관리자 권한으로 재실행
    echo.
    echo   자세한 에러는 로그 파일을 확인하세요:
    echo   %LOGFILE%
    echo.
    echo [에러] 패키지 설치 실패 >> "%LOGFILE%"
    pause
    exit /b 1
)
echo 패키지 설치 성공 >> "%LOGFILE%"

REM -------------------------------------------------------------
REM  완료
REM -------------------------------------------------------------
echo.
echo ============================================================
echo   설치 완료!
echo ============================================================
echo.
echo   이제 Grader 프로그램을 실행할 수 있습니다.
echo   바탕화면 아이콘 또는 시작 메뉴에서 Grader 를 실행하세요.
echo.
echo   설치 로그: %LOGFILE%
echo.
echo 완료 시각: %date% %time% >> "%LOGFILE%"
echo === 설치 완료 === >> "%LOGFILE%"

pause
endlocal
exit /b 0
