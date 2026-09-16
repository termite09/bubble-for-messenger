const test = require('node:test');
const assert = require('node:assert');
const electron = require('./helpers/electron-stub').install();
const { createSettingsWindow } = require('../src/main/settings-window');

// The card is frosted (the system's material under a tinted page) by the Glass setting, and
// opaque in the palette's ground otherwise — or whenever macOS is asked to reduce transparency.
test('the settings card is frosted by the Glass setting, opaque otherwise', () => {
  let settings = { glass: true };
  let listener = null;
  const sw = createSettingsWindow({
    getSettings: () => settings,
    setSetting() {},
    subscribe: (fn) => {
      listener = fn;
    },
    onOpenMessengerPreferences() {},
  });
  sw.open({ x: 0, y: 0, width: 44, height: 44 });
  const win = electron.windows[electron.windows.length - 1];
  assert.equal(win.opts.transparent, false);
  assert.equal(win.opts.roundedCorners, true);
  assert.equal(win.vibrancy, 'popover');
  assert.equal(win.background, '#00000000');

  settings = { glass: false };
  listener(settings);
  assert.equal(win.vibrancy, null);
  assert.equal(win.background, '#1c1c1e');

  electron.nativeTheme.shouldUseDarkColors = false;
  electron.nativeTheme.emit('updated');
  assert.equal(win.background, '#f5f5f7');

  settings = { glass: true };
  electron.nativeTheme.prefersReducedTransparency = true;
  listener(settings);
  assert.equal(win.vibrancy, null);
  assert.equal(win.background, '#f5f5f7');
  electron.nativeTheme.prefersReducedTransparency = false;
  electron.nativeTheme.shouldUseDarkColors = true;
});
