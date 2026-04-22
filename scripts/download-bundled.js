// scripts/download-bundled.js — 构建前下载 Node.js 和 OpenClaw 到 bundled/ 目录
const fs = require('fs');
const path = require('path');
const https = require('https');

const versions = require('./load-versions');
const NODE_VERSION = versions.node;
const OPENCLAW_VERSION = versions.openclaw;
const GIT_VERSION = versions.git;

const BUNDLED_DIR = path.join(__dirname, '..', 'bundled');

// 各平台需要下载的 Node.js 安装包
const NODE_FILES = [
  {
    url: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-x64.msi`,
    file: `node-v${NODE_VERSION}-x64.msi`,
    platform: 'win32',
  },
  {
    url: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
    file: `node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
    platform: 'darwin-arm64',
  },
  {
    url: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-x64.tar.gz`,
    file: `node-v${NODE_VERSION}-darwin-x64.tar.gz`,
    platform: 'darwin-x64',
  },
];

// Git for Windows 安装包（仅 Windows）
// 优先使用华为云镜像，GitHub 在国内下载慢
const GIT_MIRROR = process.env.GIT_MIRROR || 'https://mirrors.huaweicloud.com/git-for-windows';
const GIT_FILES = [
  {
    url: `${GIT_MIRROR}/v${GIT_VERSION}.windows.1/Git-${GIT_VERSION}-64-bit.exe`,
    file: `Git-${GIT_VERSION}-64-bit.exe`,
    platform: 'win32',
  },
  // macOS Git（Intel+Apple Silicon 通用二进制）
  // 下载后重命名为 git-mac.pkg，install-git.js 按此文件名查找
  {
    url: `https://sourceforge.net/projects/git-osx-installer/files/git-${GIT_VERSION}-intel-universal-mavericks.pkg/download`,
    file: 'git-mac.pkg',
    platform: 'darwin',
  },
];

// OpenClaw npm tarball（通用，跨平台）
const OPENCLAW_FILE = {
  url: `https://registry.npmmirror.com/openclaw/-/openclaw-${OPENCLAW_VERSION}.tgz`,
  file: `openclaw-${OPENCLAW_VERSION}.tgz`,
};

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    let redirectCount = 0;

    function doDownload(downloadUrl) {
      redirectCount++;
      if (redirectCount > 5) {
        reject(new Error('重定向次数过多'));
        return;
      }

      https.get(downloadUrl, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          doDownload(response.headers.location);
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const total = parseInt(response.headers['content-length'], 10) || 0;
        let received = 0;
        let lastPercent = 0;

        response.on('data', (chunk) => {
          received += chunk.length;
          if (total > 0) {
            const percent = Math.round((received / total) * 100);
            if (percent - lastPercent >= 10) {
              lastPercent = percent;
              const mb = (received / 1024 / 1024).toFixed(1);
              const totalMb = (total / 1024 / 1024).toFixed(1);
              process.stdout.write(`  ${percent}% (${mb}/${totalMb}MB)\r`);
            }
          }
        });

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          process.stdout.write('\n');
          resolve(destPath);
        });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
    }

    doDownload(url);
  });
}

async function main() {
  console.log('=== 准备离线资源 ===\n');

  // 创建 bundled 目录
  if (!fs.existsSync(BUNDLED_DIR)) {
    fs.mkdirSync(BUNDLED_DIR, { recursive: true });
  }

  // 确定当前平台需要哪些 Node.js 文件
  // CI 环境下全平台都下载，本地开发只下载当前平台
  const downloadAll = process.env.DOWNLOAD_ALL === '1' || process.env.CI === 'true';
  const platform = process.platform;
  const arch = process.arch;

  const nodeFilesToDownload = downloadAll
    ? NODE_FILES
    : NODE_FILES.filter((f) => {
        if (platform === 'win32' && f.platform === 'win32') return true;
        if (platform === 'darwin' && arch === 'arm64' && f.platform === 'darwin-arm64') return true;
        if (platform === 'darwin' && arch === 'x64' && f.platform === 'darwin-x64') return true;
        return false;
      });

  const gitFilesToDownload = downloadAll
    ? GIT_FILES
    : GIT_FILES.filter((f) => {
        if (platform === 'win32' && f.platform === 'win32') return true;
        if (platform === 'darwin' && f.platform === 'darwin') return true;
        return false;
      });

  const allDownloads = [
    ...nodeFilesToDownload.map((f) => ({ ...f, label: `Node.js ${f.platform}` })),
    ...gitFilesToDownload.map((f) => ({ ...f, label: `Git ${f.platform}` })),
    { ...OPENCLAW_FILE, label: `OpenClaw@${OPENCLAW_VERSION}` },
  ];

  for (const item of allDownloads) {
    const destPath = path.join(BUNDLED_DIR, item.file);

    // 已存在且非空则跳过
    if (fs.existsSync(destPath)) {
      const stat = fs.statSync(destPath);
      if (stat.size > 1024) {
        console.log(`[跳过] ${item.label} — ${item.file} 已存在 (${(stat.size / 1024 / 1024).toFixed(1)}MB)`);
        continue;
      }
    }

    console.log(`[下载] ${item.label}...`);
    console.log(`  URL: ${item.url}`);
    try {
      await downloadFile(item.url, destPath);
      const size = fs.statSync(destPath).size;
      console.log(`  完成! (${(size / 1024 / 1024).toFixed(1)}MB)`);
    } catch (err) {
      console.error(`  失败: ${err.message}`);
      // 删除不完整的文件
      try { fs.unlinkSync(destPath); } catch {}
      process.exitCode = 1;
    }
  }

  console.log('\n=== 离线资源准备完毕 ===');
  const files = fs.readdirSync(BUNDLED_DIR);
  for (const f of files) {
    const size = fs.statSync(path.join(BUNDLED_DIR, f)).size;
    console.log(`  ${f}  (${(size / 1024 / 1024).toFixed(1)}MB)`);
  }
}

main().catch((err) => {
  console.error('下载失败:', err.message);
  process.exit(1);
});
