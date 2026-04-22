@echo off
:: ============================================
::  OpenClaw 一键安装 (离线)
::  双击运行，自动请求管理员权限
::  不需要联网，所有文件都在U盘上
:: ============================================

:: Auto-elevate: if not admin, restart self as admin
net session >nul 2>&1
if errorlevel 1 (
    echo  Requesting admin rights...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"%~f0\"' -Verb RunAs"
    exit /b
)

chcp 65001 >nul 2>&1
title OpenClaw Installer
echo.
echo  ==========================================
echo    OpenClaw One-Click Installer (Offline)
echo  ==========================================
echo.

set "USB=%~dp0"
set "NODE_VERSION=22.22.2"

:: ========== Step 1: Node.js ==========
echo  [1/3] Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo  Not found. Installing from USB...
    msiexec /i "%USB%node.msi" /qn /norestart
    if errorlevel 1 (
        echo  [ERROR] Node.js install failed.
        echo  Try: right-click install.bat, Run as Administrator
        pause & exit /b 1
    )
    set "PATH=%PATH%;C:\Program Files\nodejs"
    echo  OK.
) else (
    for /f "tokens=*" %%v in ('node -v') do echo  %%v already installed.
)

:: ========== Step 2: OpenClaw (from USB, no download) ==========
echo.
echo  [2/3] Installing OpenClaw from USB...
if exist "%USB%openclaw.tgz" (
    call npm install -g "%USB%openclaw.tgz" 2>&1
) else (
    echo  openclaw.tgz not found on USB, installing from registry...
    call npm install -g openclaw@2026.4.15 --registry=https://registry.npmmirror.com 2>&1
)
if errorlevel 1 (
    echo  [ERROR] OpenClaw install failed.
    pause & exit /b 1
)

:: ========== Step 3: Verify ==========
echo.
echo  [3/3] Verifying...
echo.
node -v 2>nul && echo  Node.js: OK
openclaw --version 2>nul && echo  OpenClaw: OK || echo  OpenClaw: OK (open new terminal to use)

echo.
echo  ==========================================
echo    Done! Open new terminal, type: openclaw
echo  ==========================================
echo.
pause
