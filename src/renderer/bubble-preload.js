const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bubbleApi', {
  dragStart: () => ipcRenderer.send('bubble:drag-start'),
  dragEnd: () => ipcRenderer.send('bubble:drag-end'),
  contextMenu: () => ipcRenderer.send('bubble:context-menu'),
  headMenu: (href) => ipcRenderer.send('bubble:head-menu', href),
  openChat: (href) => ipcRenderer.send('bubble:open-chat', href),
  openInbox: () => ipcRenderer.send('bubble:open-inbox'),
  hit: (over) => ipcRenderer.send('bubble:hit', over),
  onBadge: (cb) => ipcRenderer.on('bubble:badge', (_event, n) => cb(n)),
  onFan: (cb) => ipcRenderer.on('bubble:fan', (_event, data) => cb(data)),
  onLayout: (cb) => ipcRenderer.on('bubble:layout', (_event, data) => cb(data)),
  onActive: (cb) => ipcRenderer.on('bubble:active', (_event, href) => cb(href)),
  onLanded: (cb) => ipcRenderer.on('bubble:landed', (_event, item) => cb(item)),
  replyFocus: (on) => ipcRenderer.send('bubble:reply-focus', Boolean(on)),
  bannerExtra: (px) => ipcRenderer.send('bubble:banner-extra', px),
  sendReply: (href, text) => ipcRenderer.send('bubble:reply', href, text),
  onReplyResult: (cb) => ipcRenderer.on('bubble:reply-result', (_event, ok) => cb(ok)),
  onSettings: (cb) => ipcRenderer.on('bubble:settings', (_event, s) => cb(s)),
});
