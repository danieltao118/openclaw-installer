@echo off
chcp 65001 >nul 2>&1
set "USB_ROOT=%~dp0.."
set "NODE_EXE=%USB_ROOT%\portable-node\node.exe"

if not exist "%NODE_EXE%" (
    echo  [ERROR] Portable Node.js not found.
    pause & exit /b 1
)

echo.
echo  ==========================================
echo    OpenClaw Emergency Repair
echo  ==========================================
echo.

if exist "%NODE_EXE%" "%NODE_EXE%" "%USB_ROOT%\tools\usb-logger.js" "INFO" "repair-env.bat launched"

"%NODE_EXE%" "%USB_ROOT%\tools\repair-env.js"

if errorlevel 1 (
    echo.
    echo  [ERROR] Repair failed. See errors above.
    if exist "%NODE_EXE%" "%NODE_EXE%" "%USB_ROOT%\tools\usb-logger.js" "ERROR" "repair-env failed"
) else (
    echo.
    echo  [OK] Environment repaired successfully!
    if exist "%NODE_EXE%" "%NODE_EXE%" "%USB_ROOT%\tools\usb-logger.js" "INFO" "repair-env completed"
)

echo.
pause
