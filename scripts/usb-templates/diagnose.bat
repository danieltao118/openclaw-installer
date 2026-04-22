@echo off
:: Anti flash-close
if "%~1"=="" (
    cmd /c "%~f0" _pinned
    if errorlevel 1 pause
    exit /b
)

chcp 65001 >nul 2>&1
set "USB_ROOT=%~dp0"
set "TOOLS=%USB_ROOT%tools"
set "NODE=%USB_ROOT%portable-node\node.exe"
set "LOG=%TOOLS%\usb-logger.js"

echo ========================================
echo   OpenClaw USB Diagnostics
echo ========================================
echo.

:: Step 1: Node.js
echo [1/6] Testing Node.js...
"%NODE%" -e "console.log('  Node.js: ' + process.version + ' OK')" 2>&1
if errorlevel 1 (
    echo   FAIL: Node.js not available
    if exist "%NODE%" "%NODE%" "%LOG%" ERROR "diag: Node.js check error"
    pause & exit /b
)
if exist "%NODE%" "%NODE%" "%LOG%" INFO "diag: Node.js OK"

:: Step 2: Claude Code entry
echo.
echo [2/6] Checking Claude Code...
set "CLI=%USB_ROOT%claude-portable\node_modules\@anthropic-ai\claude-code\cli.js"
if exist "%CLI%" (
    echo   OK: cli.js found
    if exist "%NODE%" "%NODE%" "%LOG%" INFO "diag: cli.js found"
) else (
    echo   FAIL: cli.js not found
    if exist "%NODE%" "%NODE%" "%LOG%" ERROR "diag: cli.js not found"
)

:: Step 3: Claude Code version
echo.
echo [3/6] Testing Claude Code version...
if exist "%CLI%" (
    "%NODE%" "%CLI%" --version 2>&1
    if errorlevel 1 (
        echo   FAIL: Claude Code --version error
        if exist "%NODE%" "%NODE%" "%LOG%" ERROR "diag: Claude Code --version failed"
    ) else (
        echo   OK
        if exist "%NODE%" "%NODE%" "%LOG%" INFO "diag: Claude Code --version OK"
    )
) else (
    echo   SKIP: cli.js not found
)

:: Step 4: Credentials
echo.
echo [4/6] Checking encrypted credentials...
if exist "%USB_ROOT%.guard\credentials.enc" (
    echo   OK: credentials.enc found
    if exist "%NODE%" "%NODE%" "%LOG%" INFO "diag: credentials found"
) else (
    echo   FAIL: credentials.enc not found
    if exist "%NODE%" "%NODE%" "%LOG%" ERROR "diag: credentials not found"
)

:: Step 5: Network
echo.
echo [5/6] Testing network (GLM API)...
if exist "%NODE%" (
    "%NODE%" -e "const https=require('https');https.get('https://open.bigmodel.cn/api/anthropic',r=>{console.log('  HTTP '+r.statusCode+' OK');process.exit(0)}).on('error',e=>{console.log('  FAIL: '+e.message);process.exit(1)})" 2>&1
    if errorlevel 1 (
        if exist "%NODE%" "%NODE%" "%LOG%" ERROR "diag: network unreachable"
    ) else (
        if exist "%NODE%" "%NODE%" "%LOG%" INFO "diag: network OK"
    )
) else (
    echo   SKIP: Node.js not available
)

:: Step 6: launcher.js
echo.
echo [6/6] Testing launcher.js load...
if exist "%TOOLS%\launcher.js" (
    echo   OK: launcher.js found
    if exist "%NODE%" "%NODE%" "%LOG%" INFO "diag: launcher.js found"
) else (
    echo   FAIL: launcher.js not found
    if exist "%NODE%" "%NODE%" "%LOG%" ERROR "diag: launcher.js not found"
)

echo.
echo ========================================
echo   Diagnostics complete.
echo ========================================
pause
