// scripts/install-git.js — 下载并静默安装 Git for Windows
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

module.exports = installGit;
