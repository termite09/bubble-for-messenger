const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bubble', {
  dragStart: () => ipcRenderer.send('bubble:drag-start'),
  dragEnd: () => ipcRenderer.send('bubble:drag-end'),
  contextMenu: () => ipcRenderer.send('bubble:context-menu'),
  onBadge: (cb) => ipcRenderer.on('bubble:badge', (_event, n) => cb(n)),
});
