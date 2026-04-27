@echo off
chcp 65001 >nul
title OpenClaw 离线安装
set "PKG_DIR=%~dp0"

echo.
echo ==========================================
echo   OpenClaw 离线安装
echo   行知商学 · 教培AI实战营
echo ==========================================
echo.

:: 检查管理员权限
net session >nul 2>&1
if errorlevel 1 (
    echo [提示] 需要管理员权限，正在请求提权...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

:: [1/2] 安装 Node.js
echo [1/2] 安装 Node.js v22 LTS...
if exist "%PKG_DIR%node-v22.22.2-x64.msi" (
    msiexec /i "%PKG_DIR%node-v22.22.2-x64.msi" /qn /norestart
    if errorlevel 1 (
        echo [错误] Node.js 安装失败，请尝试：
        echo   1. 关闭杀毒软件后重试
        echo   2. 手动双击 node-v22.22.2-x64.msi 安装
        pause & exit /b 1
    )
    echo   Node.js 安装完成
) else (
    echo [错误] 未找到 node-v22.22.2-x64.msi
    pause & exit /b 1
)

:: 刷新 PATH（新安装的 Node.js 可能不在当前 PATH 中）
set "PATH=%ProgramFiles%\nodejs;%PATH%"

:: [2/2] 安装 OpenClaw
echo.
echo [2/2] 安装 OpenClaw v2026.4.23...
if exist "%PKG_DIR%openclaw-2026.4.23.tgz" (
    npm install -g "%PKG_DIR%openclaw-2026.4.23.tgz" --no-audit --no-fund
    if errorlevel 1 (
        echo [错误] OpenClaw 安装失败，请尝试：
        echo   npm install -g "%PKG_DIR%openclaw-2026.4.23.tgz"
        pause & exit /b 1
    )
    echo   OpenClaw 安装完成
) else (
    echo [错误] 未找到 openclaw-2026.4.23.tgz
    pause & exit /b 1
)

:: 验证
echo.
echo [验证]
node --version 2>nul && echo   Node.js: OK || echo   Node.js: 未找到
openclaw --version 2>nul && echo   OpenClaw: OK || echo   OpenClaw: 未找到

echo.
echo ==========================================
echo   安装完成！
echo   下一步：双击 config.bat 配置 AI 模型
echo ==========================================
echo.
pause
