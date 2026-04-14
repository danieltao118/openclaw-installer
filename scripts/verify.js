// scripts/verify.js — 安装验证
const { execSync } = require('child_process');
const logger = require('./logger');

// Windows 下全局命令需要 .cmd 后缀
function getCmd(name) {
  return process.platform === 'win32' ? name + '.cmd' : name;
}

async function verify() {
  const results = {
    nodeOk: false,
    nodeVersion: null,
    openclawOk: false,
    openclawVersion: null,
  };

  logger.info('开始安装验证');

  // 验证 Node.js
  try {
    results.nodeVersion = execSync('node --version', {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    results.nodeOk = true;
    logger.info(`验证 Node.js: ${results.nodeVersion}`);
  } catch (err) {
    results.nodeOk = false;
    logger.error(`Node.js 验证失败: ${err.message}`);
  }

  // 验证 OpenClaw（Windows 需要 .cmd）
  try {
    const cmd = getCmd('openclaw');
    results.openclawVersion = execSync(`"${cmd}" --version`, {
      encoding: 'utf8',
      timeout: 10000,
    }).trim();
    results.openclawOk = true;
    logger.info(`验证 OpenClaw: ${results.openclawVersion}`);
  } catch (err) {
    results.openclawOk = false;
    logger.error(`OpenClaw 验证失败: ${err.message}`);
  }

  const allOk = results.nodeOk && results.openclawOk;
  logger.info(`验证结果: ${allOk ? '全部通过' : '存在失败项'}`);

  return results;
}

module.exports = verify;
