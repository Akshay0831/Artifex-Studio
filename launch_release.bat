@echo off
setlocal
cd /d "%~dp0" || exit /b 1

if not exist ".venv\Scripts\python.exe" goto Setup
if not exist "frontend\dist\index.html" goto Setup
goto Launch

:Setup
echo Alpha environment or production frontend is missing. Running setup...
call "%~dp0setup-windows.bat"
if errorlevel 1 exit /b 1

:Launch
call "%~dp0start-studio.bat"
exit /b %errorlevel%
