#!/bin/bash
# OpenClaw macOS 便携安装器
# 双击此文件运行（自动解压 .app 并启动）

cd "$(dirname "$0")"

# 检测芯片架构
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    ZIP="OpenClaw-Installer-1.0.0-arm64-mac.zip"
    LABEL="M芯片"
else
    ZIP="OpenClaw-Installer-1.0.0-mac.zip"
    LABEL="Intel"
fi

echo "=== OpenClaw 技术支持工具盘 (macOS $LABEL) ==="
echo ""

if [ ! -f "$ZIP" ]; then
    echo "[错误] 未找到 $ZIP"
    echo "请确认U盘 macOS 目录中有此文件"
    read -p "按回车退出..."
    exit 1
fi

# 解压到临时目录
TMPDIR="/tmp/openclaw-installer"
rm -rf "$TMPDIR"
mkdir -p "$TMPDIR"

echo "正在解压 $ZIP ..."
unzip -q "$ZIP" -d "$TMPDIR"

APP="$TMPDIR/OpenClaw-Installer.app"
if [ ! -d "$APP" ]; then
    echo "[错误] 解压后未找到 .app"
    read -p "按回车退出..."
    exit 1
fi

# 写入 .portable 标记（让安装器跳过激活码）
touch "$TMPDIR/.portable"

echo "正在启动安装器..."
echo "(免激活码 · 便携模式)"
echo ""

# 启动 .app
open "$APP"
