// renderer.js — UI 逻辑 + IPC 调用编排

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ========== 步骤切换 ==========
function showStep(name) {
  $$('.step').forEach(el => el.classList.remove('active'));
  $(`#step-${name}`).classList.add('active');
}

// ========== 顶部进度条 ==========
function updateTopProgress(percent, text) {
  $('#progress-fill').style.width = percent + '%';
  $('#progress-text').textContent = text;
}

// ========== 安装进度条 ==========
function updateInstallProgress(percent) {
  $('#install-progress-fill').style.width = percent + '%';
  $('#install-percent').textContent = Math.round(percent) + '%';
}

// ========== 安装步骤列表 ==========
const INSTALL_STEPS = [
  'istep-detect',
  'istep-download-node',
  'istep-install-node',
  'istep-mirror',
  'istep-install-openclaw',
  'istep-verify',
];

function setStepActive(stepId) {
  INSTALL_STEPS.forEach(id => {
    const el = $(`#${id}`);
    if (id === stepId) {
      el.className = 'step-item active';
    } else if (!el.classList.contains('done')) {
      el.className = 'step-item pending';
    }
  });
}

function setStepDone(stepId) {
  $(`#${stepId}`).className = 'step-item done';
}

function setStepError(stepId) {
  $(`#${stepId}`).className = 'step-item error';
}

// ========== 日志 ==========
function appendLog(text) {
  const logEl = $('#log-console');
  logEl.textContent += text + '\n';
  logEl.scrollTop = logEl.scrollHeight;
}

// ========== 环境检测结果渲染 ==========
function renderDetectResults(env) {
  const container = $('#detect-results');
  const items = [
    { label: '操作系统', value: getOsName(env.os, env.arch), ok: true },
    { label: 'CPU架构', value: env.arch === 'arm64' ? 'ARM64 (Apple芯片)' : 'x64', ok: true },
    { label: 'Node.js', value: env.nodeStatus === 'ok' ? `已安装 ${env.nodeVersion}` :
                 env.nodeStatus === 'outdated' ? `版本过低 ${env.nodeVersion || ''}` : '未安装',
      ok: env.nodeStatus === 'ok' },
    { label: 'OpenClaw', value: env.openclawStatus === 'installed' ? '已安装' : '未安装',
      ok: env.openclawStatus === 'installed' },
    { label: '网络连接', value: env.networkOk ? '正常' : '无法连接', ok: env.networkOk },
  ];

  container.innerHTML = items.map(item => `
    <div class="detect-item">
      <span class="icon">${item.ok ? '✅' : '❌'}</span>
      <div>
        <div class="label">${item.label}</div>
        <div class="value">${item.value}</div>
      </div>
    </div>
  `).join('');

  // 摘要
  const summary = [];
  if (env.nodeStatus !== 'ok') summary.push('将安装 Node.js v22 LTS');
  if (env.openclawStatus !== 'installed') summary.push('将安装 OpenClaw');
  if (!env.networkOk) summary.push('⚠️ 网络不可用，安装可能失败');

  $('#detect-summary').textContent = summary.join('，') || '所有组件已就绪';
  $('#btn-go-install').disabled = !env.networkOk;
}

function getOsName(os, arch) {
  if (os === 'win32') return 'Windows';
  if (os === 'darwin') return arch === 'arm64' ? 'macOS (Apple芯片)' : 'macOS (Intel)';
  return os;
}

// ========== 错误处理 ==========
function showError(message, details) {
  showStep('error');
  $('#error-message').textContent = message;
  if (details) {
    $('#error-detail').textContent = details;
  }
}

// ========== 打开日志文件 ==========
async function openLogFile() {
  try {
    await window.installerAPI.openLogFile();
  } catch (err) {
    appendLog('无法打开日志文件: ' + err.message);
  }
}

// ========== IPC 进度监听 ==========
window.installerAPI.onProgress((data) => {
  if (data.message) appendLog(data.message);
  if (data.percent !== undefined) updateInstallProgress(data.percent);
  if (data.stepActive) setStepActive(data.stepActive);
  if (data.stepDone) setStepDone(data.stepDone);
});

// ========== 主流程 ==========
let envResult = null;

async function runInstall() {
  try {
    showStep('install');
    updateTopProgress(10, '正在检测环境...');

    // 步骤1: 检测
    setStepActive('istep-detect');
    appendLog('正在检测系统环境...');
    envResult = await window.installerAPI.detectEnvironment();
    setStepDone('istep-detect');
    updateTopProgress(15, '环境检测完成');

    // 步骤2-3: 安装 Node.js（如果需要）
    if (envResult.nodeStatus !== 'ok') {
      updateTopProgress(20, '正在安装 Node.js...');
      setStepActive('istep-download-node');
      appendLog('正在下载 Node.js v22 LTS...');

      await window.installerAPI.installNode();

      setStepDone('istep-download-node');
      setStepDone('istep-install-node');
      appendLog('Node.js 安装完成');
      updateTopProgress(60, 'Node.js 已安装');
    } else {
      setStepDone('istep-download-node');
      setStepDone('istep-install-node');
      appendLog('Node.js 已就绪，跳过安装');
      updateTopProgress(60, 'Node.js 已就绪');
    }

    // 步骤4: 配置镜像（自动）
    setStepDone('istep-mirror');
    appendLog('npm 镜像源: registry.npmmirror.com');

    // 步骤5: 安装 OpenClaw（如果需要）
    if (envResult.openclawStatus !== 'installed') {
      updateTopProgress(70, '正在安装 OpenClaw...');
      setStepActive('istep-install-openclaw');
      appendLog('正在安装 OpenClaw（使用淘宝镜像）...');

      await window.installerAPI.installOpenclaw();

      setStepDone('istep-install-openclaw');
      updateTopProgress(90, 'OpenClaw 安装完成');
    } else {
      setStepDone('istep-install-openclaw');
      appendLog('OpenClaw 已就绪，跳过安装');
      updateTopProgress(90, 'OpenClaw 已就绪');
    }

    // 步骤6: 验证
    updateTopProgress(95, '正在验证安装...');
    setStepActive('istep-verify');
    appendLog('正在验证安装...');

    const verifyResult = await window.installerAPI.verifyInstallation();

    if (verifyResult.openclawOk) {
      setStepDone('istep-verify');
      updateInstallProgress(100);
      updateTopProgress(100, '安装完成');

      // 进入配置向导
      showStep('config');
      appendLog('安装成功，进入初始配置...');
    } else {
      setStepError('istep-verify');
      appendLog('验证失败: openclaw 命令不可用');
      showError(
        '安装验证失败，OpenClaw 命令未找到。\n请查看日志文件获取详细信息。',
        `Node.js: ${verifyResult.nodeOk ? 'OK' : '失败'}\nOpenClaw: ${verifyResult.openclawOk ? 'OK' : '失败'}`
      );
    }
  } catch (err) {
    const msg = err.message || '未知错误';
    appendLog(`安装失败: ${msg}`);
    showError(
      getChineseError(msg),
      msg
    );
  }
}

function getChineseError(errMsg) {
  if (errMsg.includes('ENOTFOUND') || errMsg.includes('ECONNREFUSED') || errMsg.includes('timeout')) {
    return '网络连接失败，请检查网络后重试。\n如使用公司网络，可能需要配置代理。';
  }
  if (errMsg.includes('EPERM') || errMsg.includes('EACCES')) {
    return '权限不足，请以管理员身份运行安装器。';
  }
  if (errMsg.includes('npm install')) {
    return 'OpenClaw 安装失败，请检查网络连接。\n可尝试手动执行: npm install -g openclaw --registry=https://registry.npmmirror.com';
  }
  if (errMsg.includes('msiexec') || errMsg.includes('installer')) {
    return 'Node.js 安装失败，请暂时关闭杀毒软件后重试。';
  }
  return `安装过程中遇到错误:\n${errMsg}\n\n请查看日志文件获取详细信息。`;
}

// ========== 事件绑定 ==========
$('#btn-start').addEventListener('click', () => {
  showStep('detect');
  updateTopProgress(5, '正在检测环境...');

  window.installerAPI.detectEnvironment().then(env => {
    envResult = env;
    renderDetectResults(env);
    appendLog('环境检测完成');
  }).catch(err => {
    appendLog('环境检测失败: ' + err.message);
    showError('环境检测失败: ' + err.message);
  });
});

$('#btn-back-welcome').addEventListener('click', () => {
  showStep('welcome');
  updateTopProgress(0, '准备就绪');
});

$('#btn-go-install').addEventListener('click', () => {
  runInstall();
});

$('#btn-retry').addEventListener('click', () => {
  showStep('welcome');
  updateTopProgress(0, '准备就绪');
  INSTALL_STEPS.forEach(id => {
    $(`#${id}`).className = 'step-item pending';
  });
  updateInstallProgress(0);
  $('#log-console').textContent = '';
});

// 错误页面的日志按钮
$('#btn-open-log2').addEventListener('click', () => {
  openLogFile();
});

// ========== 配置向导事件 ==========

// Tab 切换
$$('.config-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const targetId = tab.dataset.tab;
    $$('.config-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    $$('.config-panel').forEach(p => p.classList.remove('active'));
    $(`#${targetId}`).classList.add('active');
  });
});

// 提供商-模型联动
const PROVIDER_MODELS = {
  zhipu: {
    hint: '在 open.bigmodel.cn 获取 API Key',
    defaultModel: 'glm-5.1',
    models: ['glm-5.1', 'glm-4.7', 'glm-4-flash', 'glm-4-plus', 'glm-4-long', 'glm-4-air'],
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  qwen: {
    hint: '在 百炼控制台 获取 API Key',
    defaultModel: 'qwen-max',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-long', 'qwen3-235b-a22b', 'qwen3-32b', 'qwen3-coder-plus'],
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyUrl: 'https://bailian.console.aliyun.com/',
  },
  kimi: {
    hint: '在 platform.moonshot.cn 获取 API Key',
    defaultModel: 'moonshot-v1-128k',
    models: ['moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k', 'kimi-latest'],
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
  },
  minimax: {
    hint: '在 platform.minimaxi.com 获取 API Key',
    defaultModel: 'MiniMax-Text-01',
    models: ['MiniMax-Text-01', 'abab6.5s-chat', 'abab6.5g-chat', 'abab7-chat-preview'],
    defaultBaseUrl: 'https://api.minimax.chat/v1',
    keyUrl: 'https://platform.minimaxi.com/',
  },
  stepfun: {
    hint: '在 platform.stepfun.com 获取 API Key',
    defaultModel: 'step-2-16k',
    models: ['step-2-16k', 'step-1-128k', 'step-1-8k', 'step-1-flash', 'step-1v-8k'],
    defaultBaseUrl: 'https://api.stepfun.com/v1',
    keyUrl: 'https://platform.stepfun.com/',
  },
  custom: {
    hint: '填写供应商的 API Key',
    defaultModel: '',
    models: [],
    defaultBaseUrl: '',
    keyUrl: '',
  },
};

function updateProviderUI() {
  const provider = $('#cfg-provider').value;
  const info = PROVIDER_MODELS[provider];
  if (!info) return;

  // 更新 hint 和链接
  $('#cfg-key-hint').textContent = info.hint;
  const linkEl = $('#cfg-key-link');
  if (linkEl) {
    if (info.keyUrl) {
      linkEl.href = info.keyUrl;
      linkEl.style.display = 'inline-block';
    } else {
      linkEl.style.display = 'none';
    }
  }

  // 更新 datalist（建议列表）
  const datalist = $('#model-list');
  datalist.innerHTML = info.models.map(m => `<option value="${m}">`).join('');

  // 更新模型输入框默认值
  const modelInput = $('#cfg-model');
  if (info.defaultModel) {
    modelInput.value = info.defaultModel;
  } else {
    modelInput.value = '';
    modelInput.placeholder = '输入模型 ID，例如: deepseek-chat';
  }

  // 预填 Base URL placeholder
  const baseUrlInput = $('#cfg-baseurl');
  if (baseUrlInput) {
    baseUrlInput.placeholder = info.defaultBaseUrl || '填写 API 地址，例如: https://api.example.com/v1';
  }
}

$('#cfg-provider').addEventListener('change', updateProviderUI);

// 初始化
updateProviderUI();

// 测试 API 连接
$('#btn-test-api').addEventListener('click', async () => {
  const provider = $('#cfg-provider').value;
  const apiKey = $('#cfg-apikey').value.trim();
  const baseUrl = $('#cfg-baseurl').value.trim();

  if (!apiKey) {
    $('#test-api-result').textContent = '请先输入 API Key';
    $('#test-api-result').className = 'test-result fail';
    return;
  }

  $('#test-api-result').textContent = '正在测试...';
  $('#test-api-result').className = 'test-result';

  try {
    const result = await window.installerAPI.testApiConnection(provider, apiKey, baseUrl);
    $('#test-api-result').textContent = result.message;
    $('#test-api-result').className = `test-result ${result.ok ? 'ok' : 'fail'}`;
  } catch (err) {
    $('#test-api-result').textContent = '测试失败: ' + err.message;
    $('#test-api-result').className = 'test-result fail';
  }
});

// 保存模型配置
$('#btn-save-model').addEventListener('click', async () => {
  const provider = $('#cfg-provider').value;
  const apiKey = $('#cfg-apikey').value.trim();
  const baseUrl = $('#cfg-baseurl').value.trim();
  const model = $('#cfg-model').value.trim();

  if (!apiKey) {
    $('#test-api-result').textContent = '请输入 API Key';
    $('#test-api-result').className = 'test-result fail';
    return;
  }

  try {
    await window.installerAPI.saveModelConfig(provider, apiKey, baseUrl, model);
    appendLog('模型配置已保存');
    $$('.config-tab')[1].click();
  } catch (err) {
    appendLog('模型配置保存失败: ' + err.message);
    $('#test-api-result').textContent = '保存失败: ' + err.message;
    $('#test-api-result').className = 'test-result fail';
  }
});

// 返回模型 tab
$('#btn-back-model').addEventListener('click', () => {
  $$('.config-tab')[0].click();
});

// 保存飞书通道配置
$('#btn-save-channel').addEventListener('click', async () => {
  const appId = $('#cfg-feishu-appid').value.trim();
  const appSecret = $('#cfg-feishu-secret').value.trim();

  if (appId && appSecret) {
    try {
      await window.installerAPI.saveChannelConfig(appId, appSecret);
      appendLog('飞书通道配置已保存');
    } catch (err) {
      appendLog('飞书配置保存失败: ' + err.message);
    }
  }

  $$('.config-tab')[2].click();
});

// 跳过配置
$('#btn-skip-config').addEventListener('click', () => {
  $$('.config-tab')[2].click();
});

// 启动 OpenClaw
$('#btn-launch').addEventListener('click', async () => {
  try {
    const result = await window.installerAPI.launchOpenclaw();
    if (result.success) {
      appendLog('OpenClaw 网关已启动');
      $('#config-final-msg').textContent = 'OpenClaw 网关已启动！可在飞书中测试对话。';
    } else {
      appendLog('启动失败: ' + (result.error || '未知错误'));
      $('#config-final-msg').textContent = '启动失败，请手动在终端运行: openclaw gateway start';
    }
  } catch (err) {
    appendLog('启动失败: ' + err.message);
    $('#config-final-msg').textContent = '启动失败，请手动在终端运行: openclaw gateway start';
  }
});

// 关闭安装器
$('#btn-close').addEventListener('click', () => {
  window.close();
});

// 完成页面的日志按钮
$('#btn-open-log3').addEventListener('click', () => {
  openLogFile();
});
