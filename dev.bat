@echo off
REM Tauri dev 서버 실행 스크립트
REM Git Bash에서는 MSVC link.exe를 찾지 못하므로 cmd에서 실행 필요
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64
cd /d "C:\0. Programing\grader"
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
npm run tauri dev
