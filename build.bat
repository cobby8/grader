@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64
cd /d "C:\0. Programing\grader\src-tauri"
set PATH=%USERPROFILE%\.cargo\bin;%PATH%
cargo build 2>&1
