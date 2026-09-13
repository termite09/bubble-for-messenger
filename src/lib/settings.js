// The user's choices, as saved in settings.json (which they may edit by hand) and as they
// arrive from the settings page. One normalizer turns anything into the full shape.
const THEMES = ['system', 'light', 'dark'];

const DEFAULTS = Object.freeze({
  overFullscreen: true,   // the bubble floats over full-screen apps
  startAtLogin: false,
  banner: true,           // the disc unrolls when a message lands
  bannerPreview: true,    // ...showing the message text, not just the name
  quickReply: true,       // the ↩ on the banner
  notifications: true,    // Messenger's own macOS notifications
  badge: true,            // unread count on the disc
  theme: 'system',        // panel appearance; only bites when Messenger follows the device
  spellcheck: true,
  blockTelemetry: true,
});

const isSettingKey = (key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(DEFAULTS, key);

function normalizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const key of Object.keys(DEFAULTS)) {
    if (key === 'theme') out.theme = THEMES.includes(src.theme) ? src.theme : DEFAULTS.theme;
    else out[key] = key in src ? Boolean(src[key]) : DEFAULTS[key];
  }
  // The disc position is saved in the same file; it is not a setting the page shows.
  out.bubble = src.bubble && typeof src.bubble === 'object' ? src.bubble : null;
  return out;
}

module.exports = { DEFAULTS, THEMES, normalizeSettings, isSettingKey };
