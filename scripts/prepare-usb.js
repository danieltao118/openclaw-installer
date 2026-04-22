// scripts/prepare-usb.js — 制作 OpenClaw 技术支持工具U盘
// 用法: node scripts/prepare-usb.js --drive E: [--password xxx] [--apikey xxx]
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync, spawn } = require('child_process');
const crypto = require('crypto');

const NODE_VERSION = '22.22.2';
const CLAUDE_CODE_VERSION = '2.1.90';
const NPM_MIRROR = 'https://registry.npmmirror.com';

// 解析参数
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--drive') opts.drive = args[++i];
    else if (args[i] === '--password') opts.password = args[++i];
    else if (args[i] === '--apikey') opts.apikey = args[++i];
    else if (args[i] === '--reset-password') opts.resetPassword = true;
  }
  return opts;
}

// 交互式输入
function readline(prompt) {
  const { execSync } = require('child_process');
  process.stdout.write(prompt);
  try {
    return execSync('node -e "process.stdout.write(require(\'readline\').createInterface({input:process.stdin,output:process.stdout})._prompt)"', { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function ask(prompt) {
  process.stdout.write(prompt);
  const buf = Buffer.alloc(256);
  const n = require('fs').readFileSync(0, buf, 0, 256);
  return buf.toString('utf8', 0, n).trim();
}

// 文件下载
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
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
        let received = 0;
        let lastPct = 0;

        res.on('data', (chunk) => {
          received += chunk.length;
          if (total > 0) {
            const pct = Math.round((received / total) * 100);
            if (pct - lastPct >= 10) {
              lastPct = pct;
              const mb = (received / 1024 / 1024).toFixed(1);
              const totalMb = (total / 1024 / 1024).toFixed(1);
              process.stdout.write(`  ${pct}% (${mb}/${totalMb}MB)\r`);
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

// AES-256-CBC 加密
function encrypt(text, password) {
  const key = crypto.createHash('sha256').update(password).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'buffer');
  encrypted = Buffer.concat([iv, encrypted, cipher.final()]);
  return encrypted;
}

// SHA-256 哈希
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function main() {
  const opts = parseArgs();

  console.log('=== OpenClaw 技术支持工具U盘制作器 ===\n');

  // 1. 确定目标盘符
  let drive = opts.drive;
  if (!drive) {
    process.stdout.write('请输入U盘盘符（如 E:）: ');
    drive = fs.readFileSync(0, Buffer.alloc(16), 0, 16).toString().trim();
  }
  if (!drive || !fs.existsSync(drive)) {
    console.error(`错误: 盘符 ${drive} 不存在或不可访问`);
    process.exit(1);
  }
  drive = drive.replace(/\\$/, '');
  console.log(`目标U盘: ${drive}\n`);

  // 2. 获取密码
  let password = opts.password;
  if (!password) {
    process.stdout.write('设置管理员密码: ');
    password = fs.readFileSync(0, Buffer.alloc(64), 0, 64).toString().trim();
  }
  if (!password || password.length < 4) {
    console.error('错误: 密码至少4位');
    process.exit(1);
  }

  // 3. 获取 API Key
  let apiKey = opts.apikey;
  if (!apiKey) {
    process.stdout.write('输入 GLM API Key: ');
    apiKey = fs.readFileSync(0, Buffer.alloc(256), 0, 256).toString().trim();
  }
  if (!apiKey) {
    console.error('错误: 必须提供 API Key');
    process.exit(1);
  }

  // 4. 创建目录结构
  const dirs = [
    path.join(drive, 'portable-node'),
    path.join(drive, 'claude-portable', '.claude'),
    path.join(drive, '.guard'),
  ];
  for (const d of dirs) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    console.log(`[目录] ${d}`);
  }

  // 5. 下载便携 Node.js
  const nodeZip = path.join(drive, 'portable-node', 'node.zip');
  const nodeExe = path.join(drive, 'portable-node', 'node.exe');

  if (!fs.existsSync(nodeExe)) {
    console.log('\n[下载] 便携 Node.js...');
    const nodeUrl = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;
    await downloadFile(nodeUrl, nodeZip);
    console.log('  解压中...');

    // 解压 node.exe 和 npm
    try {
      execSync(`powershell -Command "Expand-Archive -Path '${nodeZip}' -DestinationPath '${drive}\\portable-node\\_tmp' -Force"`, { timeout: 120000 });
      const innerDir = path.join(drive, 'portable-node', '_tmp', `node-v${NODE_VERSION}-win-x64`);
      // 复制关键文件
      const filesToCopy = ['node.exe', 'npm', 'npm.cmd', 'npx', 'npx.cmd'];
      for (const f of filesToCopy) {
        const src = path.join(innerDir, f);
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, path.join(drive, 'portable-node', f));
        }
      }
      // 复制 node_modules（npm 核心）
      const nmDir = path.join(innerDir, 'node_modules');
      if (fs.existsSync(nmDir)) {
        copyDirRecursive(nmDir, path.join(drive, 'portable-node', 'node_modules'));
      }
      // 清理
      fs.rmSync(path.join(drive, 'portable-node', '_tmp'), { recursive: true });
      fs.unlinkSync(nodeZip);
      console.log('  Node.js 便携版就绪');
    } catch (err) {
      console.error('  解压失败:', err.message);
      console.log('  尝试使用系统 Node.js...');
      // 回退：复制系统 Node.js
      try {
        const sysNode = execSync('where node', { encoding: 'utf8' }).trim().split('\n')[0].trim();
        fs.copyFileSync(sysNode, nodeExe);
        console.log('  已复制系统 Node.js');
      } catch {
        console.error('  无法获取 Node.js，请手动安装');
        process.exit(1);
      }
    }
  } else {
    console.log('[跳过] Node.js 便携版已存在');
  }

  // 6. 安装 Claude Code
  const claudeEntry = path.join(drive, 'claude-portable', 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
  if (!fs.existsSync(claudeEntry)) {
    console.log('\n[安装] Claude Code...');
    const npmCmd = path.join(drive, 'portable-node', 'npm.cmd');
    const nodeDir = path.join(drive, 'portable-node');

    try {
      // 设置 npm prefix 到 claude-portable
      const prefix = path.join(drive, 'claude-portable');
      execSync(`"${nodeExe}" "${npmCmd}" install @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} --prefix "${prefix}" --registry=${NPM_MIRROR} --no-audit --no-fund --no-optional`, {
        timeout: 300000,
        env: { ...process.env, PATH: nodeDir + ';' + process.env.PATH },
        stdio: 'pipe',
      });
      console.log('  Claude Code 安装完成');
    } catch (err) {
      console.error('  安装失败:', err.message);
      console.log('  尝试使用全局安装方式...');
      try {
        // 回退：复制全局安装的 Claude Code
        const globalClaude = path.join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code');
        if (fs.existsSync(globalClaude)) {
          copyDirRecursive(globalClaude, path.join(drive, 'claude-portable', 'node_modules', '@anthropic-ai', 'claude-code'));
          console.log('  已复制全局 Claude Code');
        }
      } catch (e2) {
        console.error('  回退也失败:', e2.message);
      }
    }
  } else {
    console.log('[跳过] Claude Code 已存在');
  }

  // 7. 写入保密文件
  console.log('\n[安全] 写入保密配置...');
  const guardDir = path.join(drive, '.guard');

  // 密码哈希
  const passwordHash = hashPassword(password);
  fs.writeFileSync(path.join(guardDir, 'key.dat'), passwordHash, 'utf8');

  // 加密 API Key（用密码哈希作为加密密钥，与 launcher.js 保持一致）
  const encKey = crypto.createHash('sha256').update(password).digest();
  const encIv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', encKey, encIv);
  let encData = cipher.update(apiKey, 'utf8', 'buffer');
  encData = Buffer.concat([encIv, encData, cipher.final()]);
  fs.writeFileSync(path.join(guardDir, 'credentials.enc'), encData);

  // 隐藏 .guard 目录
  try { execSync(`attrib +h "${guardDir}"`); } catch {}

  console.log('  密码和凭证已加密存储');

  // 9. 写入启动脚本
  console.log('\n[文件] 写入启动脚本...');
  const templatesDir = path.join(__dirname, 'usb-templates');
  // 根目录文件: start.bat, diagnose.bat
  const rootFiles = ['start.bat', 'diagnose.bat'];
  for (const f of rootFiles) {
    const src = path.join(templatesDir, f);
    const dst = path.join(drive, f);
    if (fs.existsSync(src)) {
      let content = fs.readFileSync(src, 'utf8');
      content = content.replace(/(?<!\r)\n/g, '\r\n');
      fs.writeFileSync(dst, content, 'utf8');
      console.log(`  ${f} (root)`);
    }
  }
  // tools/ 目录文件: 所有辅助脚本
  const toolsDir = path.join(drive, 'tools');
  if (!fs.existsSync(toolsDir)) fs.mkdirSync(toolsDir, { recursive: true });
  const toolsFiles = ['run-claude.bat', 'start-installer.bat', 'repair-env.bat', 'launcher.js', 'verify-password.js', 'usb-logger.js', 'repair-env.js'];
  for (const f of toolsFiles) {
    const src = path.join(templatesDir, f);
    const dst = path.join(toolsDir, f);
    if (fs.existsSync(src)) {
      let content = fs.readFileSync(src, 'utf8');
      if (f.endsWith('.bat')) {
        content = content.replace(/(?<!\r)\n/g, '\r\n');
      }
      fs.writeFileSync(dst, content, 'utf8');
      console.log(`  tools/${f}`);
    }
  }

  const claudeMd = path.join(templatesDir, 'CLAUDE.md');
  if (fs.existsSync(claudeMd)) {
    const destClaudeDir = path.join(drive, 'claude-portable', '.claude');
    fs.writeFileSync(path.join(destClaudeDir, 'CLAUDE.md'), fs.readFileSync(claudeMd));
    console.log('  CLAUDE.md（铁律模板）');
  }

  // 10. 写入 settings.json
  const settings = {
    permissions: {
      allow: ['Bash(npm *)', 'Bash(node *)', 'Bash(openclaw *)', 'Bash(dir *)', 'Bash(where *)', 'Bash(tasklist *)', 'Read', 'Write', 'Edit', 'Glob', 'Grep'],
    },
  };
  fs.writeFileSync(
    path.join(drive, 'claude-portable', '.claude', 'settings.json'),
    JSON.stringify(settings, null, 2),
    'utf8'
  );
  console.log('  settings.json');

  // 完成
  console.log('\n=== 制作完成 ===');
  console.log(`U盘内容 (${drive}):`);
  try {
    const files = fs.readdirSync(drive);
    for (const f of files) {
      const stat = fs.statSync(path.join(drive, f));
      const size = stat.isDirectory() ? '<DIR>' : `${(stat.size / 1024 / 1024).toFixed(1)}MB`;
      console.log(`  ${f.padEnd(30)} ${size}`);
    }
  } catch {}

  console.log('\n使用方式:');
  console.log('  1. 双击 start.bat → 输入密码');
  console.log('  2. 选 [1] 安装 OpenClaw');
  console.log('  3. 选 [2] 启动 Claude Code');
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

main().catch(err => {
  console.error('制作失败:', err.message);
  process.exit(1);
});
