@echo off
setlocal
title Canary Server
cd /d %~dp0

set PORT_NUM=3000
if defined PORT set PORT_NUM=%PORT%
set MODE=dev
if /i "%~1"=="prod" set MODE=prod
if /i "%~1"=="production" set MODE=prod

echo ============================================
echo  Canary - Gemma 4 Chat  [%MODE% mode]
echo ============================================
echo.

REM --- 1. Check Node.js ---
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found.
  echo Install Node.js 20+ LTS from https://nodejs.org , then reopen this window.
  echo.
  pause
  exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do echo [OK] Node %%v

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm not found. Reinstall Node.js LTS from https://nodejs.org.
  pause
  exit /b 1
)

REM --- 2. Install dependencies if needed ---
if not exist "node_modules" (
  echo.
  echo [INFO] node_modules not found. Running npm install...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed. See messages above.
    pause
    exit /b 1
  )
) else (
  echo [OK] Dependencies present.
)

REM --- 3. Env file for search (optional) ---
if not exist ".env.local" (
  if exist ".env.example" (
    echo.
    echo [INFO] .env.local missing - copying from .env.example.
    copy /y ".env.example" ".env.local" >nul
    echo [WARN] Edit .env.local and set SERPAPI_KEY for web search.
    echo        The app still runs without it.
  ) else (
    echo [WARN] No .env file found. Web search will be disabled.
  )
)

REM --- 4. Sessions directory ---
if not exist "sessions" mkdir sessions

REM --- 5. Free the port if something old is on it ---
for /f "tokens=5" %%a in ('netstat -a -n -o ^| findstr ":%PORT_NUM%" 2^>nul') do (
  echo [INFO] Stopping old process on port %PORT_NUM% ^(PID %%a^)...
  taskkill /F /PID %%a >nul 2>nul
)

echo.
if /i "%MODE%"=="prod" goto :prod

:dev
echo Starting dev server at http://localhost:%PORT_NUM%
echo Press Ctrl+C to stop.
echo.
REM Open browser shortly after startup so the server has time to boot.
call :open_browser
call npm run dev
goto :end

:prod
echo Building production bundle...
call npm run build
if errorlevel 1 (
  echo [ERROR] Build failed. See messages above.
  pause
  exit /b 1
)
echo.
echo Starting production server at http://localhost:%PORT_NUM%
echo Press Ctrl+C to stop.
echo.
call :open_browser
call npm run start

goto :end

REM Open the app in Chrome incognito when available, else default browser.
REM NOTE: incognito wipes localStorage on close — chats, theme, persona,
REM and custom instructions won't persist. Use a normal window to keep them.
:open_browser
set "CHROME_PATH="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME_PATH=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME_PATH=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME_PATH=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if defined CHROME_PATH (
  echo [INFO] Opening Chrome incognito at http://localhost:%PORT_NUM%
  start "" powershell -NoProfile -Command "Start-Sleep -Seconds 5; Start-Process '%CHROME_PATH%' -ArgumentList '--incognito','http://localhost:%PORT_NUM%'"
) else (
  echo [WARN] Chrome not found - opening default browser instead.
  start "" powershell -NoProfile -Command "Start-Sleep -Seconds 5; Start-Process 'http://localhost:%PORT_NUM%'"
)
goto :eof

:end
echo.
echo Server stopped.
pause
endlocal
