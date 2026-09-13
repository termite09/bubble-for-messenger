const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shieldApi', {
  click: () => ipcRenderer.send('shield:click'),
});
