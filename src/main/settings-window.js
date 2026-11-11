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
const FIRST_SIZE_WAIT_MS = 1000; // a page that never says how tall it is still gets its card

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
  firstSizeWaitMs = FIRST_SIZE_WAIT_MS,
}) {
  let win = null;
  let overFullscreen = true;
  // The card is first shown once its page has said how tall the pane is — not at a guess,
  // blank, to jump to the right height a moment later.
  let sized = false;
  let pendingOpen = null; // the bubble's bounds, for an open asked for before that
  let waitTimer = null;

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
      clearTimeout(waitTimer);
      win = null;
      sized = false;
      pendingOpen = null;
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
    // The page reports how tall the pane it shows is; the card's top edge stays put, and on
    // screen macOS animates the change. The first report lets a waiting open go ahead.
    ipc.on(CHANNELS.SETTINGS_RESIZE, (height) => {
      if (!Number.isFinite(height)) return;
      const h = Math.round(Math.min(Math.max(height, MIN_HEIGHT), MAX_HEIGHT));
      const { x, y } = w.getBounds();
      w.setBounds({ x, y, width: WIDTH, height: h }, w.isVisible());
      sized = true;
      if (pendingOpen) showAt(pendingOpen);
    });
    ipc.on(CHANNELS.SETTINGS_OPEN_MESSENGER_PREFERENCES, () => onOpenMessengerPreferences());
    ipc.on(CHANNELS.SETTINGS_CHECK_UPDATES, () => onCheckUpdates());
  }
  subscribe((s) => {
    if (!win) return;
    win.webContents.send(CHANNELS.SETTINGS_CHANGED, s);
    applyMaterial(win);
  });

  // Centre the card in the work area of the display holding `bounds` (the bubble).
  function showAt(bounds) {
    pendingOpen = null;
    clearTimeout(waitTimer);
    if (!win) return;
    const area = screen.getDisplayMatching(bounds).workArea;
    const { height } = win.getBounds(); // the pane's own height, as the page asked for it
    win.setPosition(
      Math.round(area.x + (area.width - WIDTH) / 2),
      Math.round(area.y + (area.height - height) / 2),
    );
    win.show();
    win.focus();
  }

  return {
    open(bounds) {
      ensure();
      if (sized) return showAt(bounds);
      if (!pendingOpen) waitTimer = setTimeout(() => showAt(pendingOpen), firstSizeWaitMs).unref();
      pendingOpen = bounds;
    },
    setOverFullscreen(on) {
      overFullscreen = on;
      if (win) joinAllSpaces(win, on);
    },
  };
}

module.exports = { createSettingsWindow };
