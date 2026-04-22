@echo off
chcp 65001 >nul 2>&1
set "USB_ROOT=%~dp0.."
set "NODE_EXE=%USB_ROOT%\portable-node\node.exe"

if not exist "%NODE_EXE%" (
    echo  [ERROR] Portable Node.js not found.
    pause & exit /b 1
)

set "TMPPASS=%~1"
if not exist "%TMPPASS%" (
    echo  [ERROR] Password file missing.
    "%NODE_EXE%" "%USB_ROOT%\tools\usb-logger.js" "ERROR" "run-claude.bat password file missing" "%TMPPASS%"
    pause & exit /b 1
)

"%NODE_EXE%" "%USB_ROOT%\tools\usb-logger.js" "INFO" "launching Claude Code portable"

"%NODE_EXE%" "%USB_ROOT%\tools\launcher.js" "%TMPPASS%" %2 %3 %4 %5

"%NODE_EXE%" "%USB_ROOT%\tools\usb-logger.js" "INFO" "Claude Code exited" "code: %ERRORLEVEL%"
