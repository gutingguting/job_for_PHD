@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

set "NODE_CMD=node"
set "NPM_CMD=npm"
where node >nul 2>nul
if errorlevel 1 if exist "%~dp0.runtime\node-v24.19.0-win-x64\node.exe" (
  set "NODE_CMD=%~dp0.runtime\node-v24.19.0-win-x64\node.exe"
  set "NPM_CMD=%~dp0.runtime\node-v24.19.0-win-x64\npm.cmd"
)
if "%NODE_CMD%"=="node" where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js 20.16 or newer is required.
  echo Please install the current Node.js LTS release from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)

"%NODE_CMD%" -e "const [a,b]=process.versions.node.split('.').map(Number); process.exit(a>20||(a===20&&b>=16)?0:1)"
if errorlevel 1 (
  echo [ERROR] Node.js 20.16 or newer is required. Current version:
  "%NODE_CMD%" --version
  pause
  exit /b 1
)

if not exist "%NPM_CMD%" where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Reinstall Node.js with npm enabled.
  pause
  exit /b 1
)

echo Installing verified dependencies...
call "%NPM_CMD%" ci
if errorlevel 1 goto :failed

echo Initializing private local data...
"%NODE_CMD%" scripts\init-data.js
if errorlevel 1 goto :failed

echo job_for_PHD is ready.
echo Optional prefill extension: %~dp0extension
echo Load that folder from Chrome or Edge extensions page with Developer mode enabled.
echo Opening the local dashboard...
call dashboard\start-dashboard.bat
exit /b %errorlevel%

:failed
echo [ERROR] Installation did not complete. Existing user data was not overwritten.
pause
exit /b 1
