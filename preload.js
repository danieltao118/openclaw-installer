const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('installerAPI', {
  detectEnvironment: () => ipcRenderer.invoke('detect-environment'),
  installNode: () => ipcRenderer.invoke('install-node'),
  installOpenclaw: () => ipcRenderer.invoke('install-openclaw'),
  verifyInstallation: () => ipcRenderer.invoke('verify-installation'),
  onProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('install-progress', listener);
    return () => ipcRenderer.removeListener('install-progress', listener);
  },
  // 配置相关
  saveModelConfig: (provider, apiKey, baseUrl, model) =>
    ipcRenderer.invoke('save-model-config', provider, apiKey, baseUrl, model),
  saveChannelConfig: (appId, appSecret) =>
    ipcRenderer.invoke('save-channel-config', appId, appSecret),
  testApiConnection: (provider, apiKey, baseUrl) =>
    ipcRenderer.invoke('test-api-connection', provider, apiKey, baseUrl),
  getConfigStatus: () => ipcRenderer.invoke('get-config-status'),
  launchOpenclaw: () => ipcRenderer.invoke('launch-openclaw'),
  openLogFile: () => ipcRenderer.invoke('open-log-file'),
});
