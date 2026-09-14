const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsApi', {
  get: () => ipcRenderer.invoke('settings:get'),
  set: (key, value) => ipcRenderer.send('settings:set', key, value),
  close: () => ipcRenderer.send('settings:close'),
  resize: (height) => ipcRenderer.send('settings:resize', height),
  openMessengerPreferences: () => ipcRenderer.send('settings:open-messenger-preferences'),
  onSettings: (cb) => ipcRenderer.on('settings:changed', (_event, s) => cb(s)),
});
