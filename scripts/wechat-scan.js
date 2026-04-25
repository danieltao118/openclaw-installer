/**
 * 微信扫码登录模块
 * 直接调用微信 iLink API，不依赖 CLI 的终端 QR 输出
 */
const https = require('https');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const logger = require('./logger');

const ILINK_BASE_URL = 'https://ilinkai.weixin.qq.com';
const BOT_TYPE = '3';
const QR_POLL_TIMEOUT_MS = 35000;
const QR_EXPIRE_MS = 5 * 60 * 1000;

// 跨平台命令名
function getCmd(name) {
  return process.platform === 'win32' ? name + '.cmd' : name;
}

// HTTPS GET 请求
function httpsGet(url, headers = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const req = https.get(url, {
      headers: {
        'iLink-App-Id': 'bot',
        'iLink-App-ClientVersion': String(131332), // 2.1.10 encoded
        ...headers,
      },
      signal: controller.signal,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        clearTimeout(timer);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// 获取 QR 码
async function fetchQRCode() {
  const url = `${ILINK_BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(BOT_TYPE)}`;
  const raw = await httpsGet(url, {}, 15000);
  const resp = JSON.parse(raw);
  if (!resp.qrcode || !resp.qrcode_img_content) {
    throw new Error('QR 响应缺少必要字段: ' + raw.substring(0, 200));
  }
  return resp;
}

// 轮询扫码状态（长轮询）
async function pollQRStatus(qrcode) {
  const url = `${ILINK_BASE_URL}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`;
  try {
    const raw = await httpsGet(url, {}, QR_POLL_TIMEOUT_MS);
    return JSON.parse(raw);
  } catch (err) {
    // 超时视为等待
    if (err.name === 'AbortError') {
      return { status: 'wait' };
    }
    throw err;
  }
}

// 安装微信插件
async function installWeixinPlugin() {
  const cmd = getCmd('openclaw');
  const config = require('./config');
  logger.info('开始安装微信插件...');

  // 先检查是否已安装
  const cfg = config.readConfig();
  if (cfg.plugins?.entries?.['openclaw-weixin']?.enabled) {
    logger.info('微信插件已启用，跳过安装');
    return;
  }

  try {
    execSync(`"${cmd}" plugins install "@tencent-weixin/openclaw-weixin" --registry=https://registry.npmmirror.com`, {
      timeout: 180000,
      stdio: 'pipe',
      windowsHide: true,
    });
    logger.info('微信插件安装成功');
  } catch (err) {
    const stderr = (err.stderr || '').toString();
    const stdout = (err.stdout || '').toString();
    const combined = stderr + stdout;
    if (combined.includes('already exists') || combined.includes('already installed') || combined.includes('Already')) {
      logger.info('微信插件已安装，跳过');
    } else {
      throw new Error('微信插件安装失败: ' + (err.message || String(err)));
    }
  }

  // 启用插件
  const cfg2 = config.readConfig();
  if (!cfg2.plugins) cfg2.plugins = {};
  if (!cfg2.plugins.entries) cfg2.plugins.entries = {};
  cfg2.plugins.entries['openclaw-weixin'] = { enabled: true };
  config.writeConfig(cfg2);
  logger.info('微信插件已启用');
}

// 检查微信是否已配置
function checkWeixinStatus() {
  // 检查 openclaw.json 中插件是否启用
  const config = require('./config');
  const cfg = config.readConfig();
  if (!cfg.plugins?.entries?.['openclaw-weixin']?.enabled) {
    return false;
  }
  // 检查是否有账号凭证
  const stateDir = path.join(os.homedir(), '.openclaw', 'state', 'openclaw-weixin', 'accounts');
  try {
    if (!fs.existsSync(stateDir)) return false;
    const accounts = fs.readdirSync(stateDir).filter(f => f.endsWith('.json') && f !== 'accounts.json');
    return accounts.length > 0;
  } catch {
    return false;
  }
}

// 保存微信账号凭证
function saveWeixinAccount(accountId, botToken, baseUrl, userId) {
  const accountsDir = path.join(os.homedir(), '.openclaw', 'state', 'openclaw-weixin', 'accounts');
  fs.mkdirSync(accountsDir, { recursive: true });

  const data = {
    token: botToken,
    savedAt: new Date().toISOString(),
    baseUrl: baseUrl || ILINK_BASE_URL,
    ...(userId ? { userId } : {}),
  };
  fs.writeFileSync(path.join(accountsDir, `${accountId}.json`), JSON.stringify(data, null, 2), 'utf-8');
  logger.info(`微信账号凭证已保存: ${accountId}`);

  // 注册账号 ID
  const indexPath = path.join(accountsDir, '..', 'accounts.json');
  let index = [];
  try {
    if (fs.existsSync(indexPath)) {
      index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    }
  } catch {}
  if (!index.includes(accountId)) {
    index.push(accountId);
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  // 更新 openclaw.json 通知 gateway 重新加载
  const config = require('./config');
  const cfg = config.readConfig();
  if (!cfg.channels) cfg.channels = {};
  cfg.channels['openclaw-weixin'] = {
    ...(cfg.channels['openclaw-weixin'] || {}),
    channelConfigUpdatedAt: new Date().toISOString(),
  };
  config.writeConfig(cfg);
}

module.exports = {
  fetchQRCode,
  pollQRStatus,
  installWeixinPlugin,
  checkWeixinStatus,
  saveWeixinAccount,
};
