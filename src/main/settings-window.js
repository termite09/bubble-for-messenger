const { screen, nativeTheme } = require('electron');
const { CHANNELS } = require('../lib/ipc');
const { createFloatingWindow, ipcFor } = require('./floating-window');
const { joinAllSpaces } = require('./workspaces');
const { CAPS } = require('../lib/platform');
const WIDTH = 360;
// The card's ground when it is not frosted: the palette's card colour for the appearance.
const GROUND = { dark: '#1c1c1e', light: '#f5f5f7' };
const HEIGHT = 480; // the tallest pane; the page asks for the exact height of the one it shows
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 900;

// The settings card. One window, made on first open and hidden after; it takes focus like a
// normal window (it has controls to click) but floats with the rest of the app. Opaque, with
// the system's own rounded corners (as the panel is); by the Glass setting it paints the
// system's frosted material beneath the page — the one card of the app that can, being a
// window on its own — unless the user asked macOS to reduce transparency.
function createSettingsWindow({
  getSettings,
  setSetting,
  subscribe,
  onOpenMessengerPreferences,
  onCheckUpdates = () => {},
  caps = CAPS,
}) {
  let win = null;
  let overFullscreen = true;

  // Frosted only where the OS has a material to frost with; opaque in the ground otherwise.
  const frosted = () =>
    caps.vibrancy && Boolean(getSettings().glass) && !nativeTheme.prefersReducedTransparency;
  function applyMaterial(w) {
    if (frosted()) {
      w.setBackgroundColor('#00000000');
      w.setVibrancy('popover');
    } else {
      if (caps.vibrancy) w.setVibrancy(null);
      w.setBackgroundColor(nativeTheme.shouldUseDarkColors ? GROUND.dark : GROUND.light);
    }
  }

  function ensure() {
    if (win) return win;
    win = createFloatingWindow({
      level: 'floating',
      width: WIDTH,
      height: HEIGHT,
      overFullscreen,
      transparent: false,
      hasShadow: true,
      roundedCorners: true,
      visualEffectState: 'active',
      page: 'settings.html',
      preload: 'settings-preload.js',
      webPreferences: { webgl: false },
      caps,
    });
    applyMaterial(win);
    const onTheme = () => {
      if (win) applyMaterial(win);
    };
    nativeTheme.on('updated', onTheme);
    win.on('closed', () => {
      nativeTheme.removeListener('updated', onTheme);
      win = null;
    });
    wire(win);
    return win;
  }

  // The page's IPC is registered with its window, once it exists (the window is made lazily).
  function wire(w) {
    const ipc = ipcFor(w);
    ipc.handle(CHANNELS.SETTINGS_GET, () => getSettings());
    ipc.handle(CHANNELS.SETTINGS_CAPABILITIES, () => caps);
    ipc.on(CHANNELS.SETTINGS_SET, (key, value) => setSetting(key, value));
    ipc.on(CHANNELS.SETTINGS_CLOSE, () => w.hide());
    // The page reports how tall the pane it shows is; the card's top edge stays put.
    ipc.on(CHANNELS.SETTINGS_RESIZE, (height) => {
      if (!Number.isFinite(height)) return;
      const h = Math.round(Math.min(Math.max(height, MIN_HEIGHT), MAX_HEIGHT));
      const { x, y } = w.getBounds();
      w.setBounds({ x, y, width: WIDTH, height: h }, true);
    });
    ipc.on(CHANNELS.SETTINGS_OPEN_MESSENGER_PREFERENCES, () => onOpenMessengerPreferences());
    ipc.on(CHANNELS.SETTINGS_CHECK_UPDATES, () => onCheckUpdates());
  }
  subscribe((s) => {
    if (!win) return;
    win.webContents.send(CHANNELS.SETTINGS_CHANGED, s);
    applyMaterial(win);
  });

  return {
    // Centre the card in the work area of the display holding `bounds` (the bubble).
    open(bounds) {
      const w = ensure();
      const area = screen.getDisplayMatching(bounds).workArea;
      const { height } = w.getBounds(); // the pane's own height, once the page has asked for it
      w.setPosition(
        Math.round(area.x + (area.width - WIDTH) / 2),
        Math.round(area.y + (area.height - height) / 2),
      );
      w.show();
      w.focus();
    },
    setOverFullscreen(on) {
      overFullscreen = on;
      if (win) joinAllSpaces(win, on);
    },
  };
}

module.exports = { createSettingsWindow };
