@echo off
chcp 65001 >nul 2>&1
echo.
echo  ==========================================
echo    第1步：安装 Node.js v22.22.2
echo  ==========================================
echo.
echo  右键此文件 → 以管理员身份运行
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  [错误] 需要管理员权限！
    echo  请右键 → 以管理员身份运行
    pause
    exit /b 1
)

echo  正在安装 Node.js...
msiexec /i "%~dp0node-v22.22.2-x64.msi" /qn /norestart

timeout /t 3 /nobreak >nul

:: 刷新 PATH
set "PATH=%PATH%;C:\Program Files\nodejs"

node -v >nul 2>&1
if %errorlevel% equ 0 (
    echo.
    echo  [OK] Node.js 安装成功：$(node -v)
) else (
    echo.
    echo  [提示] 安装完成，请关闭当前窗口重新打开终端验证
)

echo.
pause
