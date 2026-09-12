const { BrowserWindow, shell, screen } = require('electron');
const path = require('path');
const { panelPosition } = require('./lib/layout');
const { unreadFromTitle } = require('./lib/unread');

const BLUR_GUARD_MS = 200;

// l.messenger.com / l.facebook.com wrap outbound links; unwrap to the real URL.
function externalUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'l.messenger.com' || u.hostname === 'l.facebook.com') return u.searchParams.get('u');
  } catch (e) {}
  return null;
}

const isInternal = (url) => url.includes('messenger.com') && !url.includes('l.messenger.com');

function createPanel({ onUnread }) {
  const win = new BrowserWindow({
    width: 420, height: 640, minWidth: 360, minHeight: 480,
    show: false, frame: false, alwaysOnTop: true, skipTaskbar: true,
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadURL('https://www.messenger.com');

  let lastBlur = 0;
  win.on('blur', () => {
    lastBlur = Date.now();
    win.hide();
  });

  win.webContents.on('page-title-updated', (_event, title) => onUnread(unreadFromTitle(title)));

  win.webContents.setWindowOpenHandler(({ url }) => {
    const ext = externalUrl(url);
    if (ext || !isInternal(url)) {
      shell.openExternal(ext || url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const ext = externalUrl(url);
    if (ext || !isInternal(url)) {
      event.preventDefault();
      shell.openExternal(ext || url);
    }
  });

  function place(bubbleBounds) {
    const area = screen.getDisplayMatching(bubbleBounds).workArea;
    const [width, height] = win.getSize();
    const { x, y } = panelPosition(bubbleBounds, area, { width, height });
    win.setPosition(x, y);
  }

  const api = {
    win,
    isVisible: () => win.isVisible(),
    showAt(bubbleBounds) {
      place(bubbleBounds);
      win.show();
      win.focus();
    },
    hide() {
      win.hide();
    },
    follow(bubbleBounds) {
      if (win.isVisible()) place(bubbleBounds);
    },
    reload() {
      win.webContents.reload();
    },
    toggle(bubbleBounds) {
      // A bubble click that just blurred (and hid) the panel must not reopen it.
      if (Date.now() - lastBlur < BLUR_GUARD_MS) return;
      if (win.isVisible()) api.hide();
      else api.showAt(bubbleBounds);
    },
  };
  return api;
}

module.exports = { createPanel };
