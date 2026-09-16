const test = require('node:test');
const assert = require('node:assert');
const { capabilities, CAPS } = require('../src/lib/platform');

const ALL = ['windowLevels', 'spaces', 'vibrancy', 'dock', 'homebrew'];

// macOS has everything the app leans on the OS for; Windows has none of it (topmost windows
// are one tier, no Spaces, no vibrancy, corners come from Windows 11 itself, no Dock, no
// Homebrew). Anything else gets the Windows answers: the conservative set.
test('darwin has every capability; win32 and unknown platforms have none', () => {
  const mac = capabilities('darwin');
  assert.deepEqual(Object.keys(mac).sort(), [...ALL].sort());
  for (const k of ALL) assert.equal(mac[k], true, k);
  for (const platform of ['win32', 'linux', 'freebsd'])
    for (const k of ALL) assert.equal(capabilities(platform)[k], false, `${platform} ${k}`);
});

test("CAPS is this platform's answers", () => {
  assert.deepEqual(CAPS, capabilities(process.platform));
});
