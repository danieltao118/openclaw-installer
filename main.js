const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn: childSpawn } = require('child_process');

// 加载版本配置
function loadVersions() {
  const paths = [
    // 生产环境：extraResources 复制到 resources/ 目录
    process.resourcesPath ? path.join(process.resourcesPath, 'versions.json') : null,
    // NSIS 安装目录下
    process.resourcesPath ? path.join(process.resourcesPath, '..', 'versions.json') : null,
    // 开发环境
    path.join(__dirname, 'versions.json'),
    path.join(__dirname, '..', 'versions.json'),
  ];
  for (const p of paths) {
    if (!p) continue;
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch {}
  }
  // 兜底
  return { node: '22.22.2', openclaw: '2026.4.15', installer: '1.0.0' };
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 820,
    height: 720,
    resizable: false,
    maximizable: false,
    title: 'OpenClaw 安装向导',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // 需要 require() 在 preload 中工作
    },
  });

  mainWindow.setMenuBarVisibility(false);

  // 设置 CSP 安全策略
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://activate.jiaopeiclaw.com"],
      },
    });
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // 外部链接在系统浏览器中打开，而不是 Electron 窗口内
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
      require('electron').shell.openExternal(url);
    }
  });
}

app.whenReady().then(() => {
  portableLog('INFO', 'Electron: 应用启动', `便携模式: ${isPortableMode}`);

  // 有效期检查
  const versions = loadVersions();
  if (versions.expiresAt) {
    const expiry = new Date(versions.expiresAt + 'T23:59:59');
    if (new Date() > expiry) {
      const { dialog } = require('electron');
      dialog.showMessageBoxSync({
        type: 'error',
        title: '安装器已过期',
        message: `本安装器已于 ${versions.expiresAt} 过期。\n请联系工作人员获取新版安装器。`,
        buttons: ['确定'],
      });
      app.quit();
      return;
    }
  }

  createWindow();
}).catch(err => {
  portableLog('ERROR', 'Electron: 窗口创建失败', err.message);
  app.quit();
});
app.on('window-all-closed', () => {
  portableLog('INFO', 'Electron: 应用退出');
  app.quit();
});

// 跨平台命令名辅助
function getCmd(name) {
  return process.platform === 'win32' ? name + '.cmd' : name;
}

// Windows 上隐藏窗口启动命令
function spawnHidden(command, args, options) {
  const isWin = process.platform === 'win32';
  if (isWin) {
    // 用 cmd /c 调用 .cmd 文件，通过 windowsHide 隐藏窗口
    return childSpawn('cmd', ['/c', command, ...args], {
      ...options,
      shell: false,
      windowsHide: true,
      stdio: 'ignore',
      detached: true,
    });
  }
  return childSpawn(command, args, {
    ...options,
    shell: false,
    stdio: 'ignore',
    detached: true,
  });
}

// 便携模式日志 — 错误写入U盘
function portableLog(level, message, detail) {
  if (!isPortableMode) return;
  try {
    // 找到U盘根目录（.portable 所在目录）
    let usbRoot = '';
    if (process.env.PORTABLE_EXECUTABLE_DIR) {
      usbRoot = process.env.PORTABLE_EXECUTABLE_DIR;
    } else {
      const appDir = process.platform === 'darwin'
        ? path.dirname(path.dirname(path.dirname(app.getAppPath())))
        : path.dirname(app.getPath('exe'));
      for (let dir = appDir; dir !== path.dirname(dir); dir = path.dirname(dir)) {
        if (fs.existsSync(path.join(dir, '.portable'))) { usbRoot = dir; break; }
      }
    }
    if (!usbRoot) return;
    const logDir = path.join(usbRoot, 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const now = new Date();
    const timestamp = now.toISOString().replace('T', ' ').substring(0, 19);
    const dateStr = now.toISOString().substring(0, 10);
    const line = detail
      ? `[${timestamp}] [${level}] ${message} | ${detail}\n`
      : `[${timestamp}] [${level}] ${message}\n`;
    fs.appendFileSync(path.join(logDir, `${dateStr}.log`), line, 'utf8');
  } catch {}
}

// IPC Handlers
ipcMain.handle('detect-environment', async (event) => {
  try {
    const detect = require('./scripts/detect');
    portableLog('INFO', 'Electron: 环境检测');
    return detect(mainWindow, loadVersions());
  } catch (err) {
    portableLog('ERROR', 'Electron: 环境检测失败', err.message);
    throw err;
  }
});

ipcMain.handle('get-versions', async () => {
  return loadVersions();
});

ipcMain.handle('install-node', async (event) => {
  try {
    portableLog('INFO', 'Electron: 开始安装 Node.js');
    const installNode = require('./scripts/install-node');
    const result = await installNode(mainWindow);
    portableLog('INFO', 'Electron: Node.js 安装完成');
    return result;
  } catch (err) {
    portableLog('ERROR', 'Electron: Node.js 安装失败', err.message);
    throw err;
  }
});

ipcMain.handle('install-git', async (event) => {
  try {
    portableLog('INFO', 'Electron: 开始安装 Git');
    const installGit = require('./scripts/install-git');
    const result = await installGit(mainWindow);
    portableLog('INFO', 'Electron: Git 安装完成');
    return result;
  } catch (err) {
    portableLog('ERROR', 'Electron: Git 安装失败', err.message);
    throw err;
  }
});

ipcMain.handle('install-openclaw', async (event) => {
  try {
    portableLog('INFO', 'Electron: 开始安装 OpenClaw');
    const installOpenclaw = require('./scripts/install-openclaw');
    const result = await installOpenclaw(mainWindow);
    portableLog('INFO', 'Electron: OpenClaw 安装完成');
    return result;
  } catch (err) {
    portableLog('ERROR', 'Electron: OpenClaw 安装失败', err.message);
    throw err;
  }
});

ipcMain.handle('verify-installation', async (event) => {
  const verify = require('./scripts/verify');
  return verify();
});

// 配置相关 IPC
ipcMain.handle('save-model-config', async (event, provider, apiKey, baseUrl, model, apiProtocol) => {
  const config = require('./scripts/config');
  return config.saveModelConfig(provider, apiKey, baseUrl, model, apiProtocol);
});

ipcMain.handle('save-channel-config', async (event, appId, appSecret) => {
  const config = require('./scripts/config');
  return config.saveChannelConfig(appId, appSecret);
});

ipcMain.handle('test-api-connection', async (event, provider, apiKey, baseUrl) => {
  const config = require('./scripts/config');
  return config.testApiConnection(provider, apiKey, baseUrl);
});

ipcMain.handle('get-config-status', async (event) => {
  const config = require('./scripts/config');
  return config.getConfigStatus();
});

ipcMain.handle('open-log-file', async (event) => {
  const { shell } = require('electron');
  const logger = require('./scripts/logger');
  // 确保日志文件存在
  const fs = require('fs');
  if (!fs.existsSync(logger.LOG_FILE)) {
    fs.writeFileSync(logger.LOG_FILE, `[${new Date().toISOString()}] [INFO] 日志文件已创建\n`, 'utf8');
  }
  await shell.openPath(logger.LOG_FILE);
});

// 反馈相关 IPC
const os = require('os');
ipcMain.handle('get-system-info', async () => {
  return {
    os: os.platform() + ' ' + os.release(),
    arch: os.arch(),
    cpu: os.cpus()[0]?.model || 'unknown',
    memory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + 'GB',
    nodeVersion: process.versions.node,
    electronVersion: process.versions.electron,
    installerVersion: loadVersions().installer || '1.0.0',
  };
});

ipcMain.handle('get-log-tail', async () => {
  const logger = require('./scripts/logger');
  try {
    if (!fs.existsSync(logger.LOG_FILE)) return '';
    const content = fs.readFileSync(logger.LOG_FILE, 'utf8');
    const lines = content.trim().split('\n');
    return lines.slice(-200).join('\n');
  } catch { return ''; }
});

// 激活码相关 IPC
// 便携模式检测：只认 .portable 标记文件（由 prepare-usb.js 创建）
// 不使用 PORTABLE_EXECUTABLE_DIR（electron-builder 总是设置，无法区分U盘和复制出去的 exe）
const isPortableMode = (() => {
  try {
    const appDir = process.platform === 'darwin'
      ? path.dirname(path.dirname(path.dirname(app.getAppPath())))
      : path.dirname(app.getPath('exe'));
    for (let dir = appDir; dir !== path.dirname(dir); dir = path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, '.portable'))) return true;
    }
  } catch {}
  return false;
})();

ipcMain.handle('is-portable-mode', async () => {
  return isPortableMode;
});

ipcMain.handle('validate-activation', async (event, code) => {
  // U盘环境免激活
  if (isPortableMode) {
    return { success: true, type: 'C', typeName: '便携版', days: 9999 };
  }
  const activation = require('./scripts/activation');
  const result = activation.validateCode(code);
  if (result.valid) {
    return activation.activate(code);
  }
  return result;
});

ipcMain.handle('check-activation', async (event) => {
  // U盘环境免激活
  if (isPortableMode) {
    return { activated: true, type: 'C', typeName: '便携版', daysLeft: 9999, expiresAt: '2099-12-31' };
  }
  const activation = require('./scripts/activation');
  return activation.isActivated();
});

// 安装完成后自删（仅非U盘环境）
// 防止 exe 被拷贝后反复使用或分享
ipcMain.handle('self-destruct', async () => {
  if (isPortableMode) {
    // U盘环境不删
    return { skipped: true, reason: 'U盘环境' };
  }
  try {
    const exePath = app.getPath('exe');
    // 开发环境跳过
    if (exePath.includes('electron')) {
      return { skipped: true, reason: '开发环境' };
    }
    // Windows: 用 cmd /c ping 延迟后删除（进程退出后才能删）
    if (process.platform === 'win32') {
      const { spawn } = require('child_process');
      spawn('cmd', ['/c', `ping -n 3 127.0.0.1 >nul & del /f /q "${exePath}"`], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }).unref();
      portableLog('INFO', `自删已调度: ${exePath}`);
    }
    return { scheduled: true, path: exePath };
  } catch (err) {
    portableLog('ERROR', `自删失败: ${err.message}`);
    return { error: err.message };
  }
});

ipcMain.handle('launch-openclaw', async (event) => {
  const { spawn, execSync } = require('child_process');
  const { shell } = require('electron');
  const crypto = require('crypto');
  const logger = require('./scripts/logger');
  try {
    const cmd = getCmd('openclaw');

    // 注册为系统服务（开机自启动）
    try {
      execSync(`"${cmd}" gateway install`, { timeout: 10000, stdio: 'pipe' });
      logger.info('Gateway 系统服务已注册（开机自启动）');
    } catch (err) {
      logger.info('Gateway 服务注册跳过: ' + (err.message || ''));
    }

    // macOS: 确保 npm 全局路径在 PATH 中
    if (process.platform !== 'win32') {
      try {
        const prefix = require('child_process').execSync('npm config get prefix', { encoding: 'utf8', timeout: 5000 }).trim();
        const binDir = prefix + '/bin';
        if (!process.env.PATH.includes(binDir) && !process.env.PATH.includes(prefix)) {
          process.env.PATH = binDir + ':' + process.env.PATH;
        }
      } catch {}
    }

    // Token 复用：从文件读取，没有则生成新的
    const tokenPath = path.join(os.homedir(), '.openclaw', 'gateway-token');
    let token;
    try {
      token = fs.readFileSync(tokenPath, 'utf8').trim();
      logger.info(`复用已有 token: ${token.substring(0, 8)}...`);
    } catch {
      token = crypto.randomBytes(16).toString('hex');
      fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
      fs.writeFileSync(tokenPath, token, 'utf8');
      logger.info(`生成新 token: ${token.substring(0, 8)}...`);
    }

    // 先停掉旧 gateway，避免 token 冲突和配置残留
    try {
      execSync(`"${cmd}" gateway stop`, { timeout: 5000, stdio: 'pipe' });
      logger.info('已停掉旧 gateway');
      // 等待旧进程完全退出，避免竞态
      await new Promise(r => setTimeout(r, 5000));
    } catch {}

    // 等待后再检查（此时旧进程应该已退出）
    const DEFAULT_PORT = 18789;
    let gatewayPort = DEFAULT_PORT;
    const alreadyRunning = await checkGatewayHealth();
    if (alreadyRunning) {
      logger.info('Gateway 已在运行，直接打开 Dashboard');
    } else {
      // 检查默认端口是否被其他程序占用
      let portInUse = false;
      if (process.platform === 'win32') {
        try {
          const out = execSync('netstat -ano | findstr :18789 | findstr LISTENING', { encoding: 'utf8', timeout: 5000 });
          if (out.trim()) portInUse = true;
        } catch {}
      } else {
        try {
          const out = execSync('lsof -ti:18789', { encoding: 'utf8', timeout: 5000 }).trim();
          if (out) portInUse = true;
        } catch {}
      }

      if (portInUse) {
        // 端口被其他程序占用，尝试用 --force 强制接管（会杀掉自己的旧 gateway）
        // 如果 --force 失败，则自动换端口
        logger.info('端口 18789 被占用，尝试 --force 接管');
        try {
          const child = spawnHidden(cmd, ['gateway', 'run', '--allow-unconfigured', '--token', token, '--force'], {
            env: { ...process.env },
          });
          child.on('error', () => {});
          child.unref();
          const ready = await waitForGateway(20, 2000);
          if (!ready) throw new Error('force failed');
        } catch {
          // force 失败，换端口
          gatewayPort = 18790;
          logger.info('换到端口 18790');
          const child = spawnHidden(cmd, ['gateway', 'run', '--allow-unconfigured', '--token', token, '--port', '18790'], {
            env: { ...process.env },
          });
          child.on('error', (err) => { logger.error(`启动 OpenClaw 失败: ${err.message}`); });
          child.unref();
          const ready = await waitForGateway(20, 2000, 18790);
          if (!ready) {
            return { success: false, error: 'Gateway 启动超时，请检查端口是否被占用' };
          }
        }
      } else {
        // 端口空闲，正常启动
        const child = spawnHidden(cmd, ['gateway', 'run', '--allow-unconfigured', '--token', token], {
          env: { ...process.env },
        });
        child.on('error', (err) => { logger.error(`启动 OpenClaw 失败: ${err.message}`); });
        child.unref();
        logger.info(`Gateway 进程已启动 PID: ${child.pid}`);
        const ready = await waitForGateway(30, 2000);
        if (!ready) {
          return { success: false, error: 'Gateway 启动超时（60秒），请稍后重试' };
        }
      }
    }

    // 打开带 token 的 Dashboard
    const dashboardUrl = `http://127.0.0.1:${gatewayPort}/#token=${encodeURIComponent(token)}`;
    logger.info(`打开 Dashboard: ${dashboardUrl.substring(0, 50)}...`);
    await shell.openExternal(dashboardUrl);

    return { success: true };
  } catch (err) {
    logger.error(`启动 OpenClaw 失败: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// 检查 gateway 是否已在运行
async function checkGatewayHealth(port = 18789) {
  const http = require('http');
  try {
    return await new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 3000 }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(data).ok === true); } catch { resolve(false); }
        });
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => { req.destroy(); resolve(false); });
    });
  } catch { return false; }
}

// 等待 gateway 就绪
async function waitForGateway(maxRetries, intervalMs, port = 18789) {
  for (let i = 0; i < maxRetries; i++) {
    await new Promise(r => setTimeout(r, intervalMs || 2000));
    const ok = await checkGatewayHealth(port);
    if (ok) return true;
  }
  return false;
}

// 飞书扫码登录 — 直接调用飞书 API，不依赖 openclaw CLI（CLI 的 QR 码需要 TTY）
ipcMain.handle('feishu-scan-init', async () => {
  const logger = require('./scripts/logger');
  try {
    const scan = require('./scripts/feishu-scan');
    const QR = require('qrcode');
    await scan.initRegistration();
    const begin = await scan.beginRegistration();
    logger.info(`飞书扫码初始化成功, QR URL: ${begin.qrUrl.substring(0, 80)}...`);

    // 在 main 进程生成 QR 码 base64 图片
    const qrDataUrl = await QR.toDataURL(begin.qrUrl, { width: 256, margin: 2 });

    return { success: true, qrImage: qrDataUrl, deviceCode: begin.deviceCode, interval: begin.interval, expireIn: begin.expireIn };
  } catch (err) {
    logger.error(`飞书扫码初始化失败: ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('feishu-scan-poll', async (event, deviceCode, interval, expireIn) => {
  const logger = require('./scripts/logger');
  try {
    const scan = require('./scripts/feishu-scan');
    const result = await scan.pollRegistration(deviceCode, interval, expireIn);
    logger.info(`飞书扫码结果: ${result.status}`);
    return result;
  } catch (err) {
    logger.error(`飞书扫码轮询失败: ${err.message}`);
    return { status: 'error', message: err.message };
  }
});
