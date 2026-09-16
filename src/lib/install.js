// How the app was installed, as far as the update path cares: Homebrew copies a cask's app
// into /Applications but keeps its record in the Caskroom (under the Apple-silicon or the
// Intel prefix), and an app installed that way should be updated by Homebrew, not by hand.
const CASK = 'bubble-for-messenger';
const CASKROOMS = ['/opt/homebrew/Caskroom', '/usr/local/Caskroom'];

// The full name: since Homebrew 6 a cask from a third-party tap must be trusted to be loaded
// from the tap at all, and naming it in full on the command line trusts it; the short name on
// an untrusted tap upgrades nothing, silently.
const HOMEBREW_UPGRADE = `brew upgrade --cask termite09/tap/${CASK}`;
const HOMEBREW_TRUST = 'brew trust termite09/tap';

function installedByHomebrew(exists = require('fs').existsSync) {
  try {
    return CASKROOMS.some((dir) => exists(`${dir}/${CASK}`));
  } catch (e) {
    return false;
  }
}

module.exports = { installedByHomebrew, HOMEBREW_UPGRADE, HOMEBREW_TRUST };
