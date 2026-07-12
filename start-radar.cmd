@echo off
setlocal
cd /d "%~dp0"
title BossAI Radar Lite

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js 22.5 or newer is required.
  echo Download Node.js first, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/3] Installing dependencies...
  call npm install
  if errorlevel 1 goto :failed
)

if not exist ".env" (
  copy /Y ".env.example" ".env" >nul
  echo [2/3] Created .env from .env.example
) else (
  echo [2/3] Existing .env retained
)

echo [3/3] Starting BossAI Radar Lite at http://127.0.0.1:3080
start "" "http://127.0.0.1:3080"
call npm run dev
exit /b %errorlevel%

:failed
echo.
echo Startup failed. Review the error above.
pause
exit /b 1
