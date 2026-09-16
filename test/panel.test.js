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

const { INSTAGRAM } = require('../src/lib/sites');

const makeInstagramPanel = () => {
  const opened = [];
  electron.shell.openExternal = async (u) => {
    opened.push(u);
  };
  const panel = createPanel({ site: INSTAGRAM, onUnread() {} });
  const win = electron.windows[electron.windows.length - 1];
  return { panel, win, opened };
};

// The Instagram panel loads Instagram's mobile web app (a phone user agent, set before the
// load) at its inbox, painted in Instagram's own wash.
test('an Instagram panel loads the inbox as a phone, in its own wash', () => {
  const { win } = makeInstagramPanel();
  assert.equal(win.loaded, INSTAGRAM.home);
  assert.equal(win.webContents.userAgent, INSTAGRAM.userAgent);
  assert.equal(win.opts.backgroundColor, '#0c1014'); // the stub's nativeTheme is dark
  assert.ok(win.opts.webPreferences.preload.endsWith('panel-preload.js'));
});

test('the Instagram panel keeps instagram.com and its login, sends the rest out, and returns to the inbox', () => {
  const { win, opened } = makeInstagramPanel();
  assert.equal(nav(win, 'will-navigate', 'https://www.instagram.com/direct/t/1/'), false);
  assert.equal(nav(win, 'will-navigate', 'https://www.instagram.com/accounts/login/'), false);
  assert.equal(nav(win, 'will-navigate', 'https://www.facebook.com/login.php'), false);
  assert.equal(nav(win, 'will-navigate', 'https://www.messenger.com/t/1/'), true);
  assert.equal(
    nav(win, 'will-redirect', 'https://l.instagram.com/?u=https%3A%2F%2Fexample.com%2Fa'),
    true,
  );
  assert.deepEqual(opened, ['https://www.messenger.com/t/1/', 'https://example.com/a']);
  // A landing off the site, or on a part of it that is not messaging, goes back to the inbox.
  win.loaded = null;
  win.webContents.emit('did-navigate', {}, 'https://evil.example/landed');
  assert.equal(win.loaded, INSTAGRAM.home);
  win.loaded = null;
  win.webContents.emit('did-navigate', {}, 'https://www.instagram.com/explore/');
  assert.equal(win.loaded, INSTAGRAM.home);
  // Instagram navigates in-page (pushState): the feed behind its inbox header's Back is one.
  win.loaded = null;
  win.webContents.emit('did-navigate-in-page', {}, 'https://www.instagram.com/', true);
  assert.equal(win.loaded, INSTAGRAM.home);
  win.loaded = null;
  win.webContents.emit('did-navigate-in-page', {}, 'https://www.instagram.com/direct/t/2/', true);
  assert.equal(win.loaded, null);
});

test('destroy() closes a panel for good, close-guard notwithstanding', () => {
  const { panel, win } = makeInstagramPanel();
  panel.destroy();
  assert.equal(win.destroyed, true);
});

const { MESSENGER } = require('../src/lib/sites');

// Two panels share one session, and a session keeps one webRequest listener per event: the
// panels' liveness watches must share it, each hearing only its own site's traffic.
test('two panels on one session each hear their own site’s sockets', () => {
  electron.shell.openExternal = async () => {};
  const statuses = { messenger: [], instagram: [] };
  const messenger = createPanel({
    site: MESSENGER,
    onUnread() {},
    onStatus: (s) => statuses.messenger.push(s.connection),
  });
  const instagram = createPanel({
    site: INSTAGRAM,
    onUnread() {},
    onStatus: (s) => statuses.instagram.push(s.connection),
  });
  const { webRequest } = electron.windows[electron.windows.length - 1].webContents.session;
  webRequest.errored.fn({
    url: 'wss://gateway.instagram.com/ws/lightspeed',
    resourceType: 'webSocket',
  });
  assert.equal(instagram.status().connection, 'reconnecting');
  assert.notEqual(messenger.status().connection, 'reconnecting'); // nothing reached it yet
  webRequest.errored.fn({ url: 'wss://edge-chat.messenger.com/chat?x', resourceType: 'webSocket' });
  assert.equal(messenger.status().connection, 'reconnecting');
  webRequest.completed.fn({
    url: 'wss://edge-chat.messenger.com/chat?x',
    resourceType: 'webSocket',
  });
  assert.notEqual(messenger.status().connection, 'reconnecting'); // nothing reached it yet
  assert.equal(instagram.status().connection, 'reconnecting');
  // A destroyed panel drops out of the shared watch; the other keeps hearing.
  instagram.destroy();
  webRequest.completed.fn({
    url: 'wss://gateway.instagram.com/ws/lightspeed',
    resourceType: 'webSocket',
  });
  assert.equal(instagram.status().connection, 'reconnecting');
  messenger.destroy();
});

test('a destroyed panel stops listening to the theme, power and its own timers', () => {
  electron.shell.openExternal = async () => {};
  const before = electron.nativeTheme.listenerCount('updated');
  const panel = createPanel({ site: INSTAGRAM, onUnread() {} });
  panel.destroy();
  electron.nativeTheme.emit('updated'); // would throw on the destroyed window if still wired
  electron.powerMonitor.emit('resume');
  assert.equal(electron.nativeTheme.listenerCount('updated'), before);
});

// The panel's own pin button: the preload reports a press; main tells it what to show.
test('the pin button reports presses and is told its state', () => {
  electron.shell.openExternal = async () => {};
  const presses = [];
  const panel = createPanel({ site: INSTAGRAM, onUnread() {}, onPin: (row) => presses.push(row) });
  const win = electron.windows[electron.windows.length - 1];
  electron.ipcMain.emit(CHANNELS.PANEL_PIN, from(win), { href: '/direct/n/A/', name: 'A' }); // a row's
  electron.ipcMain.emit(CHANNELS.PANEL_PIN, { sender: {} }, { href: '/direct/n/B/' }); // another page: ignored
  assert.deepEqual(presses, [{ href: '/direct/n/A/', name: 'A' }]);
  panel.setPinState({ pins: ['/direct/n/A/'] });
  const sent = win.webContents.sent.filter(([c]) => c === CHANNELS.PANEL_PIN_STATE).pop();
  assert.deepEqual(sent[1], { pins: ['/direct/n/A/'] });
});
