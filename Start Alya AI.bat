@echo off
title Alya AI Agent — Launcher
color 0B
echo.
echo   ╔══════════════════════════════════════════╗
echo   ║         A L Y A   A I   A G E N T        ║
echo   ║     Desktop AI Companion Launcher       ║
echo   ╚══════════════════════════════════════════╝
echo.

:: Check if Node.js is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo   [ERROR] Node.js is not installed or not in PATH.
    echo   Please install Node.js from https://nodejs.org and try again.
    echo.
    pause
    exit /b 1
)

:: Check if npm dependencies are installed
if not exist "node_modules" (
    echo   [SETUP] First run detected — installing dependencies...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo   [ERROR] npm install failed. Check the error above.
        pause
        exit /b 1
    )
    echo.
    echo   [OK] Dependencies installed successfully.
    echo.
)

:: Check if assets exist
if not exist "assets\talking.mp4" (
    echo   [WARNING] Video assets not found in assets/ folder.
    echo            The app will still launch but may show a placeholder.
    echo.
)

:: Check if .env.local has a Gemini API key
if not exist ".env.local" (
    if exist ".env" (
        echo   [INFO] Using API key from .env
    ) else (
        echo   [WARNING] No .env or .env.local found.
        echo            Create .env.local with: GEMINI_API_KEY=your_key_here
        echo.
    )
)

echo   [START] Launching Alya AI Agent...
echo   The desktop window will open shortly.
echo   Close the window to minimize to tray. Quit from the tray icon.
echo.
echo   ───────────────────────────────────────────
echo   Press Ctrl+C to stop the server and exit.
echo   ───────────────────────────────────────────
echo.

:: Launch the app (server + Electron desktop window)
npm run electron-dev
