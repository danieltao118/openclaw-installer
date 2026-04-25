const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('installerAPI', {
  detectEnvironment: () => ipcRenderer.invoke('detect-environment'),
  installNode: () => ipcRenderer.invoke('install-node'),
  installGit: () => ipcRenderer.invoke('install-git'),
  installOpenclaw: () => ipcRenderer.invoke('install-openclaw'),
  verifyInstallation: () => ipcRenderer.invoke('verify-installation'),
  onProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('install-progress', listener);
    return () => ipcRenderer.removeListener('install-progress', listener);
  },
  // 配置相关
  saveModelConfig: (provider, apiKey, baseUrl, model, apiProtocol) =>
    ipcRenderer.invoke('save-model-config', provider, apiKey, baseUrl, model, apiProtocol),
  saveChannelConfig: (appId, appSecret) =>
    ipcRenderer.invoke('save-channel-config', appId, appSecret),
  testApiConnection: (provider, apiKey, baseUrl) =>
    ipcRenderer.invoke('test-api-connection', provider, apiKey, baseUrl),
  getConfigStatus: () => ipcRenderer.invoke('get-config-status'),
  launchOpenclaw: () => ipcRenderer.invoke('launch-openclaw'),
  gatewayStatus: () => ipcRenderer.invoke('gateway-status'),
  gatewayStop: () => ipcRenderer.invoke('gateway-stop'),
  gatewayRestart: () => ipcRenderer.invoke('gateway-restart'),
  getDashboardUrl: () => ipcRenderer.invoke('get-dashboard-url'),
  validateActivation: (code) => ipcRenderer.invoke('validate-activation', code),
  checkActivation: () => ipcRenderer.invoke('check-activation'),
  isPortableMode: () => ipcRenderer.invoke('is-portable-mode'),
  getVersions: () => ipcRenderer.invoke('get-versions'),
  loginFeishuChannel: () => ipcRenderer.invoke('feishu-scan-init'),
  feishuScanPoll: (deviceCode, interval, expireIn) => ipcRenderer.invoke('feishu-scan-poll', deviceCode, interval, expireIn),
  // 微信通道
  installWeixinPlugin: () => ipcRenderer.invoke('wechat-plugin-install'),
  wechatScanInit: () => ipcRenderer.invoke('wechat-scan-init'),
  wechatScanPoll: (qrcode) => ipcRenderer.invoke('wechat-scan-poll', qrcode),
  openLogFile: () => ipcRenderer.invoke('open-log-file'),
  // 反馈相关
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  getLogTail: () => ipcRenderer.invoke('get-log-tail'),
  // 自删（防泄露）
  selfDestruct: () => ipcRenderer.invoke('self-destruct'),
});
