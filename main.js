const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');

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
        'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"],
      },
    });
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(() => {
  portableLog('INFO', 'Electron: 应用启动', `便携模式: ${isPortableMode}`);
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
ipcMain.handle('save-model-config', async (event, provider, apiKey, baseUrl, model) => {
  const config = require('./scripts/config');
  return config.saveModelConfig(provider, apiKey, baseUrl, model);
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
// 便携模式检测：Windows portable 设置 PORTABLE_EXECUTABLE_DIR，或存在 .portable 标记文件
const isPortableMode = (() => {
  if (process.env.PORTABLE_EXECUTABLE_DIR) return true;
  try {
    // 检查可执行文件同目录及上级目录的 .portable 标记
    const appDir = process.platform === 'darwin'
      ? path.dirname(path.dirname(path.dirname(app.getAppPath()))) // macOS .app/Contents/Resources/app.asar
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
  if (isPortableMode) {
    return { activated: true, type: 'C', typeName: '便携版', daysLeft: 9999, expiresAt: '2099-12-31' };
  }
  const activation = require('./scripts/activation');
  return activation.isActivated();
});

ipcMain.handle('launch-openclaw', async (event) => {
  const { spawn } = require('child_process');
  const { shell } = require('electron');
  const crypto = require('crypto');
  const logger = require('./scripts/logger');
  try {
    const cmd = getCmd('openclaw');

    // 生成随机 token
    const token = crypto.randomBytes(16).toString('hex');
    logger.info(`生成 gateway token: ${token.substring(0, 8)}...`);

    // 后台启动 gateway，传入 token
    const child = spawn(cmd, ['gateway', 'run', '--allow-unconfigured', '--token', token], {
      detached: true,
      stdio: 'ignore',
      shell: process.platform === 'win32',
      windowsHide: true,
      env: { ...process.env },
    });
    child.on('error', (err) => {
      logger.error(`启动 OpenClaw 失败: ${err.message}`);
    });
    child.unref();
    logger.info('Gateway 进程已启动');

    // 等待 gateway 就绪
    const ready = await waitForGateway(15);
    if (ready) {
      const dashboardUrl = `http://127.0.0.1:18789/#token=${encodeURIComponent(token)}`;
      logger.info(`打开 Dashboard: ${dashboardUrl.substring(0, 50)}...`);
      await shell.openExternal(dashboardUrl);
    } else {
      logger.info('Gateway 等待超时，打开默认地址');
      await shell.openExternal('http://127.0.0.1:18789');
    }

    return { success: true };
  } catch (err) {
    logger.error(`启动 OpenClaw 失败: ${err.message}`);
    return { success: false, error: err.message };
  }
});

// 等待 gateway 就绪
async function waitForGateway(maxRetries) {
  const http = require('http');
  for (let i = 0; i < maxRetries; i++) {
    await new Promise(r => setTimeout(r, 1500));
    try {
      await new Promise((resolve, reject) => {
        const req = http.get('http://127.0.0.1:18789/', { timeout: 3000 }, (res) => {
          res.resume();
          resolve(true);
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      });
      return true;
    } catch {
      // 还没就绪，继续等待
    }
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
