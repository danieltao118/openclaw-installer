const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 700,
    height: 580,
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

app.whenReady().then(createWindow).catch(err => {
  console.error('窗口创建失败:', err);
  app.quit();
});
app.on('window-all-closed', () => app.quit());

// 跨平台命令名辅助
function getCmd(name) {
  return process.platform === 'win32' ? name + '.cmd' : name;
}

// IPC Handlers
ipcMain.handle('detect-environment', async (event) => {
  const detect = require('./scripts/detect');
  return detect(mainWindow);
});

ipcMain.handle('install-node', async (event) => {
  const installNode = require('./scripts/install-node');
  return installNode(mainWindow);
});

ipcMain.handle('install-openclaw', async (event) => {
  const installOpenclaw = require('./scripts/install-openclaw');
  return installOpenclaw(mainWindow);
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

ipcMain.handle('launch-openclaw', async (event) => {
  const { spawn } = require('child_process');
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
