const test = require('node:test');
const assert = require('node:assert');
const electron = require('./helpers/electron-stub').install();
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
  assert.equal(win.loaded, 'https://www.messenger.com');
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
