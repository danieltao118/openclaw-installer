// scripts/package-offline.js — 打包3个平台的离线安装包
// 用法: node scripts/package-offline.js
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const NODE_VERSION = '22.22.2';
const OPENCLAW_VERSION = '2026.4.15';
const NPM_MIRROR = 'https://registry.npmmirror.com';

const PROJECT_ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(PROJECT_ROOT, 'dist', 'offline-cache');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'dist', 'packages');
const TEMPLATES_DIR = path.join(__dirname, 'offline-templates');

// 需要下载的文件
const RESOURCES = {
  'node-win-x64': `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-x64.msi`,
  'node-mac-arm64': `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
  'node-mac-x64': `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-x64.tar.gz`,
  'openclaw': null, // 通过 npm pack 获取
};

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(destPath)) {
      console.log(`  [跳过] ${path.basename(destPath)} 已存在`);
      return resolve(destPath);
    }
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const file = fs.createWriteStream(destPath);
    let redirects = 0;

    function doDownload(downloadUrl) {
      redirects++;
      if (redirects > 5) return reject(new Error('重定向过多'));
      https.get(downloadUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return doDownload(res.headers.location);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const total = parseInt(res.headers['content-length'], 10) || 0;
        let received = 0, lastPct = 0;
        res.on('data', (chunk) => {
          received += chunk.length;
          if (total > 0) {
            const pct = Math.round((received / total) * 100);
            if (pct - lastPct >= 10) {
              lastPct = pct;
              process.stdout.write(`  ${pct}% (${(received/1024/1024).toFixed(1)}/${(total/1024/1024).toFixed(1)}MB)\r`);
            }
          }
        });
        res.pipe(file);
        file.on('finish', () => { file.close(); process.stdout.write('\n'); resolve(destPath); });
      }).on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
    }
    doDownload(url);
  });
}

async function main() {
  console.log('=== OpenClaw 离线安装包打包器 ===\n');

  // 准备目录
  [CACHE_DIR, OUTPUT_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });

  // 1. 下载 Node.js（3个平台）
  console.log('[1/3] 下载 Node.js...');
  const nodeWin = path.join(CACHE_DIR, `node-v${NODE_VERSION}-x64.msi`);
  const nodeMacArm = path.join(CACHE_DIR, `node-v${NODE_VERSION}-darwin-arm64.tar.gz`);
  const nodeMacX64 = path.join(CACHE_DIR, `node-v${NODE_VERSION}-darwin-x64.tar.gz`);

  await downloadFile(RESOURCES['node-win-x64'], nodeWin);
  await downloadFile(RESOURCES['node-mac-arm64'], nodeMacArm);
  await downloadFile(RESOURCES['node-mac-x64'], nodeMacX64);

  // 2. 打包 openclaw tgz
  console.log('\n[2/3] 打包 OpenClaw...');
  const openclawTgz = path.join(CACHE_DIR, `openclaw-${OPENCLAW_VERSION}.tgz`);
  if (!fs.existsSync(openclawTgz)) {
    console.log(`  npm pack openclaw@${OPENCLAW_VERSION}...`);
    execSync(`npm pack openclaw@${OPENCLAW_VERSION} --registry=${NPM_MIRROR}`, {
      cwd: CACHE_DIR,
      timeout: 120000,
      stdio: 'pipe',
    });
    // npm pack 可能生成不同文件名，重命名
    const files = fs.readdirSync(CACHE_DIR).filter(f => f.startsWith('openclaw-') && f.endsWith('.tgz'));
    if (files.length > 0 && files[0] !== `openclaw-${OPENCLAW_VERSION}.tgz`) {
      const src = path.join(CACHE_DIR, files[0]);
      if (!fs.existsSync(openclawTgz)) {
        fs.renameSync(src, openclawTgz);
      } else {
        fs.unlinkSync(src);
      }
    }
    console.log('  OpenClaw 打包完成');
  } else {
    console.log(`  [跳过] openclaw-${OPENCLAW_VERSION}.tgz 已存在`);
  }

  // 3. 组装3个ZIP
  console.log('\n[3/3] 组装安装包...');

  // 读取模板文件并确保编码正确
  function readTemplate(name) {
    const p = path.join(TEMPLATES_DIR, name);
    if (!fs.existsSync(p)) return null;
    let content = fs.readFileSync(p, 'utf8');
    if (name.endsWith('.bat')) {
      content = content.replace(/(?<!\r)\n/g, '\r\n');
    }
    return content;
  }

  const templates = {
    'README.md': readTemplate('README.md'),
  };

  const packages = [
    {
      name: 'OpenClaw-离线安装包-Windows',
      zipName: 'OpenClaw-离线安装包-Windows.zip',
      files: [
        { src: nodeWin, name: `node-v${NODE_VERSION}-x64.msi` },
        { src: openclawTgz, name: `openclaw-${OPENCLAW_VERSION}.tgz` },
      ],
      templates: ['README.md'],
    },
    {
      name: 'OpenClaw-离线安装包-macOS-M芯片',
      zipName: 'OpenClaw-离线安装包-macOS-M芯片.zip',
      files: [
        { src: nodeMacArm, name: `node-v${NODE_VERSION}-darwin-arm64.tar.gz` },
        { src: openclawTgz, name: `openclaw-${OPENCLAW_VERSION}.tgz` },
      ],
      templates: ['README.md'],
    },
    {
      name: 'OpenClaw-离线安装包-macOS-Intel',
      zipName: 'OpenClaw-离线安装包-macOS-Intel.zip',
      files: [
        { src: nodeMacX64, name: `node-v${NODE_VERSION}-darwin-x64.tar.gz` },
        { src: openclawTgz, name: `openclaw-${OPENCLAW_VERSION}.tgz` },
      ],
      templates: ['README.md'],
    },
  ];

  for (const pkg of packages) {
    const staging = path.join(CACHE_DIR, '_staging', pkg.name);
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true });
    fs.mkdirSync(staging, { recursive: true });

    // 复制二进制文件
    for (const f of pkg.files) {
      if (fs.existsSync(f.src)) {
        fs.copyFileSync(f.src, path.join(staging, f.name));
      } else {
        console.error(`  [错误] ${f.src} 不存在`);
      }
    }

    // 写入模板文件（加 UTF-8 BOM 确保 Windows 记事本能打开）
    for (const t of pkg.templates) {
      if (templates[t]) {
        const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
        const content = Buffer.concat([bom, Buffer.from(templates[t], 'utf8')]);
        fs.writeFileSync(path.join(staging, t), content);
      }
    }

    // 打 ZIP
    const zipPath = path.join(OUTPUT_DIR, pkg.zipName);
    console.log(`  打包 ${pkg.zipName}...`);
    try {
      execSync(`powershell -Command "Compress-Archive -Path '${staging}\\*' -DestinationPath '${zipPath}' -Force"`, {
        timeout: 120000,
        stdio: 'pipe',
      });
      const size = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
      console.log(`    ${pkg.zipName} (${size}MB)`);
    } catch (err) {
      console.error(`    打包失败: ${err.message}`);
    }

    // 清理 staging
    fs.rmSync(staging, { recursive: true });
  }

  // 汇总
  console.log('\n=== 打包完成 ===');
  console.log(`输出目录: ${OUTPUT_DIR}`);
  const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.zip'));
  for (const f of files) {
    const size = (fs.statSync(path.join(OUTPUT_DIR, f)).size / 1024 / 1024).toFixed(1);
    console.log(`  ${f}  (${size}MB)`);
  }
}

main().catch(err => {
  console.error('打包失败:', err.message);
  process.exit(1);
});
