const { BrowserWindow, shell, screen } = require('electron');
const path = require('path');
const { panelPosition } = require('./lib/layout');
const { unreadFromTitle } = require('./lib/unread');
const { isInternal, staysInPanel, browserUrl } = require('./lib/links');
const scrape = require('./scrape');

const BLUR_GUARD_MS = 200;

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

  // Re-apply compact styling after any navigation (a full reload drops injected CSS).
  let compact = false;
  win.webContents.on('did-finish-load', () => scrape.setCompact(win.webContents, compact));

  win.webContents.on('page-title-updated', (_event, title) => onUnread(unreadFromTitle(title)));

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternal(url)) return { action: 'allow' };
    const target = browserUrl(url);
    if (target) shell.openExternal(target);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (staysInPanel(url)) return;
    event.preventDefault();
    const target = browserUrl(url);
    if (target) shell.openExternal(target);
  });

  // A single open thread is shorter than the full inbox. It is kept the same width, though:
  // below ~400px Messenger drops into a single-column layout that shows the chat list instead
  // of the conversation, so a narrower panel would render the wrong thing.
  const SIZES = { full: [420, 640], compact: [420, 560] };

  function resize(mode) {
    const [w, h] = SIZES[mode];
    win.setSize(w, h);
  }

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
    readRecentChats: () => scrape.readRecentChats(win.webContents),
    session: () => win.webContents.session,
    async openThread(href, bubbleBounds) {
      compact = true;
      resize('compact');
      api.showAt(bubbleBounds);
      await scrape.openThread(win.webContents, href);
      await scrape.setCompact(win.webContents, true);
    },
    async openInbox(bubbleBounds) {
      compact = false;
      await scrape.setCompact(win.webContents, false);
      resize('full');
      await scrape.openInbox(win.webContents);
      api.showAt(bubbleBounds);
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
