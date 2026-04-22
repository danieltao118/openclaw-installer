#!/bin/bash
# ============================================
#  macOS 诊断工具
#  检查U盘 Claude Code 便携环境
# ============================================

xattr -d com.apple.quarantine "$0" 2>/dev/null

cd "$(dirname "$0")"
USB_ROOT="$(cd .. && pwd)"
SCRIPT_DIR="$(pwd)"

echo ""
echo "  =========================================="
echo "    macOS Diagnostics"
echo "  =========================================="
echo ""

ARCH=$(uname -m)
echo "  Host: macOS $(sw_vers -productVersion) ($ARCH)"
echo ""

OK=0
FAIL=0

# 1. portable-node
echo "  [1/5] Portable Node.js..."
NODE_BIN="$SCRIPT_DIR/portable-node/bin/node"
if [ -f "$NODE_BIN" ]; then
    NODE_VER=$("$NODE_BIN" -v 2>/dev/null)
    if [ $? -eq 0 ]; then
        echo "  OK: $NODE_VER"
        OK=$((OK+1))
    else
        echo "  FAIL: binary exists but won't run (arch mismatch?)"
        FAIL=$((FAIL+1))
    fi
else
    TAR=""
    if [ "$ARCH" = "arm64" ]; then TAR="node-darwin-arm64.tar.gz"
    else TAR="node-darwin-x64.tar.gz"; fi
    if [ -f "$SCRIPT_DIR/$TAR" ]; then
        echo "  FAIL: not extracted yet (run start-claude.command first)"
    else
        echo "  FAIL: $TAR missing from USB"
    fi
    FAIL=$((FAIL+1))
fi

# 2. Claude Code
echo ""
echo "  [2/5] Claude Code..."
CLAUDE_CLI="$USB_ROOT/claude-portable/node_modules/@anthropic-ai/claude-code/cli.js"
if [ -f "$CLAUDE_CLI" ]; then
    echo "  OK: cli.js found"
    OK=$((OK+1))
else
    echo "  FAIL: claude-portable not installed"
    FAIL=$((FAIL+1))
fi

# 3. Credentials
echo ""
echo "  [3/5] Credentials..."
if [ -f "$USB_ROOT/.guard/credentials.enc" ]; then
    echo "  OK: credentials.enc"
    OK=$((OK+1))
else
    echo "  FAIL: .guard/credentials.enc missing"
    FAIL=$((FAIL+1))
fi
if [ -f "$USB_ROOT/.guard/key.dat" ]; then
    echo "  OK: key.dat"
    OK=$((OK+1))
else
    echo "  FAIL: .guard/key.dat missing"
    FAIL=$((FAIL+1))
fi

# 4. launcher-mac.js
echo ""
echo "  [4/5] launcher-mac.js..."
if [ -f "$SCRIPT_DIR/launcher-mac.js" ]; then
    # 语法检查
    if [ -f "$NODE_BIN" ]; then
        "$NODE_BIN" -c "$SCRIPT_DIR/launcher-mac.js" 2>/dev/null
        if [ $? -eq 0 ]; then
            echo "  OK: syntax valid"
            OK=$((OK+1))
        else
            echo "  FAIL: syntax error"
            FAIL=$((FAIL+1))
        fi
    else
        echo "  OK: file exists (can't check syntax without Node)"
        OK=$((OK+1))
    fi
else
    echo "  FAIL: launcher-mac.js not found"
    FAIL=$((FAIL+1))
fi

# 5. Network
echo ""
echo "  [5/5] Network (open.bigmodel.cn)..."
curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 https://open.bigmodel.cn 2>/dev/null | grep -q "200\|301\|302"
if [ $? -eq 0 ]; then
    echo "  OK: reachable"
    OK=$((OK+1))
else
    echo "  WARN: not reachable (may need WiFi)"
    FAIL=$((FAIL+1))
fi

# Summary
echo ""
echo "  =========================================="
echo "  Results: $OK OK, $FAIL FAIL"
echo "  =========================================="
echo ""
read -p "  Press Enter to exit..."
