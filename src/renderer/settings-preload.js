const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsApi', {
  get: () => ipcRenderer.invoke('settings:get'),
  set: (key, value) => ipcRenderer.send('settings:set', key, value),
  close: () => ipcRenderer.send('settings:close'),
  onSettings: (cb) => ipcRenderer.on('settings:changed', (_event, s) => cb(s)),
});
