#!/bin/bash
# OpenClaw macOS 配置向导

CONFIG_DIR="$HOME/.openclaw"

echo ""
echo "=========================================="
echo "  OpenClaw 配置向导 (macOS)"
echo "=========================================="
echo ""

# 检查 openclaw
if ! command -v openclaw &>/dev/null; then
    echo "[错误] OpenClaw 未安装，请先运行 install.sh"
    exit 1
fi

mkdir -p "$CONFIG_DIR"

# 选择提供商
echo "请选择 AI 提供商："
echo "  [1] 智谱 GLM（推荐）"
echo "  [2] 通义千问"
echo "  [3] Kimi（月之暗面）"
echo "  [4] MiniMax"
echo "  [5] 自定义（OpenAI 兼容）"
echo ""
read -p "请输入编号 (1-5): " provider

case "$provider" in
    1) base_url="https://open.bigmodel.cn/api/paas/v4"; default_model="glm-5.1"; key_url="https://open.bigmodel.cn" ;;
    2) base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"; default_model="qwen-max"; key_url="https://bailian.console.aliyun.com" ;;
    3) base_url="https://api.moonshot.cn/v1"; default_model="moonshot-v1-128k"; key_url="https://platform.moonshot.cn" ;;
    4) base_url="https://api.minimax.chat/v1"; default_model="MiniMax-Text-01"; key_url="https://platform.minimaxi.com" ;;
    5) read -p "请输入 API 地址: " base_url; default_model="" ;;
    *) echo "无效选择"; exit 1 ;;
esac

# 输入 API Key
echo ""
echo "请输入 API Key（在 $key_url 获取）:"
read -p "API Key: " api_key
if [ -z "$api_key" ]; then
    echo "[错误] API Key 不能为空"
    exit 1
fi

# 输入模型
echo ""
if [ -n "$default_model" ]; then
    read -p "模型名称（回车使用默认: $default_model）: " model
    model="${model:-$default_model}"
else
    read -p "请输入模型名称: " model
fi

# 写入配置
cat > "$CONFIG_DIR/config.json" << EOF
{
  "provider": "$provider",
  "apiKey": "$api_key",
  "baseUrl": "$base_url",
  "model": "$model"
}
EOF

echo ""
echo "[完成] 配置已保存到 $CONFIG_DIR/config.json"
echo "  提供商: $base_url"
echo "  模型: $model"
echo ""
echo "启动 OpenClaw: openclaw gateway start"
echo ""
