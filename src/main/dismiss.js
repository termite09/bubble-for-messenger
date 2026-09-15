const { screen } = require('electron');
const { CHANNELS } = require('../lib/ipc');
const { centerWithin } = require('../lib/layout');
const { createFloatingWindow } = require('./floating-window');
const { joinAllSpaces } = require('./workspaces');

const SIZE = 120; // window; the visible target is centred inside it
const HIT_RADIUS = 70; // how close the bubble centre must get to trigger dismissal
const BOTTOM_MARGIN = 40;

// A drop target that appears at the bottom-centre of the display while the bubble is being
// dragged. Dropping the bubble onto it dismisses (quits) the app.
function createDismissTarget({ overFullscreen = true } = {}) {
  let win = null;
  let over = overFullscreen;
  let center = null; // screen point of the target centre while shown

  // Made on the first drag: most launches never see one.
  function ensure() {
    if (win) return win;
    win = createFloatingWindow({
      level: 'screen-saver',
      width: SIZE,
      height: SIZE,
      focusable: false,
      overFullscreen: over,
      page: 'dismiss.html',
      preload: 'dismiss-preload.js',
      paintWhenInitiallyHidden: false,
      webPreferences: { webgl: false },
    });
    win.setIgnoreMouseEvents(true);
    return win;
  }

  return {
    // Show centred at the bottom of the display the bubble is on.
    show(bubbleBounds) {
      const w = ensure();
      const area = screen.getDisplayMatching(bubbleBounds).workArea;
      const x = Math.round(area.x + area.width / 2 - SIZE / 2);
      const y = Math.round(area.y + area.height - SIZE - BOTTOM_MARGIN);
      w.setBounds({ x, y, width: SIZE, height: SIZE });
      center = { x: x + SIZE / 2, y: y + SIZE / 2 };
      w.showInactive();
    },
    hide() {
      center = null;
      if (win) win.hide();
    },
    // True when the bubble centre is within the hit radius of the target.
    isOver(bubbleBounds) {
      return center ? centerWithin(bubbleBounds, center, HIT_RADIUS) : false;
    },
    setHot(hot) {
      if (win) win.webContents.send(CHANNELS.DISMISS_HOT, hot);
    },
    setOverFullscreen(on) {
      over = on;
      if (win) joinAllSpaces(win, on);
    },
  };
}

module.exports = { createDismissTarget };
