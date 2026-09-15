const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { joinAllSpaces } = require('./workspaces');

const RENDERER = path.join(__dirname, '..', 'renderer');

// Every window of the app is one of these: frameless, floating at its level, on every Space
// (or one, by the full-screen setting), never full-screenable itself, and a sandboxed renderer
// that reaches main only through its preload's contextBridge. `page`/`preload` name files in
// src/renderer; a window that loads a remote site passes `url` and no page.
function createFloatingWindow({
  level = 'floating',
  width,
  height,
  x,
  y,
  page,
  preload,
  url,
  overFullscreen = true,
  focusable = true,
  transparent = true,
  hasShadow = !transparent,
  webPreferences = {},
  ...rest
}) {
  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent,
    hasShadow,
    resizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable,
    show: false,
    ...rest,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      ...(preload ? { preload: path.join(RENDERER, preload) } : {}),
      ...webPreferences,
    },
  });
  win.setAlwaysOnTop(true, level);
  joinAllSpaces(win, overFullscreen);
  if (page) win.loadFile(path.join(RENDERER, page));
  else if (url) win.loadURL(url);
  return win;
}

// IPC that only the given window's page may send: every handler checks the sender, and all
// of them go away with the window.
function ipcFor(win) {
  const owns = (e) => !win.isDestroyed() && e.sender === win.webContents;
  const registered = [];
  win.on('closed', () => {
    for (const [kind, channel, fn] of registered)
      kind === 'handle' ? ipcMain.removeHandler(channel) : ipcMain.removeListener(channel, fn);
  });
  return {
    on(channel, fn) {
      const wrapped = (e, ...args) => {
        if (owns(e)) fn(...args);
      };
      ipcMain.on(channel, wrapped);
      registered.push(['on', channel, wrapped]);
    },
    handle(channel, fn) {
      ipcMain.handle(channel, (e, ...args) => (owns(e) ? fn(...args) : null));
      registered.push(['handle', channel]);
    },
  };
}

module.exports = { createFloatingWindow, ipcFor, RENDERER };
