// usb-logger.js — U盘便携日志模块
// 日志写入U盘 logs/YYYY-MM-DD.log，不管在哪台电脑上都保留记录
// 用法: node usb-logger.js <LEVEL> <message> [detail]
const fs = require('fs');
const path = require('path');

// __dirname = tools/, USB_ROOT = 上一级
const USB_ROOT = path.resolve(__dirname, '..');
const LOG_DIR = path.join(USB_ROOT, 'logs');

const level = (process.argv[2] || 'INFO').toUpperCase();
// 从 GBK 转为 UTF-8（bat 传过来的是系统代码页编码）
function decodeArg(arg) {
  if (!arg) return '';
  try {
    return Buffer.from(arg, 'binary').toString('utf8');
  } catch {
    return arg;
  }
}
const message = decodeArg(process.argv[3] || '');
const detail = decodeArg(process.argv[4] || '');

if (!message) process.exit(0);

const now = new Date();
const timestamp = now.toISOString().replace('T', ' ').substring(0, 19);
const dateStr = now.toISOString().substring(0, 10);
const logFile = path.join(LOG_DIR, `${dateStr}.log`);

if (!fs.existsSync(LOG_DIR)) {
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch {}
}

const line = detail
  ? `[${timestamp}] [${level}] ${message} | ${detail}\n`
  : `[${timestamp}] [${level}] ${message}\n`;

try {
  fs.appendFileSync(logFile, line, 'utf8');
} catch {}
