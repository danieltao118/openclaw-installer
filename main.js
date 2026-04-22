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
  const logger = require('./scripts/logger');
  try {
    const cmd = getCmd('openclaw');
    const child = spawn(cmd, ['gateway', 'start'], {
      detached: true,
      stdio: 'ignore',
      shell: process.platform === 'win32',
      env: { ...process.env },
    });
    child.on('error', (err) => {
      logger.error(`启动 OpenClaw 失败: ${err.message}`);
    });
    child.unref();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// 飞书扫码登录 — 运行 openclaw channels login --channel feishu 并流式返回输出
ipcMain.handle('login-feishu-channel', async (event) => {
  const { spawn } = require('child_process');
  const logger = require('./scripts/logger');

  return new Promise((resolve) => {
    const cmd = getCmd('openclaw');
    const args = ['channels', 'login', '--channel', 'feishu'];

    logger.info(`执行飞书扫码登录: ${cmd} ${args.join(' ')}`);

    const child = spawn(cmd, args, {
      shell: process.platform === 'win32',
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      cwd: require('os').homedir(),
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      // 流式转发到前端
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('feishu-login-output', { text, stream: 'stdout' });
      }
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('feishu-login-output', { text, stream: 'stderr' });
      }
    });

    child.on('close', (code) => {
      logger.info(`飞书扫码登录完成, exit code: ${code}`);
      resolve({
        success: code === 0,
        code,
        stdout,
        stderr,
      });
    });

    child.on('error', (err) => {
      logger.error(`飞书扫码登录失败: ${err.message}`);
      resolve({
        success: false,
        code: -1,
        stdout,
        stderr: err.message,
      });
    });

    // 超时保护：3分钟无操作自动终止
    const timeout = setTimeout(() => {
      child.kill();
      resolve({
        success: false,
        code: -1,
        stdout,
        stderr: '操作超时，请重试',
      });
    }, 3 * 60 * 1000);

    child.on('close', () => clearTimeout(timeout));
  });
});
