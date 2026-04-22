// scripts/install-git.js — 安装 Git（Windows: 静默安装 .exe / macOS: xcode-select --install）
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const logger = require('./logger');

const versions = require('./load-versions');
const GIT_VERSION = versions.git;

const GIT_BASE_URL = `https://github.com/git-for-windows/git/releases/download/v${GIT_VERSION}.windows.1/`;

function getDownloadInfo() {
  const arch = process.arch === 'arm64' ? 'arm64' : '64-bit';
  return {
    url: `${GIT_BASE_URL}Git-${GIT_VERSION}-${arch}.exe`,
    filename: `Git-${GIT_VERSION}-${arch}.exe`,
  };
}

async function installGit(win) {
  // macOS: 用 xcode-select --install 安装 Command Line Tools（包含 git）
  if (process.platform === 'darwin') {
    return installMacGit(win);
  }

  // Windows: 下载并静默安装 Git for Windows
  const { url, filename } = getDownloadInfo();
  const destPath = path.join(os.tmpdir(), filename);

  // 优先使用内置资源
  let bundledPath = null;
  try {
    const resPath = path.join(process.resourcesPath, 'bundled', filename);
    if (fs.existsSync(resPath) && fs.statSync(resPath).size > 1024) {
      bundledPath = resPath;
      logger.info(`发现内置 Git: ${resPath}`);
    }
  } catch {}

  logger.info(`开始安装 Git v${GIT_VERSION}`);

  if (bundledPath) {
    logger.info('使用内置安装包，跳过下载');
    if (win && !win.isDestroyed()) {
      win.webContents.send('install-progress', {
        message: '使用内置 Git 安装包，无需下载',
      });
    }
    fs.copyFileSync(bundledPath, destPath);
    logger.info(`已复制到: ${destPath}`);
  } else {
    logger.info(`下载地址: ${url}`);
    if (win && !win.isDestroyed()) {
      win.webContents.send('install-progress', {
        message: `正在下载 Git v${GIT_VERSION}...`,
      });
    }
    await downloadFile(url, destPath, (percent) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('install-progress', { percent: percent * 0.5 });
      }
    });
    logger.info(`下载完成: ${destPath}`);
  }

  // 静默安装
  if (win && !win.isDestroyed()) {
    win.webContents.send('install-progress', {
      message: '正在安装 Git...',
    });
  }

  await runSilentInstall(destPath);

  // 刷新 PATH
  refreshPath();

  // 清理
  try { fs.unlinkSync(destPath); } catch {}

  // 验证
  try {
    const ver = execSync('git --version', { timeout: 5000, encoding: 'utf8' }).trim();
    logger.info(`Git 安装验证: ${ver}`);
  } catch {
    logger.warn('Git 安装后验证失败（可能需要重启终端）');
  }

  logger.info('Git 安装完成');
  return { success: true };
}

function runSilentInstall(exePath) {
  return new Promise((resolve, reject) => {
    logger.info('执行 Git 静默安装...');
    // Git for Windows 使用 Inno Setup，支持 /VERYSILENT
    const child = spawn(exePath, [
      '/VERYSILENT',
      '/NORESTART',
      '/NOCANCEL',
      '/SP-',
      '/CLOSEAPPLICATIONS',
      '/RESTARTAPPLICATIONS',
      '/o:PathOption=BashOnly',
      '/o:SSHOption=OpenSSH',
    ], {
      stdio: 'pipe',
      windowsHide: true,
    });

    let stderr = '';
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Git 安装超时（5分钟）'));
    }, 5 * 60 * 1000);

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0 || code === 1) {
        // Inno Setup 退出码 0=成功, 1=成功但需重启
        logger.info(`Git 安装完成 (退出码: ${code})`);
        resolve();
      } else {
        logger.error(`Git 安装失败 (退出码: ${code}): ${stderr}`);
        reject(new Error(`Git 安装失败 (退出码: ${code})`));
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`无法执行 Git 安装程序: ${err.message}`));
    });
  });
}

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    let redirectCount = 0;

    function doDownload(downloadUrl) {
      redirectCount++;
      if (redirectCount > 10) { reject(new Error('重定向过多')); return; }

      https.get(downloadUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          doDownload(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`下载失败 HTTP ${res.statusCode}`));
          return;
        }
        const total = parseInt(res.headers['content-length'], 10);
        let received = 0;
        let lastPct = 0;
        res.on('data', (chunk) => {
          received += chunk.length;
          if (total > 0) {
            const pct = Math.round(received / total * 100);
            if (pct - lastPct >= 5) { lastPct = pct; onProgress(pct); }
          }
        });
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(destPath); });
      }).on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
    }
    doDownload(url);
  });
}

function refreshPath() {
  if (process.platform !== 'win32') return;
  try {
    const sysPath = execSync(
      'powershell -Command "[Environment]::GetEnvironmentVariable(\'Path\',\'Machine\')"',
      { encoding: 'utf8', timeout: 10000 }
    ).trim();
    const userPath = execSync(
      'powershell -Command "[Environment]::GetEnvironmentVariable(\'Path\',\'User\')"',
      { encoding: 'utf8', timeout: 10000 }
    ).trim();
    process.env.PATH = sysPath + ';' + userPath;
  } catch {}
  // 确保 Git 目录在 PATH 中
  const gitDir = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'cmd');
  if (fs.existsSync(gitDir) && !process.env.PATH.toLowerCase().includes(gitDir.toLowerCase())) {
    process.env.PATH = gitDir + ';' + process.env.PATH;
  }
}

// macOS: 用内置 .pkg 安装 Git（和 Windows 一样离线安装）
function installMacGit(win) {
  return new Promise((resolve, reject) => {
    logger.info('macOS: 开始安装 Git...');

    // 查找内置 .pkg
    const candidates = [
      process.resourcesPath ? path.join(process.resourcesPath, 'bundled', 'git-mac.pkg') : null,
      path.join(__dirname, '..', 'bundled', 'git-mac.pkg'),
    ];

    let pkgPath = null;
    for (const p of candidates) {
      if (p && fs.existsSync(p) && fs.statSync(p).size > 1024) {
        pkgPath = p;
        break;
      }
    }

    if (!pkgPath) {
      // 没有内置包，尝试 xcode-select --install 作为兜底
      logger.info('macOS: 未找到内置 Git .pkg，尝试 xcode-select --install');
      return installMacGitFallback(win).then(resolve, reject);
    }

    logger.info(`macOS: 使用内置 Git: ${pkgPath}`);
    if (win && !win.isDestroyed()) {
      win.webContents.send('install-progress', {
        message: '正在安装 Git...',
      });
    }

    try {
      const sudo = require('sudo-prompt');
      const options = { name: 'OpenClaw 安装向导' };
      sudo.exec(`installer -pkg "${pkgPath}" -target /`, options, (error, stdout, stderr) => {
        if (error) {
          logger.error(`macOS Git 安装失败: ${error.message}`);
          // 降级到 xcode-select
          logger.info('尝试 xcode-select --install 作为降级方案');
          installMacGitFallback(win).then(resolve, reject);
        } else {
          logger.info('macOS Git 安装成功');
          resolve({ success: true });
        }
      });
    } catch (err) {
      logger.error(`sudo-prompt 加载失败: ${err.message}`);
      installMacGitFallback(win).then(resolve, reject);
    }
  });
}

// 兜底：通过 xcode-select --install 安装 Command Line Tools（包含 git）
function installMacGitFallback(win) {
  return new Promise((resolve, reject) => {
    logger.info('macOS: 通过 xcode-select 安装 Git...');
    try {
      execSync('xcode-select --install 2>&1', { timeout: 30000, stdio: 'pipe' });
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('already installed') || msg.includes('command line tools are already installed')) {
        logger.info('macOS: Command Line Tools 已安装');
        resolve({ success: true });
        return;
      }
    }
    // 等待用户在系统对话框中完成安装
    waitForMacGit(resolve, reject);
  });
}

// 等待 macOS git 安装完成
function waitForMacGit(resolve, reject) {
  let attempts = 0;
  const maxAttempts = 60; // 5 分钟（每 5 秒检查一次）
  const check = () => {
    attempts++;
    try {
      const ver = execSync('git --version', { timeout: 5000, encoding: 'utf8' }).trim();
      logger.info(`macOS Git 安装完成: ${ver}`);
      resolve({ success: true });
    } catch {
      if (attempts < maxAttempts) {
        setTimeout(check, 5000);
      } else {
        reject(new Error('Git 安装超时。请手动在终端执行: xcode-select --install'));
      }
    }
  };
  setTimeout(check, 5000);
}

module.exports = installGit;
