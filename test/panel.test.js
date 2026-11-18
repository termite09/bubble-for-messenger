const test = require('node:test');
const assert = require('node:assert');
const electron = require('./helpers/electron-stub').install();
const { from } = require('./helpers/electron-stub');
const { CHANNELS } = require('../src/lib/ipc');
const { createPanel } = require('../src/main/panel');

const makePanel = () => {
  const opened = [];
  electron.shell.openExternal = async (u) => {
    opened.push(u);
  };
  const panel = createPanel({ onUnread() {} });
  const win = electron.windows[electron.windows.length - 1];
  return { panel, win, opened };
};
const nav = (win, event, url) => {
  let prevented = false;
  win.webContents.emit(
    event,
    {
      preventDefault: () => {
        prevented = true;
      },
    },
    url,
  );
  return prevented;
};

test('the panel is a sandboxed floating window that loads messenger.com', () => {
  const { win } = makePanel();
  assert.equal(win.opts.webPreferences.sandbox, true);
  assert.ok(win.opts.webPreferences.preload.endsWith('panel-preload.js')); // the list watcher; exposes nothing to the page
  assert.equal(win.opts.fullscreenable, false);
  assert.equal(win.loaded, 'https://www.messenger.com/');
});

test('navigations and redirects off Meta go to the browser; Meta pages stay; a landing elsewhere returns to the inbox', () => {
  const { win, opened } = makePanel();
  assert.equal(nav(win, 'will-navigate', 'https://www.messenger.com/t/1/'), false);
  assert.equal(nav(win, 'will-navigate', 'https://www.facebook.com/checkpoint/'), false);
  assert.equal(
    nav(win, 'will-navigate', 'https://l.messenger.com/l.php?u=https%3A%2F%2Fexample.com%2Fa'),
    true,
  );
  assert.equal(nav(win, 'will-redirect', 'https://evil.example/phish'), true);
  assert.equal(
    nav(win, 'will-redirect', 'https://www.facebook.com/flx/warn/?u=https%3A%2F%2Fexample.com%2Fb'),
    true,
  );
  assert.deepEqual(opened, [
    'https://example.com/a',
    'https://evil.example/phish',
    'https://example.com/b',
  ]);
  win.loaded = null;
  win.webContents.emit('did-navigate', {}, 'https://evil.example/landed');
  assert.equal(win.loaded, 'https://www.messenger.com/');
});

test('a popup never opens: internal links load in the panel, others in the browser, and the window is denied', () => {
  const { win, opened } = makePanel();
  const handler = win.webContents.windowOpenHandler;
  assert.ok(handler, 'setWindowOpenHandler was not called');
  assert.deepEqual(handler({ url: 'https://www.messenger.com/t/2/' }), { action: 'deny' });
  assert.equal(win.loaded, 'https://www.messenger.com/t/2/');
  assert.deepEqual(handler({ url: 'javascript:alert(1)' }), { action: 'deny' });
  assert.deepEqual(handler({ url: 'https://example.com/' }), { action: 'deny' });
  assert.deepEqual(opened, ['https://example.com/']);
});

test('closing hides the panel, except when the app is quitting; blur hides and reports', () => {
  const blurred = [];
  electron.shell.openExternal = async () => {};
  const panel = createPanel({ onUnread() {}, onBlurred: () => blurred.push(1) });
  const win = electron.windows[electron.windows.length - 1];
  win.show();
  let prevented = false;
  win.emit('close', {
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(win.visible, false);
  win.show();
  win.emit('blur');
  assert.equal(win.visible, false);
  assert.equal(blurred.length, 1);
  electron.app.emit('before-quit');
  prevented = false;
  win.emit('close', {
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, false);
  assert.equal(panel.isVisible(), false);
});

// A showing panel that goes away says so, once, however it went; a staged one (opacity 0,
// never shown to the user) does not.
test('a panel that was showing reports when it is hidden; a staged one does not', () => {
  const hidden = [];
  electron.shell.openExternal = async () => {};
  const panel = createPanel({ onUnread() {}, onHidden: () => hidden.push(1) });
  const win = electron.windows[electron.windows.length - 1];
  panel.showAt({ x: 100, y: 100, width: 44, height: 44 });
  assert.equal(win.visible, true);
  win.emit('blur');
  assert.deepEqual(hidden, [1]);
  panel.hide(); // already hidden: nothing to report
  assert.deepEqual(hidden, [1]);
  panel.showAt({ x: 100, y: 100, width: 44, height: 44 });
  panel.hide();
  assert.deepEqual(hidden, [1, 1]);
});

// Chromium's network error page fires did-finish-load too; it must not count as a load, or
// the retry a failed load is owed would be forgotten.
test("a failed load stays a failed load through the error page's did-finish-load", () => {
  electron.shell.openExternal = async () => {};
  const panel = createPanel({ onUnread() {} });
  const win = electron.windows[electron.windows.length - 1];
  win.webContents.emit(
    'did-fail-load',
    {},
    -106,
    'ERR_INTERNET_DISCONNECTED',
    'https://www.messenger.com/',
    true,
  );
  win.webContents.emit('did-finish-load');
  assert.notEqual(panel.liveness().failLoadAt, null);
  assert.equal(panel.liveness().failCount, 1);
  win.webContents.emit('did-finish-load'); // a real load afterwards
  assert.equal(panel.liveness().failLoadAt, null);
});

test('a failure mid-body does not swallow the next successful load', () => {
  electron.shell.openExternal = async () => {};
  const panel = createPanel({ onUnread() {} });
  const win = electron.windows[electron.windows.length - 1];
  win.webContents.emit(
    'did-fail-load',
    {},
    -101,
    'ERR_CONNECTION_RESET',
    'https://www.messenger.com/',
    true,
  );
  // No error page, no did-finish-load; the liveness reload starts a new navigation…
  win.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
  win.webContents.emit('did-finish-load');
  assert.equal(panel.liveness().failLoadAt, null); // …and its finish counts as a load
});

const { MESSENGER } = require('../src/lib/sites');

// The panel sends no substituted user agent: it is honestly an Electron client and says so.
// Hiding that would be evasion, not compliance — see docs/COMPLIANCE-PLAN.md.
test('the panel sends no user agent override, and paints the site wash', () => {
  const { win } = makePanel();
  assert.equal(win.webContents.userAgent, undefined);
  assert.equal(win.opts.backgroundColor, '#1a1a1a'); // the stub's nativeTheme is dark
});

test('destroy() closes a panel for good, close-guard notwithstanding', () => {
  const { panel, win } = makePanel();
  panel.destroy();
  assert.equal(win.destroyed, true);
});

// A session keeps one webRequest listener per event, so the panel's liveness watch must hear
// only Messenger's own traffic through it.
test('the panel hears its own sockets through the shared watch', () => {
  electron.shell.openExternal = async () => {};
  const messenger = createPanel({ site: MESSENGER, onUnread() {}, onStatus() {} });
  const { webRequest } = electron.windows[electron.windows.length - 1].webContents.session;
  webRequest.errored.fn({ url: 'wss://edge-chat.messenger.com/chat?x', resourceType: 'webSocket' });
  assert.equal(messenger.status().connection, 'reconnecting');
  webRequest.completed.fn({
    url: 'wss://edge-chat.messenger.com/chat?x',
    resourceType: 'webSocket',
  });
  assert.notEqual(messenger.status().connection, 'reconnecting');
  messenger.destroy();
});

test('a destroyed panel stops listening to the theme, power and its own timers', () => {
  electron.shell.openExternal = async () => {};
  const before = electron.nativeTheme.listenerCount('updated');
  const panel = createPanel({ site: MESSENGER, onUnread() {} });
  panel.destroy();
  electron.nativeTheme.emit('updated'); // would throw on the destroyed window if still wired
  electron.powerMonitor.emit('resume');
  assert.equal(electron.nativeTheme.listenerCount('updated'), before);
});

// The panel's own pin button: the preload reports a press; main tells it what to show.
test('the pin button reports presses and is told its state', () => {
  electron.shell.openExternal = async () => {};
  const presses = [];
  const panel = createPanel({ site: MESSENGER, onUnread() {}, onPin: (row) => presses.push(row) });
  const win = electron.windows[electron.windows.length - 1];
  electron.ipcMain.emit(CHANNELS.PANEL_PIN, from(win), { href: '/t/1/', name: 'A' }); // a row's
  electron.ipcMain.emit(CHANNELS.PANEL_PIN, { sender: {} }, { href: '/t/2/' }); // another page: ignored
  assert.deepEqual(presses, [{ href: '/t/1/', name: 'A' }]);
  panel.setPinState({ pins: ['/t/1/'] });
  const sent = win.webContents.sent.filter(([c]) => c === CHANNELS.PANEL_PIN_STATE).pop();
  assert.deepEqual(sent[1], { pins: ['/t/1/'] });
});

// ---- Opening a chat ---------------------------------------------------------------------------
const { capabilities } = require('../src/lib/platform');
const BOUNDS = { x: 100, y: 100, width: 44, height: 44 };

// The page scripts the open path runs, faked: what each was asked, in order.
function fakeScrape({ openThread } = {}) {
  const calls = [];
  const rec =
    (name, result) =>
    async (_wc, ...args) => {
      calls.push([name, ...args]);
      return result;
    };
  return {
    calls,
    names: () => calls.map((c) => c[0]),
    api: {
      setFrame: rec('frame'),
      setCompact: rec('compact'),
      setTheme: rec('theme'),
      run: async () => null,
      openInbox: rec('inbox'),
      viewport: rec('viewport', {}),
      cover: rec('cover', true),
      uncover: rec('uncover'),
      openThread: async (wc, href, opts) => {
        calls.push(['openThread', href]);
        if (openThread) await openThread(opts);
        return { via: 'back', landed: true };
      },
    },
  };
}
function panelWith(scrape, caps = capabilities('darwin'), opts = {}) {
  electron.shell.openExternal = async () => {};
  const panel = createPanel({ onUnread() {}, scrape: scrape.api, caps, ...opts });
  const win = electron.windows[electron.windows.length - 1];
  return { panel, win };
}

// Switching chats with the panel on screen used to blank the window for the length of the
// switch (it was staged at opacity 0 like a hidden one), so whatever was behind it flashed
// through. Now the picture it shows is held over the page while it switches, then faded.
test('switching chats on a showing panel holds its picture over the switch and never blanks it', async () => {
  const scrape = fakeScrape();
  const { panel, win } = panelWith(scrape);
  panel.showAt(BOUNDS);
  win.opacities = [];
  await panel.openThread('/t/2/', BOUNDS);
  assert.equal(win.opacities.includes(0), false);
  const names = scrape.names();
  assert.ok(names.indexOf('cover') >= 0 && names.indexOf('cover') < names.indexOf('openThread'));
  assert.ok(names.lastIndexOf('uncover') > names.indexOf('openThread'));
  const [, picture] = scrape.calls.find((c) => c[0] === 'cover');
  assert.equal(picture, 'data:image/jpeg;base64,' + Buffer.from('picture').toString('base64'));
  assert.equal(win.visible, true);
});

test('a hidden panel is staged out of sight for an open, as before, with no picture held', async () => {
  const scrape = fakeScrape();
  const { panel, win } = panelWith(scrape);
  await panel.openThread('/t/2/', BOUNDS);
  assert.equal(win.opacities[0], 0);
  assert.equal(win.opacities[win.opacities.length - 1], 1);
  assert.equal(scrape.names().includes('cover'), false);
});

// The slow path reloads the page, and the held picture goes with the old document.
test('a covered switch that has to reload the page goes out of sight for the reload', async () => {
  const scrape = fakeScrape({ openThread: (opts) => opts.beforeReload() });
  const { panel, win } = panelWith(scrape);
  panel.showAt(BOUNDS);
  win.opacities = [];
  await panel.openThread('/t/2/', BOUNDS);
  assert.ok(scrape.names().includes('cover')); // held at first; out of sight only for the reload
  assert.deepEqual(win.opacities, [0, 1]);
});

test('a picture that cannot be taken falls back to staging out of sight', async () => {
  const scrape = fakeScrape();
  const { panel, win } = panelWith(scrape);
  win.webContents.capturePage = async () => {
    throw new Error('no picture');
  };
  panel.showAt(BOUNDS);
  win.opacities = [];
  await panel.openThread('/t/2/', BOUNDS);
  assert.equal(win.opacities[0], 0);
  assert.equal(scrape.names().includes('cover'), false);
});

// Opens are serialised: a picture that never comes must not hold up this open or the next.
test('a picture that never comes is given up on, and the open goes ahead out of sight', async () => {
  const scrape = fakeScrape();
  const { panel, win } = panelWith(scrape);
  win.webContents.capturePage = () => new Promise(() => {});
  panel.showAt(BOUNDS);
  win.opacities = [];
  const started = Date.now();
  await panel.openThread('/t/2/', BOUNDS);
  assert.ok(Date.now() - started < 1000);
  assert.equal(win.opacities[0], 0);
  assert.equal(scrape.names().includes('openThread'), true);
});

test('isShowing is what the user sees: true once revealed, false once put away or merely staged', async () => {
  const scrape = fakeScrape({
    openThread: async () => assert.equal(panel.isShowing(), false), // staged, not shown
  });
  const { panel, win } = panelWith(scrape);
  assert.equal(panel.isShowing(), false);
  await panel.openThread('/t/1/', BOUNDS);
  assert.equal(panel.isShowing(), true);
  win.emit('blur');
  assert.equal(panel.isShowing(), false);
});

// A load starts the preload afresh, knowing no pins: it is told them again on every load.
test('the pinned chats are told to the page again after every load', () => {
  const { panel, win } = makePanel();
  panel.setPinState({ pins: ['/t/1/'] });
  win.webContents.sent = [];
  win.webContents.emit('did-finish-load');
  const sent = win.webContents.sent.filter(([c]) => c === CHANNELS.PANEL_PIN_STATE);
  assert.deepEqual(sent, [[CHANNELS.PANEL_PIN_STATE, { pins: ['/t/1/'] }]]);
});

// What the page looks like 0, 300 and 1200 ms after a reveal was added to the log for a Windows
// report; on macOS, where the open path is verified, those six page scripts per open are not run.
test('the page is probed after a reveal only where the open path is not verified', async () => {
  const counts = {};
  for (const platform of ['darwin', 'win32']) {
    const scrape = fakeScrape();
    const { panel } = panelWith(scrape, capabilities(platform));
    await panel.openThread('/t/1/', BOUNDS);
    await new Promise((r) => setTimeout(r, 20));
    counts[platform] = scrape.names().filter((n) => n === 'viewport').length;
  }
  assert.deepEqual(counts, { darwin: 0, win32: 1 }); // the first of three, at 0 ms
});

// Whether a wake still needs its reload is worth seeing in a bug report's log.
test('a wake settled by the socket coming back is logged, and no reload is owed', () => {
  electron.shell.openExternal = async () => {};
  const lines = [];
  const log = { debug() {}, warn() {}, error() {}, info: (msg) => lines.push(msg) };
  const panel = createPanel({ site: MESSENGER, onUnread() {}, log });
  const { webRequest } = electron.windows[electron.windows.length - 1].webContents.session;
  electron.powerMonitor.emit('resume');
  assert.equal(panel.liveness().resumePending, true);
  webRequest.completed.fn({
    url: 'wss://edge-chat.messenger.com/chat?x',
    resourceType: 'webSocket',
  });
  assert.equal(panel.liveness().resumePending, false);
  assert.ok(lines.includes('wake settled without a reload'));
  panel.destroy();
});

// ---- A chat you are in stays ------------------------------------------------------------------
// 300 of 496 chats in one log ended because a click elsewhere hid the panel — mid-conversation
// too, and with no way to drag a file in from Finder or paste from another app. A peek still
// goes away on a click elsewhere; a chat you have typed in stays until you put it away.
test('a peek goes away on a click elsewhere; a chat you typed in stays', async () => {
  const blurred = [];
  const { panel, win } = panelWith(fakeScrape(), capabilities('darwin'), {
    onBlurred: () => blurred.push(1),
  });
  await panel.openThread('/t/1/', BOUNDS);
  win.emit('blur');
  assert.equal(win.visible, false); // a peek
  assert.deepEqual(blurred, [1]);
  await panel.openThread('/t/1/', BOUNDS);
  electron.ipcMain.emit(CHANNELS.PANEL_ENGAGED, from(win));
  win.emit('blur');
  assert.equal(win.visible, true); // you were typing: it stays
  assert.equal(panel.isShowing(), true);
  assert.deepEqual(blurred, [1]);
  panel.hide(); // put away (the disc, Esc, ✕): the next open starts as a peek again
  await panel.openThread('/t/2/', BOUNDS);
  win.emit('blur');
  assert.equal(win.visible, false);
});

test('the keep-open pin holds the panel up across chats until it is unpinned', async () => {
  const { panel, win } = panelWith(fakeScrape());
  await panel.openThread('/t/1/', BOUNDS);
  electron.ipcMain.emit(CHANNELS.PANEL_KEEP, from(win));
  const told = () => win.webContents.sent.filter(([c]) => c === CHANNELS.PANEL_KEEP_STATE).pop();
  assert.deepEqual(told()[1], { keep: true });
  win.emit('blur');
  assert.equal(win.visible, true);
  panel.hide();
  await panel.openThread('/t/2/', BOUNDS);
  win.emit('blur');
  assert.equal(win.visible, true); // still pinned
  electron.ipcMain.emit(CHANNELS.PANEL_KEEP, from(win));
  assert.deepEqual(told()[1], { keep: false });
  win.emit('blur');
  assert.equal(win.visible, false);
});

// The panel's own controls: ✕ (and Esc) put it away the way the disc does; ↗ opens the chat
// on messenger.com in the browser.
test("the panel's close and open-in-browser controls are heard from its own page only", async () => {
  const closes = [];
  const opened = [];
  const { panel, win } = panelWith(fakeScrape(), capabilities('darwin'), {
    onCloseRequest: () => closes.push(1),
  });
  electron.shell.openExternal = async (u) => opened.push(u);
  await panel.openThread('/t/5/', BOUNDS);
  win.webContents.url = 'https://www.messenger.com/t/5/';
  electron.ipcMain.emit(CHANNELS.PANEL_CLOSE, { sender: {} });
  electron.ipcMain.emit(CHANNELS.PANEL_CLOSE, from(win));
  assert.deepEqual(closes, [1]);
  electron.ipcMain.emit(CHANNELS.PANEL_BROWSER, from(win));
  assert.deepEqual(opened, ['https://www.messenger.com/t/5/']);
});

// Tall (a setting): the panel takes the work area's height, less a margin, for long chats.
test('a tall panel takes the height of the screen it opens on', async () => {
  const { panel, win } = panelWith(fakeScrape(), capabilities('darwin'), {
    panelHeight: () => 'tall',
  });
  await panel.openThread('/t/1/', BOUNDS);
  const { workArea } = electron.screen.getPrimaryDisplay();
  assert.deepEqual(win.getSize(), [420, workArea.height - 16]);
  const standard = panelWith(fakeScrape());
  await standard.panel.openThread('/t/1/', BOUNDS);
  assert.deepEqual(standard.win.getSize(), [420, 560]);
});
