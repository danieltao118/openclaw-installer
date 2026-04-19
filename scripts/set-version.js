// scripts/set-version.js — 命令行版本更新工具
// 用法: node scripts/set-version.js --openclaw 2026.5.20 [--node 22.22.2] [--installer 1.1.0]

const fs = require('fs');
const path = require('path');

const VERSIONS_FILE = path.join(__dirname, '..', 'versions.json');

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('用法: node scripts/set-version.js --openclaw <版本号> [--node <版本号>] [--installer <版本号>]');
    console.log('');
    console.log('示例:');
    console.log('  node scripts/set-version.js --openclaw 2026.5.20');
    console.log('  node scripts/set-version.js --openclaw 2026.5.20 --node 22.22.3');
    console.log('  node scripts/set-version.js --openclaw 2026.5.20 --installer 1.1.0');
    process.exit(0);
  }

  // 读取当前版本
  let versions;
  try {
    versions = JSON.parse(fs.readFileSync(VERSIONS_FILE, 'utf8'));
  } catch {
    console.error('错误: 无法读取 versions.json');
    process.exit(1);
  }

  console.log('当前版本:');
  console.log(`  Node.js:    v${versions.node}`);
  console.log(`  OpenClaw:   v${versions.openclaw}`);
  console.log(`  安装器:     v${versions.installer}`);
  console.log('');

  // 解析参数
  let changed = false;
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const val = args[i + 1];
    if (!val) {
      console.error(`错误: ${key} 缺少版本号`);
      process.exit(1);
    }
    if (key === '--openclaw') {
      versions.openclaw = val;
      changed = true;
    } else if (key === '--node') {
      versions.node = val;
      changed = true;
    } else if (key === '--installer') {
      versions.installer = val;
      changed = true;
    }
  }

  if (!changed) {
    console.log('未指定任何版本变更');
    process.exit(0);
  }

  // 写入
  fs.writeFileSync(VERSIONS_FILE, JSON.stringify(versions, null, 2) + '\n', 'utf8');

  console.log('已更新 versions.json:');
  console.log(`  Node.js:    v${versions.node}`);
  console.log(`  OpenClaw:   v${versions.openclaw}`);
  console.log(`  安装器:     v${versions.installer}`);

  // 删除旧的 bundled tgz 文件（版本变了旧文件没用了）
  const bundledDir = path.join(__dirname, '..', 'bundled');
  if (fs.existsSync(bundledDir)) {
    const files = fs.readdirSync(bundledDir).filter(f => f.startsWith('openclaw-') && f.endsWith('.tgz'));
    for (const f of files) {
      if (!f.includes(versions.openclaw)) {
        const fullPath = path.join(bundledDir, f);
        fs.unlinkSync(fullPath);
        console.log(`已删除旧文件: ${f}`);
      }
    }
  }

  console.log('');
  console.log('下一步:');
  console.log('  npm run prepare:bundled   # 下载新版本到 bundled/');
  console.log('  npm run build:win          # 打包成新的 exe');
}

main();
