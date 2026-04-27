// repair-env.js — 应急修复：安装 Node.js + OpenClaw（不依赖安装器 EXE）
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

// __dirname = tools/, USB_ROOT = 上一级
const USB_ROOT = path.resolve(__dirname, '..');
const NODE_VERSION = '22.22.2';
const OPENCLAW_VERSION = '2026.4.23';
const REGISTRY = 'https://registry.npmmirror.com';

function log(msg) {
  console.log(`  ${msg}`);
  // 写入U盘日志
  try {
    const logDir = path.join(USB_ROOT, 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(logDir, `${date}.log`);
    const time = new Date().toISOString().split('T')[1].split('.')[0];
    fs.appendFileSync(logFile, `[${time}] [INFO] repair-env: ${msg}\n`, 'utf8');
  } catch {}
}

// Step 1: 检查系统 Node.js
function checkSystemNode() {
  try {
    const ver = execSync('node --version', { encoding: 'utf8', timeout: 5000 }).trim();
    log(`系统 Node.js: ${ver}`);
    return true;
  } catch {
    log('系统 Node.js 未安装');
    return false;
  }
}

// Step 2: 下载 Node.js MSI
function downloadNodeMsi(destPath) {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${arch}.msi`;
  const filename = `node-v${NODE_VERSION}-${arch}.msi`;

  // 检查U盘是否有内置 MSI
  const bundledMsi = path.join(USB_ROOT, 'bundled', filename);
  if (fs.existsSync(bundledMsi) && fs.statSync(bundledMsi).size > 1024) {
    log(`发现内置安装包: ${filename}`);
    fs.copyFileSync(bundledMsi, destPath);
    return true;
  }

  // 在线下载
  log(`下载 Node.js v${NODE_VERSION}...`);
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    let redirects = 0;

    function doDownload(downloadUrl) {
      redirects++;
      if (redirects > 5) { reject(new Error('重定向过多')); return; }
      https.get(downloadUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          doDownload(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        const total = parseInt(res.headers['content-length'], 10);
        let received = 0;
        let lastPct = 0;
        res.on('data', (chunk) => {
          received += chunk.length;
          if (total > 0) {
            const pct = Math.round(received / total * 100);
            if (pct - lastPct >= 10) { lastPct = pct; log(`下载进度: ${pct}%`); }
          }
        });
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(true); });
      }).on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
    }
    doDownload(url);
  });
}

// Step 3: 安装 MSI（需要管理员权限时用 sudo-prompt）
async function installMsi(msiPath) {
  log('安装 Node.js MSI...');
  return new Promise((resolve, reject) => {
    const child = spawn('msiexec', ['/i', msiPath, '/qn', '/norestart'], {
      stdio: 'pipe',
      env: { ...process.env },
    });
    child.on('close', (code) => {
      if (code === 0 || code === 3010) {
        log(`MSI 安装成功 (退出码: ${code})`);
        resolve();
      } else if (code === 1603) {
        log('退出码 1603，尝试提权安装...');
        elevateAndInstall(msiPath).then(resolve).catch(reject);
      } else {
        reject(new Error(`MSI 安装失败 (退出码: ${code})`));
      }
    });
    child.on('error', (err) => reject(err));
  });
}

function elevateAndInstall(msiPath) {
  return new Promise((resolve, reject) => {
    try {
      // 尝试用 PowerShell Start-Process 提权
      const cmd = `powershell -Command "Start-Process msiexec -ArgumentList '/i','"${msiPath}"','/qn','/norestart' -Verb RunAs -Wait"`;
      log('请求管理员权限...');
      execSync(cmd, { timeout: 300000 });
      log('提权安装完成');
      resolve();
    } catch (err) {
      reject(new Error(
        `提权安装失败。\n` +
        `请手动操作:\n` +
        `1. 右键"命令提示符" → 以管理员身份运行\n` +
        `2. 执行: msiexec /i "${msiPath}" /qn /norestart`
      ));
    }
  });
}

// Step 4: 安装 OpenClaw
function installOpenclaw() {
  log(`安装 OpenClaw v${OPENCLAW_VERSION}...`);
  try {
    execSync(
      `npm install -g openclaw@${OPENCLAW_VERSION} --registry=${REGISTRY}`,
      { encoding: 'utf8', timeout: 120000, stdio: 'inherit' }
    );
    log('OpenClaw 安装成功');
    return true;
  } catch (err) {
    log(`OpenClaw 安装失败: ${err.message}`);
    return false;
  }
}

// Step 5: 刷新 PATH
function refreshPath() {
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
}

// 主流程
async function main() {
  console.log('');
  log('=== OpenClaw 应急修复开始 ===');

  // Step 1: 检查 Node.js
  let nodeInstalled = checkSystemNode();

  // Step 2-3: 安装 Node.js（如果未安装）
  if (!nodeInstalled) {
    const tmpMsi = path.join(os.tmpdir(), `node-v${NODE_VERSION}-x64.msi`);
    try {
      await downloadNodeMsi(tmpMsi);
      await installMsi(tmpMsi);
      // 清理
      try { fs.unlinkSync(tmpMsi); } catch {}
      // 刷新 PATH
      refreshPath();
      // 验证
      nodeInstalled = checkSystemNode();
    } catch (err) {
      console.log('');
      console.log(`  [错误] Node.js 安装失败: ${err.message}`);
      process.exit(1);
    }
  }

  if (!nodeInstalled) {
    console.log('');
    console.log('  [错误] Node.js 安装后仍不可用，请手动安装。');
    console.log(`  下载地址: https://nodejs.org/dist/v${NODE_VERSION}/`);
    process.exit(1);
  }

  // Step 4: 安装 OpenClaw
  const ok = installOpenclaw();
  if (!ok) {
    console.log('');
    console.log('  [提示] OpenClaw 安装失败，请检查网络连接后重试。');
    console.log(`  手动安装: npm install -g openclaw@${OPENCLAW_VERSION} --registry=${REGISTRY}`);
    process.exit(1);
  }

  // Step 5: 验证
  console.log('');
  log('=== 验证安装 ===');
  try {
    const nodeVer = execSync('node --version', { encoding: 'utf8', timeout: 5000 }).trim();
    log(`Node.js: ${nodeVer}`);
  } catch { log('Node.js: 不可用'); }
  try {
    const ocVer = execSync('openclaw --version', { encoding: 'utf8', timeout: 5000 }).trim();
    log(`OpenClaw: ${ocVer}`);
  } catch { log('OpenClaw: 不可用 (可能需要重启终端)'); }

  console.log('');
  log('=== 应急修复完成 ===');
}

main().catch(err => {
  console.log(`  [致命错误] ${err.message}`);
  process.exit(1);
});
