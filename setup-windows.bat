@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0" || exit /b 1

echo ========================================
echo Artifex Studio - Alpha Setup
echo ========================================
echo.

set "PYTHON_CMD=python"
where py >nul 2>&1
if !errorlevel! equ 0 (
    for %%V in (12 11 10 9) do (
        py -3.%%V --version >nul 2>&1
        if !errorlevel! equ 0 (
            set "PYTHON_CMD=py -3.%%V"
            goto RunSetup
        )
    )
)

:RunSetup
%PYTHON_CMD% setup.py
set "SETUP_EXIT=!errorlevel!"
if not "!SETUP_EXIT!"=="0" (
    echo.
    echo Alpha setup failed. Review the error above and correct it before launching.
    pause
    exit /b !SETUP_EXIT!
)

echo.
echo Setup completed. Launch with start-studio.bat.
pause
exit /b 0
