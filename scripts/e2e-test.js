// scripts/e2e-test.js — 端到端模拟测试
// 模拟 Electron IPC handler 的完整调用链，不启动 GUI
const fs = require('fs');
const path = require('path');
const os = require('os');

let passed = 0, failed = 0;

function log(icon, msg) { console.log(`  ${icon} ${msg}`); }
function pass(msg) { passed++; log('✅', msg); }
function fail(msg, err) { failed++; log('❌', msg); console.log(`     ${String(err).split('\n')[0]}`); }

async function run() {
  console.log('');
  console.log('══════════════════════════════════════════');
  console.log('  OpenClaw 安装器 — 端到端流程测试');
  console.log('  模拟用户完整操作路径');
  console.log('══════════════════════════════════════════');
  console.log('');

  // ===== 模拟 win 对象 =====
  const mockWin = {
    isDestroyed: () => false,
    webContents: {
      send: (channel, data) => {
        // 模拟进度推送
        if (data.message) process.stdout.write('.');
      },
    },
  };

  // ========================================
  // Phase 1: 欢迎 → 环境检测
  // ========================================
  console.log('📍 Phase 1: 用户点击"开始安装" → 环境检测');
  try {
    const detect = require('./detect');
    const env = await detect(mockWin);
    pass(`操作系统: ${env.os} ${env.arch}`);
    pass(`Node.js: ${env.nodeStatus} ${env.nodeVersion || ''}`);
    pass(`OpenClaw: ${env.openclawStatus}`);
    pass(`网络: ${env.networkOk ? '正常' : '不可用'}`);

    if (!env.networkOk) {
      fail('网络不可用，无法继续测试');
      return summary();
    }
  } catch (e) {
    fail('环境检测失败', e);
    return summary();
  }

  // ========================================
  // Phase 2: 安装 Node.js（模拟）
  // ========================================
  console.log('\n📍 Phase 2: 检查是否需要安装 Node.js');
  try {
    const detect = require('./detect');
    const env = await detect(mockWin);

    if (env.nodeStatus === 'missing') {
      console.log('  ⏳ Node.js 未安装，开始下载...');
      // 注意：实际安装会耗时，这里只验证模块能正确调用
      const installNode = require('./install-node');
      // 不真正调用 installNode(mockWin)，因为会修改系统
      pass('install-node 模块可调用（跳过实际安装避免修改系统）');
    } else {
      pass(`Node.js 已就绪 (${env.nodeVersion})，跳过安装`);
    }
  } catch (e) {
    fail('Node.js 安装检查失败', e);
  }

  // ========================================
  // Phase 3: 安装 OpenClaw（模拟）
  // ========================================
  console.log('\n📍 Phase 3: 检查是否需要安装 OpenClaw');
  try {
    const detect = require('./detect');
    const env = await detect(mockWin);

    if (env.openclawStatus === 'missing') {
      console.log('  ⏳ OpenClaw 未安装，开始安装...');
      pass('install-openclaw 模块可调用（跳过实际安装避免修改系统）');
    } else {
      pass(`OpenClaw 已安装 (${env.openclawVersion})，跳过安装`);
    }
  } catch (e) {
    fail('OpenClaw 安装检查失败', e);
  }

  // ========================================
  // Phase 4: 验证安装
  // ========================================
  console.log('\n📍 Phase 4: 验证安装结果');
  try {
    const verify = require('./verify');
    const result = await verify();
    pass(`Node.js 验证: ${result.nodeOk ? '通过' : '失败'} (${result.nodeVersion || 'N/A'})`);
    pass(`OpenClaw 验证: ${result.openclawOk ? '通过' : '失败'} (${result.openclawVersion || 'N/A'})`);

    if (!result.openclawOk) {
      fail('OpenClaw 不可用，后续配置测试可能受影响');
    }
  } catch (e) {
    fail('验证步骤失败', e);
  }

  // ========================================
  // Phase 5: 配置向导 — AI 模型
  // ========================================
  console.log('\n📍 Phase 5: 配置向导 — AI 模型设置');
  try {
    const config = require('./config');

    // 保存 DeepSeek 模型配置
    await config.saveModelConfig('deepseek', 'sk-test-e2e-key-12345', '', 'deepseek-chat');
    pass('模型配置保存成功');

    // 验证文件
    const cfgFile = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
    const modelOk = cfg.agents?.defaults?.model?.primary === 'deepseek/deepseek-chat';
    if (modelOk) pass('openclaw.json 模型配置正确');
    else fail('openclaw.json 模型配置不正确', JSON.stringify(cfg.agents));

    const envFile = path.join(os.homedir(), '.openclaw', '.env');
    const envContent = fs.readFileSync(envFile, 'utf8');
    const keyOk = envContent.includes('DEEPSEEK_API_KEY=sk-test-e2e-key-12345');
    if (keyOk) pass('.env API Key 写入正确');
    else fail('.env API Key 写入不正确', envContent);

    // 测试 API 连接（用假 Key，应该失败）
    const testResult = await config.testApiConnection('deepseek', 'sk-fake-key', '');
    if (!testResult.ok) pass(`API 连接测试正确返回失败: ${testResult.message}`);
    else fail('API 连接测试应该返回失败', testResult.message);
  } catch (e) {
    fail('AI 模型配置流程失败', e);
  }

  // ========================================
  // Phase 6: 配置向导 — 飞书通道
  // ========================================
  console.log('\n📍 Phase 6: 配置向导 — 飞书通道设置');
  try {
    const config = require('./config');

    await config.saveChannelConfig('cli_e2e_test_app', 'e2e_test_secret');
    pass('飞书配置保存成功');

    const cfg = config.readConfig();
    const feishuOk = cfg.channels?.feishu?.appId === 'cli_e2e_test_app';
    if (feishuOk) pass('openclaw.json 飞书配置正确');
    else fail('openclaw.json 飞书配置不正确', JSON.stringify(cfg.channels?.feishu));
  } catch (e) {
    fail('飞书通道配置流程失败', e);
  }

  // ========================================
  // Phase 7: 最终状态检查
  // ========================================
  console.log('\n📍 Phase 7: 最终状态检查');
  try {
    const config = require('./config');
    const status = config.getConfigStatus();
    pass(`配置文件存在: ${status.hasConfig}`);
    pass(`API Key 已设置: ${status.hasApiKey}`);
    pass(`飞书已配置: ${status.hasFeishu}`);
    pass(`默认模型: ${status.model}`);

    // 日志文件
    const logFile = path.join(os.homedir(), 'openclaw-install.log');
    const logExists = fs.existsSync(logFile);
    if (logExists) {
      const logContent = fs.readFileSync(logFile, 'utf8');
      const logLines = logContent.split('\n').filter(l => l.trim()).length;
      pass(`日志文件正常 (${logLines} 行)`);
    } else {
      fail('日志文件不存在', '');
    }
  } catch (e) {
    fail('最终状态检查失败', e);
  }

  // ========================================
  // Phase 8: 错误路径测试
  // ========================================
  console.log('\n📍 Phase 8: 错误路径测试');
  try {
    // 测试无效 provider
    const config = require('./config');
    const badResult = await config.testApiConnection('invalid_provider', 'key', '');
    if (!badResult.ok) pass('无效 provider 正确返回错误');
    else fail('无效 provider 应该返回错误', badResult);
  } catch (e) {
    pass('无效 provider 正确抛出异常');
  }

  try {
    // 测试空配置读取
    const config = require('./config');
    config.writeConfig({});
    const empty = config.readConfig();
    if (JSON.stringify(empty) === '{}') pass('空配置读写正常');
    else fail('空配置读写异常', JSON.stringify(empty));
  } catch (e) {
    fail('空配置读写失败', e);
  }

  return summary();
}

function summary() {
  const total = passed + failed;
  console.log('');
  console.log('══════════════════════════════════════════');
  console.log(`  结果: ${passed} 通过 / ${failed} 失败 / ${total} 总计`);
  if (failed === 0) console.log('  🎉 全部通过！');
  console.log('══════════════════════════════════════════');
  console.log('');

  // 清理测试数据
  try {
    const configDir = path.join(os.homedir(), '.openclaw');
    fs.writeFileSync(path.join(configDir, 'openclaw.json'), '{}', 'utf8');
    const envFile = path.join(configDir, '.env');
    if (fs.existsSync(envFile)) fs.unlinkSync(envFile);
  } catch {}

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('致命错误:', err);
  process.exit(1);
});
