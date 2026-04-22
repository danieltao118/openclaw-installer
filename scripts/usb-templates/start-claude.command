#!/bin/bash
# ============================================
#  Claude Code - macOS 便携启动
#  双击运行，M芯片/Intel 自动适配
# ============================================

# 清除 macOS 隔离标记
xattr -d com.apple.quarantine "$0" 2>/dev/null

cd "$(dirname "$0")"
USB_ROOT="$(cd .. && pwd)"
SCRIPT_DIR="$(pwd)"

# 清屏，显示标题
clear
echo ""
echo "  =========================================="
echo "    Claude Code - Tech Support (macOS)"
echo "    teach-AI bootcamp"
echo "  =========================================="
echo ""

# ========== 检测架构 ==========
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    TAR="node-darwin-arm64.tar.gz"
    LABEL="M1/M2/M3/M4"
else
    TAR="node-darwin-x64.tar.gz"
    LABEL="Intel"
fi
echo "  Detected: macOS $LABEL ($ARCH)"

# ========== 检查凭证 ==========
if [ ! -f "$USB_ROOT/.guard/key.dat" ]; then
    echo ""
    echo "  [ERROR] USB not initialized."
    echo "  Run prepare-usb.js first."
    echo ""
    read -p "  Press Enter to exit..."
    exit 1
fi

# ========== 首次运行：解压 portable-node ==========
NODE_BIN="$SCRIPT_DIR/portable-node/bin/node"
if [ ! -f "$NODE_BIN" ]; then
    echo ""
    echo "  [Setup] Extracting Node.js ($TAR)..."
    if [ ! -f "$SCRIPT_DIR/$TAR" ]; then
        echo "  [ERROR] $TAR not found on USB."
        echo "  Please copy it from bundled/ to macOS/ directory."
        read -p "  Press Enter to exit..."
        exit 1
    fi
    mkdir -p "$SCRIPT_DIR/portable-node"
    tar -xzf "$SCRIPT_DIR/$TAR" -C "$SCRIPT_DIR/portable-node" --strip-components=1
    if [ $? -ne 0 ]; then
        echo "  [ERROR] Failed to extract Node.js."
        read -p "  Press Enter to exit..."
        exit 1
    fi
    chmod +x "$NODE_BIN" 2>/dev/null
    echo "  Node.js extracted OK."
fi

# 验证 Node.js 可执行
NODE_VER=$("$NODE_BIN" -v 2>/dev/null)
if [ $? -ne 0 ]; then
    echo ""
    echo "  [ERROR] Node.js binary doesn't work on this Mac."
    echo "  Architecture mismatch? USB has $ARCH binaries."
    echo ""
    read -p "  Press Enter to exit..."
    exit 1
fi
echo "  Node.js: $NODE_VER"

# ========== 首次运行：安装 git ==========
GIT_PKG="git-mac.pkg"
GIT_BIN="$SCRIPT_DIR/portable-git/bin/git"
if ! command -v git &>/dev/null && [ ! -f "$GIT_BIN" ]; then
    echo ""
    echo "  [Setup] Installing portable Git..."
    # 尝试从U盘的 .pkg 安装（需要 sudo）
    if [ -f "$SCRIPT_DIR/$GIT_PKG" ]; then
        echo "  Found $GIT_PKG on USB. Installing (requires admin password)..."
        sudo installer -pkg "$SCRIPT_DIR/$GIT_PKG" -target / 2>/dev/null
        if [ $? -eq 0 ]; then
            echo "  Git installed OK."
        else
            echo "  [WARN] pkg install failed. Trying xcode-select..."
            xcode-select --install 2>/dev/null
            echo "  Please run this script again after installation completes."
            read -p "  Press Enter to exit..."
            exit 1
        fi
    else
        echo "  $GIT_PKG not found on USB."
        echo "  Installing Xcode Command Line Tools instead..."
        xcode-select --install 2>/dev/null
        echo "  Please run this script again after installation completes."
        read -p "  Press Enter to exit..."
        exit 1
    fi
fi
if command -v git &>/dev/null; then
    echo "  Git: $(git --version)"
elif [ -f "$GIT_BIN" ]; then
    echo "  Git: $($GIT_BIN --version) (portable)"
else
    echo "  Git: [WARN] not available"
fi

# ========== 密码输入 ==========
echo ""
read -s -p "  Password: " PASS
echo ""

# 临时密码文件
TMPPASS=$(mktemp /tmp/oclaw.XXXXXX)
trap 'rm -f "$TMPPASS" 2>/dev/null' EXIT

echo "$PASS" > "$TMPPASS"
unset PASS

# ========== 验证密码 ==========
"$NODE_BIN" "$USB_ROOT/tools/verify-password.js" "$USB_ROOT/.guard/key.dat" "$TMPPASS"
if [ $? -ne 0 ]; then
    echo ""
    echo "  [ERROR] Wrong password."
    exit 1
fi

# ========== 启动 Claude Code ==========
echo ""
"$NODE_BIN" "$SCRIPT_DIR/launcher-mac.js" "$TMPPASS"

echo ""
read -p "  Press Enter to exit..."
