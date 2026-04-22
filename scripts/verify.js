// scripts/verify.js — 安装验证
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
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

  // 验证前刷新 PATH（Node.js/npm 刚安装，PATH 可能未生效）
  refreshPath();

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
    results.openclawVersion = execSync(`${cmd} --version`, {
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

function refreshPath() {
  if (process.platform === 'win32') {
    try {
      const sysPath = execSync(
        'powershell -Command "[Environment]::GetEnvironmentVariable(\'Path\',\'Machine\')"',
        { encoding: 'utf8', timeout: 10000, stdio: 'pipe' }
      ).trim();
      const userPath = execSync(
        'powershell -Command "[Environment]::GetEnvironmentVariable(\'Path\',\'User\')"',
        { encoding: 'utf8', timeout: 10000, stdio: 'pipe' }
      ).trim();
      process.env.PATH = sysPath + ';' + userPath;
      logger.info('验证前 PATH 已刷新');
    } catch (err) {
      logger.warn(`验证前刷新 PATH 失败: ${err.message}`);
    }
    // 确保 nodejs 和 npm 全局目录在 PATH 中
    const dirs = [
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs'),
      path.join(process.env.APPDATA || '', 'npm'),
    ];
    for (const d of dirs) {
      if (fs.existsSync(d) && !process.env.PATH.toLowerCase().includes(d.toLowerCase())) {
        process.env.PATH = d + ';' + process.env.PATH;
      }
    }
  } else if (process.platform === 'darwin') {
    // macOS: 从 login shell 刷新 PATH
    try {
      const shellPath = execSync('/usr/bin/env bash -lc "echo $PATH"', { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }).trim();
      if (shellPath && shellPath.includes('/')) {
        process.env.PATH = shellPath;
        logger.info('macOS 验证前 PATH 已刷新');
      }
    } catch {}
    // 兜底：添加常见路径
    for (const p of ['/usr/local/bin', '/opt/homebrew/bin']) {
      if (fs.existsSync(p) && !process.env.PATH.includes(p)) {
        process.env.PATH = p + ':' + process.env.PATH;
      }
    }
    // 确保 npm 全局 bin 目录在 PATH 中
    try {
      const prefix = execSync('npm config get prefix', { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }).trim();
      const binDir = prefix + '/bin';
      if (!process.env.PATH.includes(binDir) && !process.env.PATH.includes(prefix)) {
        process.env.PATH = binDir + ':' + process.env.PATH;
      }
    } catch {}
  }
}

module.exports = verify;
