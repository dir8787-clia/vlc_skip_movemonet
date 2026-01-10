@echo off
echo Starting Video Player...
cd /d "%~dp0"

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo Python is not found. Please install Python first.
    pause
    exit /b 1
)

REM Start the HTTP server in the background
start /min python -m http.server 8000

REM Wait a moment for the server to start
timeout /t 2 /nobreak >nul

REM Open the player in the default browser
start http://localhost:8000/player.html

echo Video player started successfully!
echo Server running on http://localhost:8000
echo Press any key to stop the server...
pause >nul

REM Kill the server process (this is basic - in production you might want something more robust)
taskkill /f /im python.exe 2>nul