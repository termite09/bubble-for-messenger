const { app, shell, screen, powerMonitor, nativeTheme, net } = require('electron');
const { panelPosition } = require('../lib/layout');
const { unreadFromTitle } = require('../lib/unread');
const { isInternal, staysInPanel, browserUrl, matchesUrlPattern } = require('../lib/links');
const { looksLikeErrorPage, errorRetryDelay } = require('../lib/refresh');
const liveness = require('../lib/liveness');
const { connectionState, signedOut } = require('../lib/status');
const { MESSENGER } = require('../lib/sites');
const { joinAllSpaces } = require('./workspaces');
const { createFloatingWindow, ipcFor } = require('./floating-window');
const { CHANNELS } = require('../lib/ipc');
const { normalizeRows } = require('../lib/recent');

const LIVENESS_TICK_MS = 30 * 1000;
// The page scripts for each site (lib/sites): the same surface, a different page.

// A session keeps one webRequest listener per event, and every panel shares the one session:
// one listener per session here, sorting each request to the panels whose patterns it
// matches. `watch` returns the way out.
const watches = new Map(); // session -> Set of { urls, onCompleted, onError }
function watchRequests(ses, entry) {
  if (!watches.has(ses)) watches.set(ses, new Set());
  const entries = watches.get(ses);
  entries.add(entry);
  const apply = () => {
    const urls = [...new Set([...entries].flatMap((e) => e.urls))];
    const dispatch = (kind) => (d) => {
      for (const e of entries)
        if (e.urls.some((pattern) => matchesUrlPattern(d.url, pattern))) e[kind](d);
    };
    if (!urls.length) {
      ses.webRequest.onCompleted(null);
      ses.webRequest.onErrorOccurred(null);
      return;
    }
    ses.webRequest.onCompleted({ urls }, dispatch('onCompleted'));
    ses.webRequest.onErrorOccurred({ urls }, dispatch('onError'));
  };
  apply();
  return () => {
    entries.delete(entry);
    apply();
  };
}
// Trial (audit, Sept 2026): set back to false if messages stop arriving while hidden.
const PANEL_THROTTLE = true;
const noLog = { debug() {}, info() {}, warn() {}, error() {} };

// One panel per site (lib/sites; Messenger by default): a hidden window on the site's inbox.
// `onShown` fires once the panel is actually visible to the user (not merely staged at opacity
// 0), so the bubble can dock the open chat's avatar beside it at the right moment. `onBlurred`
// fires when the panel put itself away because it lost focus (the user went elsewhere);
// `onHidden` whenever a showing panel goes away, for whatever reason.
function createPanel({
  site = MESSENGER,
  onUnread,
  onRows = () => {},
  onStatus = () => {},
  onShown = () => {},
  onBlurred = () => {},
  onHidden = () => {},
  onNavigated = () => {},
  onPin = () => {},
  overFullscreen = true,
  log = noLog,
}) {
  const scrape = require('./scrape');
  // The site's page wash in each theme: the window's own colour, so nothing shows through
  // before the page paints or around its edges.
  const washFor = site.wash;
  // Opaque, in the wash of the current theme, with macOS's own rounded corners and shadow: a
  // transparent window with a shadow would be recomposited on every frame the page changes.
  const win = createFloatingWindow({
    level: 'floating',
    width: 420,
    height: 640,
    overFullscreen,
    hasShadow: true,
    transparent: false,
    roundedCorners: true,
    backgroundColor: washFor(nativeTheme.shouldUseDarkColors),
    url: site.home,
    userAgent: site.userAgent,
    // The preload watches the chat list and reports its rows (see renderer/panel-preload.js).
    preload: 'panel-preload.js',
    // The page spends its life hidden. Chromium's timer throttling for hidden pages is on
    // (PANEL_THROTTLE): its keepalives survive it, messages arrive over the socket regardless,
    // and the page idles instead of running its timers at full rate. Its scripts are the same
    // multi-megabyte bundle every load: cache them compiled.
    webPreferences: { backgroundThrottling: PANEL_THROTTLE, v8CacheOptions: 'bypassHeatCheck' },
  });

  // Put away, and say so if it was showing (a staged panel at opacity 0 is not "showing").
  let showing = false;
  function hide() {
    win.hide();
    if (!showing) return;
    showing = false;
    onHidden();
  }
  win.on('blur', () => {
    hide();
    onBlurred();
  });
  // The chat list's rows, pushed by the preload whenever they change; and the pin button.
  ipcFor(win).on(CHANNELS.PANEL_ROWS, (rows) => onRows(normalizeRows(rows)));
  // The pin button on an inbox row: the row, as the page read it.
  ipcFor(win).on(CHANNELS.PANEL_PIN, (row) => onPin(row));
  // The panel is the app's connection to Messenger: it is only ever hidden, never closed (Cmd+W
  // or a page's window.close would otherwise destroy it) — except by the app quitting, which
  // closes every window and must not be held up. A crashed page is loaded again.
  let quitting = false;
  const onQuit = () => {
    quitting = true;
  };
  app.on('before-quit', onQuit);
  win.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      hide();
    }
  });
  let crashes = 0;
  win.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;
    setTimeout(() => {
      if (!win.isDestroyed()) win.webContents.reload();
    }, errorRetryDelay(crashes++));
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
  const applyTheme = () => {
    win.setBackgroundColor(washFor(nativeTheme.shouldUseDarkColors));
    scrape.setTheme(win.webContents, nativeTheme.shouldUseDarkColors);
  };
  nativeTheme.on('updated', applyTheme);

  // Keep the hidden page live. lib/liveness decides when a reload is due — after the Mac
  // wakes, after its connection dropped and stayed down, after a failed load, or when nothing
  // has completed for a long while — from what the network and the power state report here;
  // never while the panel is showing, never in a loop. Facebook's static error page is retried
  // with backoff separately.
  let live = liveness.initial(Date.now());
  // The disc shows whether Messenger is reachable and whether anyone is signed in.
  let lastStatus = '';
  const reportStatus = () => {
    if (win.isDestroyed()) return; // a request settling as the app quits
    const status = {
      connection: connectionState({ online: net.isOnline(), socketErrorAt: live.socketErrorAt }),
      signedOut: signedOut(win.webContents.getURL()),
    };
    const key = JSON.stringify(status);
    if (key === lastStatus) return;
    lastStatus = key;
    onStatus(status);
  };
  const note = (event) => {
    live = liveness.reduce(live, event, Date.now());
    reportStatus();
  };
  const unwatch = watchRequests(win.webContents.session, {
    urls: [...site.socketUrls],
    onCompleted: (d) => note(d.resourceType === 'webSocket' ? 'socket-open' : 'request-ok'),
    onError: (d) => {
      if (d.resourceType === 'webSocket') note('socket-error');
    },
  });
  const onSuspend = () => note('suspend');
  const onResume = () => note('resume');
  powerMonitor.on('suspend', onSuspend);
  powerMonitor.on('resume', onResume);
  // Chromium's own error page fires did-finish-load too; that is not a load of Messenger. A
  // new navigation clears the mark (a failure mid-body has no error page and no finish).
  let loadFailed = false;
  win.webContents.on('did-start-navigation', (details) => {
    if (details && details.isMainFrame && !details.isSameDocument) loadFailed = false;
  });
  win.webContents.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    loadFailed = true;
    note('fail-load');
  });
  const livenessTimer = setInterval(() => {
    reportStatus();
    const verdict = liveness.decide(live, {
      visible: win.isVisible(),
      online: net.isOnline(),
      now: Date.now(),
    });
    if (!verdict.reload || win.isVisible()) return;
    log.info('panel reload', { reason: verdict.reason });
    note('reload');
    win.webContents.reload();
  }, LIVENESS_TICK_MS).unref();
  let errorRetries = 0;
  let errorTimer = null;
  win.webContents.on('did-finish-load', async () => {
    if (loadFailed) {
      loadFailed = false;
      return;
    }
    scrape.setFrame(win.webContents, true);
    scrape.setCompact(win.webContents, compact);
    applyTheme();
    note('loaded');
    clearTimeout(errorTimer);
    const doc = await scrape
      .run(
        win.webContents,
        `({
      elementCount: document.getElementsByTagName('*').length,
      interstitial: !!document.querySelector('.uiInterstitial, #back, #icon'),
    })`,
      )
      .catch(() => null);
    if (!looksLikeErrorPage(doc)) {
      errorRetries = 0;
      return;
    }
    // Never reload a page the user is looking at: a small login or checkpoint page can look
    // like Facebook's error page to the probe.
    errorTimer = setTimeout(() => {
      if (!win.isVisible()) win.webContents.reload();
    }, errorRetryDelay(errorRetries++));
  });

  win.webContents.on('page-title-updated', (_event, title) => {
    if (!win.isDestroyed()) onUnread(unreadFromTitle(title));
  });

  // Never spawn a second window: it would carry the Facebook session with none of this
  // window's navigation policy. Messenger pages open in the panel itself, the rest externally.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternal(url, site.domain))
      win.loadURL(url).catch((err) => log.debug('panel load failed', { err }));
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
    if (staysInPanel(url, site.domain)) return;
    event.preventDefault();
    const target = browserUrl(url);
    if (target) shell.openExternal(target);
  };
  win.webContents.on('will-navigate', guardNavigation);
  win.webContents.on('will-redirect', guardNavigation);
  // Off the site, or on a part of it that is not messaging (reached in-page, by pushState):
  // back to the inbox.
  const belongs = (url) => {
    if (!staysInPanel(url, site.domain)) return false;
    try {
      const u = new URL(url);
      return !isInternal(url, site.domain) || site.panelPath(u.pathname);
    } catch (e) {
      return false;
    }
  };
  win.webContents.on('did-navigate', (_event, url) => {
    reportStatus();
    if (!belongs(url)) win.loadURL(site.home).catch(() => {});
    else onNavigated(url);
  });
  win.webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
    if (!isMainFrame) return;
    if (!belongs(url)) win.loadURL(site.home).catch(() => {});
    else onNavigated(url);
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
    showing = true;
    onShown();
  }

  // Opens are serialised: a second fan click while one is still staging would otherwise
  // interleave its reload / row-click with the first. The chain never rejects.
  let queue = Promise.resolve();
  const enqueue = (fn) =>
    (queue = queue
      .then(() => (win.isDestroyed() ? undefined : fn())) // a destroyed panel has nothing left to do
      .catch((err) => log.warn('panel action failed', { err })));

  async function stageThread(href, bubbleBounds) {
    compact = true;
    resize('compact');
    // Stage the reload + row click invisibly (opacity 0 but rendered, so the click still
    // dispatches), then reveal only once the conversation is showing — the list is never seen.
    place(bubbleBounds);
    stage();
    try {
      await scrape.setCompact(win.webContents, true);
      const landed = await scrape.openThread(win.webContents, href);
      await scrape.setCompact(win.webContents, true);
      return landed;
    } finally {
      // Whatever happened, never leave the panel staged: an invisible window still swallows
      // the clicks meant for whatever is underneath it.
      place(bubbleBounds);
      reveal();
    }
  }

  // Staged the same way a thread is: openInbox presses Messenger's own Back control with a
  // real input event, which a hidden window does not dispatch, so the page is rendered at
  // opacity 0 for the press and revealed after it.
  async function stageInbox(bubbleBounds) {
    compact = false;
    await scrape.setCompact(win.webContents, false);
    resize('full');
    place(bubbleBounds);
    stage();
    try {
      await scrape.openInbox(win.webContents);
    } finally {
      place(bubbleBounds);
      reveal();
    }
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
      if (wasHidden) {
        win.hide();
        win.setOpacity(1);
        win.setIgnoreMouseEvents(false);
      }
    }
  }

  const api = {
    win,
    site,
    isVisible: () => win.isVisible(),
    isLoading: () => win.webContents.isLoading(),
    liveness: () => live,
    status: () => JSON.parse(lastStatus || '{}'),
    showAt(bubbleBounds) {
      place(bubbleBounds);
      reveal();
    },
    hide,
    // The page's own sounds (a message arriving), off while the user is looking at Bubble.
    setMuted: (on) => {
      if (!win.isDestroyed()) win.webContents.setAudioMuted(on);
    },
    follow(bubbleBounds) {
      if (win.isVisible()) place(bubbleBounds);
    },
    reload() {
      win.webContents.reload();
    },
    readRecentChats: () => scrape.readRecentChats(win.webContents),
    // The chat the page is showing ({ href, name, avatarUrl }).
    readShowing: () => scrape.readShowing(win.webContents),
    // The pin button drawn by the preload on the inbox rows: which of them are pinned.
    setPinState({ pins }) {
      if (!win.isDestroyed()) win.webContents.send(CHANNELS.PANEL_PIN_STATE, { pins });
    },
    requestRows: () => win.webContents.send(CHANNELS.PANEL_READ),
    session: () => win.webContents.session,
    openThread: (href, bubbleBounds) => enqueue(() => stageThread(href, bubbleBounds)),
    openInbox: (bubbleBounds) => enqueue(() => stageInbox(bubbleBounds)),
    // The compose button, pressed for real on the inbox the caller has just brought up.
    newMessage: () => enqueue(() => scrape.newMessage(win.webContents)),
    openPreferences: (bubbleBounds) => enqueue(() => stagePreferences(bubbleBounds)),
    // Serialised with opens; the queue swallows rejections into undefined, hence `=== true`.
    sendReply: (href, text) => enqueue(() => stageReply(href, text)).then((ok) => ok === true),
    setOverFullscreen: (on) => joinAllSpaces(win, on),
    // For good — the close guard above only yields to the app quitting — and out of everything
    // that would otherwise keep reaching for the window.
    destroy() {
      quitting = true;
      unwatch();
      clearInterval(livenessTimer);
      clearTimeout(errorTimer);
      nativeTheme.removeListener('updated', applyTheme);
      powerMonitor.removeListener('suspend', onSuspend);
      powerMonitor.removeListener('resume', onResume);
      app.removeListener('before-quit', onQuit);
      if (!win.isDestroyed()) win.destroy();
    },
  };
  return api;
}

module.exports = { createPanel };
