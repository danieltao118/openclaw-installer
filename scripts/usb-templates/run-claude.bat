@echo off
chcp 65001 >nul
set "USB_ROOT=%~dp0"

set "NODE_EXE=%USB_ROOT%portable-node\node.exe"
if not exist "%NODE_EXE%" (
    echo [错误] 便携 Node.js 未找到。
    pause & exit /b
)

:: 将密码写入临时文件（launcher.js 会读取后立即删除）
set "PASS=%~1"
set "TMPPASS=%TEMP%\oclaw_launch_%RANDOM%.tmp"
echo %PASS%> "%TMPPASS%"
set "PASS="

:: 启动 launcher.js
"%NODE_EXE%" "%USB_ROOT%launcher.js" "%TMPPASS%" %2 %3 %4 %5
