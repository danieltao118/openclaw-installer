// scripts/install-openclaw.js — 通过 npm 安装 OpenClaw（优先使用内置包）
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const NPM_MIRROR = 'https://registry.npmmirror.com';
const MAX_RETRIES = 3;
const INSTALL_TIMEOUT = 5 * 60 * 1000; // 5分钟超时

const versions = require('./load-versions');
const OPENCLAW_VERSION = versions.openclaw;

// 查找内置 tarball（多个 fallback 路径）
function findBundledTgz() {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'bundled') : null,
    path.join(__dirname, '..', 'bundled'),
    path.join(__dirname, '..', '..', 'bundled'),
  ];
  for (const dir of candidates) {
    if (!dir) continue;
    try {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter(f => f.startsWith('openclaw-') && f.endsWith('.tgz'));
      if (files.length > 0) {
        const tgz = path.join(dir, files[0]);
        logger.info(`找到内置 OpenClaw: ${tgz}`);
        return tgz;
      }
    } catch {}
  }
  return null;
}

async function installOpenclaw(win) {
  logger.info('开始安装 OpenClaw...');

  // 安装前先关闭正在运行的 OpenClaw 进程，避免 EBUSY 文件锁
  killOpenclawProcesses();

  // 确保 npm 全局目录存在（新电脑可能没有 APPDATA\npm）
  ensureNpmGlobalDir();

  // 先卸载旧版，避免 npm install 时 EBUSY rename 错误
  try {
    const npmPath = getNpmPath();
    logger.info(`卸载旧版: ${npmPath} uninstall -g openclaw`);
    execSync(`"${npmPath}" uninstall -g openclaw`, {
      timeout: 30000,
      windowsHide: true,
      stdio: 'pipe',
    });
    logger.info('旧版卸载完成');
  } catch (err) {
    logger.info(`旧版卸载跳过（可能未安装）: ${err.message}`);
  }

  const bundledTgz = findBundledTgz();
  if (bundledTgz) {
    logger.info(`将使用内置包: ${bundledTgz}`);
  } else {
    logger.info(`未找到内置包，将在线安装 v${OPENCLAW_VERSION}`);
  }

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info(`安装尝试 ${attempt}/${MAX_RETRIES}`);
      if (win && !win.isDestroyed() && attempt > 1) {
        win.webContents.send('install-progress', {
          message: `安装失败，正在重试 (${attempt}/${MAX_RETRIES})...`,
        });
      }
      await runNpmInstall(win, bundledTgz);
      logger.info('OpenClaw 安装成功');

      // 安装后验证
      const verified = verifyOpenclaw();
      if (!verified) {
        logger.warn('安装后验证失败：openclaw --version 未返回结果');
      }

      return { success: true, verified };
    } catch (err) {
      lastError = err;
      logger.warn(`安装第 ${attempt} 次失败: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await sleep(2000 * attempt);
      }
    }
  }

  throw new Error(`OpenClaw 安装失败（已重试 ${MAX_RETRIES} 次）。\n${lastError.message}\n\n请尝试手动执行:\nnpm install -g openclaw@${OPENCLAW_VERSION} --registry=${NPM_MIRROR}`);
}

function getNpmPath() {
  if (process.platform !== 'win32') return 'npm';
  try {
    const npmPath = execSync('where npm.cmd', { encoding: 'utf8', timeout: 5000 }).split('\n')[0].trim();
    if (npmPath) return npmPath;
  } catch {}
  const candidates = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'npm.cmd'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'npm.cmd'),
  ];
  for (const c of candidates) {
    try { fs.accessSync(c); return c; } catch {}
  }
  return 'npm.cmd';
}

function runNpmInstall(win, bundledTgz) {
  return new Promise((resolve, reject) => {
    const npmPath = getNpmPath();
    logger.info(`npm 路径: ${npmPath}`);

    let args;
    if (bundledTgz && fs.existsSync(bundledTgz)) {
      logger.info(`使用内置 tarball 安装`);
      args = ['install', '-g', bundledTgz, '--no-audit', '--no-fund'];
    } else {
      logger.info(`使用在线安装 openclaw@${OPENCLAW_VERSION}`);
      args = ['install', '-g', `openclaw@${OPENCLAW_VERSION}`,
        `--registry=${NPM_MIRROR}`,
        '--no-audit', '--no-fund',
      ];
    }

    const child = spawn('cmd', ['/c', npmPath, ...args], {
      stdio: 'pipe',
      env: { ...process.env },
      windowsHide: true,
    });

    let stderr = '';
    const startTime = Date.now();

    // 进度估算：基于时间，从0%到90%
    let estimatedPercent = 0;
    const progressTimer = setInterval(() => {
      if (estimatedPercent < 90) {
        estimatedPercent += 2;
        if (win && !win.isDestroyed()) {
          win.webContents.send('install-progress', {
            percent: estimatedPercent,
            message: '正在安装 OpenClaw，请稍候...',
          });
        }
      }
    }, 3000);

    child.stdout.on('data', (data) => {
      const text = data.toString();
      logger.info(`[npm] ${text.trim()}`);
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      // 过滤 npm warn，只保留真正的错误
      const lines = text.split('\n').filter(l => {
        const trimmed = l.trim();
        return trimmed && !trimmed.startsWith('npm warn') && !trimmed.startsWith('WARN');
      });
      if (lines.length > 0) {
        stderr += lines.join('\n');
        logger.info(`[npm err] ${lines.join(' ').trim()}`);
      }
    });

    // 超时保护
    const timeoutTimer = setTimeout(() => {
      clearInterval(progressTimer);
      child.kill();
      reject(new Error(`安装超时（5分钟），请尝试手动执行:\nnpm install -g openclaw@${OPENCLAW_VERSION} --registry=${NPM_MIRROR}`));
    }, INSTALL_TIMEOUT);

    child.on('close', (code) => {
      clearInterval(progressTimer);
      clearTimeout(timeoutTimer);
      if (code === 0) {
        if (win && !win.isDestroyed()) {
          win.webContents.send('install-progress', { percent: 100 });
        }
        resolve();
      } else {
        reject(new Error(`npm install 退出码: ${code}\n${stderr}`));
      }
    });

    child.on('error', (err) => {
      clearInterval(progressTimer);
      clearTimeout(timeoutTimer);
      reject(new Error(`无法执行 npm: ${err.message}\n请确认 Node.js 已正确安装。`));
    });
  });
}

function killOpenclawProcesses() {
  try {
    if (process.platform === 'win32') {
      const output = execSync('tasklist /FO CSV /NH', { encoding: 'utf8', timeout: 10000 });
      const pids = [];
      output.split('\n').forEach(line => {
        const match = line.match(/"([^"]+)","(\d+)"/);
        if (match) {
          const name = match[1].toLowerCase();
          if (name === 'openclaw.exe' || name === 'node.exe' && line.toLowerCase().includes('openclaw')) {
            pids.push(match[2]);
          }
        }
      });
      if (pids.length > 0) {
        logger.info(`关闭 OpenClaw 进程: PID ${pids.join(', ')}`);
        execSync(`taskkill /F /PID ${pids.join(' /PID ')}`, { timeout: 10000 });
        const start = Date.now();
        while (Date.now() - start < 3000) {
          try { execSync('tasklist /FI "IMAGENAME eq openclaw.exe" /NH', { encoding: 'utf8', timeout: 5000 }); } catch { break; }
        }
      }
    } else {
      // macOS/Linux: 用 pkill 关闭 openclaw gateway 进程
      try {
        const out = execSync('pgrep -f "openclaw gateway" || true', { encoding: 'utf8', timeout: 5000 }).trim();
        if (out) {
          logger.info(`关闭 OpenClaw 进程: PID ${out.replace(/\n/g, ', ')}`);
          execSync('pkill -f "openclaw gateway"', { timeout: 5000 });
          setTimeout(() => {}, 2000);
        }
      } catch {}
    }
  } catch (err) {
    logger.warn(`关闭进程失败（可忽略）: ${err.message}`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureNpmGlobalDir() {
  if (process.platform === 'win32') {
    // Windows 上 npm 全局安装目录可能不存在，需要手动创建
    const appData = process.env.APPDATA;
    if (!appData) return;
    const npmDir = path.join(appData, 'npm');
    if (!fs.existsSync(npmDir)) {
      fs.mkdirSync(npmDir, { recursive: true });
      logger.info(`创建 npm 全局目录: ${npmDir}`);
    }
    const nmDir = path.join(npmDir, 'node_modules');
    if (!fs.existsSync(nmDir)) {
      fs.mkdirSync(nmDir, { recursive: true });
      logger.info(`创建 node_modules 目录: ${nmDir}`);
    }
  } else {
    // macOS/Linux: 确保 npm 全局 bin 目录存在
    try {
      const prefix = execSync('npm config get prefix', { encoding: 'utf8', timeout: 5000 }).trim();
      const binDir = path.join(prefix, 'bin');
      if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
        logger.info(`创建 npm bin 目录: ${binDir}`);
      }
    } catch {}
  }
}

function verifyOpenclaw() {
  try {
    // 刷新 PATH 以包含新安装的位置
    const prefix = execSync('npm config get prefix', { encoding: 'utf8', timeout: 5000 }).trim();
    const newPath = process.platform === 'win32'
      ? prefix + ';' + process.env.PATH
      : prefix + '/bin:' + process.env.PATH;
    process.env.PATH = newPath;

    const cmd = process.platform === 'win32' ? 'openclaw.cmd' : 'openclaw';
    const ver = execSync(`"${cmd}" --version`, { timeout: 10000, encoding: 'utf8' }).trim();
    logger.info(`安装验证: ${ver}`);
    return true;
  } catch (err) {
    logger.warn(`安装验证失败: ${err.message}`);
    return false;
  }
}

module.exports = installOpenclaw;
