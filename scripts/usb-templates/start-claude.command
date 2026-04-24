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

# ========== 首次运行：修复便携 git 符号链接 ==========
GIT_BIN="$SCRIPT_DIR/portable-git/bin/git"
if [ -f "$GIT_BIN" ] && [ ! -f "$GIT_BIN.exec" ]; then
    # 便携 git 已预提取，修复 Windows 无法保存的符号链接
    chmod +x "$GIT_BIN" 2>/dev/null
    LINK_COUNT=0
    while IFS= read -r -d '' LINKFILE; do
        TARGET=$(cat "$LINKFILE")
        REALFILE="${LINKFILE%.link}"
        rm -f "$REALFILE" 2>/dev/null
        ln -sf "$TARGET" "$REALFILE" 2>/dev/null
        rm -f "$LINKFILE" 2>/dev/null
        LINK_COUNT=$((LINK_COUNT + 1))
    done < <(find "$SCRIPT_DIR/portable-git" -name '*.link' -print0 2>/dev/null)
    # 标记已修复
    touch "$GIT_BIN.exec"
    echo "  Git symlinks fixed ($LINK_COUNT)."
fi

# 添加便携 git 到 PATH
if [ -f "$GIT_BIN" ]; then
    export PATH="$SCRIPT_DIR/portable-git/bin:$PATH"
    export GIT_EXEC_PATH="$SCRIPT_DIR/portable-git/libexec/git-core"
    echo "  Git: $($GIT_BIN --version) (portable)"
elif command -v git &>/dev/null; then
    echo "  Git: $(git --version) (system)"
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
