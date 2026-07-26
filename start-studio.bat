@echo off
REM Unified Editing Studio - Robust Windows Launcher
REM This script launches the application with comprehensive error handling

echo ========================================
echo Unified Editing Studio - Launcher
echo ========================================
echo.

setlocal enabledelayedexpansion

REM Set error handling
set "EXIT_CODE=0"
set "VENV_FOUND=0"
set "PYTHON_FOUND=0"

REM Get script directory
set "SCRIPT_DIR=%~dp0"
if not defined SCRIPT_DIR (
    echo ERROR: Could not determine script directory
    pause
    exit /b 1
)

REM Change to script directory
cd /d "%SCRIPT_DIR%" || (
    echo ERROR: Could not change to script directory: %SCRIPT_DIR%
    pause
    exit /b 1
)

echo Working directory: %SCRIPT_DIR%
echo.

REM Check for virtual environment
if exist ".venv" (
    set VENV_FOUND=1
    echo Virtual environment found
) else (
    echo WARNING: Virtual environment not found at %SCRIPT_DIR%.venv
    echo Please run setup-windows.bat first to install dependencies
    echo.
    set EXIT_CODE=1
    goto :CheckDependencies
)

REM Check for Python in virtual environment
if exist ".venv\Scripts\python.exe" (
    set "PYTHON_CMD=.venv\Scripts\python.exe"
    set "PYTHON_FOUND=1"
    echo Found Python in virtual environment: %PYTHON_CMD%
) else (
    echo WARNING: Python not found in virtual environment
    echo The virtual environment might be corrupted
    set EXIT_CODE=1
)

:CheckDependencies
if !VENV_FOUND! equ 1 (
    REM Check for backend application
    if exist "backend\app.py" (
        echo Backend application found: backend\app.py
    ) else (
        echo ERROR: Backend application not found at %SCRIPT_DIR%backend\app.py
        set EXIT_CODE=1
    )
    
    REM Check for frontend
    if exist "frontend\dist\index.html" (
        echo Frontend found: frontend\dist\index.html
    ) else (
        echo WARNING: Frontend not found at %SCRIPT_DIR%frontend\dist\index.html
        echo Frontend build might be missing - run npm run build in frontend directory
    )
)

REM Check if we can proceed
if !EXIT_CODE! neq 0 (
    echo.
    echo ERROR: Required components missing or corrupted
    echo.
    echo Please try the following steps:
    echo 1. Run setup-windows.bat to install all dependencies
    echo 2. If issues persist, run: %PYTHON_CMD% -m pip list --check
    echo 3. Check that backend\app.py exists
    echo 4. Consider deleting .venv and running setup again
    echo.
    pause
    exit /b !EXIT_CODE!
)

REM Find Python - try virtual environment first, then system
if not defined PYTHON_CMD (
    REM Try different Python executables
    for %%P in (python.exe python3.exe python3.9.exe python3.10.exe python3.11.exe python3.12.exe python3.13.exe) do (
        where %%P >nul 2>&1
        if !errorlevel! equ 0 (
            set "PYTHON_CMD=%%P"
            echo Found system Python: !PYTHON_CMD!
            goto :LaunchApp
        )
    )
    echo ERROR: No Python installation found
    pause
    exit /b 1
)

:LaunchApp
echo.
echo ========================================
echo Starting Unified Editing Studio...
echo ========================================
echo Backend will be available at: http://localhost:8000
echo Frontend: Open %SCRIPT_DIR%frontend\dist\index.html
echo API documentation: http://localhost:8000/docs
echo.
echo Press Ctrl+C to stop the server
echo.

REM Activate virtual environment and start application
call .venv\Scripts\activate

echo Starting backend application...
!PYTHON_CMD! backend\app.py

if !errorlevel! neq 0 (
    echo.
    echo ERROR: Application failed with error code !errorlevel!
    echo.
    echo Troubleshooting steps:
    echo 1. Check the error messages above
    echo 2. Try running: !PYTHON_CMD! -c "import sys; print(sys.version)"
    echo 3. Try running: !PYTHON_CMD! -m pip list
    echo 4. Try running: !PYTHON_CMD! backend\app.py --help 2>nul
    echo 5. Check if all dependencies are installed
    echo.
    set EXIT_CODE=!errorlevel!
)

echo.
echo Application stopped
pause
exit /b !EXIT_CODE!