@echo off
cd /d "%~dp0"
where npm >nul 2>&1
if errorlevel 1 (
  echo Please install Node.js 22 or newer from https://nodejs.org
  pause
  exit /b 1
)
echo.
echo Optional: enter a public GitHub repo for future automatic updates.
echo Example: yourusername/AgentOffice
set /p AGENTOFFICE_REPO=GitHub owner/repo (Enter to skip): 
echo.
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo npm install failed. Check internet connection.
  pause
  exit /b 1
)
call npm run package:win
if errorlevel 1 (
  echo Windows EXE build failed. Review the error above.
  pause
  exit /b 1
)
echo.
echo Installer created in the release folder.
start "" "%~dp0release"
pause
