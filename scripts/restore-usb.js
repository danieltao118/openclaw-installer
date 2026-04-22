// restore-usb.js — U盘一键恢复：缺什么补什么
// 用法: node scripts/restore-usb.js [盘符]
// 示例: node scripts/restore-usb.js E:
// 效果: 检查U盘每个组件，缺失的自动重建

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const NODE_VERSION = '22.22.2';
const OPENCLAW_VERSION = '2026.4.15';
const PROJECT_ROOT = path.resolve(__dirname, '..');
const TEMPLATES = path.join(PROJECT_ROOT, 'scripts', 'usb-templates');
const BUNDLED = path.join(PROJECT_ROOT, 'bundled');

const drive = (process.argv[2] || 'E:').replace(/\\$/, '');
const dirs = {
  portableNode: path.join(drive, 'portable-node'),
  claudePortable: path.join(drive, 'claude-portable'),
  tools: path.join(drive, 'tools'),
  guard: path.join(drive, '.guard'),
  logs: path.join(drive, 'logs'),
  macos: path.join(drive, 'macOS'),
};

console.log(`\n=== OpenClaw USB Restore ===`);
console.log(`Target: ${drive}\n`);

// ============ 1. 目录结构 ============
console.log('[1/7] 目录结构...');
for (const d of Object.values(dirs)) {
  if (!fs.existsSync(d)) { fs.mkdirSync(d, { recursive: true }); console.log(`  创建: ${path.basename(d)}/`); }
}

// ============ 2. portable-node ============
console.log('\n[2/7] portable-node...');
const nodeExe = path.join(dirs.portableNode, 'node.exe');
if (fs.existsSync(nodeExe)) {
  const ver = execSync(`"${nodeExe}" -v`, { encoding: 'utf8' }).trim();
  console.log(`  OK: ${ver}`);
} else {
  console.log('  缺失！下载 Node.js...');
  downloadAndExtractNode(dirs.portableNode);
}

// ============ 3. claude-portable ============
console.log('\n[3/7] claude-portable...');
const claudeCli = path.join(dirs.claudePortable, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
if (fs.existsSync(claudeCli)) {
  console.log('  OK: Claude Code 已安装');
} else {
  console.log('  缺失！安装 Claude Code...');
  const npmCmd = path.join(dirs.portableNode, 'npm.cmd');
  const npmNode = path.join(dirs.portableNode, 'node.exe');
  if (fs.existsSync(npmCmd) && fs.existsSync(npmNode)) {
    const claudeDir = path.join(dirs.claudePortable, '.claude');
    if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });
    execSync(`"${npmNode}" "${npmCmd}" install @anthropic-ai/claude-code@latest --prefix "${dirs.claudePortable}"`, {
      timeout: 180000, stdio: 'inherit',
    });
    console.log('  Claude Code 安装完成');
  } else {
    console.log('  跳过: portable-node 不可用');
  }
}

// ============ 4. 工具脚本 (tools/ + 根目录 bat) ============
console.log('\n[4/7] 工具脚本...');

// tools/ 目录文件（含更新后的 launcher.js）
const toolsFiles = ['launcher.js', 'usb-logger.js', 'verify-password.js'];
for (const f of toolsFiles) {
  const src = path.join(TEMPLATES, f);
  const dst = path.join(dirs.tools, f);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`  tools/${f}`);
  }
}

// 根目录 bat 文件（CRLF）
const batFiles = ['start.bat', 'diagnose.bat', 'install.bat'];
for (const f of batFiles) {
  const src = path.join(TEMPLATES, f);
  const dst = path.join(drive, f);
  if (fs.existsSync(src)) {
    let content = fs.readFileSync(src, 'utf8').replace(/(?<!\r)\n/g, '\r\n');
    fs.writeFileSync(dst, content, 'utf8');
    console.log(`  ${f}`);
  }
}

// ============ 5. CLAUDE.md ============
console.log('\n[5/7] CLAUDE.md...');
const claudeMd = path.join(TEMPLATES, 'CLAUDE.md');
const claudeMdDest = path.join(dirs.claudePortable, '.claude', 'CLAUDE.md');
if (fs.existsSync(claudeMd)) {
  fs.copyFileSync(claudeMd, claudeMdDest);
  console.log('  OK');
}

// ============ 6. 离线安装包 ============
console.log('\n[6/7] 离线安装包...');
const bundledFiles = {
  'node-v22.22.2-x64.msi': path.join(drive, 'node.msi'),
  'openclaw-2026.4.15.tgz': path.join(drive, 'openclaw.tgz'),
};
for (const [srcName, dstPath] of Object.entries(bundledFiles)) {
  const src = path.join(BUNDLED, srcName);
  if (fs.existsSync(src) && !fs.existsSync(dstPath)) {
    fs.copyFileSync(src, dstPath);
    console.log(`  ${path.basename(dstPath)} (${(fs.statSync(dstPath).size / 1024 / 1024).toFixed(0)}MB)`);
  } else if (fs.existsSync(dstPath)) {
    console.log(`  ${path.basename(dstPath)} OK`);
  } else {
    console.log(`  ${srcName} 源文件不存在，跳过`);
  }
}

// macOS Node.js tarballs + install script
const macFiles = [
  [path.join(TEMPLATES, 'install-mac.command'), path.join(dirs.macos, 'install.command')],
  [path.join(TEMPLATES, 'start-mac.command'), path.join(dirs.macos, 'start-mac.command')],
  [path.join(TEMPLATES, 'start-claude.command'), path.join(dirs.macos, 'start-claude.command')],
  [path.join(TEMPLATES, 'diagnose-mac.command'), path.join(dirs.macos, 'diagnose-mac.command')],
  [path.join(TEMPLATES, 'launcher-mac.js'), path.join(dirs.macos, 'launcher-mac.js')],
  [path.join(BUNDLED, 'openclaw-2026.4.15.tgz'), path.join(dirs.macos, 'openclaw.tgz')],
];
for (const [src, dst] of macFiles) {
  if (fs.existsSync(src) && !fs.existsSync(dst)) {
    fs.copyFileSync(src, dst);
    console.log(`  macOS/${path.basename(dst)}`);
  } else if (fs.existsSync(dst)) {
    console.log(`  macOS/${path.basename(dst)} OK`);
  }
}
// macOS Node.js tarballs
const macTarballs = [
  ['node-v22.22.2-darwin-arm64.tar.gz', 'node-darwin-arm64.tar.gz'],
  ['node-v22.22.2-darwin-x64.tar.gz', 'node-darwin-x64.tar.gz'],
];
for (const [srcName, dstName] of macTarballs) {
  const src = path.join(BUNDLED, srcName);
  const dst = path.join(dirs.macos, dstName);
  if (fs.existsSync(src) && !fs.existsSync(dst)) {
    fs.copyFileSync(src, dst);
    console.log(`  macOS/${dstName}`);
  } else if (fs.existsSync(dst)) {
    console.log(`  macOS/${dstName} OK`);
  } else {
    console.log(`  macOS/${dstName} 缺失（源文件不存在）`);
  }
}

// ============ 7. 验证 ============
console.log('\n[7/7] 验证...');
let ok = 0, fail = 0;
const checks = [
  ['portable-node/node.exe', nodeExe],
  ['portable-git/bin/bash.exe', path.join(drive, 'portable-git', 'bin', 'bash.exe')],
  ['portable-git/cmd/git.exe', path.join(drive, 'portable-git', 'cmd', 'git.exe')],
  ['tools/launcher.js', path.join(dirs.tools, 'launcher.js')],
  ['tools/usb-logger.js', path.join(dirs.tools, 'usb-logger.js')],
  ['tools/verify-password.js', path.join(dirs.tools, 'verify-password.js')],
  ['start.bat', path.join(drive, 'start.bat')],
  ['macOS/start-claude.command', path.join(dirs.macos, 'start-claude.command')],
  ['macOS/launcher-mac.js', path.join(dirs.macos, 'launcher-mac.js')],
  ['macOS/node-darwin-arm64.tar.gz', path.join(dirs.macos, 'node-darwin-arm64.tar.gz')],
  ['macOS/node-darwin-x64.tar.gz', path.join(dirs.macos, 'node-darwin-x64.tar.gz')],
  ['macOS/git-mac.pkg', path.join(dirs.macos, 'git-mac.pkg')],
  ['.guard/key.dat', path.join(dirs.guard, 'key.dat')],
  ['.guard/credentials.enc', path.join(dirs.guard, 'credentials.enc')],
];
for (const [label, p] of checks) {
  if (fs.existsSync(p)) { console.log(`  OK: ${label}`); ok++; }
  else { console.log(`  FAIL: ${label}`); fail++; }
}
// .guard 文件无法恢复
if (!fs.existsSync(path.join(dirs.guard, 'key.dat'))) {
  console.log('\n  注意: .guard/ 凭证文件无法自动恢复，需重新运行 prepare-usb.js');
}

console.log(`\n=== 完成: ${ok} OK, ${fail} FAIL ===\n`);

// ========== 工具函数 ==========
function downloadAndExtractNode(targetDir) {
  const zipUrl = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;
  const zipPath = path.join(targetDir, 'node.zip');

  execSync(`curl -L -o "${zipPath}" "${zipUrl}"`, { timeout: 120000, stdio: 'inherit' });
  const tmp = path.join(targetDir, '_tmp');
  execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${tmp}' -Force"`, { timeout: 120000 });

  const inner = path.join(tmp, `node-v${NODE_VERSION}-win-x64`);
  for (const f of ['node.exe', 'npm', 'npm.cmd', 'npx', 'npx.cmd']) {
    const src = path.join(inner, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(targetDir, f));
  }
  const nm = path.join(inner, 'node_modules');
  if (fs.existsSync(nm)) copyDir(nm, path.join(targetDir, 'node_modules'));

  fs.rmSync(tmp, { recursive: true });
  fs.unlinkSync(zipPath);
  console.log(`  Node.js v${NODE_VERSION} 恢复完成`);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    entry.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}
