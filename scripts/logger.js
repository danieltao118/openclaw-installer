// scripts/logger.js — 日志模块
const fs = require('fs');
const path = require('path');
const os = require('os');

const LOG_FILE = path.join(os.homedir(), 'openclaw-install.log');
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

function rotateIfNeeded() {
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size > MAX_SIZE) {
      const content = fs.readFileSync(LOG_FILE, 'utf8');
      const half = Math.floor(content.length / 2);
      fs.writeFileSync(LOG_FILE, '... [日志已轮转] ...\n' + content.slice(half), 'utf8');
    }
  } catch {
    // 文件不存在，无需轮转
  }
}

function log(level, message) {
  rotateIfNeeded();
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch {
    // 写日志失败不阻塞主流程
  }
}

module.exports = {
  log,
  info: (msg) => log('INFO', msg),
  warn: (msg) => log('WARN', msg),
  error: (msg) => log('ERROR', msg),
  LOG_FILE,
};
