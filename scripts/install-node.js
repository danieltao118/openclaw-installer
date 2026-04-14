// scripts/install-node.js — 下载并安装 Node.js v22 LTS
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const logger = require('./logger');

const NODE_VERSION = '22.14.0';
const NODE_BASE_URL = `https://nodejs.org/dist/v${NODE_VERSION}/`;

function getDownloadInfo(platform, arch) {
  if (platform === 'win32') {
    const realArch = arch === 'arm64' ? 'arm64' : 'x64';
    return {
      url: `${NODE_BASE_URL}node-v${NODE_VERSION}-${realArch}.msi`,
      filename: `node-v${NODE_VERSION}-${realArch}.msi`,
    };
  }
  if (platform === 'darwin') {
    const suffix = arch === 'arm64' ? '-arm64' : '-x64';
    return {
      url: `${NODE_BASE_URL}node-v${NODE_VERSION}${suffix}.pkg`,
      filename: `node-v${NODE_VERSION}${suffix}.pkg`,
    };
  }
  throw new Error(`不支持的平台: ${platform}`);
}

async function installNode(win) {
  const { url, filename } = getDownloadInfo(process.platform, process.arch);
  const tmpDir = os.tmpdir();
  const destPath = path.join(tmpDir, filename);

  logger.info(`开始安装 Node.js v${NODE_VERSION}`);
  logger.info(`下载地址: ${url}`);

  // 检查磁盘空间
  const freeSpace = checkDiskSpace(tmpDir);
  if (freeSpace !== null && freeSpace < 500 * 1024 * 1024) {
    throw new Error('磁盘空间不足，至少需要 500MB 可用空间。请清理磁盘后重试。');
  }

  // 下载（带重试）
  if (win && !win.isDestroyed()) {
    win.webContents.send('install-progress', {
      stepActive: 'istep-download-node',
      message: `正在下载 Node.js v${NODE_VERSION}...`,
    });
  }

  const MAX_RETRIES = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info(`下载尝试 ${attempt}/${MAX_RETRIES}`);
      if (win && !win.isDestroyed()) {
        win.webContents.send('install-progress', {
          message: attempt > 1 ? `下载超时，正在重试 (${attempt}/${MAX_RETRIES})...` : `正在下载 Node.js v${NODE_VERSION}...`,
        });
      }
      await downloadFile(url, destPath, (percent) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('install-progress', { percent: percent * 0.4 });
        }
      });
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      logger.warn(`下载第 ${attempt} 次失败: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await sleep(2000 * attempt); // 指数退避: 2s, 4s
      }
    }
  }

  if (lastError) {
    throw new Error(`下载 Node.js 失败（已重试 ${MAX_RETRIES} 次）: ${lastError.message}\n请检查网络连接，或手动下载安装: ${url}`);
  }

  logger.info(`下载完成: ${destPath}`);

  // 安装
  if (win && !win.isDestroyed()) {
    win.webContents.send('install-progress', {
      stepDone: 'istep-download-node',
      stepActive: 'istep-install-node',
      message: '正在安装 Node.js...',
      percent: 45,
    });
  }

  if (process.platform === 'win32') {
    await installWindowsMsi(destPath, win);
  } else if (process.platform === 'darwin') {
    await installMacPkg(destPath, win);
  }

  // 刷新 PATH
  refreshPath();

  // 清理安装文件
  try {
    fs.unlinkSync(destPath);
    logger.info('已清理临时安装文件');
  } catch {
    // 清理失败无所谓
  }

  logger.info('Node.js 安装完成');
  return { success: true };
}

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    let redirectCount = 0;

    function doDownload(downloadUrl) {
      redirectCount++;
      if (redirectCount > 5) {
        reject(new Error('下载重定向次数过多'));
        return;
      }

      https.get(downloadUrl, (response) => {
        // 处理重定向
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          doDownload(response.headers.location);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`下载失败，HTTP状态码: ${response.statusCode}`));
          return;
        }

        const total = parseInt(response.headers['content-length'], 10);
        let received = 0;
        let lastReport = 0;

        response.on('data', (chunk) => {
          received += chunk.length;
          if (total > 0) {
            const percent = Math.round((received / total) * 100);
            if (percent - lastReport >= 5) { // 每5%报告一次
              lastReport = percent;
              onProgress(percent);
            }
          }
        });

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(destPath);
        });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }

    doDownload(url);
  });
}

function installWindowsMsi(msiPath, win) {
  return new Promise((resolve, reject) => {
    logger.info('执行 msiexec 静默安装...');
    const child = spawn('msiexec', ['/i', msiPath, '/qn', '/norestart'], {
      stdio: 'pipe',
      env: { ...process.env },
    });

    let stderr = '';
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        logger.info('msiexec 安装成功');
        resolve();
      } else {
        logger.error(`msiexec 退出码: ${code}, stderr: ${stderr}`);
        reject(new Error(`Node.js 安装失败 (退出码: ${code})。请尝试关闭杀毒软件后重试。`));
      }
    });

    child.on('error', (err) => {
      logger.error(`msiexec 执行错误: ${err.message}`);
      reject(new Error(`无法执行安装程序: ${err.message}`));
    });
  });
}

function installMacPkg(pkgPath, win) {
  return new Promise((resolve, reject) => {
    logger.info('执行 macOS pkg 安装...');

    try {
      const sudo = require('sudo-prompt');
      const options = { name: 'OpenClaw 安装向导' };

      sudo.exec(`installer -pkg "${pkgPath}" -target /`, options, (error, stdout, stderr) => {
        if (error) {
          logger.error(`macOS pkg 安装失败: ${error.message}`);
          reject(new Error(`Node.js 安装失败: ${error.message}\n请尝试手动在终端执行:\nsudo installer -pkg "${pkgPath}" -target /`));
        } else {
          logger.info('macOS pkg 安装成功');
          resolve();
        }
      });
    } catch (err) {
      // sudo-prompt 不可用时，提示用户手动安装
      logger.error(`sudo-prompt 加载失败: ${err.message}`);
      reject(new Error(`需要管理员权限安装 Node.js。\n请在终端执行:\nsudo installer -pkg "${pkgPath}" -target /`));
    }
  });
}

function refreshPath() {
  if (process.platform === 'win32') {
    // Windows: 用 PowerShell 读取最新的系统 PATH
    try {
      const sysPath = execSync(
        'powershell -Command "[Environment]::GetEnvironmentVariable(\'Path\',\'Machine\')"',
        { encoding: 'utf8', timeout: 10000 }
      ).trim();
      const userPath = execSync(
        'powershell -Command "[Environment]::GetEnvironmentVariable(\'Path\',\'User\')"',
        { encoding: 'utf8', timeout: 10000 }
      ).trim();
      // 合并系统PATH + 用户PATH
      process.env.PATH = sysPath + ';' + userPath;
      logger.info('已通过 PowerShell 刷新 PATH');
      return;
    } catch {
      logger.warn('PowerShell PATH 读取失败');
    }

    // 方案2: 直接检查 Node.js 是否在 PATH 中
    try {
      execSync('node --version', { timeout: 3000, encoding: 'utf8' });
      logger.info('node 命令已可用，PATH 无需修复');
      return;
    } catch {
      // node 不可用，需要手动添加
    }

    // 方案3: 添加常见 Node.js 安装路径
    const commonNodePaths = [
      'C:\\Program Files\\nodejs',
      path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs'),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs'),
    ];
    commonNodePaths.forEach(p => {
      if (p && !process.env.PATH.includes(p)) {
        try {
          fs.accessSync(path.join(p, 'node.exe'));
          process.env.PATH = p + ';' + process.env.PATH;
          logger.info(`已手动添加 ${p} 到 PATH`);
        } catch {
          // 路径不存在
        }
      }
    });
  } else {
    // macOS: 刷新 PATH
    try {
      const newPath = execSync('/usr/bin/env bash -lc "echo $PATH"', { encoding: 'utf8' }).trim();
      if (newPath && newPath.includes('/')) {
        process.env.PATH = newPath;
        logger.info('已刷新 PATH');
      }
    } catch {
      const commonPaths = ['/usr/local/bin', '/opt/homebrew/bin'];
      commonPaths.forEach(p => {
        if (!process.env.PATH.includes(p)) {
          process.env.PATH = p + ':' + process.env.PATH;
        }
      });
      logger.info('已添加常见路径到 PATH');
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function checkDiskSpace(dirPath) {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`wmic logicaldisk get size,freespace,caption`, {
        encoding: 'utf8',
        timeout: 5000,
      });
      const driveLetter = path.resolve(dirPath).charAt(0).toUpperCase();
      const lines = output.split('\n').filter(l => l.trim());
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts[0] === driveLetter + ':' && parts.length >= 3) {
          return parseInt(parts[parts.length - 1], 10);
        }
      }
    } else {
      const output = execSync(`df -k "${dirPath}"`, { encoding: 'utf8' });
      const lines = output.trim().split('\n');
      if (lines.length >= 2) {
        const parts = lines[1].split(/\s+/);
        return parseInt(parts[3], 10) * 1024; // KB -> bytes
      }
    }
  } catch {
    // 检测失败不阻塞
  }
  return null;
}

module.exports = installNode;
