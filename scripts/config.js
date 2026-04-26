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
async function saveModelConfig(provider, apiKey, baseUrl, model, apiProtocol) {
  logger.info(`保存模型配置: provider=${provider}, model=${model}, apiProtocol=${apiProtocol || 'default'}`);

  // 1. 写入 auth-profiles.json（OpenClaw 运行时从这里读取 API Key）
  const agentsDir = path.join(OPENCLAW_DIR, 'agents', 'main', 'agent');
  const authFile = path.join(agentsDir, 'auth-profiles.json');
  if (!fs.existsSync(agentsDir)) fs.mkdirSync(agentsDir, { recursive: true });

  let authData = { version: 1, profiles: {} };
  try {
    if (fs.existsSync(authFile)) {
      authData = JSON.parse(fs.readFileSync(authFile, 'utf8'));
      if (!authData.profiles) authData.profiles = {};
    }
  } catch {}

  authData.profiles[`${provider}:manual`] = {
    type: 'api_key',
    provider: provider,
    key: apiKey,
  };
  fs.writeFileSync(authFile, JSON.stringify(authData, null, 2), 'utf8');
  logger.info(`API Key 已保存到 auth-profiles.json`);

  // 2. 写入 models.json（provider baseUrl + 模型列表）
  const modelsFile = path.join(agentsDir, 'models.json');
  let modelsData = { providers: {} };
  try {
    if (fs.existsSync(modelsFile)) {
      modelsData = JSON.parse(fs.readFileSync(modelsFile, 'utf8'));
      if (!modelsData.providers) modelsData.providers = {};
    }
  } catch {}

  const providerApiMap = {
    anthropic: 'anthropic-messages',
    openai: 'openai-completions',
    zai: 'openai-completions',
    deepseek: 'openai-completions',
    qwen: 'openai-completions',
    kimi: 'anthropic-messages',
    minimax: 'openai-completions',
    stepfun: 'openai-completions',
  };

  const providerBaseUrlMap = {
    zai: 'https://open.bigmodel.cn/api/coding/paas/v4',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    kimi: 'https://api.kimi.com/coding/v1',
    minimax: 'https://api.minimax.chat/v1',
    deepseek: 'https://api.deepseek.com/v1',
    stepfun: 'https://api.stepfun.com/v1',
  };

  const providerModelsMap = {
    zai: [
      { id: 'glm-5v-turbo', name: 'GLM-5V Turbo', api: 'openai-completions', reasoning: true, input: ['text', 'image'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 204800, maxTokens: 131072 },
      { id: 'glm-5', name: 'GLM-5', api: 'openai-completions', reasoning: true, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 204800, maxTokens: 131072 },
      { id: 'glm-4.7', name: 'GLM-4.7', api: 'openai-completions', reasoning: true, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 204800, maxTokens: 131072 },
      { id: 'glm-4.5-air', name: 'GLM-4.5-Air', api: 'openai-completions', input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 4096 },
    ],
    qwen: [
      { id: 'qwen-max', name: 'Qwen Max', api: 'openai-completions', contextWindow: 32768, maxTokens: 8192 },
      { id: 'qwen-plus', name: 'Qwen Plus', api: 'openai-completions', contextWindow: 131072, maxTokens: 8192 },
      { id: 'qwen-turbo', name: 'Qwen Turbo', api: 'openai-completions', contextWindow: 131072, maxTokens: 8192 },
      { id: 'qwen3-coder-plus', name: 'Qwen3 Coder Plus', api: 'openai-completions', contextWindow: 131072, maxTokens: 16384 },
    ],
    kimi: [
      { id: 'kimi-code', name: 'Kimi Code', api: 'anthropic-messages' },
      { id: 'k2p5', name: 'K2P5', api: 'anthropic-messages' },
    ],
    deepseek: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', api: 'openai-completions', contextWindow: 65536, maxTokens: 8192 },
      { id: 'deepseek-coder', name: 'DeepSeek Coder', api: 'openai-completions', contextWindow: 65536, maxTokens: 16384 },
    ],
    minimax: [
      { id: 'MiniMax-Text-01', name: 'MiniMax-Text-01', api: 'openai-completions', contextWindow: 1024000, maxTokens: 16384 },
    ],
  };

  const effectiveBaseUrl = baseUrl || providerBaseUrlMap[provider] || '';
  const effectiveApi = apiProtocol || providerApiMap[provider] || 'openai-completions';

  // 清理旧 provider 残留（zhipu → zai 迁移等）
  const providerAliases = { zai: ['zhipu'], kimi: ['moonshot'] };
  const aliases = providerAliases[provider] || [];
  for (const alias of aliases) {
    if (modelsData.providers[alias]) {
      delete modelsData.providers[alias];
      logger.info(`清理旧 provider: ${alias} → ${provider}`);
    }
    const oldAuthKey = `${alias}:manual`;
    if (authData.profiles[oldAuthKey]) {
      delete authData.profiles[oldAuthKey];
      logger.info(`清理旧 auth profile: ${oldAuthKey}`);
    }
  }

  modelsData.providers[provider] = {
    baseUrl: effectiveBaseUrl,
    api: effectiveApi,
  };

  if (providerModelsMap[provider]) {
    modelsData.providers[provider].models = providerModelsMap[provider];
  }

  fs.writeFileSync(modelsFile, JSON.stringify(modelsData, null, 2), 'utf8');
  logger.info(`模型配置已保存到 models.json`);

  // 3. 更新 openclaw.json 默认模型
  const config = readConfig();
  if (!config.agents) config.agents = {};
  if (!config.agents.defaults) config.agents.defaults = {};

  config.agents.defaults.model = {
    primary: `${provider}/${model}`,
  };

  // 关键：必须同时设置 models 映射，否则 OpenClaw 会 fallback 到内置模型
  if (!config.agents.defaults.models) config.agents.defaults.models = {};
  config.agents.defaults.models[`${provider}/${model}`] = {};

  // gateway auth 不设置 mode，让 gateway 通过 --token 参数自行管理
  // 避免 openclaw.json 中的 auth 配置与 gateway-token 文件不匹配

  writeConfig(config);

  // 4. 同时写入 .env 作为兜底
  const envKeyMap = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    zai: 'ZAI_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    qwen: 'DASHSCOPE_API_KEY',
    kimi: 'MOONSHOT_API_KEY',
    minimax: 'MINIMAX_API_KEY',
    stepfun: 'STEPFUN_API_KEY',
    custom: 'CUSTOM_API_KEY',
  };
  const envKey = envKeyMap[provider];
  if (envKey) {
    const envFile = path.join(OPENCLAW_DIR, '.env');
    let envContent = '';
    if (fs.existsSync(envFile)) envContent = fs.readFileSync(envFile, 'utf8');
    const envLines = envContent.split('\n').filter(l => l.trim());
    const idx = envLines.findIndex(l => l.startsWith(envKey + '='));
    if (idx >= 0) envLines[idx] = `${envKey}=${apiKey}`;
    else envLines.push(`${envKey}=${apiKey}`);
    fs.writeFileSync(envFile, envLines.join('\n') + '\n', 'utf8');
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
    dmPolicy: 'open',
  };

  writeConfig(config);

  // CLI 同步为可选操作
  try {
    const cmd = getCmd('openclaw');
    // openclaw channels add 命令格式可能不同版本有差异
    // 直接写入配置文件已足够，CLI 调用仅作为补充
    execSync(`"${cmd}" configure --section channels`, {
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
    zai: 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/models',
    kimi: 'https://api.kimi.com/coding/v1/models',
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

    // Anthropic 和 Kimi 使用 x-api-key 头
    if (provider === 'anthropic' || provider === 'kimi') {
      delete headers['Authorization'];
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    }

    // 智谱用 chat completions 端点，用 POST 发一个最小请求验证
    if (provider === 'zai') {
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
            resolve({ ok: true, message: '连接成功！GLM Coding Plan API Key 有效' });
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
