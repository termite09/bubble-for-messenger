const test = require('node:test');
const assert = require('node:assert');
const electron = require('./helpers/electron-stub').install();
const { createFloatingWindow } = require('../src/main/floating-window');
const { capabilities } = require('../src/lib/platform');

const mac = capabilities('darwin');
const win32 = capabilities('win32');

// macOS keeps always-on-top windows at their level; Windows has one topmost tier where the
// last shown is on top. There, showing a lower-level window re-raises the visible higher ones.
test('without window levels, showing a floating window raises the visible screen-saver ones', () => {
  electron.raised.length = 0;
  const bubble = createFloatingWindow({ level: 'screen-saver', page: 'bubble.html', caps: win32 });
  const dismiss = createFloatingWindow({
    level: 'screen-saver',
    page: 'dismiss.html',
    caps: win32,
  });
  const shield = createFloatingWindow({ level: 'floating', page: 'shield.html', caps: win32 });
  bubble.showInactive();
  assert.deepEqual(electron.raised, []); // nothing above it to raise
  shield.showInactive();
  assert.deepEqual(electron.raised, [bubble]); // dismiss is hidden: left alone
  electron.raised.length = 0;
  dismiss.showInactive();
  assert.deepEqual(electron.raised, []); // same level as the bubble: nothing higher
  bubble.destroy();
  electron.raised.length = 0;
  shield.hide();
  shield.showInactive();
  assert.deepEqual(electron.raised, [dismiss]); // the closed bubble is forgotten
  dismiss.destroy();
  shield.destroy();
});

// Activation also raises a window on Windows (a focus() after show(), or a click in it), so
// the higher levels are put back over it once that has settled.
test('without window levels, focusing a floating window re-raises the screen-saver ones', async () => {
  electron.raised.length = 0;
  const bubble = createFloatingWindow({ level: 'screen-saver', page: 'bubble.html', caps: win32 });
  const panel = createFloatingWindow({ level: 'floating', page: 'panel.html', caps: win32 });
  bubble.showInactive();
  panel.show();
  panel.focus();
  electron.raised.length = 0; // what show() raised is covered above; this is the focus path
  panel.focus();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(electron.raised, [bubble]);
  bubble.destroy();
  panel.destroy();
});

test('with window levels, nothing is raised by hand', () => {
  electron.raised.length = 0;
  const bubble = createFloatingWindow({ level: 'screen-saver', page: 'bubble.html', caps: mac });
  const shield = createFloatingWindow({ level: 'floating', page: 'shield.html', caps: mac });
  bubble.showInactive();
  shield.showInactive();
  assert.deepEqual(electron.raised, []);
  assert.equal(bubble.level, 'screen-saver'); // setAlwaysOnTop(true, level), as before
});

// visualEffectState is the one BrowserWindow option only macOS knows, so it is dropped
// elsewhere rather than passed as a no-op a future Electron might start rejecting.
// roundedCorners is a plain option since Electron 44 and flows through on every platform.
test('visualEffectState is passed only where it exists; roundedCorners always', () => {
  const onMac = createFloatingWindow({
    page: 'settings.html',
    roundedCorners: true,
    visualEffectState: 'active',
    caps: mac,
  });
  assert.equal(onMac.opts.roundedCorners, true);
  assert.equal(onMac.opts.visualEffectState, 'active');
  const onWin = createFloatingWindow({
    page: 'settings.html',
    roundedCorners: true,
    visualEffectState: 'active',
    caps: win32,
  });
  assert.equal(onWin.opts.roundedCorners, true);
  assert.equal('visualEffectState' in onWin.opts, false);
  assert.equal('caps' in onWin.opts, false); // never forwarded to BrowserWindow
});
