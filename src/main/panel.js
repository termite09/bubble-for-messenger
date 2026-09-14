const { BrowserWindow, shell, screen, powerMonitor, nativeTheme } = require('electron');
const { panelPosition } = require('../lib/layout');
const { unreadFromTitle } = require('../lib/unread');
const { isInternal, staysInPanel, browserUrl } = require('../lib/links');
const { shouldRefresh, looksLikeErrorPage, errorRetryDelay } = require('../lib/refresh');
const scrape = require('./scrape');
const { joinAllSpaces } = require('./workspaces');

const REFRESH_TICK_MS = 60 * 1000;

// `onShown` fires once the panel is actually visible to the user (not merely staged at opacity
// 0), so the bubble can dock the open chat's avatar beside it at the right moment. `onBlurred`
// fires when the panel put itself away because it lost focus (the user went elsewhere).
function createPanel({ onUnread, onShown = () => {}, onBlurred = () => {}, overFullscreen = true }) {
  // Transparent so the page can draw its own card silhouette (scrape.FRAME_CSS: 16px corners and
  // a hairline) instead of the square window edge; macOS casts a shadow that follows the shape.
  const win = new BrowserWindow({
    width: 420, height: 640, resizable: false, fullscreenable: false,
    show: false, frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // The page spends its life hidden; throttled timers would let its live connection lapse.
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  joinAllSpaces(win, overFullscreen);
  win.loadURL('https://www.messenger.com');

  win.on('blur', () => { win.hide(); onBlurred(); });

  // Re-apply the frame and compact styling after any navigation (a full reload drops injected CSS).
  let compact = false;
  win.webContents.on('did-finish-load', () => {
    scrape.setFrame(win.webContents, true);
    scrape.setCompact(win.webContents, compact);
    applyTheme();
  });

  // The page's theme follows the app's Appearance setting: main.js sets nativeTheme.themeSource
  // from it, so shouldUseDarkColors is the answer for System (macOS decides) and Light / Dark
  // alike, and 'updated' fires for either kind of change. Messenger renders its own choice into
  // <html> on every load, hence the re-apply above.
  const applyTheme = () => scrape.setTheme(win.webContents, nativeTheme.shouldUseDarkColors);
  nativeTheme.on('updated', applyTheme);

  // Keep the hidden page live: reload it after the Mac wakes and every quarter hour in the
  // background (never while it is showing), and retry Facebook's static error page with backoff.
  let loadedAt = Date.now();
  let resumed = false;
  let errorRetries = 0;
  let errorTimer = null;
  powerMonitor.on('resume', () => { resumed = true; });
  setInterval(() => {
    if (!shouldRefresh({ visible: win.isVisible(), loadedAt, now: Date.now(), resumed })) return;
    resumed = false;
    win.webContents.reload();
  }, REFRESH_TICK_MS);
  win.webContents.on('did-finish-load', async () => {
    loadedAt = Date.now();
    clearTimeout(errorTimer);
    const doc = await win.webContents.executeJavaScript(`({
      elementCount: document.getElementsByTagName('*').length,
      interstitial: !!document.querySelector('.uiInterstitial, #back, #icon'),
    })`, true).catch(() => null);
    if (!looksLikeErrorPage(doc)) { errorRetries = 0; return; }
    errorTimer = setTimeout(() => win.webContents.reload(), errorRetryDelay(errorRetries++));
  });

  win.webContents.on('page-title-updated', (_event, title) => onUnread(unreadFromTitle(title)));

  // Never spawn a second window: it would carry the Facebook session with none of this
  // window's navigation policy. Messenger pages open in the panel itself, the rest externally.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternal(url)) win.loadURL(url).catch(() => {});
    else {
      const target = browserUrl(url);
      if (target) shell.openExternal(target);
    }
    return { action: 'deny' };
  });

  // A navigation the panel may not follow goes to the browser instead. `will-navigate` covers
  // what the page starts; `will-redirect` covers where a server sends it (a 30x off Meta's hosts
  // would otherwise carry the session out); `did-navigate` is the last resort should either be
  // bypassed: back to the inbox.
  const guardNavigation = (event, url) => {
    if (staysInPanel(url)) return;
    event.preventDefault();
    const target = browserUrl(url);
    if (target) shell.openExternal(target);
  };
  win.webContents.on('will-navigate', guardNavigation);
  win.webContents.on('will-redirect', guardNavigation);
  win.webContents.on('did-navigate', (_event, url) => {
    if (!staysInPanel(url)) win.loadURL('https://www.messenger.com/').catch(() => {});
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

  function reveal() {
    win.setOpacity(1);
    win.show();
    win.focus();
    onShown();
  }

  // Opens are serialised: a second fan click while one is still staging would otherwise
  // interleave its reload / row-click with the first. The chain never rejects.
  let queue = Promise.resolve();
  const enqueue = (fn) => (queue = queue.then(fn).catch(() => {}));

  async function stageThread(href, bubbleBounds) {
    compact = true;
    resize('compact');
    // Stage the reload + row click invisibly (opacity 0 but rendered, so the click still
    // dispatches), then reveal only once the conversation is showing — the list is never seen.
    win.setOpacity(0);
    place(bubbleBounds);
    win.showInactive();
    try {
      await scrape.setCompact(win.webContents, true);
      await scrape.openThread(win.webContents, href);
      await scrape.setCompact(win.webContents, true);
    } finally {
      // Whatever happened, never leave the panel staged: an invisible window still swallows
      // the clicks meant for whatever is underneath it.
      place(bubbleBounds);
      reveal();
    }
  }

  async function stageInbox(bubbleBounds) {
    compact = false;
    await scrape.setCompact(win.webContents, false);
    resize('full');
    await scrape.openInbox(win.webContents);
    api.showAt(bubbleBounds);
  }

  // The inbox with Messenger's Preferences dialog up (best effort: if its menu can't be found
  // the inbox simply shows, and the gear is one click away).
  async function stagePreferences(bubbleBounds) {
    await stageInbox(bubbleBounds);
    await scrape.openPreferences(win.webContents);
  }

  // Send a reply through the page without showing it: a hidden window does not dispatch the
  // trusted row click, so stage it at opacity 0 like a thread open, then hide it again. If the
  // panel is already showing, it simply switches to that thread in view.
  async function stageReply(href, text) {
    const wasHidden = !win.isVisible();
    if (wasHidden) { win.setOpacity(0); win.showInactive(); }
    try {
      return await scrape.sendReply(win.webContents, href, text);
    } finally {
      // Never leave the invisible window up: it would swallow clicks meant for what's under it.
      if (wasHidden) { win.hide(); win.setOpacity(1); }
    }
  }

  const api = {
    win,
    isVisible: () => win.isVisible(),
    showAt(bubbleBounds) {
      place(bubbleBounds);
      reveal();
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
    openThread: (href, bubbleBounds) => enqueue(() => stageThread(href, bubbleBounds)),
    openInbox: (bubbleBounds) => enqueue(() => stageInbox(bubbleBounds)),
    openPreferences: (bubbleBounds) => enqueue(() => stagePreferences(bubbleBounds)),
    // Serialised with opens; the queue swallows rejections into undefined, hence `=== true`.
    sendReply: (href, text) => enqueue(() => stageReply(href, text)).then((ok) => ok === true),
    setOverFullscreen: (on) => joinAllSpaces(win, on),
  };
  return api;
}

module.exports = { createPanel };
