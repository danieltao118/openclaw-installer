// scripts/install-openclaw.js — 通过 npm 安装 OpenClaw（带重试）
const { spawn } = require('child_process');
const logger = require('./logger');

const NPM_MIRROR = 'https://registry.npmmirror.com';
const MAX_RETRIES = 3;

async function installOpenclaw(win) {
  logger.info('开始安装 OpenClaw...');

  // Windows 下 npm 命令是 npm.cmd
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info(`npm install 尝试 ${attempt}/${MAX_RETRIES}`);
      if (win && !win.isDestroyed() && attempt > 1) {
        win.webContents.send('install-progress', {
          message: `安装失败，正在重试 (${attempt}/${MAX_RETRIES})...`,
        });
      }
      await runNpmInstall(npmCmd, win);
      logger.info('OpenClaw 安装成功');
      return { success: true };
    } catch (err) {
      lastError = err;
      logger.warn(`npm install 第 ${attempt} 次失败: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await sleep(2000 * attempt);
      }
    }
  }

  throw new Error(`OpenClaw 安装失败（已重试 ${MAX_RETRIES} 次）。\n${lastError.message}\n\n请尝试手动执行:\nnpm install -g openclaw --registry=${NPM_MIRROR}`);
}

function runNpmInstall(npmCmd, win) {
  return new Promise((resolve, reject) => {
    const child = spawn(npmCmd, [
      'install', '-g', 'openclaw',
      `--registry=${NPM_MIRROR}`,
      '--prefer-online',
      '--no-audit',
      '--no-fund',
    ], {
      stdio: 'pipe',
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      logger.info(`[npm stdout] ${text.trim()}`);

      if (win && !win.isDestroyed()) {
        win.webContents.send('install-progress', {
          message: text.trim(),
        });
      }
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      // npm 的进度输出在 stderr，不一定是错误
      logger.info(`[npm stderr] ${text.trim()}`);

      if (win && !win.isDestroyed()) {
        win.webContents.send('install-progress', {
          message: text.trim(),
        });
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`npm install 退出码: ${code}\n${stderr || stdout}`));
      }
    });

    child.on('error', (err) => {
      if (process.platform === 'win32') {
        // 尝试直接路径
        const nodeDir = 'C:\\Program Files\\nodejs';
        reject(new Error(`找不到 npm 命令。Node.js 可能未正确安装。\n请确认 ${nodeDir} 目录存在后重试。`));
      } else {
        reject(new Error(`无法执行 npm: ${err.message}`));
      }
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = installOpenclaw;
