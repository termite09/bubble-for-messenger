const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dismissApi', {
  onHot: (cb) => ipcRenderer.on('dismiss:hot', (_event, hot) => cb(hot)),
});
