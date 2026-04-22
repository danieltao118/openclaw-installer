// rebuild-portable-node.js — 快速重建U盘 portable-node
// 用法: node rebuild-portable-node.js [盘符，默认 E:]
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const NODE_VERSION = '22.22.2';
const drive = process.argv[2] || 'E:';
const target = path.join(drive, 'portable-node');

if (fs.existsSync(path.join(target, 'node.exe'))) {
  console.log('portable-node 已存在，跳过。如需重建请先删除。');
  process.exit(0);
}

console.log(`重建 portable-node v${NODE_VERSION} → ${target}`);
fs.mkdirSync(target, { recursive: true });

const zipUrl = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;
const zipPath = path.join(target, 'node.zip');

// 下载
console.log('下载中...');
const file = fs.createWriteStream(zipPath);
https.get(zipUrl, (res) => {
  if (res.statusCode >= 300 && res.headers.location) {
    https.get(res.headers.location, r => r.pipe(file)).on('error', e => { console.error(e); process.exit(1); });
    return;
  }
  res.pipe(file);
  file.on('finish', () => {
    file.close();
    console.log('解压中...');
    const tmp = path.join(target, '_tmp');
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tmp}' -Force"`, { timeout: 120000 });
    const inner = path.join(tmp, `node-v${NODE_VERSION}-win-x64`);
    for (const f of ['node.exe', 'npm', 'npm.cmd', 'npx', 'npx.cmd']) {
      const src = path.join(inner, f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(target, f));
    }
    const nm = path.join(inner, 'node_modules');
    if (fs.existsSync(nm)) copyDir(nm, path.join(target, 'node_modules'));
    fs.rmSync(tmp, { recursive: true });
    fs.unlinkSync(zipPath);
    console.log('完成！' + path.join(target, 'node.exe'));
  });
}).on('error', e => { console.error(e); process.exit(1); });

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    entry.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}
