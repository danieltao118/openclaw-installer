// scripts/feishu-scan.js — 直接调用飞书扫码注册 API，不依赖 openclaw CLI
const https = require('https');
const logger = require('./logger');

const FEISHU_ACCOUNTS_URL = 'https://accounts.feishu.cn';
const REGISTRATION_PATH = '/oauth/v1/app/registration';

function postRegistration(body) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams(body).toString();
    const url = new URL(REGISTRATION_PATH, FEISHU_ACCOUNTS_URL);

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`解析响应失败: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    req.write(postData);
    req.end();
  });
}

// Step 1: 初始化
async function initRegistration() {
  const res = await postRegistration({ action: 'init' });
  if (!res.supported_auth_methods?.includes('client_secret')) {
    throw new Error('当前环境不支持 client_secret 认证');
  }
  return res;
}

// Step 2: 获取扫码 URL 和 device_code
async function beginRegistration() {
  const res = await postRegistration({
    action: 'begin',
    archetype: 'PersonalAgent',
    auth_method: 'client_secret',
    request_user_info: 'open_id',
  });

  const qrUrl = new URL(res.verification_uri_complete);
  qrUrl.searchParams.set('from', 'oc_onboard');
  qrUrl.searchParams.set('tp', 'ob_cli_app');

  return {
    deviceCode: res.device_code,
    qrUrl: qrUrl.toString(),
    userCode: res.user_code,
    interval: res.interval || 5,
    expireIn: res.expire_in || 600,
  };
}

// Step 3: 轮询扫码结果
async function pollRegistration(deviceCode, interval, expireIn) {
  const deadline = Date.now() + expireIn * 1000;
  while (Date.now() < deadline) {
    try {
      const res = await postRegistration({
        action: 'poll',
        device_code: deviceCode,
        tp: 'ob_app',
      });

      if (res.client_id && res.client_secret) {
        return {
          status: 'success',
          appId: res.client_id,
          appSecret: res.client_secret,
          openId: res.user_info?.open_id,
        };
      }

      if (res.error === 'authorization_pending') {
        // 正常等待中
      } else if (res.error === 'slow_down') {
        interval += 5;
      } else if (res.error === 'access_denied') {
        return { status: 'denied' };
      } else if (res.error === 'expired_token') {
        return { status: 'expired' };
      } else if (res.error) {
        return { status: 'error', message: `${res.error}: ${res.error_description || ''}` };
      }
    } catch (err) {
      logger.warn(`轮询失败: ${err.message}`);
    }

    await new Promise(r => setTimeout(r, interval * 1000));
  }
  return { status: 'timeout' };
}

module.exports = { initRegistration, beginRegistration, pollRegistration };
