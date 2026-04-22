// sync-to-usb.js — 一键同步源码到U盘
// 用法: node scripts/sync-to-usb.js [盘符，默认 E:]
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const drive = (process.argv[2] || 'E:').replace(/\\$/, '');
const src = path.resolve(__dirname, '..');
const dst = path.join(drive, 'openclaw-src');

console.log(`\n=== 同步源码到U盘 ===`);
console.log(`源: ${src}`);
console.log(`目标: ${dst}\n`);

// robocopy 返回码: 0=无变化, 1=已复制, 2=额外, 3=两者, 8+才是错误
const cmd = `robocopy "${src}" "${dst}" /E /XD "node_modules" ".git" "dist" "bundled" /NFL /NDL /NJH /NP /DCOPY:T`;
try {
  execSync(cmd, { timeout: 30000 });
} catch (e) {
  if (e.status >= 8) throw e; // 8+ 才是真正错误
}
console.log('源码同步完成');

// 同步构建产物
const exe = path.join(src, 'dist', 'OpenClaw-Portable.exe');
const exeDst = path.join(drive, 'OpenClaw-Portable.exe');
if (fs.existsSync(exe)) {
  fs.copyFileSync(exe, exeDst);
  console.log(`安装器同步完成 (${(fs.statSync(exeDst).size / 1024 / 1024).toFixed(0)}MB)`);
}

// 确保U盘有 .portable 标记（安装器通过此文件识别U盘环境）
const portableMarker = path.join(drive, '.portable');
if (!fs.existsSync(portableMarker)) {
  fs.writeFileSync(portableMarker, new Date().toISOString(), 'utf8');
  console.log('.portable 标记已创建');
}

console.log('\n=== 同步完成 ===\n');
