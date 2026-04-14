// scripts/test.js — 自动化验证测试（CI/CD 和本地均可运行）
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

let passed = 0;
let failed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message.split('\n')[0]}`);
  }
}

async function testAsync(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message.split('\n')[0]}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || '断言失败');
}

// 跨平台命令名
function getCmd(name) {
  return process.platform === 'win32' ? name + '.cmd' : name;
}

async function runTests() {
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log('  OpenClaw 安装器 — 自动化测试');
  console.log('  平台:', os.type(), os.arch());
  console.log('  Node.js:', process.version);
  console.log('═══════════════════════════════════════');

  // ===== 1. 模块加载测试 =====
  console.log('\n📦 模块加载');
  const modules = ['logger', 'detect', 'install-node', 'install-openclaw', 'verify', 'config'];
  modules.forEach(mod => {
    test(`require('./scripts/${mod}')`, () => {
      const m = require(`./${mod}`);
      assert(m !== undefined, `${mod} 加载返回 undefined`);
    });
  });

  // ===== 2. 环境检测测试 =====
  console.log('\n🔍 环境检测');
  const detect = require('./detect');
  let envResult;
  await testAsync('detect() 返回正确结构', async () => {
    envResult = await detect(null);
    assert(typeof envResult.os === 'string', 'os 应为 string');
    assert(typeof envResult.arch === 'string', 'arch 应为 string');
    assert(['ok', 'missing', 'outdated', 'unknown'].includes(envResult.nodeStatus), 'nodeStatus 值不合法');
    assert(['installed', 'missing', 'unknown'].includes(envResult.openclawStatus), 'openclawStatus 值不合法');
    assert(typeof envResult.networkOk === 'boolean', 'networkOk 应为 boolean');
  });

  test('Node.js 版本 >= v18', () => {
    if (envResult.nodeStatus === 'missing') return; // 跳过，CI 可能没装
    assert(envResult.nodeVersion, '未检测到 Node.js 版本');
    const major = parseInt(envResult.nodeVersion.replace('v', '').split('.')[0], 10);
    assert(major >= 18, `Node.js 版本过低: ${envResult.nodeVersion}`);
  });

  // ===== 3. 网络测试 =====
  console.log('\n🌐 网络连通性');
  await testAsync('淘宝 npm 镜像可访问', async () => {
    assert(envResult.networkOk, '无法连接 registry.npmmirror.com');
  });

  await testAsync('Node.js 下载 URL 有效', async () => {
    const https = require('https');
    const url = process.platform === 'win32'
      ? 'https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi'
      : process.arch === 'arm64'
        ? 'https://nodejs.org/dist/v22.14.0/node-v22.14.0-arm64.pkg'
        : 'https://nodejs.org/dist/v22.14.0/node-v22.14.0-darwin-x64.pkg';

    await new Promise((resolve, reject) => {
      const req = https.request(url, { method: 'HEAD', timeout: 15000 }, (res) => {
        assert(res.statusCode === 200, `HTTP ${res.statusCode}`);
        resolve();
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('超时')); });
      req.end();
    });
  });

  // ===== 4. 配置读写测试 =====
  console.log('\n⚙️ 配置管理');
  const config = require('./config');

  test('配置目录创建', () => {
    const configDir = path.join(os.homedir(), '.openclaw');
    config.writeConfig({ test: true });
    assert(fs.existsSync(path.join(configDir, 'openclaw.json')), '配置文件未创建');
  });

  test('配置读取', () => {
    const cfg = config.readConfig();
    assert(cfg.test === true, '配置读取值不匹配');
  });

  await testAsync('模型配置保存', async () => {
    await config.saveModelConfig('deepseek', 'sk-test-key', '', 'deepseek-chat');
    const cfg = config.readConfig();
    assert(cfg.agents?.defaults?.model?.primary === 'deepseek/deepseek-chat', '模型配置未正确保存');

    const envFile = path.join(os.homedir(), '.openclaw', '.env');
    const envContent = fs.readFileSync(envFile, 'utf8');
    assert(envContent.includes('DEEPSEEK_API_KEY=sk-test-key'), 'API Key 未写入 .env');
  });

  await testAsync('飞书通道配置保存', async () => {
    await config.saveChannelConfig('cli_test_id', 'test_secret');
    const cfg = config.readConfig();
    assert(cfg.channels?.feishu?.appId === 'cli_test_id', '飞书配置未正确保存');
  });

  // ===== 5. 验证测试 =====
  console.log('\n✔️ 安装验证');
  const verify = require('./verify');
  await testAsync('verify() 返回正确结构', async () => {
    const r = await verify();
    assert(typeof r.nodeOk === 'boolean', 'nodeOk 应为 boolean');
    assert(typeof r.openclawOk === 'boolean', 'openclawOk 应为 boolean');
  });

  // ===== 6. 日志测试 =====
  console.log('\n📝 日志系统');
  test('日志文件写入', () => {
    const logger = require('./logger');
    logger.info('自动化测试写入');
    const logFile = path.join(os.homedir(), 'openclaw-install.log');
    assert(fs.existsSync(logFile), '日志文件不存在');
    const content = fs.readFileSync(logFile, 'utf8');
    assert(content.includes('自动化测试写入'), '日志内容未找到');
  });

  // ===== 7. Electron 打包文件检查 =====
  console.log('\n📦 打包文件');
  test('HTML 文件存在', () => {
    assert(fs.existsSync('src/index.html'), 'index.html 不存在');
  });

  test('CSS 文件存在', () => {
    assert(fs.existsSync('src/styles.css'), 'styles.css 不存在');
  });

  test('renderer.js 存在', () => {
    assert(fs.existsSync('src/renderer.js'), 'renderer.js 不存在');
  });

  test('main.js 存在', () => {
    assert(fs.existsSync('main.js'), 'main.js 不存在');
  });

  test('preload.js 存在', () => {
    assert(fs.existsSync('preload.js'), 'preload.js 不存在');
  });

  test('图标文件存在', () => {
    assert(fs.existsSync('build/icon.ico') || fs.existsSync('build/icon.png'), '图标文件不存在');
  });

  // ===== 8. HTML-JS 一致性检查 =====
  console.log('\n🔗 HTML-JS 一致性');
  test('所有 JS 选择器在 HTML 中有对应 ID', () => {
    const html = fs.readFileSync('src/index.html', 'utf8');
    const js = fs.readFileSync('src/renderer.js', 'utf8');

    const htmlIds = new Set();
    const idRegex = /id="([^"]+)"/g;
    let m;
    while ((m = idRegex.exec(html)) !== null) htmlIds.add(m[1]);

    // 检查 $ 选择的元素
    const selectorRegex = /\$\('#([^']+)'\)/g;
    while ((m = selectorRegex.exec(js)) !== null) {
      const id = m[1];
      assert(htmlIds.has(id), `renderer.js 引用了不存在的 ID: #${id}`);
    }
  });

  // ===== 结果汇总 =====
  console.log('');
  console.log('═══════════════════════════════════════');
  console.log(`  测试结果: ${passed} 通过 / ${failed} 失败 / ${total} 总计`);
  console.log('═══════════════════════════════════════');
  console.log('');

  // 清理测试数据
  try {
    const configDir = path.join(os.homedir(), '.openclaw');
    fs.writeFileSync(path.join(configDir, 'openclaw.json'), '{}', 'utf8');
    if (fs.existsSync(path.join(configDir, '.env'))) {
      fs.unlinkSync(path.join(configDir, '.env'));
    }
  } catch {
    // 清理失败不影响结果
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('测试运行失败:', err);
  process.exit(1);
});
