// renderer.js — UI 逻辑 + IPC 调用编排

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ========== 步骤切换 ==========
function showStep(name) {
  $$('.step').forEach(el => {
    el.classList.remove('active', 'fade-in');
  });
  const target = $(`#step-${name}`);
  target.classList.add('active');
  requestAnimationFrame(() => {
    target.classList.add('fade-in');
  });
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
  'istep-install-git',
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
                 env.nodeStatus === 'outdated' ? `版本过低 ${env.nodeVersion || ''}（将升级）` : '未安装',
      ok: env.nodeStatus === 'ok' || env.nodeStatus === 'outdated' },
    { label: 'OpenClaw',
      value: env.openclawStatus === 'installed'
        ? (env.openclawNeedsUpdate
          ? `已安装 v${env.openclawVersion}（可升级到 v${env.openclawLatestVersion}）`
          : `已安装 v${env.openclawVersion || ''}`)
        : '未安装',
      ok: env.openclawStatus === 'installed' && !env.openclawNeedsUpdate },
    { label: '网络连接', value: env.networkOk ? '正常' : '无法连接', ok: env.networkOk },
    { label: 'Git', value: env.gitStatus === 'ok' ? `已安装 ${env.gitVersion || ''}` : '未安装',
      ok: env.gitStatus === 'ok' },
  ];

  // 杀毒软件检测项（仅 Windows 有）
  if (env.antivirus && env.antivirus.length > 0) {
    const avNames = env.antivirus.map(a => a.name).join('、');
    items.push({ label: '杀毒软件', value: avNames, ok: false });
  }

  container.innerHTML = items.map(item => `
    <div class="detect-item">
      <span class="icon">${item.ok ? '✅' : '⚠️'}</span>
      <div>
        <div class="label">${item.label}</div>
        <div class="value">${item.value}</div>
      </div>
    </div>
  `).join('');

  // 警告区域
  const warningsContainer = document.getElementById('detect-warnings') || createWarningsContainer();
  warningsContainer.innerHTML = '';

  if (env.warnings && env.warnings.length > 0) {
    warningsContainer.style.display = 'block';
    warningsContainer.innerHTML = env.warnings.map(w => `
      <div class="warn-item ${w.type === 'error' ? 'warn-error' : 'warn-warn'}">
        <span class="warn-icon">${w.type === 'error' ? '🚫' : '⚠️'}</span>
        <span>${w.msg}</span>
      </div>
    `).join('');
  } else {
    warningsContainer.style.display = 'none';
  }

  // 摘要
  const summary = [];
  if (env.nodeStatus === 'missing') summary.push('将安装 Node.js v22 LTS');
  if (env.nodeStatus === 'outdated') summary.push('将升级 Node.js 到 v22 LTS');
  if (env.openclawStatus !== 'installed') summary.push('将安装 OpenClaw');
  if (env.openclawNeedsUpdate) summary.push(`OpenClaw 将从 v${env.openclawVersion} 升级到 v${env.openclawLatestVersion}`);
  if (!env.networkOk) summary.push('⚠️ 网络不可用，离线安装包可用');

  $('#detect-summary').textContent = summary.join('，') || '所有组件已就绪';

  // 检查是否有 error 级别警告（如 Windows 版本过低）
  const hasError = env.warnings && env.warnings.some(w => w.type === 'error');
  // 网络不可用但不是致命错误（离线包可用）
  $('#btn-go-install').disabled = hasError;
}

function createWarningsContainer() {
  const div = document.createElement('div');
  div.id = 'detect-warnings';
  div.className = 'detect-warnings';
  // 插入到 detect-summary 之后
  const summary = $('#detect-summary');
  summary.parentNode.insertBefore(div, summary.nextSibling);
  return div;
}

function getOsName(os, arch) {
  if (os === 'win32') return 'Windows';
  if (os === 'darwin') return arch === 'arm64' ? 'macOS (Apple芯片)' : 'macOS (Intel)';
  return os;
}

// ========== 错误处理 ==========
let lastErrorMessage = '';

function showError(message, details) {
  lastErrorMessage = message;
  showStep('error');
  $('#error-message').textContent = message;
  if (details) {
    $('#error-detail').textContent = details;
  }
  // 重置反馈按钮状态
  const feedbackBtn = $('#feedback-btn');
  if (feedbackBtn) {
    feedbackBtn.disabled = false;
    feedbackBtn.textContent = '一键反馈给技术支持';
  }
  const feedbackResult = $('#feedback-result');
  if (feedbackResult) feedbackResult.textContent = '';
}

// ========== 一键反馈 ==========
async function submitFeedback() {
  const btn = $('#feedback-btn');
  const result = $('#feedback-result');
  btn.disabled = true;
  btn.textContent = '提交中...';
  result.textContent = '';

  try {
    // 系统信息获取失败不阻塞反馈提交
    let systemInfo = {};
    let logTail = '';
    try {
      [systemInfo, logTail] = await Promise.all([
        window.installerAPI.getSystemInfo(),
        window.installerAPI.getLogTail(),
      ]);
    } catch {
      // getSystemInfo 可能因 loadVersions 失败，继续提交
    }

    const resp = await fetch('https://activate.jiaopeiclaw.com/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: lastErrorMessage,
        systemInfo,
        logTail,
      }),
    });

    const data = await resp.json();
    if (data.ok) {
      btn.textContent = '已提交';
      result.textContent = '反馈已提交，我们会尽快处理！';
      result.style.color = '#4ade80';
    } else {
      throw new Error(data.msg || '提交失败');
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '重试提交';
    result.textContent = '提交失败（' + err.message + '），请截图发给管理员';
    result.style.color = '#ef4444';
  }
}

// 绑定反馈按钮（避免内联 onclick 被 CSP 阻止）
$('#feedback-btn').addEventListener('click', submitFeedback);

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
      if (envResult.nodeStatus === 'outdated') {
        appendLog(`Node.js ${envResult.nodeVersion} 版本过低，将升级到 v22 LTS...`);
      }
      updateTopProgress(20, '正在安装 Node.js...');
      setStepActive('istep-download-node');
      appendLog('正在安装 Node.js v22 LTS...');

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

    // 步骤3.5: 安装 Git（如果需要）
    if (envResult.gitStatus !== 'ok') {
      updateTopProgress(62, '正在安装 Git...');
      setStepActive('istep-install-git');
      appendLog('正在安装 Git...');

      await window.installerAPI.installGit();

      setStepDone('istep-install-git');
      appendLog('Git 安装完成');
      updateTopProgress(65, 'Git 已安装');
    } else {
      setStepDone('istep-install-git');
      appendLog('Git 已就绪，跳过安装');
      updateTopProgress(65, 'Git 已就绪');
    }

    // 步骤4: 配置镜像（自动）
    setStepDone('istep-mirror');
    appendLog('npm 镜像源: registry.npmmirror.com');

    // 步骤5: 安装或升级 OpenClaw
    if (envResult.openclawStatus !== 'installed') {
      // 未安装 → 全新安装
      updateTopProgress(70, '正在安装 OpenClaw...');
      setStepActive('istep-install-openclaw');
      appendLog('正在安装 OpenClaw（指定稳定版本）...');

      await window.installerAPI.installOpenclaw();

      setStepDone('istep-install-openclaw');
      updateTopProgress(90, 'OpenClaw 安装完成');
    } else if (envResult.openclawNeedsUpdate) {
      // 已安装但版本旧 → 升级到指定稳定版本
      updateTopProgress(70, '正在升级 OpenClaw...');
      setStepActive('istep-install-openclaw');
      appendLog(`OpenClaw ${envResult.openclawVersion} → ${envResult.openclawLatestVersion}，正在升级...`);

      await window.installerAPI.installOpenclaw();

      setStepDone('istep-install-openclaw');
      updateTopProgress(90, 'OpenClaw 升级完成');
    } else {
      setStepDone('istep-install-openclaw');
      appendLog('OpenClaw 已是最新版本，跳过安装');
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
    const verHint = appVersions ? `openclaw@${appVersions.openclaw}` : 'openclaw';
    return `OpenClaw 安装失败，请检查网络连接。\n可尝试手动执行: npm install -g ${verHint} --registry=https://registry.npmmirror.com`;
  }
  if (errMsg.includes('msiexec') || errMsg.includes('installer')) {
    return 'Node.js 安装失败，请暂时关闭杀毒软件后重试。';
  }
  return `安装过程中遇到错误:\n${errMsg}\n\n请查看日志文件获取详细信息。`;
}

// ========== 事件绑定 ==========

// ========== 激活码 ==========

let appVersions = null;

// 启动时加载版本信息
async function loadVersions() {
  try {
    appVersions = await window.installerAPI.getVersions();
    const verText = document.getElementById('version-text');
    if (verText && appVersions.installer) {
      verText.textContent = `版本 ${appVersions.installer} · OpenClaw v${appVersions.openclaw} · 由行知商学制作`;
    }
  } catch (err) {
    appendLog('版本信息加载失败: ' + err.message);
  }
}

loadVersions().catch(() => {});

// 根据平台显示安装提示
(function setPlatformTips() {
  const tipsEl = document.getElementById('install-tips');
  if (!tipsEl) return;
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  if (isMac) {
    tipsEl.innerHTML = '<li>如遇到"无法打开，因为无法验证开发者"提示，请在 系统偏好设置 → 安全性与隐私 中允许</li><li>安装过程中可能需要输入管理员密码</li>';
  } else {
    tipsEl.innerHTML = '<li>如遇到"Windows 已保护你的电脑"提示，请点击 <strong>更多信息</strong> → <strong>仍要运行</strong></li><li>如安装被拦截，请临时关闭杀毒软件（360、火绒等）后重试</li><li>安装需要管理员权限，如弹出权限请求请点击"是"</li>';
  }
})();

// 启动时检查激活状态
async function checkActivationStatus() {
  try {
    const status = await window.installerAPI.checkActivation();
    if (status.activated) {
      // 已激活，解锁安装按钮，隐藏输入框
      $('#btn-start').disabled = false;
      $('#activation-area').classList.add('hidden');
      $('#activation-done').classList.remove('hidden');
      $('#activation-done-text').textContent = `已激活 · ${status.typeName} · 剩余 ${status.daysLeft} 天`;
      appendLog(`激活状态: ${status.typeName}, 剩余 ${status.daysLeft} 天`);

      // 检查 OpenClaw 是否已安装
      try {
        const env = await window.installerAPI.detectEnvironment();
        if (env.openclawStatus === 'installed') {
          // 已安装：改为快捷启动模式
          $('#btn-start').textContent = '启动 OpenClaw';
          $('#btn-start').onclick = () => {
            showStep('config');
            updateTopProgress(100, '配置');
            appendLog('OpenClaw 已安装，直接进入配置');
          };
          appendLog('OpenClaw 已安装，可直接启动');

          // 同时更新欢迎页描述
          const desc = document.querySelector('.desc');
          if (desc) desc.textContent = 'OpenClaw 已安装。点击下方按钮启动或重新配置。';

          checkForUpdate();
          return;
        }
      } catch {}

      // 未安装：保持原有的安装流程
      checkForUpdate();
    }
  } catch (err) {
    appendLog('检查激活状态失败: ' + err.message);
  }
}

// 检查 OpenClaw 是否需要更新（已激活用户）
async function checkForUpdate() {
  try {
    const env = await window.installerAPI.detectEnvironment();
    if (env.openclawStatus === 'installed' && env.openclawNeedsUpdate) {
      const banner = document.getElementById('update-banner');
      const title = document.getElementById('update-title');
      const detail = document.getElementById('update-detail');
      if (banner && title && detail) {
        title.textContent = `发现新版本 v${env.openclawLatestVersion}`;
        detail.textContent = `当前版本 v${env.openclawVersion} → 可升级到 v${env.openclawLatestVersion}`;
        banner.classList.remove('hidden');
        appendLog(`发现 OpenClaw 新版本: ${env.openclawVersion} → ${env.openclawLatestVersion}`);
      }
    }
  } catch (err) {
    // 更新检查失败不影响正常使用
  }
}

checkActivationStatus().catch(() => {});

// 激活码自动格式化（保留大小写，仅过滤非法字符）
$('#activation-code').addEventListener('input', (e) => {
  let val = e.target.value.replace(/[^A-Za-z0-9-]/g, '');
  e.target.value = val;
});

// 激活码验证按钮
$('#btn-activate').addEventListener('click', async () => {
  const code = $('#activation-code').value.trim();
  const statusEl = $('#activation-status');

  if (!code) {
    statusEl.textContent = '请输入激活码';
    statusEl.className = 'activation-status error';
    return;
  }

  statusEl.textContent = '正在验证...';
  statusEl.className = 'activation-status';

  try {
    const result = await window.installerAPI.validateActivation(code);
    if (result.success || result.valid) {
      // 激活成功
      statusEl.textContent = '';
      $('#btn-start').disabled = false;
      $('#activation-area').classList.add('hidden');
      $('#activation-done').classList.remove('hidden');
      $('#activation-done-text').textContent = `已激活 · ${result.typeName || '实战营'} · 有效期 ${result.days || 365} 天`;
      appendLog('激活成功！' + (result.typeName || ''));
    } else {
      statusEl.textContent = result.reason || '激活码无效';
      statusEl.className = 'activation-status error';
      appendLog('激活失败: ' + (result.reason || '未知错误'));
    }
  } catch (err) {
    statusEl.textContent = '验证失败: ' + err.message;
    statusEl.className = 'activation-status error';
  }
});

// 回车触发验证
$('#activation-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#btn-activate').click();
});
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
  zai: {
    hint: '在 open.bigmodel.cn 获取 API Key（GLM Coding Plan）',
    defaultModel: 'glm-5v-turbo',
    models: ['glm-5v-turbo', 'glm-5', 'glm-4.7', 'glm-4.5-air'],
    defaultBaseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4',
    defaultApi: 'openai-completions',
    keyUrl: 'https://www.bigmodel.cn/invite?icode=fUalT%2FJzsW3InfvOR%2Blk9pmwcr074zMJTpgMb8zZZvg%3D',
  },
  qwen: {
    hint: '在 百炼控制台 获取 API Key',
    defaultModel: 'qwen-max',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-long', 'qwen3-235b-a22b', 'qwen3-32b', 'qwen3-coder-plus'],
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultApi: 'openai-completions',
    keyUrl: 'https://bailian.console.aliyun.com/cn-beijing/?spm=5176.38070734.nav-v2-dropdown-menu-0.d_main_2_0_0.12a934c9LVTTQl&tab=coding-plan&scm=20140722.M_10979710._.V_1#/efm/coding-plan-index',
  },
  kimi: {
    hint: '在 kimi.com 获取 Kimi Code API Key',
    defaultModel: 'kimi-code',
    models: ['kimi-code', 'k2p5'],
    defaultBaseUrl: 'https://api.kimi.com/coding/v1',
    defaultApi: 'anthropic-messages',
    keyUrl: 'https://www.kimi.com/membership/pricing?from=kfc_membership_topbar&track_id=428673fa-1954-4d84-814d-59b3d4efe2d6',
  },
  minimax: {
    hint: '在 platform.minimaxi.com 获取 API Key',
    defaultModel: 'MiniMax-Text-01',
    models: ['MiniMax-Text-01', 'abab6.5s-chat', 'abab6.5g-chat', 'abab7-chat-preview'],
    defaultBaseUrl: 'https://api.minimax.chat/v1',
    defaultApi: 'openai-completions',
    keyUrl: 'https://platform.minimaxi.com/subscribe/token-plan',
  },
  custom: {
    hint: '填写供应商的 API Key',
    defaultModel: '',
    models: [],
    defaultBaseUrl: '',
    defaultApi: 'openai-completions',
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

  // 更新协议选择默认值
  const protocolSelect = $('#cfg-api-protocol');
  if (protocolSelect && info.defaultApi) {
    protocolSelect.value = info.defaultApi;
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
  const apiProtocol = $('#cfg-api-protocol') ? $('#cfg-api-protocol').value : '';

  if (!apiKey) {
    $('#test-api-result').textContent = '请输入 API Key';
    $('#test-api-result').className = 'test-result fail';
    return;
  }

  try {
    await window.installerAPI.saveModelConfig(provider, apiKey, baseUrl, model, apiProtocol);
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

// ========== 飞书扫码配置 ==========

function showFeishuScanState(state) {
  ['feishu-scan-idle', 'feishu-scan-running', 'feishu-scan-success', 'feishu-scan-error', 'feishu-manual-form'].forEach(id => {
    $(`#${id}`).classList.add('hidden');
  });
  $(`#${state}`).classList.remove('hidden');
}

// 监听飞书扫码输出（已弃用 CLI 方式，保留兼容）
// 飞书扫码现在直接调用飞书 API，在前端生成 QR 码

// 简易 QR 码显示（使用 main 进程生成的 base64 图片）
function showQRImage(dataUrl) {
  const container = $('#feishu-qr-container');
  if (!container) return;
  container.innerHTML = '';
  const img = document.createElement('img');
  img.src = dataUrl;
  img.width = 256;
  img.height = 256;
  img.style.imageRendering = 'pixelated';
  container.appendChild(img);
}

// 扫码按钮
$('#btn-scan-feishu').addEventListener('click', async () => {
  const btn = $('#btn-scan-feishu');
  btn.disabled = true;
  showFeishuScanState('feishu-scan-running');
  appendLog('启动飞书扫码配置...');

  try {
    // Step 1: 初始化并获取 QR URL
    const initResult = await window.installerAPI.loginFeishuChannel();
    if (!initResult.success) {
      $('#feishu-error-msg').textContent = '扫码初始化失败: ' + (initResult.error || '未知错误');
      showFeishuScanState('feishu-scan-error');
      appendLog('飞书扫码初始化失败: ' + initResult.error);
      return;
    }

    // Step 2: 显示 QR 码图片
    if (initResult.qrImage) {
      showQRImage(initResult.qrImage);
    }
    const statusEl = $('#feishu-scan-status');
    if (statusEl) statusEl.textContent = '请用飞书 App 扫描二维码';

    // Step 3: 轮询扫码结果
    const pollResult = await window.installerAPI.feishuScanPoll(
      initResult.deviceCode,
      initResult.interval,
      initResult.expireIn
    );

    if (pollResult.status === 'success') {
      showFeishuScanState('feishu-scan-success');
      appendLog('飞书扫码配置成功！appId: ' + pollResult.appId);

      // 自动保存凭据
      await window.installerAPI.saveChannelConfig(pollResult.appId, pollResult.appSecret);
      appendLog('飞书凭据已保存');
    } else {
      const msg = pollResult.status === 'timeout' ? '扫码超时，请重试'
        : pollResult.status === 'denied' ? '授权被拒绝'
        : pollResult.status === 'expired' ? '二维码已过期，请重试'
        : pollResult.message || '未知错误';
      $('#feishu-error-msg').textContent = msg;
      showFeishuScanState('feishu-scan-error');
      appendLog('飞书扫码失败: ' + msg);
    }
  } catch (err) {
    $('#feishu-error-msg').textContent = '扫码配置失败: ' + err.message;
    showFeishuScanState('feishu-scan-error');
    appendLog('飞书扫码配置失败: ' + err.message);
  } finally {
    btn.disabled = false;
  }
});

// 重试扫码
$('#btn-retry-scan').addEventListener('click', () => {
  showFeishuScanState('feishu-scan-idle');
});

// 扫码失败 → 改手动
$('#btn-fallback-manual').addEventListener('click', () => {
  showFeishuScanState('feishu-manual-form');
});

// 切换到手动填写
$('#btn-manual-feishu').addEventListener('click', () => {
  showFeishuScanState('feishu-manual-form');
});

// 手动填写 → 返回扫码
$('#btn-back-scan').addEventListener('click', () => {
  showFeishuScanState('feishu-scan-idle');
});

// 手动保存飞书凭证
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

// 飞书通道完成 → 跳到完成 tab
$('#btn-skip-channel').addEventListener('click', () => {
  $$('.config-tab')[2].click();
});

// 跳过配置（AI模型tab 的"跳过配置"按钮）
$('#btn-skip-config').addEventListener('click', () => {
  $$('.config-tab')[2].click();
});

// 启动 OpenClaw
$('#btn-launch').addEventListener('click', async () => {
  const btn = $('#btn-launch');
  btn.disabled = true;
  btn.textContent = '正在启动...';
  try {
    const result = await window.installerAPI.launchOpenclaw();
    if (result.success) {
      appendLog('OpenClaw 网关已启动，浏览器将自动打开');
      $('#config-final-msg').textContent = 'OpenClaw 已启动！WebUI 页面正在浏览器中打开...';
    } else {
      appendLog('启动失败: ' + (result.error || '未知错误'));
      $('#config-final-msg').textContent = '启动失败，请手动在终端运行: openclaw gateway run';
    }
  } catch (err) {
    appendLog('启动失败: ' + err.message);
    $('#config-final-msg').textContent = '启动失败，请手动在终端运行: openclaw gateway run';
  } finally {
    btn.disabled = false;
    btn.textContent = '启动 OpenClaw';
  }
});

// 关闭安装器
$('#btn-close').addEventListener('click', async () => {
  // 非U盘环境：关闭时自删 exe，防止泄露
  try {
    await window.installerAPI.selfDestruct();
  } catch {}
  window.close();
});

// 完成页面的日志按钮
$('#btn-open-log3').addEventListener('click', () => {
  openLogFile();
});

// ========== 关于弹窗 ==========

const ABOUT_CONTENT = `
<h3>版权声明</h3>
<p>本安装器由 <strong>行知商学 · 教培AI实战营</strong> 制作，非 OpenClaw 官方产品。</p>
<p>OpenClaw 及龙虾 logo 是 OpenClaw 项目的品牌资产。"OpenClaw" 名称仅用于描述本安装器所安装的目标软件。</p>

<h3>开源许可证</h3>
<div class="license-item">
  <div class="name">OpenClaw</div>
  <div class="detail">MIT License · Copyright (c) 2025 Peter Steinberger</div>
</div>
<div class="license-item">
  <div class="name">Electron</div>
  <div class="detail">MIT License · Copyright (c) Electron contributors</div>
</div>
<div class="license-item">
  <div class="name">electron-builder</div>
  <div class="detail">MIT License · Copyright (c) electron-builder contributors</div>
</div>
<div class="license-item">
  <div class="name">Node.js</div>
  <div class="detail">MIT License · Copyright (c) OpenJS Foundation</div>
</div>
<div class="license-item">
  <div class="name">Chromium</div>
  <div class="detail">BSD-style licenses · Copyright (c) The Chromium Authors</div>
</div>

<h3>本项目许可证</h3>
<p>本安装器以 MIT License 发布。Copyright (c) 2025-2026 行知商学</p>
`;

const PRIVACY_CONTENT = `
<h3>隐私说明</h3>
<p>本安装器高度重视您的隐私，所有数据仅存储在您的本地设备上：</p>

<div class="license-item">
  <div class="name">API Key</div>
  <div class="detail">仅保存在本地 OpenClaw 配置文件中，用于调用 AI 模型服务</div>
</div>
<div class="license-item">
  <div class="name">飞书 App 凭证</div>
  <div class="detail">仅保存在本地配置中，用于连接飞书机器人通道</div>
</div>
<div class="license-item">
  <div class="name">系统环境信息</div>
  <div class="detail">仅用于安装流程判断（操作系统、Node.js 版本等），不外传</div>
</div>

<p>本安装器<strong>不收集、不上传</strong>任何用户数据。不包含任何遥测、统计或追踪功能。</p>

<h3>数据存储位置</h3>
<p>所有配置文件存储在您计算机的 OpenClaw 用户目录中，您可以随时查看或删除这些文件。</p>
`;

function showModal(title, content) {
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = content;
  $('#modal-overlay').classList.remove('hidden');
}

function hideModal() {
  $('#modal-overlay').classList.add('hidden');
}

$('#btn-about').addEventListener('click', (e) => {
  e.preventDefault();
  showModal('版权声明与开源许可', ABOUT_CONTENT);
});

$('#btn-privacy').addEventListener('click', (e) => {
  e.preventDefault();
  showModal('隐私说明', PRIVACY_CONTENT);
});

$('#btn-modal-close').addEventListener('click', hideModal);

$('#modal-overlay').addEventListener('click', (e) => {
  if (e.target === $('#modal-overlay')) hideModal();
});
