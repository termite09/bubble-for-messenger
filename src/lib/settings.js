// The user's choices, as saved in settings.json (which they may edit by hand) and as they
// arrive from the settings page. One normalizer turns anything into the full shape.
const { isThreadHref, MAX_PINS } = require('./recent');
const THEMES = ['system', 'light', 'dark'];
const BADGES = ['off', 'steady', 'pulse'];       // the unread count on the disc
const BUBBLE_SIZES = Object.freeze({ small: 44, medium: 56, large: 68 }); // the disc, in px
const REOPEN_SECONDS = [0, 15, 30, 60, 300];  // how long a chat closed by clicking away stays one click away

const DEFAULTS = Object.freeze({
  overFullscreen: true,   // the bubble floats over full-screen apps
  startAtLogin: false,
  bubbleSize: 'small',
  banner: true,           // the disc unrolls when a message lands
  bannerPreview: true,    // ...showing the message text, not just the name
  quickReply: true,       // the ↩ on the banner
  notifications: true,    // Messenger's own macOS notifications
  badge: 'steady',        // unread count on the disc: off, steady, or pulsing
  theme: 'system',        // panel appearance
  spellcheck: true,
  blockTelemetry: true,
  reopenLast: 30,         // seconds; 0 is off
});

// Keys whose value is one of a list rather than a boolean.
const CHOICES = { theme: THEMES, badge: BADGES, bubbleSize: Object.keys(BUBBLE_SIZES), reopenLast: REOPEN_SECONDS };

const GRANTED_PERMISSIONS = new Set(['media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen']);
function isPermissionGranted(permission, settings) {
  return GRANTED_PERMISSIONS.has(permission) || (permission === 'notifications' && settings.notifications);
}

const isSettingKey = (key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(DEFAULTS, key);

function normalizeSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const key of Object.keys(DEFAULTS)) {
    if (key in CHOICES) out[key] = CHOICES[key].includes(src[key]) ? src[key] : DEFAULTS[key];
    else out[key] = key in src ? Boolean(src[key]) : DEFAULTS[key];
  }
  // The unread count was a switch before 2.2; a saved boolean keeps meaning what it meant.
  if (typeof src.badge === 'boolean') out.badge = src.badge ? 'steady' : 'off';
  // The disc position is saved in the same file; it is not a setting the page shows.
  out.bubble = src.bubble && typeof src.bubble === 'object' ? src.bubble : null;
  out.pins = normalizePins(src.pins);
  return out;
}

// Pinned chats, likewise not a page setting: thread hrefs only, no duplicates, MAX_PINS at most.
function normalizePins(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object' || !isThreadHref(p.href) || seen.has(p.href)) continue;
    seen.add(p.href);
    out.push({ href: p.href, name: typeof p.name === 'string' ? p.name : '', avatarUrl: typeof p.avatarUrl === 'string' ? p.avatarUrl : null });
    if (out.length === MAX_PINS) break;
  }
  return out;
}

module.exports = { DEFAULTS, THEMES, BADGES, BUBBLE_SIZES, REOPEN_SECONDS, normalizeSettings, isSettingKey, isPermissionGranted };
