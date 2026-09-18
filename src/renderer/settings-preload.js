const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsApi', {
  get: () => ipcRenderer.invoke('settings:get'),
  capabilities: () => ipcRenderer.invoke('settings:capabilities'),
  set: (key, value) => ipcRenderer.send('settings:set', key, value),
  close: () => ipcRenderer.send('settings:close'),
  resize: (height) => ipcRenderer.send('settings:resize', height),
  openMessengerPreferences: () => ipcRenderer.send('settings:open-messenger-preferences'),
  checkUpdates: () => ipcRenderer.send('settings:check-updates'),
  onSettings: (cb) => ipcRenderer.on('settings:changed', (_event, s) => cb(s)),
});
