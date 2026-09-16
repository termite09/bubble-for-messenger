const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { joinAllSpaces } = require('./workspaces');
const { CAPS } = require('../lib/platform');
const { raiseOrder } = require('../lib/stacking');

const RENDERER = path.join(__dirname, '..', 'renderer');

// Without window levels (Windows: one topmost tier, last shown on top) the level order is
// kept by hand: every window is recorded with its level, and when one shows, the visible
// windows of higher levels are raised over it again (lib/stacking says which, in what order).
const stacked = [];
function keepAbove(win, level) {
  const entry = { level, win };
  stacked.push(entry);
  win.on('show', () => {
    const others = stacked.map((e) => ({ level: e.level, visible: e.win.isVisible(), win: e.win }));
    for (const e of raiseOrder(level, others)) e.win.moveTop();
  });
  win.on('closed', () => {
    const i = stacked.indexOf(entry);
    if (i >= 0) stacked.splice(i, 1);
  });
}

// Every window of the app is one of these: frameless, floating at its level, on every Space
// (or one, by the full-screen setting), never full-screenable itself, and a sandboxed renderer
// that reaches main only through its preload's contextBridge. `page`/`preload` name files in
// src/renderer; a window that loads a remote site passes `url` and no page, and may pass the
// `userAgent` the site should see (set before the first load). `caps` is the platform's
// capabilities (lib/platform); the options only macOS knows are dropped where it lacks them.
function createFloatingWindow({
  level = 'floating',
  width,
  height,
  x,
  y,
  page,
  preload,
  url,
  userAgent = null,
  overFullscreen = true,
  focusable = true,
  transparent = true,
  hasShadow = !transparent,
  roundedCorners,
  visualEffectState,
  webPreferences = {},
  caps = CAPS,
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
    ...(caps.roundedCornersOption && roundedCorners !== undefined ? { roundedCorners } : {}),
    ...(caps.vibrancy && visualEffectState !== undefined ? { visualEffectState } : {}),
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
  if (!caps.windowLevels) keepAbove(win, level);
  joinAllSpaces(win, overFullscreen, caps);
  if (userAgent) win.webContents.setUserAgent(userAgent);
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
