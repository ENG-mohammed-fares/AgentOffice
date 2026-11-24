@echo off
cd /d "%~dp0"
where npm >nul 2>&1
if errorlevel 1 (
  echo Please install Node.js 22 or newer from https://nodejs.org
  pause
  exit /b 1
)
echo Installing dependencies if needed...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo Install failed. Check internet connection and try again.
  pause
  exit /b 1
)
call npm run dev
pause
