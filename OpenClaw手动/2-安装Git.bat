@echo off
chcp 65001 >nul 2>&1
echo.
echo  ==========================================
echo    第2步：安装 Git v2.49.0
echo  ==========================================
echo.

echo  正在静默安装 Git...
"%~dp0Git-2.49.0-64-bit.exe" /VERYSILENT /NORESTART /NOCANCEL /SP- /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS /COMPONENTS="icons,ext\reg\shellhere,assoc,assoc_sh"

timeout /t 5 /nobreak >nul

:: 刷新 PATH
set "PATH=%PATH%;C:\Program Files\Git\cmd"

git --version >nul 2>&1
if %errorlevel% equ 0 (
    echo.
    echo  [OK] Git 安装成功：$(git --version)
) else (
    echo.
    echo  [提示] 安装完成，请关闭当前窗口重新打开终端验证
)

echo.
pause
