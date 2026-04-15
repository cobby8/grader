@echo off
REM ============================================================
REM  Grader - Release build script (MSI + NSIS)
REM ============================================================

REM Setup MSVC build environment (cl.exe, link.exe on PATH)
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64

REM Move to project root
cd /d "C:\0. Programing\grader"

REM Register cargo on PATH
set PATH=%USERPROFILE%\.cargo\bin;%PATH%

echo.
echo === Tauri release build start ===
echo Start time: %date% %time%
echo.

REM Build MSI + NSIS bundle via Tauri CLI
call npm run tauri build

set BUILD_RESULT=%errorlevel%

echo.
echo === Build finished ===
echo End time: %date% %time%
echo.

if %BUILD_RESULT% neq 0 (
    echo [ERROR] Build failed. Error code: %BUILD_RESULT%
    echo.
    echo Common causes:
    echo   1. First build downloads WiX/NSIS - check internet
    echo   2. Missing icon files - check src-tauri/icons/
    echo   3. Rust compile errors - scroll up
    pause
    exit /b %BUILD_RESULT%
)

echo Installer output:
echo   MSI : src-tauri\target\release\bundle\msi\
echo   NSIS: src-tauri\target\release\bundle\nsis\
echo.

pause
