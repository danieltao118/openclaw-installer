// load-versions.js — 兼容 ASAR 打包的 versions.json 读取
const fs = require('fs');
const path = require('path');

function loadVersions() {
  const paths = [
    process.resourcesPath ? path.join(process.resourcesPath, 'versions.json') : null,
    process.resourcesPath ? path.join(process.resourcesPath, '..', 'versions.json') : null,
    path.join(__dirname, '..', 'versions.json'),
    path.join(__dirname, 'versions.json'),
  ];
  for (const p of paths) {
    if (!p) continue;
    try {
      if (fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch {}
  }
  return { node: '22.22.2', openclaw: '2026.4.15', installer: '1.0.0' };
}

module.exports = loadVersions();
