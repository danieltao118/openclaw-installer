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
    minWidth: 640,
    minHeight: 540,
    resizable: true,
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

// Windows 上彻底隐藏窗口启动命令
function spawnHidden(command, args, options) {
  const isWin = process.platform === 'win32';
  if (isWin) {
    // PowerShell -WindowStyle Hidden 隐藏窗口
    // 用 & 调用运算符避免引号路径解析问题
    const escapedCmd = command.replace(/'/g, "''");
    const escapedArgs = args.map(a => `'${a.replace(/'/g, "''")}'`).join(' ');
    return childSpawn('powershell.exe', [
      '-WindowStyle', 'Hidden',
      '-NonInteractive',
      '-Command', `& '${escapedCmd}' ${escapedArgs}`,
    ], {
      ...options,
      shell: false,
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

// Gateway 控制面板 IPC
ipcMain.handle('gateway-status', async () => {
  const config = require('./scripts/config');
  const status = config.getConfigStatus();
  const running = await checkGatewayHealth();
  return { running, model: status.model, hasApiKey: status.hasApiKey, hasFeishu: status.hasFeishu, hasWeixin: status.hasWeixin };
});

ipcMain.handle('gateway-stop', async () => {
  const { execSync } = require('child_process');
  const cmd = getCmd('openclaw');
  try {
    execSync(`"${cmd}" gateway stop`, { timeout: 10000, stdio: 'pipe', windowsHide: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('gateway-restart', async () => {
  const logger = require('./scripts/logger');
  const { execSync } = require('child_process');
  const cmd = getCmd('openclaw');
  // 停止旧 gateway
  try {
    execSync(`"${cmd}" gateway stop`, { timeout: 10000, stdio: 'pipe', windowsHide: true });
    logger.info('重启：已停止旧 gateway');
  } catch {}
  // 轮询确认旧进程退出（最多 10 秒）
  for (let i = 0; i < 20; i++) {
    if (!(await checkGatewayHealth())) break;
    await new Promise(r => setTimeout(r, 500));
  }
  // 如果还活着，强制杀
  if (await checkGatewayHealth()) {
    try {
      if (process.platform === 'win32') {
        const out = execSync('netstat -ano | findstr :18789 | findstr LISTENING', { encoding: 'utf8', timeout: 3000, windowsHide: true });
        const pid = out.trim().split(/\s+/).pop();
        if (pid && /^\d+$/.test(pid)) {
          execSync(`taskkill /F /PID ${pid}`, { timeout: 5000, windowsHide: true });
          logger.info(`强制杀掉旧 gateway PID: ${pid}`);
        }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 2000));
  }
  // 复用 launch-openclaw 的完整逻辑
  return ipcMain.invoke('launch-openclaw');
});

ipcMain.handle('get-dashboard-url', async () => {
  // token 已在 launch-openclaw 中写入 openclaw.json，直接读取
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.openclaw', 'openclaw.json'), 'utf8'));
    if (cfg.gateway?.auth?.token) {
      return `http://127.0.0.1:18789/#token=${encodeURIComponent(cfg.gateway.auth.token)}`;
    }
  } catch {}
  return 'http://127.0.0.1:18789';
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
  const config = require('./scripts/config');
  const openclawJsonPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');

  // 从 openclaw.json 读取 token
  const getGatewayToken = () => {
    try {
      const cfg = JSON.parse(fs.readFileSync(openclawJsonPath, 'utf8'));
      return cfg.gateway?.auth?.token || null;
    } catch { return null; }
  };

  // 生成或复用 token
  let token = getGatewayToken();
  if (!token) {
    token = crypto.randomBytes(16).toString('hex');
    logger.info(`生成新 gateway token: ${token.substring(0, 8)}...`);
  } else {
    logger.info(`复用已有 gateway token: ${token.substring(0, 8)}...`);
  }

  // 将 token 写入 openclaw.json（gateway 从配置文件读取，不依赖 --token 参数）
  const cfg = config.readConfig();
  if (!cfg.gateway) cfg.gateway = {};
  if (!cfg.gateway.auth) cfg.gateway.auth = {};
  cfg.gateway.auth.token = token;
  config.writeConfig(cfg);
  logger.info(`Token 已写入 openclaw.json: ${token.substring(0, 8)}...`);

  // 打开 Dashboard
  const openDashboard = async (port) => {
    const actualToken = getGatewayToken() || token;
    const dashboardUrl = `http://127.0.0.1:${port}/#token=${encodeURIComponent(actualToken)}`;
    logger.info(`打开 Dashboard: ${dashboardUrl.substring(0, 60)}...`);
    await shell.openExternal(dashboardUrl);
  };

  try {
    const cmd = getCmd('openclaw');
    const DEFAULT_PORT = 18789;
    let gatewayPort = DEFAULT_PORT;

    // 注册为系统服务（开机自启动）— 静默失败
    try {
      execSync(`"${cmd}" gateway install`, { timeout: 10000, stdio: 'pipe', windowsHide: true });
    } catch {}

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

    // 停掉旧 gateway — 确保重启后 token 跟 openclaw.json 一致
    try {
      if (await checkGatewayHealth()) {
        logger.info('Gateway 已在运行，停止后重新启动以确保 token 一致');
      }
      execSync(`"${cmd}" gateway stop`, { timeout: 10000, stdio: 'pipe', windowsHide: true });
      for (let i = 0; i < 10; i++) {
        if (!(await checkGatewayHealth())) break;
        await new Promise(r => setTimeout(r, 500));
      }
    } catch {}

    // 再次确认端口可用
    let portInUse = false;
    if (process.platform === 'win32') {
      try {
        const out = execSync('netstat -ano | findstr :18789 | findstr LISTENING', { encoding: 'utf8', timeout: 3000, windowsHide: true });
        if (out.trim()) portInUse = true;
      } catch {}
    } else {
      try {
        const out = execSync('lsof -ti:18789', { encoding: 'utf8', timeout: 3000, windowsHide: true }).trim();
        if (out) portInUse = true;
      } catch {}
    }

    if (portInUse) {
      logger.info('端口 18789 被占用，尝试 --force 接管');
      try {
        const child = spawnHidden(cmd, ['gateway', 'run', '--allow-unconfigured', '--force'], {
          env: { ...process.env },
        });
        child.on('error', () => {});
        child.unref();
        if (!(await waitForGateway(10, 1000))) throw new Error('force failed');
      } catch {
        gatewayPort = 18790;
        const child = spawnHidden(cmd, ['gateway', 'run', '--allow-unconfigured', '--port', '18790'], {
          env: { ...process.env },
        });
        child.on('error', (err) => { logger.error(`启动 OpenClaw 失败: ${err.message}`); });
        child.unref();
        if (!(await waitForGateway(10, 1000, 18790))) {
          return { success: false, error: 'Gateway 启动超时，请检查端口是否被占用' };
        }
      }
    } else {
      // 正常启动（不传 --token，gateway 从 openclaw.json 读取）
      const child = spawnHidden(cmd, ['gateway', 'run', '--allow-unconfigured'], {
        env: { ...process.env },
      });
      child.on('error', (err) => { logger.error(`启动 OpenClaw 失败: ${err.message}`); });
      child.unref();
      logger.info(`Gateway 进程已启动 PID: ${child.pid}`);

      // 快速轮询：前 10 次 500ms，之后 2s
      let ready = false;
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 500));
        const h = await checkGatewayHealth();
        logger.info(`Health check ${i+1}/10: ${h}`);
        if (h) { ready = true; break; }
      }
      if (!ready) {
        logger.info('进入慢速轮询...');
        ready = await waitForGateway(30, 2000);
      }
      if (!ready) {
        return { success: false, error: 'Gateway 启动超时，请稍后重试' };
      }
    }

    await openDashboard(gatewayPort);
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

// 微信扫码登录 IPC
ipcMain.handle('wechat-plugin-install', async () => {
  const logger = require('./scripts/logger');
  try {
    const wechat = require('./scripts/wechat-scan');
    await wechat.installWeixinPlugin();
    logger.info('微信插件安装完成');
    return { success: true };
  } catch (err) {
    logger.error(`微信插件安装失败: ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('wechat-scan-init', async () => {
  const logger = require('./scripts/logger');
  try {
    const wechat = require('./scripts/wechat-scan');
    const QR = require('qrcode');
    const resp = await wechat.fetchQRCode();
    logger.info(`微信 QR 获取成功, content 长度: ${resp.qrcode_img_content?.length || 0}`);

    // 将 QR URL 转为 base64 图片
    const qrDataUrl = await QR.toDataURL(resp.qrcode_img_content, { width: 256, margin: 2 });
    return { success: true, qrImage: qrDataUrl, qrcode: resp.qrcode };
  } catch (err) {
    logger.error(`微信 QR 获取失败: ${err.message}`);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('wechat-scan-poll', async (event, qrcode) => {
  const logger = require('./scripts/logger');
  try {
    const wechat = require('./scripts/wechat-scan');
    const statusResp = await wechat.pollQRStatus(qrcode);
    logger.info(`微信扫码状态: ${statusResp.status}`);

    if (statusResp.status === 'confirmed' && statusResp.bot_token && statusResp.ilink_bot_id) {
      // 保存凭证
      wechat.saveWeixinAccount(
        statusResp.ilink_bot_id,
        statusResp.bot_token,
        statusResp.baseurl,
        statusResp.ilink_user_id,
      );
      return { status: 'confirmed', accountId: statusResp.ilink_bot_id };
    }

    // 过期时需要刷新 QR
    if (statusResp.status === 'expired') {
      return { status: 'expired' };
    }

    return { status: statusResp.status };
  } catch (err) {
    logger.error(`微信扫码轮询失败: ${err.message}`);
    return { status: 'error', message: err.message };
  }
});
