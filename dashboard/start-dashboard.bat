@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0\.."

set "NODE_CMD=node"
where node >nul 2>nul
if errorlevel 1 if exist "%~dp0..\.runtime\node-v24.19.0-win-x64\node.exe" set "NODE_CMD=%~dp0..\.runtime\node-v24.19.0-win-x64\node.exe"
if "%NODE_CMD%"=="node" where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not available. Run install.bat after installing Node.js 20.16 or newer.
  pause
  exit /b 1
)

if not exist "node_modules\busboy" (
  echo [ERROR] Dependencies are missing. Run install.bat first.
  pause
  exit /b 1
)

start "" "http://localhost:8420/dashboard.html"
"%NODE_CMD%" dashboard\server.js
if errorlevel 1 pause
