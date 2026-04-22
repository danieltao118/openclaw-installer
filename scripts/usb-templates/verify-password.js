// verify-password.js — 独立密码验证脚本
// 用法: node verify-password.js <keyfile> <tmpPassFile>
// 成功退出码 = 0（保留临时文件供 launcher.js 使用）
// 失败退出码 = 1（删除临时文件）
const fs = require('fs');
const crypto = require('crypto');

const keyfilePath = process.argv[2];
const tmpPassPath = process.argv[3];

function cleanup() {
  try { fs.unlinkSync(tmpPassPath); } catch {}
}

if (!keyfilePath || !tmpPassPath) {
  cleanup();
  process.exit(1);
}

try {
  const storedHash = fs.readFileSync(keyfilePath, 'utf8').trim();
  const password = fs.readFileSync(tmpPassPath, 'utf8').trim();
  const hash = crypto.createHash('sha256').update(password).digest('hex');

  if (hash === storedHash) {
    // 成功 — 保留临时文件
    process.exit(0);
  } else {
    cleanup();
    process.exit(1);
  }
} catch (e) {
  cleanup();
  process.exit(1);
}
