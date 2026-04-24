// launcher-mac.js — macOS 安全启动器：解密 API Key + 设置环境 + 启动 Claude Code
// 与 launcher.js (Windows) 平行，macOS 特化版本
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

// __dirname = macOS/, USB_ROOT = U盘根目录
const USB_ROOT = path.resolve(__dirname, '..');
function log(level, message, detail) {
  try {
    const now = new Date();
    const timestamp = now.toISOString().replace('T', ' ').substring(0, 19);
    const dateStr = now.toISOString().substring(0, 10);
    const logDir = path.join(USB_ROOT, 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const line = detail
      ? `[${timestamp}] [${level}] ${message} | ${detail}\n`
      : `[${timestamp}] [${level}] ${message}\n`;
    fs.appendFileSync(path.join(logDir, `${dateStr}.log`), line, 'utf8');
  } catch {}
}

const tmpPassPath = process.argv[2];

log('INFO', 'launcher-mac.js 启动', `电脑: ${os.hostname()} USB: ${USB_ROOT}`);

if (!tmpPassPath || !fs.existsSync(tmpPassPath)) {
  console.error('[错误] 缺少密码');
  log('ERROR', '缺少密码文件', tmpPassPath || '(空)');
  process.exit(1);
}

// 读取密码后立即删除临时文件
const password = fs.readFileSync(tmpPassPath, 'utf8').trim();
try { fs.unlinkSync(tmpPassPath); } catch {}

// 1. 解密 API Key（与 Windows launcher.js 完全一致）
const encPath = path.join(USB_ROOT, '.guard', 'credentials.enc');
if (!fs.existsSync(encPath)) {
  console.error('[错误] 凭证文件不存在');
  process.exit(1);
}

let apikey;
try {
  const enc = fs.readFileSync(encPath);
  const key = crypto.createHash('sha256').update(password).digest();
  const iv = enc.slice(0, 16);
  const data = enc.slice(16);
  const dec = crypto.createDecipheriv('aes-256-cbc', key, iv);
  apikey = dec.update(data, 'buffer', 'utf8') + dec.final('utf8');
} catch {
  console.error('[错误] 凭证解密失败（密码错误？）');
  log('ERROR', '凭证解密失败');
  process.exit(1);
}

log('INFO', 'API Key 解密成功');

// 2. macOS 便携环境
const nodeExe = path.join(__dirname, 'portable-node', 'bin', 'node');
const claudeCli = path.join(USB_ROOT, 'claude-portable', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
const claudeHome = path.join(USB_ROOT, 'claude-portable');

// 确保 .claude 目录存在
const claudeDir = path.join(claudeHome, '.claude');
if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });

if (!fs.existsSync(nodeExe)) {
  console.error('[错误] portable-node 未解压。请先运行 start-claude.command');
  log('ERROR', 'portable-node 未解压', nodeExe);
  process.exit(1);
}

if (!fs.existsSync(claudeCli)) {
  console.error('[错误] Claude Code 未安装。请先在 Windows 上运行 prepare-usb.js');
  log('ERROR', 'Claude Code 未安装', claudeCli);
  process.exit(1);
}

// 检查便携 git
const gitBinDir = path.join(__dirname, 'portable-git', 'bin');
const gitExecPath = path.join(__dirname, 'portable-git', 'libexec', 'git-core');
if (fs.existsSync(path.join(gitBinDir, 'git'))) {
  log('INFO', '便携 Git 找到', gitBinDir);
}

const env = {
  ...process.env,
  // API 配置
  ANTHROPIC_AUTH_TOKEN: apikey,
  ANTHROPIC_BASE_URL: 'https://open.bigmodel.cn/api/anthropic',
  ANTHROPIC_MODEL: 'GLM-5.1',
  ANTHROPIC_DEFAULT_SONNET_MODEL: 'GLM-5V-Turbo',
  ANTHROPIC_DEFAULT_HAIKU_MODEL: 'GLM-4.7',
  ANTHROPIC_DEFAULT_OPUS_MODEL: 'GLM-5.1',
  ANTHROPIC_REASONING_MODEL: 'GLM-5.1',
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  // macOS: HOME 指向U盘，Claude Code 配置和历史写到U盘
  HOME: claudeHome,
  PATH: (fs.existsSync(gitBinDir) ? gitBinDir + ':' : '') + path.join(__dirname, 'portable-node', 'bin') + ':' + (process.env.PATH || ''),
  ...(fs.existsSync(gitExecPath) ? { GIT_EXEC_PATH: gitExecPath } : {}),
};

// 3. 启动 Claude Code
const extraArgs = process.argv.slice(3);
console.log('正在启动 Claude Code (macOS 便携模式)...');
console.log('配置目录: ' + claudeDir);
console.log('');

const child = spawn(nodeExe, ['--max-old-space-size=4096', claudeCli, ...extraArgs], {
  stdio: 'inherit',
  env,
  shell: false,
});

log('INFO', 'Claude Code 已启动', `PID: ${child.pid}`);

child.on('exit', (code) => {
  log('INFO', 'Claude Code 退出', `退出码: ${code || 0}`);
  process.exit(code || 0);
});
