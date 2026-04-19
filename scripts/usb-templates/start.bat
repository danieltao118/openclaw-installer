@echo off
chcp 65001 >nul
title OpenClaw 技术支持工具盘
set "USB_ROOT=%~dp0"

:: ========== 密码验证 ==========
set "KEYFILE=%USB_ROOT%.guard\key.dat"
if not exist "%KEYFILE%" (
    echo [错误] U盘未初始化，请先运行 prepare-usb 脚本。
    pause & exit /b
)

echo.
echo ==========================================
echo   OpenClaw 技术支持工具盘
echo   行知商学 · 教培AI实战营
echo ==========================================
echo.
set /p "PASS=请输入管理员密码: "

:: 用 Node.js 验证密码（密码通过临时文件传入，避免命令行暴露）
set "TMPPASS=%TEMP%\oclaw_verify_%RANDOM%.tmp"
echo %PASS%> "%TMPPASS%"
if exist "%USB_ROOT%portable-node\node.exe" (
    "%USB_ROOT%portable-node\node.exe" -e "const fs=require('fs');const crypto=require('crypto');try{const k=fs.readFileSync(process.argv[1],'utf8').trim();const p=fs.readFileSync(process.argv[2],'utf8').trim();const h=crypto.createHash('sha256').update(p).digest('hex');fs.unlinkSync(process.argv[2]);process.exit(h===k?0:1)}catch(e){try{fs.unlinkSync(process.argv[2])}catch{}process.exit(1)}" "%KEYFILE%" "%TMPPASS%"
) else (
    node -e "const fs=require('fs');const crypto=require('crypto');try{const k=fs.readFileSync(process.argv[1],'utf8').trim();const p=fs.readFileSync(process.argv[2],'utf8').trim();const h=crypto.createHash('sha256').update(p).digest('hex');fs.unlinkSync(process.argv[2]);process.exit(h===k?0:1)}catch(e){try{fs.unlinkSync(process.argv[2])}catch{}process.exit(1)}" "%KEYFILE%" "%TMPPASS%"
)

if errorlevel 1 (
    echo.
    echo [错误] 密码错误。
    pause & exit /b
)

echo.
echo   [1] 安装 OpenClaw
echo   [2] 启动 Claude Code（技术支持）
echo   [3] 退出
echo.
set /p "choice=请选择: "

if "%choice%"=="1" call "%USB_ROOT%start-installer.bat"
if "%choice%"=="2" call "%USB_ROOT%run-claude.bat" "%PASS%"
if "%choice%"=="3" exit /b

:: 清除密码
set "PASS="
pause
