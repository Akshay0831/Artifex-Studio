@echo off
REM Unified Editing Studio - Robust Windows Setup
REM This script sets up the application on Windows systems with error handling

echo ========================================
echo Unified Editing Studio - Windows Setup
========================================
echo.
echo This script will set up the Unified Editing Studio
echo on your Windows system.
echo.

REM Set error handling
setlocal enabledelayedexpansion

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

REM Check for Python and find available Python executable
set PYTHON_CMD=
set PYTHON_VERSION=
echo Checking for Python installation...

REM Try different Python executables in order of preference
for %%P in (python.exe python3.exe python3.9.exe python3.10.exe python3.11.exe python3.12.exe python3.13.exe) do (
    where %%P >nul 2>&1
    if !errorlevel! equ 0 (
        set PYTHON_CMD=%%P
        call :GetPythonVersion %%P
        echo Found Python: !PYTHON_CMD! (version !PYTHON_VERSION!)
        goto :PythonFound
    )
)

echo ERROR: No Python installation found
echo Please install Python 3.9+ from https://python.org
echo Make sure Python is added to your PATH environment variable
pause
exit /b 1

:PythonFound
if not "!PYTHON_VERSION!" geq "3.9" (
    echo WARNING: Python version !PYTHON_VERSION! found
    echo This application requires Python 3.9 or higher
    echo Please upgrade to Python 3.9+ for best results
    pause
)

echo.
echo Starting setup with !PYTHON_CMD!...
!PYTHON_CMD! setup.py

if !errorlevel! neq 0 (
    echo.
    echo ERROR: Setup failed with error code !errorlevel!
    echo Please check the error messages above and try again
    echo.
    echo Troubleshooting steps:
    echo 1. Make sure you have Python 3.9+ installed
    echo 2. Check if Python is added to your PATH
    echo 3. Try running: !PYTHON_CMD! -m pip install --upgrade pip
    echo 4. Try running: !PYTHON_CMD! setup.py --help
    pause
    exit /b !errorlevel!
) else (
    echo.
    echo ========================================
    echo Setup completed successfully!
    ========================================
    echo.
    echo Next steps:
    echo 1. Run start-studio.bat to launch the application
    echo 2. Backend will be available at: http://localhost:8000
    echo 3. Frontend: Open frontend/dist/index.html
    echo 4. API documentation: http://localhost:8000/docs
    echo.
    pause
    exit /b 0
)

REM Function to get Python version
:GetPythonVersion
python %1 --version 2>NUL | findstr /R /C:"Python [0-9]" >NUL
if !errorlevel! equ 0 (
    for /f "tokens=2" %%v in ('python %1 --version') do set PYTHON_VERSION=%%v
) else (
    set PYTHON_VERSION=unknown
)
goto :eof