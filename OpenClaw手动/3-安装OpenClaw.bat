@echo off
chcp 65001 >nul 2>&1
echo.
echo  ==========================================
echo    第3步：安装 OpenClaw v2026.4.23
echo  ==========================================
echo.

:: 刷新 PATH（可能刚装了 Node）
set "PATH=%PATH%;C:\Program Files\nodejs"

node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo  [错误] Node.js 未安装或不在 PATH 中
    echo  请先运行 1-安装Node.bat
    pause
    exit /b 1
)

echo  正在安装 OpenClaw（离线）...
echo.

npm install -g "%~dp0openclaw-2026.4.23.tgz" --registry=https://registry.npmmirror.com

if %errorlevel% equ 0 (
    echo.
    echo  [OK] OpenClaw 安装成功！
    echo.
    echo  下一步：打开 安装指南.md 配置大模型和飞书
) else (
    echo.
    echo  [错误] 安装失败，尝试在线安装：
    echo  npm install -g openclaw@2026.4.23 --registry=https://registry.npmmirror.com
)

echo.
pause
