const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bubbleApi', {
  dragStart: () => ipcRenderer.send('bubble:drag-start'),
  dragEnd: () => ipcRenderer.send('bubble:drag-end'),
  contextMenu: () => ipcRenderer.send('bubble:context-menu'),
  openChat: (href) => ipcRenderer.send('bubble:open-chat', href),
  openInbox: () => ipcRenderer.send('bubble:open-inbox'),
  onBadge: (cb) => ipcRenderer.on('bubble:badge', (_event, n) => cb(n)),
  onFan: (cb) => ipcRenderer.on('bubble:fan', (_event, data) => cb(data)),
});
