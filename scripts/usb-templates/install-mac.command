#!/bin/bash
# ============================================
#  OpenClaw 一键安装 (macOS, 离线)
#  双击运行，自动请求管理员权限
#  不需要联网，所有文件都在U盘上
# ============================================

cd "$(dirname "$0")"

echo ""
echo "  =========================================="
echo "    OpenClaw One-Click Installer (macOS)"
echo "  =========================================="
echo ""

ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    TAR="node-darwin-arm64.tar.gz"
    LABEL="M1/M2/M3"
else
    TAR="node-darwin-x64.tar.gz"
    LABEL="Intel"
fi

echo "  Detected: macOS $LABEL"
echo ""

# ========== Step 1: Node.js ==========
echo "  [1/3] Node.js..."
if command -v node &>/dev/null; then
    echo "  $(node -v) already installed."
else
    echo "  Not found. Installing from USB..."
    if [ ! -f "$TAR" ]; then
        echo "  [ERROR] $TAR not found on USB."
        echo "  Download: https://nodejs.org/dist/v22.22.2/"
        read -p "  Press Enter to exit..."
        exit 1
    fi
    sudo tar -xzf "$TAR" -C /usr/local --strip-components=1
    if [ $? -ne 0 ]; then
        echo "  [ERROR] Node.js install failed."
        read -p "  Press Enter to exit..."
        exit 1
    fi
    echo "  OK."
fi

# ========== Step 2: OpenClaw ==========
echo ""
echo "  [2/3] Installing OpenClaw from USB..."
if [ -f "openclaw.tgz" ]; then
    sudo npm install -g openclaw.tgz 2>&1
else
    echo "  openclaw.tgz not found, installing from registry..."
    sudo npm install -g openclaw@2026.4.23 --registry=https://registry.npmmirror.com 2>&1
fi
if [ $? -ne 0 ]; then
    echo "  [ERROR] OpenClaw install failed."
    read -p "  Press Enter to exit..."
    exit 1
fi

# ========== Step 3: Verify ==========
echo ""
echo "  [3/3] Verifying..."
echo ""
node -v 2>/dev/null && echo "  Node.js: OK" || echo "  Node.js: not in PATH"
openclaw --version 2>/dev/null && echo "  OpenClaw: OK" || echo "  OpenClaw: open new terminal to use"

echo ""
echo "  =========================================="
echo "    Done! Open new terminal, type: openclaw"
echo "  =========================================="
echo ""
read -p "  Press Enter to exit..."
