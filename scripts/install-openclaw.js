// scripts/install-openclaw.js — 通过 npm 安装 OpenClaw（带重试）
const { spawn, execSync } = require('child_process');
const path = require('path');
const logger = require('./logger');

const NPM_MIRROR = 'https://registry.npmmirror.com';
const MAX_RETRIES = 3;

async function installOpenclaw(win) {
  logger.info('开始安装 OpenClaw...');

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info(`npm install 尝试 ${attempt}/${MAX_RETRIES}`);
      if (win && !win.isDestroyed() && attempt > 1) {
        win.webContents.send('install-progress', {
          message: `安装失败，正在重试 (${attempt}/${MAX_RETRIES})...`,
        });
      }
      await runNpmInstall(win);
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

function getNpmPath() {
  if (process.platform !== 'win32') return 'npm';
  // Windows: 查找 npm.cmd 的完整路径
  try {
    const npmPath = execSync('where npm.cmd', { encoding: 'utf8', timeout: 5000 }).split('\n')[0].trim();
    if (npmPath) return npmPath;
  } catch {}
  // 回退：尝试常见路径
  const candidates = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'npm.cmd'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'npm.cmd'),
  ];
  for (const c of candidates) {
    try {
      require('fs').accessSync(c);
      return c;
    } catch {}
  }
  return 'npm.cmd';
}

function runNpmInstall(win) {
  return new Promise((resolve, reject) => {
    const npmPath = getNpmPath();
    logger.info(`npm 路径: ${npmPath}`);

    const child = spawn('cmd', ['/c', npmPath, 'install', '-g', 'openclaw',
      `--registry=${NPM_MIRROR}`,
      '--prefer-online',
      '--no-audit',
      '--no-fund',
    ], {
      stdio: 'pipe',
      env: { ...process.env },
      windowsHide: true,
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
      reject(new Error(`无法执行 npm: ${err.message}\n请确认 Node.js 已正确安装。`));
    });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = installOpenclaw;
