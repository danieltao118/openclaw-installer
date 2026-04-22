@echo off
chcp 65001 >nul 2>&1
set "USB_ROOT=%~dp0.."
set "NODE_EXE=%USB_ROOT%\portable-node\node.exe"
set "PORTABLE_EXE=%USB_ROOT%\OpenClaw-Portable.exe"

if not exist "%PORTABLE_EXE%" (
    echo.
    echo  [ERROR] OpenClaw-Portable.exe not found.
    echo.
    if exist "%NODE_EXE%" "%NODE_EXE%" "%USB_ROOT%\tools\usb-logger.js" "ERROR" "OpenClaw-Portable.exe not found"
    pause & exit /b 1
)

echo  Launching OpenClaw installer...
if exist "%NODE_EXE%" "%NODE_EXE%" "%USB_ROOT%\tools\usb-logger.js" "INFO" "launching OpenClaw-Portable.exe"

start "" /wait "%PORTABLE_EXE%"

if errorlevel 1 (
    echo.
    echo  [ERROR] Installer failed. Exit code: %ERRORLEVEL%
    echo.
    echo  Try: Right-click ^> Run as Administrator
    echo.
    if exist "%NODE_EXE%" "%NODE_EXE%" "%USB_ROOT%\tools\usb-logger.js" "ERROR" "installer launch failed" "code: %ERRORLEVEL%"
) else (
    if exist "%NODE_EXE%" "%NODE_EXE%" "%USB_ROOT%\tools\usb-logger.js" "INFO" "installer exited normally"
)
