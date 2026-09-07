@echo off
title Gemma 4 Chat Server
cd /d %~dp0

REM Kill any existing server on port 8080
for /f "tokens=5" %%a in ('netstat -a -n -o ^| findstr ":8080" 2^>nul') do (
    taskkill /F /PID %%a 2>nul
)

REM Create sessions directory if it doesn't exist
if not exist "sessions" mkdir sessions

echo Starting server on http://localhost:8080
echo Sessions will be saved to: %~dp0sessions
echo Press Ctrl+C to stop.
echo.

python server.py
pause
