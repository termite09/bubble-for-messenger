const test = require('node:test');
const assert = require('node:assert');
const { joinAllSpaces } = require('../src/main/workspaces');
const { capabilities } = require('../src/lib/platform');

// A window that joins all Spaces is drawn in full-screen Spaces too on current macOS, so "not
// over full-screen apps" means staying on one desktop. Electron's default for the call also
// re-transforms the process type on every use (Dock icon back, windows blinking); the app
// hides the Dock itself, so the transform must always be skipped.
test('on: all Spaces and over full-screen; off: one desktop; never transforms the process', () => {
  const calls = [];
  const win = { setVisibleOnAllWorkspaces: (...args) => calls.push(args) };
  joinAllSpaces(win, true);
  joinAllSpaces(win, false);
  assert.deepEqual(calls, [
    [true, { visibleOnFullScreen: true, skipTransformProcessType: true }],
    [false, { visibleOnFullScreen: false, skipTransformProcessType: true }],
  ]);
});

// No Spaces (Windows): there is nothing to join, and Electron's call is a no-op that still
// carries macOS-only options — so it is not made at all.
test('without Spaces the call is not made', () => {
  const calls = [];
  const win = { setVisibleOnAllWorkspaces: (...args) => calls.push(args) };
  joinAllSpaces(win, true, capabilities('win32'));
  joinAllSpaces(win, false, capabilities('win32'));
  assert.deepEqual(calls, []);
  joinAllSpaces(win, true, capabilities('darwin'));
  assert.equal(calls.length, 1);
});
