// scripts/install-openclaw.js — 安装 OpenClaw（和官方一样：npm install -g openclaw）
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('./logger');

const versions = require('./load-versions');
const OPENCLAW_VERSION = versions.openclaw;
const NPM_MIRROR = 'https://registry.npmmirror.com';

// 查找内置 tarball
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
        logger.info(`找到内置包: ${tgz}`);
        return tgz;
      }
    } catch {}
  }
  return null;
}

// 确保 npm 在 PATH 中（Node.js 刚装完，PATH 可能没刷新）
function ensureNpmInPath() {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const sep = process.platform === 'win32' ? ';' : ':';

  // 先检查 npm 是否已经可用（带重试，Node.js 刚装完可能需要等一下）
  for (let i = 0; i < 3; i++) {
    try {
      execSync(`${npmCmd} --version`, { timeout: 5000, stdio: 'pipe' });
      return;
    } catch {
      if (i < 2) {
        logger.info(`npm 暂不可用，等待后重试 (${i + 1}/3)...`);
        execSync('timeout /t 2 /nobreak >nul 2>&1 || sleep 2', { shell: true, timeout: 5000 });
      }
    }
  }

  // macOS: 从 login shell 刷新 PATH
  if (process.platform === 'darwin') {
    try {
      const shellPath = execSync('/usr/bin/env bash -lc "echo $PATH"', { encoding: 'utf8', timeout: 5000 }).trim();
      if (shellPath && shellPath.includes('/')) {
        process.env.PATH = shellPath;
        logger.info('macOS PATH 已从 login shell 刷新');
        return;
      }
    } catch {}
    // 兜底：添加常见路径
    for (const p of ['/usr/local/bin', '/opt/homebrew/bin']) {
      if (fs.existsSync(p) && !process.env.PATH.includes(p)) {
        process.env.PATH = p + sep + process.env.PATH;
      }
    }
    return;
  }

  // Windows: 从注册表刷新 PATH
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
    logger.info('Windows PATH 已从注册表刷新');
    return;
  } catch {}

  // 兜底：手动添加已知路径
  const dirs = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs'),
  ];
  for (const d of dirs) {
    if (fs.existsSync(path.join(d, 'npm.cmd'))) {
      process.env.PATH = d + ';' + process.env.PATH;
      logger.info(`手动添加到 PATH: ${d}`);
      return;
    }
  }
}

// 关闭运行中的 openclaw 进程（避免文件锁导致 EBUSY）
function killRunningProcesses() {
  try {
    if (process.platform === 'win32') {
      const out = execSync('tasklist /FO CSV /NH', { encoding: 'utf8', timeout: 10000 });
      const pids = [];
      out.split('\n').forEach(line => {
        const m = line.match(/"([^"]+)","(\d+)"/);
        if (m && m[1].toLowerCase() === 'openclaw.exe') pids.push(m[2]);
      });
      if (pids.length > 0) {
        execSync(`taskkill /F /PID ${pids.join(' /PID ')}`, { timeout: 10000 });
        logger.info(`已关闭 openclaw 进程: ${pids.join(', ')}`);
      }
    } else {
      execSync('pkill -f "openclaw gateway" 2>/dev/null || true', { timeout: 5000 });
    }
  } catch {}
}

// 确保 npm 全局目录存在（全新电脑可能没有 %APPDATA%\npm）
function ensureNpmGlobalDir() {
  if (process.platform === 'win32') {
    const npmDir = path.join(process.env.APPDATA || '', 'npm');
    if (!fs.existsSync(npmDir)) {
      fs.mkdirSync(npmDir, { recursive: true });
      logger.info(`创建 npm 全局目录: ${npmDir}`);
    }
  } else if (process.platform === 'darwin') {
    // macOS: 确保 npm 全局 bin 目录存在
    try {
      const prefix = execSync('npm config get prefix', { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }).trim();
      const binDir = path.join(prefix, 'bin');
      if (!fs.existsSync(binDir)) {
        fs.mkdirSync(binDir, { recursive: true });
        logger.info(`创建 npm bin 目录: ${binDir}`);
      }
    } catch {}
  }
}

async function installOpenclaw(win) {
  logger.info('开始安装 OpenClaw...');

  // 刷新 PATH（Node.js 上一步刚装完）
  ensureNpmInPath();

  // 关闭运行中的 openclaw（老用户重新安装时，gateway 进程会锁文件导致 EBUSY）
  killRunningProcesses();

  // 确保 npm 全局目录存在（全新电脑可能没有 %APPDATA%\npm）
  ensureNpmGlobalDir();

  // Git 配置 HTTPS 替代 SSH（避免 git@github.com 权限错误）
  try {
    execSync('git config --global url."https://github.com/".insteadOf ssh://git@github.com/', { timeout: 5000, stdio: 'pipe' });
    logger.info('Git: 已配置 HTTPS 替代 SSH');
  } catch {}

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  // 确定安装来源
  const bundledTgz = findBundledTgz();
  let installTarget = null;

  if (bundledTgz) {
    // 内置包路径如果有空格（如 C:\Program Files\...），复制到临时目录
    if (bundledTgz.includes(' ')) {
      const tempDir = path.join(os.tmpdir(), 'openclaw-install');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      installTarget = path.join(tempDir, 'openclaw-bundled.tgz');
      fs.copyFileSync(bundledTgz, installTarget);
      logger.info(`复制内置包到: ${installTarget}`);
    } else {
      installTarget = bundledTgz;
    }
  }

  // 构造 npm install 命令
  let args;
  if (installTarget) {
    logger.info(`使用内置包安装`);
    args = ['install', '-g', installTarget, `--registry=${NPM_MIRROR}`, '--no-audit', '--no-fund'];
  } else {
    logger.info(`在线安装 openclaw@${OPENCLAW_VERSION}`);
    args = ['install', '-g', `openclaw@${OPENCLAW_VERSION}`,
      `--registry=${NPM_MIRROR}`, '--no-audit', '--no-fund'];
  }

  // 执行安装
  await runCommand(npmCmd, args, win);

  logger.info('OpenClaw 安装完成');

  // 清理临时文件
  if (installTarget && installTarget !== bundledTgz) {
    try {
      const tempDir = path.dirname(installTarget);
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }

  // 验证
  ensureNpmInPath();
  let verified = false;
  let verifyReason = '';
  try {
    const cmd = process.platform === 'win32' ? 'openclaw.cmd' : 'openclaw';
    const ver = execSync(`${cmd} --version`, { timeout: 10000, encoding: 'utf8', stdio: 'pipe' }).trim();
    logger.info(`验证通过: ${ver}`);
    verified = true;
  } catch (err) {
    verifyReason = err.message;
    logger.warn(`验证失败: ${verifyReason}`);
    // 检查文件是否存在（可能是 PATH 问题）
    try {
      const prefix = execSync(`${npmCmd} prefix -g`, { encoding: 'utf8', timeout: 5000, stdio: 'pipe' }).trim();
      const exe = path.join(prefix, process.platform === 'win32' ? 'openclaw.cmd' : 'bin/openclaw');
      if (fs.existsSync(exe)) {
        verifyReason = `openclaw 已安装到 ${prefix}，但 PATH 未生效，请重启终端`;
        logger.info(verifyReason);
      }
    } catch {}
  }

  return { success: true, verified, verifyReason };
}

function runCommand(cmd, args, win) {
  return new Promise((resolve, reject) => {
    logger.info(`执行: ${cmd} ${args.join(' ')}`);

    const child = spawn(cmd, args, {
      stdio: 'pipe',
      env: { ...process.env },
      windowsHide: true,
      shell: true,
    });

    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('安装超时（10分钟）'));
    }, 10 * 60 * 1000);

    // 进度估算
    let pct = 0;
    const timer = setInterval(() => {
      if (pct < 90) {
        pct += 2;
        if (win && !win.isDestroyed()) {
          win.webContents.send('install-progress', { percent: pct, message: '正在安装 OpenClaw...' });
        }
      }
    }, 3000);

    child.stdout.on('data', (d) => { logger.info(`[npm] ${d.toString().trim()}`); });
    child.stderr.on('data', (d) => {
      const text = d.toString();
      const lines = text.split('\n').filter(l => l.trim() && !l.trim().startsWith('npm warn'));
      if (lines.length > 0) {
        stderr += lines.join('\n');
        logger.info(`[npm] ${lines.join(' ').trim()}`);
      }
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      clearInterval(timer);
      if (code === 0) {
        if (win && !win.isDestroyed()) win.webContents.send('install-progress', { percent: 100 });
        resolve();
      } else {
        reject(new Error(`npm install 退出码 ${code}\n${stderr}`));
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      clearInterval(timer);
      reject(new Error(`无法执行 npm: ${err.message}`));
    });
  });
}

module.exports = installOpenclaw;
