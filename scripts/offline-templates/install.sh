#!/bin/bash
# OpenClaw macOS 离线安装
# 使用方式：双击此文件，或在终端中执行 bash install.sh

PKG_DIR="$(cd "$(dirname "$0")" && pwd)"
OPENCLAW_VERSION="2026.4.15"

echo ""
echo "=========================================="
echo "  OpenClaw 离线安装 (macOS)"
echo "  行知商学 · 教培AI实战营"
echo "=========================================="
echo ""

# 检测 Node.js tar.gz
NODE_TGZ=$(ls "$PKG_DIR"/node-v22.22.2-darwin-*.tar.gz 2>/dev/null | head -1)
if [ -z "$NODE_TGZ" ]; then
    echo "[错误] 未找到 Node.js 安装包 (node-v22.22.2-darwin-*.tar.gz)"
    echo "请确认文件在当前目录中"
    exit 1
fi

ARCH=$(uname -m)
echo "检测到架构: $ARCH"
echo ""

# [1/2] 安装 Node.js
echo "[1/2] 安装 Node.js v22 LTS..."
echo "  需要管理员密码（sudo）："
sudo tar -xzf "$NODE_TGZ" -C /usr/local --strip-components=1
if [ $? -ne 0 ]; then
    echo "[错误] Node.js 安装失败"
    exit 1
fi
echo "  Node.js 安装完成"

# [2/2] 安装 OpenClaw
echo ""
echo "[2/2] 安装 OpenClaw v${OPENCLAW_VERSION}..."
if [ -f "$PKG_DIR/openclaw-${OPENCLAW_VERSION}.tgz" ]; then
    sudo npm install -g "$PKG_DIR/openclaw-${OPENCLAW_VERSION}.tgz" --no-audit --no-fund
    if [ $? -ne 0 ]; then
        echo "[错误] OpenClaw 安装失败"
        echo "尝试手动执行: sudo npm install -g $PKG_DIR/openclaw-${OPENCLAW_VERSION}.tgz"
        exit 1
    fi
    echo "  OpenClaw 安装完成"
else
    echo "[错误] 未找到 openclaw-${OPENCLAW_VERSION}.tgz"
    exit 1
fi

# 验证
echo ""
echo "[验证]"
node --version 2>/dev/null && echo "  Node.js: OK" || echo "  Node.js: 未找到"
openclaw --version 2>/dev/null && echo "  OpenClaw: OK" || echo "  OpenClaw: 未找到"

echo ""
echo "=========================================="
echo "  安装完成！"
echo "  下一步：运行 bash config.sh 配置 AI 模型"
echo "=========================================="
echo ""
