// What the platform can do, by name: main-process code asks about a capability, never about
// the OS. Every one of these is macOS today; the point of the list is that Windows (and a
// Linux later) is a matter of answers here, not of `process.platform` checks elsewhere.
function capabilities(platform) {
  const darwin = platform === 'darwin';
  return Object.freeze({
    windowLevels: darwin, // NSWindow levels; elsewhere every topmost window is one tier
    spaces: darwin, // setVisibleOnAllWorkspaces means something
    vibrancy: darwin, // setVibrancy exists; elsewhere the card is opaque
    dock: darwin,
    homebrew: darwin,
    // The thread open has been measured here (195 of 195 landed, Sept–Nov 2026); elsewhere the
    // log follows each reveal for a moment, for the Windows report it was added for (panel.js).
    openVerified: darwin,
  });
}

const CAPS = capabilities(process.platform);

module.exports = { capabilities, CAPS };
