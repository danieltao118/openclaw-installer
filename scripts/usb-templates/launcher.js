// launcher.js — 安全启动器：解密 API Key + 设置环境 + 启动 Claude Code
// 所有敏感操作在 Node.js 进程内完成，不写入目标电脑磁盘
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

// 日志辅助函数
// __dirname = tools/, USB_ROOT = 上一级
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

log('INFO', 'launcher.js 启动', `电脑: ${os.hostname()} USB: ${USB_ROOT}`);

if (!tmpPassPath || !fs.existsSync(tmpPassPath)) {
  console.error('[错误] 缺少密码');
  log('ERROR', '缺少密码文件', tmpPassPath || '(空)');
  process.exit(1);
}

// 从临时文件读取密码，读完后立即删除
const password = fs.readFileSync(tmpPassPath, 'utf8').trim();
try { fs.unlinkSync(tmpPassPath); } catch {}

// 1. 解密 API Key
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

// 2. 构建隔离环境 —— 所有路径指向U盘，不写目标电脑
const nodeExe = path.join(USB_ROOT, 'portable-node', 'node.exe');
const claudeCli = path.join(USB_ROOT, 'claude-portable', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
const claudeHome = path.join(USB_ROOT, 'claude-portable');

// 确保 .claude 目录存在
const claudeDir = path.join(claudeHome, '.claude');
if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });

// 确保临时目录在U盘上
const appdataDir = path.join(claudeHome, 'appdata');
const localappdataDir = path.join(claudeHome, 'localappdata');
if (!fs.existsSync(appdataDir)) fs.mkdirSync(appdataDir, { recursive: true });
if (!fs.existsSync(localappdataDir)) fs.mkdirSync(localappdataDir, { recursive: true });

const env = {
  ...process.env,
  // API 配置（通过环境变量注入，不写文件）
  ANTHROPIC_AUTH_TOKEN: apikey,
  ANTHROPIC_BASE_URL: 'https://open.bigmodel.cn/api/anthropic',
  ANTHROPIC_MODEL: 'GLM-5.1',
  ANTHROPIC_DEFAULT_SONNET_MODEL: 'GLM-5V-Turbo',
  ANTHROPIC_DEFAULT_HAIKU_MODEL: 'GLM-4.7',
  ANTHROPIC_DEFAULT_OPUS_MODEL: 'GLM-5.1',
  ANTHROPIC_REASONING_MODEL: 'GLM-5.1',
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  // 关键：HOME 指向U盘，Claude Code 的所有配置和历史都写到U盘
  HOME: claudeHome,
  USERPROFILE: claudeHome,
  APPDATA: appdataDir,
  LOCALAPPDATA: localappdataDir,
  PATH: path.join(USB_ROOT, 'portable-node') + ';' + process.env.PATH,
};

// 3. 启动 Claude Code
const extraArgs = process.argv.slice(3);
console.log('正在启动 Claude Code (便携模式)...');
console.log('配置目录: ' + claudeDir);
console.log('');

const child = spawn(nodeExe, [claudeCli, ...extraArgs], {
  stdio: 'inherit',
  env,
  shell: false,
});

log('INFO', 'Claude Code 已启动', `PID: ${child.pid}`);

child.on('exit', (code) => {
  log('INFO', 'Claude Code 退出', `退出码: ${code || 0}`);
  process.exit(code || 0);
});
