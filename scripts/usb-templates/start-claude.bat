@echo off
chcp 65001 >nul
set "USB_ROOT=%~dp0"
set "PASS=%~1"

set "NODE_EXE=%USB_ROOT%portable-node\node.exe"
if not exist "%NODE_EXE%" (
    echo [错误] 便携 Node.js 未找到。
    pause & exit /b
)

:: 启动 launcher.js（一步完成解密+设环境+启动 Claude Code）
"%NODE_EXE%" "%USB_ROOT%launcher.js" "%PASS%" %2 %3 %4 %5
