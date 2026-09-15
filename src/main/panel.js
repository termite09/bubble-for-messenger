const { app, shell, screen, powerMonitor, nativeTheme } = require('electron');
const { panelPosition } = require('../lib/layout');
const { unreadFromTitle } = require('../lib/unread');
const { isInternal, staysInPanel, browserUrl } = require('../lib/links');
const { shouldRefresh, looksLikeErrorPage, errorRetryDelay } = require('../lib/refresh');
const scrape = require('./scrape');
const { joinAllSpaces } = require('./workspaces');
const { createFloatingWindow, ipcFor } = require('./floating-window');
const { CHANNELS } = require('../lib/ipc');
const { normalizeRows } = require('../lib/recent');

const REFRESH_TICK_MS = 60 * 1000;
const noLog = { debug() {}, info() {}, warn() {}, error() {} };

// `onShown` fires once the panel is actually visible to the user (not merely staged at opacity
// 0), so the bubble can dock the open chat's avatar beside it at the right moment. `onBlurred`
// fires when the panel put itself away because it lost focus (the user went elsewhere).
function createPanel({ onUnread, onRows = () => {}, onShown = () => {}, onBlurred = () => {}, overFullscreen = true, log = noLog }) {
  // Transparent so the page can draw its own card silhouette (scrape.FRAME_CSS: 16px corners and
  // a hairline) instead of the square window edge; macOS casts a shadow that follows the shape.
  const win = createFloatingWindow({
    level: 'floating', width: 420, height: 640, overFullscreen, hasShadow: true,
    url: 'https://www.messenger.com',
    // The preload watches the chat list and reports its rows (see renderer/panel-preload.js).
    preload: 'panel-preload.js',
    // The page spends its life hidden; throttled timers would let its live connection lapse.
    // Its scripts are the same multi-megabyte bundle every load: cache them compiled.
    webPreferences: { backgroundThrottling: false, v8CacheOptions: 'bypassHeatCheck' },
  });

  win.on('blur', () => { win.hide(); onBlurred(); });
  // The chat list's rows, pushed by the preload whenever they change.
  ipcFor(win).on(CHANNELS.PANEL_ROWS, (rows) => onRows(normalizeRows(rows)));
  // The panel is the app's connection to Messenger: it is only ever hidden, never closed (Cmd+W
  // or a page's window.close would otherwise destroy it) — except by the app quitting, which
  // closes every window and must not be held up. A crashed page is loaded again.
  let quitting = false;
  app.on('before-quit', () => { quitting = true; });
  win.on('close', (event) => { if (!quitting) { event.preventDefault(); win.hide(); } });
  let crashes = 0;
  win.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;
    setTimeout(() => { if (!win.isDestroyed()) win.webContents.reload(); }, errorRetryDelay(crashes++));
  });
  win.webContents.on('unresponsive', () => log.warn('panel unresponsive'));
  win.webContents.on('responsive', () => log.info('panel responsive again'));

  // The frame and compact styling are re-applied after any navigation (a full reload drops
  // injected CSS) — see did-finish-load below.
  let compact = false;

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
  }, REFRESH_TICK_MS).unref();
  win.webContents.on('did-finish-load', async () => {
    scrape.setFrame(win.webContents, true);
    scrape.setCompact(win.webContents, compact);
    applyTheme();
    loadedAt = Date.now();
    clearTimeout(errorTimer);
    const doc = await scrape.run(win.webContents, `({
      elementCount: document.getElementsByTagName('*').length,
      interstitial: !!document.querySelector('.uiInterstitial, #back, #icon'),
    })`).catch(() => null);
    if (!looksLikeErrorPage(doc)) { errorRetries = 0; return; }
    // Never reload a page the user is looking at: a small login or checkpoint page can look
    // like Facebook's error page to the probe.
    errorTimer = setTimeout(() => { if (!win.isVisible()) win.webContents.reload(); }, errorRetryDelay(errorRetries++));
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

  // Staging shows the window at opacity 0 so page clicks dispatch; while it is invisible it
  // must not swallow the user's own clicks on whatever is underneath.
  function stage() {
    win.setOpacity(0);
    win.setIgnoreMouseEvents(true);
    win.showInactive();
  }
  function reveal() {
    win.setOpacity(1);
    win.setIgnoreMouseEvents(false);
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
    place(bubbleBounds);
    stage();
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
    if (wasHidden) stage();
    try {
      return await scrape.sendReply(win.webContents, href, text);
    } finally {
      // Never leave the invisible window up: it would swallow clicks meant for what's under it.
      if (wasHidden) { win.hide(); win.setOpacity(1); win.setIgnoreMouseEvents(false); }
    }
  }

  const api = {
    win,
    isVisible: () => win.isVisible(),
    isLoading: () => win.webContents.isLoading(),
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
    requestRows: () => win.webContents.send(CHANNELS.PANEL_READ),
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
