// scripts/detect.js — 环境检测
const { execSync } = require('child_process');
const os = require('os');
const https = require('https');
const logger = require('./logger');

// Windows 下全局命令需要 .cmd 后缀
function getCmd(name) {
  return process.platform === 'win32' ? name + '.cmd' : name;
}

async function detect(win) {
  const result = {
    os: process.platform,
    arch: process.arch,
    osName: os.type(),
    osVersion: os.release(),
    nodeStatus: 'unknown',
    nodeVersion: null,
    openclawStatus: 'unknown',
    networkOk: false,
  };

  logger.info('开始环境检测');

  // 1. 检测 Node.js
  try {
    const ver = execSync('node --version', { timeout: 5000, encoding: 'utf8' }).trim();
    result.nodeVersion = ver;
    const major = parseInt(ver.replace('v', '').split('.')[0], 10);
    result.nodeStatus = major >= 18 ? 'ok' : 'outdated';
    logger.info(`Node.js: ${ver} (${result.nodeStatus})`);
  } catch {
    result.nodeStatus = 'missing';
    logger.info('Node.js: 未安装');
  }

  // 2. 检测 OpenClaw（Windows 需要 .cmd）
  try {
    const cmd = getCmd('openclaw');
    const ver = execSync(`"${cmd}" --version`, { timeout: 5000, encoding: 'utf8' }).trim();
    result.openclawStatus = 'installed';
    result.openclawVersion = ver;
    logger.info(`OpenClaw: 已安装 ${ver}`);
  } catch {
    result.openclawStatus = 'missing';
    logger.info('OpenClaw: 未安装');
  }

  // 3. 网络连通性
  result.networkOk = await checkNetwork('https://registry.npmmirror.com');
  logger.info(`网络: ${result.networkOk ? '正常' : '不可用'}`);

  // 通知前端
  if (win && !win.isDestroyed()) {
    win.webContents.send('install-progress', {
      stepDone: 'istep-detect',
      message: `检测完成: OS=${result.os} 架构=${result.arch} Node=${result.nodeStatus} OpenClaw=${result.openclawStatus} 网络=${result.networkOk}`,
    });
  }

  return result;
}

function checkNetwork(url) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'HEAD', timeout: 8000 }, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

module.exports = detect;
