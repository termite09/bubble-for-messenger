const { BrowserWindow, screen } = require('electron');
const { CHANNELS } = require('../lib/ipc');
const path = require('path');
const { centerWithin } = require('../lib/layout');
const { joinAllSpaces } = require('./workspaces');

const SIZE = 120; // window; the visible target is centred inside it
const HIT_RADIUS = 70; // how close the bubble centre must get to trigger dismissal
const BOTTOM_MARGIN = 40;

// A drop target that appears at the bottom-centre of the display while the bubble is being
// dragged. Dropping the bubble onto it dismisses (quits) the app.
function createDismissTarget({ overFullscreen = true } = {}) {
  const win = new BrowserWindow({
    width: SIZE, height: SIZE,
    frame: false, transparent: true, hasShadow: false, resizable: false, fullscreenable: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'dismiss-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  joinAllSpaces(win, overFullscreen);
  win.setIgnoreMouseEvents(true);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'dismiss.html'));

  let center = null; // screen point of the target centre while shown

  return {
    win,
    // Show centred at the bottom of the display the bubble is on.
    show(bubbleBounds) {
      const area = screen.getDisplayMatching(bubbleBounds).workArea;
      const x = Math.round(area.x + area.width / 2 - SIZE / 2);
      const y = Math.round(area.y + area.height - SIZE - BOTTOM_MARGIN);
      win.setBounds({ x, y, width: SIZE, height: SIZE });
      center = { x: x + SIZE / 2, y: y + SIZE / 2 };
      win.showInactive();
    },
    hide() {
      center = null;
      win.hide();
    },
    // True when the bubble centre is within the hit radius of the target.
    isOver(bubbleBounds) {
      return center ? centerWithin(bubbleBounds, center, HIT_RADIUS) : false;
    },
    setHot(hot) {
      win.webContents.send(CHANNELS.DISMISS_HOT, hot);
    },
    setOverFullscreen: (on) => joinAllSpaces(win, on),
  };
}

module.exports = { createDismissTarget };
