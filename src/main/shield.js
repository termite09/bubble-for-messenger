const { CHANNELS } = require('../lib/ipc');
const { createFloatingWindow, ipcFor } = require('./floating-window');
const { joinAllSpaces } = require('./workspaces');

// While the stack is open, an invisible shield covers the display beneath it (and the panel):
// a press anywhere that is not a banner puts the stack away, the way a popover closes. It is
// non-focusable so the click never activates anything, and it sits below the bubble's level.
// Made on first use: most launches never open the stack before a while.
function createShield({ onPress, overFullscreen = true }) {
  let win = null;
  let over = overFullscreen;

  function ensure() {
    if (win) return win;
    win = createFloatingWindow({
      level: 'floating',
      focusable: false,
      overFullscreen: over,
      page: 'shield.html',
      preload: 'shield-preload.js',
      paintWhenInitiallyHidden: false,
      webPreferences: { webgl: false },
    });
    ipcFor(win).on(CHANNELS.SHIELD_CLICK, () => onPress());
    return win;
  }

  return {
    show(displayBounds) {
      const w = ensure();
      w.setBounds(displayBounds);
      if (!w.isVisible()) w.showInactive();
    },
    hide: () => {
      if (win) win.hide();
    },
    isVisible: () => Boolean(win) && win.isVisible(),
    setOverFullscreen(on) {
      over = on;
      if (win) joinAllSpaces(win, on);
    },
  };
}

module.exports = { createShield };
