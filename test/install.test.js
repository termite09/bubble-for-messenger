const test = require('node:test');
const assert = require('node:assert');
const { installedByHomebrew, HOMEBREW_UPGRADE, HOMEBREW_TRUST } = require('../src/lib/install');
const { capabilities } = require('../src/lib/platform');

// Homebrew copies a cask's app into /Applications but keeps its record in the Caskroom, under
// the Apple-silicon or the Intel prefix. That folder is the sign of a Homebrew install.
test('installedByHomebrew looks for the cask’s Caskroom folder under either prefix', () => {
  const seen = [];
  const exists = (p) => {
    seen.push(p);
    return p === '/usr/local/Caskroom/bubble-for-messenger';
  };
  assert.equal(installedByHomebrew(exists, capabilities('darwin')), true);
  assert.deepEqual(seen, [
    '/opt/homebrew/Caskroom/bubble-for-messenger',
    '/usr/local/Caskroom/bubble-for-messenger',
  ]);
  assert.equal(
    installedByHomebrew(() => false, capabilities('darwin')),
    false,
  );
  assert.equal(
    installedByHomebrew(() => {
      throw new Error('no');
    }, capabilities('darwin')),
    false,
  );
});

// No Homebrew (Windows): not a Homebrew install, and the filesystem is not asked.
test('without Homebrew nothing is looked up', () => {
  let asked = 0;
  const exists = () => {
    asked++;
    return true;
  };
  assert.equal(installedByHomebrew(exists, capabilities('win32')), false);
  assert.equal(asked, 0);
  assert.equal(installedByHomebrew(exists, capabilities('darwin')), true);
});

test('the commands name the cask in full, so Homebrew trusts it as it upgrades', () => {
  assert.equal(HOMEBREW_UPGRADE, 'brew upgrade --cask termite09/tap/bubble-for-messenger');
  assert.equal(HOMEBREW_TRUST, 'brew trust termite09/tap');
});
