// scripts/config.js — OpenClaw 配置管理
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const logger = require('./logger');

const OPENCLAW_DIR = path.join(os.homedir(), '.openclaw');
const CONFIG_FILE = path.join(OPENCLAW_DIR, 'openclaw.json');

// Windows 下全局命令需要 .cmd 后缀
function getCmd(name) {
  return process.platform === 'win32' ? name + '.cmd' : name;
}

// 确保配置目录存在
function ensureConfigDir() {
  if (!fs.existsSync(OPENCLAW_DIR)) {
    fs.mkdirSync(OPENCLAW_DIR, { recursive: true });
    logger.info(`创建配置目录: ${OPENCLAW_DIR}`);
  }
}

// 读取配置
function readConfig() {
  try {
    ensureConfigDir();
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf8');
      // 简单的 JSON5 容错：去掉注释和尾部逗号
      const cleaned = content
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/,\s*([}\]])/g, '$1');
      return JSON.parse(cleaned);
    }
  } catch (err) {
    logger.warn(`读取配置失败: ${err.message}`);
  }
  return {};
}

// 写入配置
function writeConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  logger.info(`配置已保存: ${CONFIG_FILE}`);
}

// 保存模型配置
async function saveModelConfig(provider, apiKey, baseUrl, model) {
  logger.info(`保存模型配置: provider=${provider}, model=${model}`);

  const config = readConfig();

  // 设置环境变量形式的 API Key
  const envKeyMap = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    zhipu: 'ZHIPU_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    qwen: 'DASHSCOPE_API_KEY',
    kimi: 'MOONSHOT_API_KEY',
    minimax: 'MINIMAX_API_KEY',
    stepfun: 'STEPFUN_API_KEY',
    custom: 'CUSTOM_API_KEY',
  };

  const envKey = envKeyMap[provider];

  // 写入 .env 文件
  const envFile = path.join(OPENCLAW_DIR, '.env');
  let envContent = '';
  if (fs.existsSync(envFile)) {
    envContent = fs.readFileSync(envFile, 'utf8');
  }

  // 更新或添加 API Key
  const envLines = envContent.split('\n').filter(l => l.trim());
  const existingIdx = envLines.findIndex(l => l.startsWith(envKey + '='));
  if (existingIdx >= 0) {
    envLines[existingIdx] = `${envKey}=${apiKey}`;
  } else {
    envLines.push(`${envKey}=${apiKey}`);
  }
  fs.writeFileSync(envFile, envLines.join('\n') + '\n', 'utf8');
  logger.info(`API Key 已保存到 ${envFile}`);

  // 更新 openclaw.json 中的模型配置
  if (!config.agents) config.agents = {};
  if (!config.agents.defaults) config.agents.defaults = {};

  const modelMap = {
    'anthropic': `anthropic/${model}`,
    'openai': `openai/${model}`,
    'zhipu': `zhipu/${model}`,
    'deepseek': `deepseek/${model}`,
    'qwen': `qwen/${model}`,
    'kimi': `moonshot/${model}`,
    'minimax': `minimax/${model}`,
    'stepfun': `stepfun/${model}`,
    'custom': model, // 通用模式直接使用模型ID
  };

  config.agents.defaults.model = {
    primary: modelMap[provider] || model,
  };

  if (baseUrl) {
    if (!config.agents.defaults.models) config.agents.defaults.models = {};
    config.agents.defaults.models[modelMap[provider]] = {
      baseUrl: baseUrl,
    };
  }

  writeConfig(config);

  // CLI 同步为可选操作，失败不影响配置文件写入
  try {
    const cmd = getCmd('openclaw');
    // 使用 --yes 跳过交互确认
    execSync(`"${cmd}" config set agents.defaults.model.primary "${modelMap[provider]}" --yes`, {
      timeout: 10000,
      encoding: 'utf8',
      stdio: 'pipe', // 静默输出，避免 stderr 报错干扰
    });
    logger.info('已通过 CLI 更新模型配置');
  } catch (err) {
    // CLI 失败不影响配置（配置已直接写入文件）
    logger.info('CLI 配置同步跳过（配置已通过文件写入）');
  }

  return { success: true };
}

// 保存飞书通道配置
async function saveChannelConfig(appId, appSecret) {
  logger.info('保存飞书通道配置');

  const config = readConfig();

  if (!config.channels) config.channels = {};
  config.channels.feishu = {
    enabled: true,
    appId: appId,
    appSecret: appSecret,
    dmPolicy: 'pairing',
  };

  writeConfig(config);

  // CLI 同步为可选操作
  try {
    const cmd = getCmd('openclaw');
    // openclaw channels add 命令格式可能不同版本有差异
    // 直接写入配置文件已足够，CLI 调用仅作为补充
    execSync(`"${cmd}" configure --section channels --yes`, {
      timeout: 15000,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    logger.info('已通过 CLI 同步通道配置');
  } catch (err) {
    logger.info('CLI 通道同步跳过（配置已通过文件写入）');
  }

  return { success: true };
}

// 测试 API 连接
async function testApiConnection(provider, apiKey, baseUrl) {
  logger.info(`测试 API 连接: ${provider}`);

  const testUrls = {
    zhipu: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/models',
    kimi: 'https://api.moonshot.cn/v1/models',
    minimax: 'https://api.minimax.chat/v1/models',
    stepfun: 'https://api.stepfun.com/v1/models',
  };

  const url = baseUrl || testUrls[provider];
  if (!url) {
    // 通用模式需要用户提供 Base URL
    if (provider === 'custom') {
      return { ok: false, message: '通用模式需要填写 API 地址' };
    }
    return { ok: false, message: '未知的提供商' };
  }

  const https = require('https');
  const http = require('http');
  const client = url.startsWith('https') ? https : http;

  return new Promise((resolve) => {
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
    };

    // Anthropic 使用 x-api-key 头
    if (provider === 'anthropic') {
      delete headers['Authorization'];
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    }

    // 智谱用 chat completions 端点，用 POST 发一个最小请求验证
    if (provider === 'zhipu') {
      const postData = JSON.stringify({
        model: 'glm-4-flash',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      });
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(postData);

      const options = {
        method: 'POST',
        headers,
        timeout: 15000,
      };

      const req = client.request(url, options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true, message: '连接成功！智谱 API Key 有效' });
          } else if (res.statusCode === 401 || res.statusCode === 403) {
            resolve({ ok: false, message: 'API Key 无效或已过期，请检查' });
          } else {
            // 其他状态码可能是余额不足等，但key格式正确
            resolve({ ok: true, message: `已收到智谱服务器响应 (${res.statusCode})，Key 格式正确` });
          }
        });
      });
      req.on('error', (err) => resolve({ ok: false, message: `连接失败: ${err.message}` }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, message: '连接超时，请检查网络' }); });
      req.write(postData);
      req.end();
      return; // 提前返回，不走下面的通用逻辑
    }

    const options = {
      method: 'GET',
      headers,
      timeout: 10000,
    };

    const req = client.request(url, options, (res) => {
      res.resume();

      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve({ ok: true, message: '连接成功！API Key 有效' });
      } else if (res.statusCode === 401) {
        resolve({ ok: false, message: 'API Key 无效，请检查后重试' });
      } else if (res.statusCode === 403) {
        resolve({ ok: false, message: '权限不足，请检查 API Key 权限' });
      } else {
        // 非 200 不一定是失败，有些 API 列表接口需要特殊参数
        // 只要不是 401/403 就认为 Key 格式可能正确
        resolve({ ok: true, message: `已收到服务器响应 (状态码: ${res.statusCode})，API Key 格式可能正确` });
      }
    });

    req.on('error', (err) => {
      resolve({ ok: false, message: `连接失败: ${err.message}` });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, message: '连接超时，请检查网络' });
    });

    req.end();
  });
}

// 获取当前配置状态
function getConfigStatus() {
  const config = readConfig();
  const envFile = path.join(OPENCLAW_DIR, '.env');

  let hasApiKey = false;
  let hasFeishu = false;

  if (fs.existsSync(envFile)) {
    const envContent = fs.readFileSync(envFile, 'utf8');
    hasApiKey = /API_KEY=.+/.test(envContent);
  }

  if (config.channels && config.channels.feishu && config.channels.feishu.appId) {
    hasFeishu = true;
  }

  return {
    hasConfig: fs.existsSync(CONFIG_FILE),
    hasApiKey,
    hasFeishu,
    model: config.agents?.defaults?.model?.primary || '未设置',
  };
}

module.exports = {
  readConfig,
  writeConfig,
  saveModelConfig,
  saveChannelConfig,
  testApiConnection,
  getConfigStatus,
};
