const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

const RENDERER = path.join(__dirname, '..', 'renderer');
const WIDTH = 360;
const HEIGHT = 720;

// The settings card. One window, made on first open and hidden after; it takes focus like a
// normal window (it has controls to click) but floats with the rest of the app.
function createSettingsWindow({ getSettings, setSetting, subscribe }) {
  let win = null;
  let overFullscreen = true;

  function ensure() {
    if (win) return win;
    win = new BrowserWindow({
      width: WIDTH, height: HEIGHT, show: false,
      frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true,
      webPreferences: {
        preload: path.join(RENDERER, 'settings-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: overFullscreen });
    win.loadFile(path.join(RENDERER, 'settings.html'));
    win.on('closed', () => { win = null; });
    return win;
  }

  const owns = (e) => Boolean(win) && e.sender === win.webContents;
  ipcMain.handle('settings:get', (e) => (owns(e) ? getSettings() : null));
  ipcMain.on('settings:set', (e, key, value) => { if (owns(e)) setSetting(key, value); });
  ipcMain.on('settings:close', (e) => { if (owns(e)) win.hide(); });
  subscribe((s) => { if (win) win.webContents.send('settings:changed', s); });

  return {
    // Centre the card in the work area of the display holding `bounds` (the bubble).
    open(bounds) {
      const w = ensure();
      const area = screen.getDisplayMatching(bounds).workArea;
      w.setPosition(Math.round(area.x + (area.width - WIDTH) / 2), Math.round(area.y + (area.height - HEIGHT) / 2));
      w.show();
      w.focus();
    },
    setOverFullscreen(on) {
      overFullscreen = on;
      if (win) {
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: on });
        if (on && !win.isVisible()) win.show();
      }
    },
  };
}

module.exports = { createSettingsWindow };
