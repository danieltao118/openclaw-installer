// scripts/detect.js — 环境检测
const { execSync } = require('child_process');
const os = require('os');
const https = require('https');
const logger = require('./logger');

// Windows 下全局命令需要 .cmd 后缀
function getCmd(name) {
  return process.platform === 'win32' ? name + '.cmd' : name;
}

async function detect(win, versions) {
  const result = {
    os: process.platform,
    arch: process.arch,
    osName: os.type(),
    osVersion: os.release(),
    nodeStatus: 'unknown',
    nodeVersion: null,
    openclawStatus: 'unknown',
    networkOk: false,
    warnings: [],
  };

  logger.info('开始环境检测');

  // 1. Windows 版本检查
  if (process.platform === 'win32') {
    const winVer = parseFloat(os.release());
    if (winVer < 10) {
      const msg = '当前 Windows 版本过低，需要 Windows 10 或更高版本';
      result.warnings.push({ type: 'error', msg });
      logger.error(`Windows 版本检查失败: ${os.release()}`);
    } else {
      logger.info(`Windows 版本: ${os.release()} (OK)`);
    }
  }

  // 2. 杀毒软件检测（仅 Windows）
  if (process.platform === 'win32') {
    const av = detectAntivirus();
    if (av.length > 0) {
      const names = av.map(a => a.name).join('、');
      const msg = `检测到杀毒软件: ${names}，建议安装前临时关闭或添加白名单`;
      result.warnings.push({ type: 'warning', msg });
      result.antivirus = av;
      logger.warn(`杀毒软件检测: ${names}`);
    } else {
      logger.info('未检测到已知杀毒软件');
    }
  }

  // 3. 检测 Node.js
  try {
    const ver = execSync('node --version', { timeout: 5000, encoding: 'utf8' }).trim();
    result.nodeVersion = ver;
    const major = parseInt(ver.replace('v', '').split('.')[0], 10);
    if (major >= 18) {
      result.nodeStatus = 'ok';
    } else {
      result.nodeStatus = 'outdated';
      result.warnings.push({
        type: 'warning',
        msg: `Node.js 版本 ${ver} 过低（需 v18+），安装时将自动升级`,
      });
    }
    logger.info(`Node.js: ${ver} (${result.nodeStatus})`);
  } catch {
    result.nodeStatus = 'missing';
    logger.info('Node.js: 未安装');
  }

  // 4. 检测 OpenClaw
  try {
    const cmd = getCmd('openclaw');
    const ver = execSync(`"${cmd}" --version`, { timeout: 5000, encoding: 'utf8' }).trim();
    result.openclawStatus = 'installed';
    result.openclawVersion = ver;
    logger.info(`OpenClaw: 已安装 ${ver}`);

    // 版本对比
    if (versions && versions.openclaw) {
      result.openclawLatestVersion = versions.openclaw;
      if (ver !== versions.openclaw) {
        result.openclawNeedsUpdate = true;
        logger.info(`OpenClaw 需要更新: ${ver} → ${versions.openclaw}`);
      } else {
        result.openclawNeedsUpdate = false;
      }
    }
  } catch {
    result.openclawStatus = 'missing';
    logger.info('OpenClaw: 未安装');
  }

  // 5. 网络连通性
  result.networkOk = await checkNetwork('https://registry.npmmirror.com');
  logger.info(`网络: ${result.networkOk ? '正常' : '不可用'}`);

  // 通知前端
  if (win && !win.isDestroyed()) {
    win.webContents.send('install-progress', {
      stepDone: 'istep-detect',
      message: `检测完成: OS=${result.os} 架构=${result.arch} Node=${result.nodeStatus} OpenClaw=${result.openclawStatus} 网络=${result.networkOk}`,
    });
  }

  return result;
}

/**
 * 检测常见杀毒软件（仅 Windows）
 * 通过进程名和注册表检测
 */
function detectAntivirus() {
  const found = [];

  // 已知杀毒软件进程名映射
  const AV_PROCESSES = {
    '360Safe.exe': '360安全卫士',
    '360Tray.exe': '360安全卫士',
    '360sd.exe': '360杀毒',
    'ZhuDongFangYu.exe': '360安全卫士（主动防御）',
    'Huorong.exe': '火绒安全',
    'wsctrl.exe': '火绒安全',
    'usysdiag.exe': '火绒安全',
    'Kxetray.exe': '金山毒霸',
    'KSWebShield.exe': '金山毒霸',
    'QQPCTray.exe': '腾讯电脑管家',
    'QQPCRTP.exe': '腾讯电脑管家',
    'avp.exe': '卡巴斯基',
    'avg.exe': 'AVG',
    'avast.exe': 'Avast',
  };

  try {
    // 通过 tasklist 获取进程列表
    const output = execSync('tasklist /FO CSV /NH', {
      encoding: 'utf8',
      timeout: 10000,
    });

    const processNames = new Set();
    output.split('\n').forEach(line => {
      const match = line.match(/"([^"]+)"/);
      if (match) processNames.add(match[1]);
    });

    for (const [proc, name] of Object.entries(AV_PROCESSES)) {
      if (processNames.has(proc)) {
        // 去重：同一款软件可能有多个进程
        if (!found.some(f => f.name === name)) {
          found.push({ name, process: proc });
        }
      }
    }
  } catch (err) {
    logger.warn(`杀毒软件进程检测失败: ${err.message}`);
  }

  // Windows Defender 通过 PowerShell 检测
  try {
    const defenderStatus = execSync(
      'powershell -Command "Get-MpComputerStatus | Select-Object -ExpandProperty RealTimeProtectionEnabled"',
      { encoding: 'utf8', timeout: 8000 }
    ).trim();
    if (defenderStatus === 'True') {
      found.push({ name: 'Windows Defender（实时保护已开启）', process: 'MsMpEng.exe' });
    }
  } catch {
    // PowerShell 不可用或 Defender 不存在，忽略
  }

  return found;
}

function checkNetwork(url) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'HEAD', timeout: 8000 }, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

module.exports = detect;
