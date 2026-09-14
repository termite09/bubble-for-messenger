const test = require('node:test');
const assert = require('node:assert');
const { joinAllSpaces } = require('../src/main/workspaces');

// Electron's default for setVisibleOnAllWorkspaces re-transforms the process type on every
// call: turning "over full-screen apps" off brought the Dock icon back and blinked every
// window. The app hides the Dock itself, so the transform must always be skipped.
test('joins all Spaces, follows the setting for full-screen, never transforms the process', () => {
  const calls = [];
  const win = { setVisibleOnAllWorkspaces: (...args) => calls.push(args) };
  joinAllSpaces(win, true);
  joinAllSpaces(win, false);
  assert.deepEqual(calls, [
    [true, { visibleOnFullScreen: true, skipTransformProcessType: true }],
    [true, { visibleOnFullScreen: false, skipTransformProcessType: true }],
  ]);
});
