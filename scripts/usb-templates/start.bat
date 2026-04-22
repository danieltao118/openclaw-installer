@echo off
:: Anti flash-close
if "%~1"=="" (
    cmd /c "%~f0" _pinned
    if errorlevel 1 pause
    exit /b
)

chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion
title Claude Code (Tech Support)

set "USB_ROOT=%~dp0"
set "TOOLS=%USB_ROOT%tools"
set "NODE_EXE=%USB_ROOT%portable-node\node.exe"

:: ========== Check ==========
if not exist "%USB_ROOT%.guard\key.dat" (
    echo.
    echo  [ERROR] USB not initialized.
    echo.
    pause & exit /b 1
)

if not exist "%NODE_EXE%" (
    echo.
    echo  [ERROR] Portable Node.js not found.
    echo.
    pause & exit /b 1
)

if exist "%NODE_EXE%" "%NODE_EXE%" "%TOOLS%\usb-logger.js" INFO "start.bat launched" "PC: %COMPUTERNAME%"

echo.
echo  ==========================================
echo    Claude Code - Tech Support Mode
echo    teach-AI bootcamp
echo  ==========================================
echo.

:: ========== Password (PowerShell hidden) ==========
set "TMPPASS=%TEMP%\oclaw_%RANDOM%.tmp"
powershell -NoProfile -Command "$p = Read-Host -Prompt 'Password' -AsSecureString; $b = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($p); $s = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($b); [System.IO.File]::WriteAllText('%TMPPASS%', $s, [System.Text.Encoding]::UTF8)" 2>nul

if not exist "%TMPPASS%" (
    echo  [WARNING] PowerShell unavailable.
    set /p "PASS=Password: "
    echo !PASS!> "%TMPPASS%"
    set "PASS="
)

if not exist "%TMPPASS%" (
    echo.
    echo  [ERROR] Password input failed.
    pause & exit /b 1
)

:: ========== Verify ==========
"%NODE_EXE%" "%TOOLS%\verify-password.js" "%USB_ROOT%.guard\key.dat" "%TMPPASS%"
if errorlevel 1 (
    echo.
    echo  [ERROR] Wrong password.
    if exist "%TMPPASS%" del "%TMPPASS%" 2>nul
    pause & exit /b 1
)

if exist "%NODE_EXE%" "%NODE_EXE%" "%TOOLS%\usb-logger.js" INFO "password verified"

:: ========== Launch Claude Code ==========
if exist "%NODE_EXE%" "%NODE_EXE%" "%TOOLS%\usb-logger.js" INFO "launching Claude Code"

"%NODE_EXE%" "%TOOLS%\launcher.js" "%TMPPASS%"

:: ========== Cleanup ==========
if exist "%TMPPASS%" del "%TMPPASS%" 2>nul
if exist "%NODE_EXE%" "%NODE_EXE%" "%TOOLS%\usb-logger.js" INFO "start.bat ended"
echo.
pause
