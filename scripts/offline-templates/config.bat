@echo off
chcp 65001 >nul
title OpenClaw 配置向导
echo.
echo ==========================================
echo   OpenClaw 配置向导
echo ==========================================
echo.

:: 检查 openclaw 是否已安装
where openclaw >nul 2>&1
if errorlevel 1 (
    echo [错误] OpenClaw 未安装，请先运行 install.bat
    pause & exit /b 1
)

:: 创建配置目录
set "CONFIG_DIR=%USERPROFILE%\.openclaw"
if not exist "%CONFIG_DIR%" mkdir "%CONFIG_DIR%"

:: 选择 AI 提供商
echo 请选择 AI 提供商：
echo   [1] 智谱 GLM（推荐）
echo   [2] 通义千问
echo   [3] Kimi（月之暗面）
echo   [4] MiniMax
echo   [5] 自定义（OpenAI 兼容）
echo.
set /p "provider=请输入编号 (1-5): "

if "%provider%"=="1" (
    set "base_url=https://open.bigmodel.cn/api/paas/v4"
    set "default_model=glm-5.1"
    set "key_url=https://open.bigmodel.cn"
)
if "%provider%"=="2" (
    set "base_url=https://dashscope.aliyuncs.com/compatible-mode/v1"
    set "default_model=qwen-max"
    set "key_url=https://bailian.console.aliyun.com"
)
if "%provider%"=="3" (
    set "base_url=https://api.moonshot.cn/v1"
    set "default_model=moonshot-v1-128k"
    set "key_url=https://platform.moonshot.cn"
)
if "%provider%"=="4" (
    set "base_url=https://api.minimax.chat/v1"
    set "default_model=MiniMax-Text-01"
    set "key_url=https://platform.minimaxi.com"
)
if "%provider%"=="5" (
    set /p "base_url=请输入 API 地址: "
    set "default_model="
)

:: 输入 API Key
echo.
echo 请输入 API Key（在 %key_url% 获取）:
set /p "api_key=API Key: "

if not defined api_key (
    echo [错误] API Key 不能为空
    pause & exit /b 1
)

:: 输入模型
echo.
if defined default_model (
    echo 模型名称（回车使用默认: %default_model%）:
    set /p "model="
    if not defined model set "model=%default_model%"
) else (
    set /p "model=请输入模型名称: "
)

:: 写入配置
echo 写入配置到 %CONFIG_DIR%\config.json...
(
echo {
echo   "provider": "%provider%",
echo   "apiKey": "%api_key%",
echo   "baseUrl": "%base_url%",
echo   "model": "%model%"
echo }
) > "%CONFIG_DIR%\config.json"

echo.
echo [完成] 配置已保存
echo   提供商: %base_url%
echo   模型: %model%
echo.
echo 启动 OpenClaw: openclaw gateway start
echo.
pause
