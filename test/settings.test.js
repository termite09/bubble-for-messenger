const test = require('node:test');
const assert = require('node:assert');
const { DEFAULTS, THEMES, BADGES, BUBBLE_SIZES, REOPEN_SECONDS, normalizeSettings, isSettingKey, isPermissionGranted } = require('../src/lib/settings');

test('defaults are what the spec says', () => {
  assert.deepEqual(DEFAULTS, {
    overFullscreen: true, startAtLogin: false, bubbleSize: 'small', banner: true, bannerPreview: true, quickReply: true,
    notifications: true, badge: 'steady', theme: 'system', spellcheck: true, blockTelemetry: true, reopenLast: 30,
  });
  assert.deepEqual(REOPEN_SECONDS, [0, 15, 30, 60, 300]);
  assert.deepEqual(THEMES, ['system', 'light', 'dark']);
  assert.deepEqual(BADGES, ['off', 'steady', 'pulse']);
  assert.deepEqual(BUBBLE_SIZES, { small: 44, medium: 56, large: 68 });
});

test('nothing in, defaults out — with a null bubble position and no pins', () => {
  assert.deepEqual(normalizeSettings(undefined), { ...DEFAULTS, bubble: null, pins: [] });
  assert.deepEqual(normalizeSettings({}), { ...DEFAULTS, bubble: null, pins: [] });
  assert.deepEqual(normalizeSettings('junk'), { ...DEFAULTS, bubble: null, pins: [] });
});

test('booleans are coerced, choices are validated, unknown keys are dropped', () => {
  const out = normalizeSettings({ banner: 0, badge: 'pulse', theme: 'dark', bubbleSize: 'large', zoom: 150, startAtLogin: 1 });
  assert.equal(out.banner, false);
  assert.equal(out.badge, 'pulse');
  assert.equal(out.theme, 'dark');
  assert.equal(out.bubbleSize, 'large');
  assert.equal(out.startAtLogin, true);
  assert.equal('zoom' in out, false);
  assert.equal(normalizeSettings({ theme: 'sepia' }).theme, 'system');
  assert.equal(normalizeSettings({ badge: 'blink' }).badge, 'steady');
  assert.equal(normalizeSettings({ bubbleSize: 'huge' }).bubbleSize, 'small');
  assert.equal(normalizeSettings({ reopenLast: 60 }).reopenLast, 60);
  assert.equal(normalizeSettings({ reopenLast: '60' }).reopenLast, 30);
  assert.equal(normalizeSettings({ reopenLast: 45 }).reopenLast, 30);
});

// Before 2.2 the unread count was a switch; a saved boolean keeps meaning what it meant.
test('a boolean badge from an older settings.json migrates', () => {
  assert.equal(normalizeSettings({ badge: true }).badge, 'steady');
  assert.equal(normalizeSettings({ badge: false }).badge, 'off');
});

test('the bubble position rides along untouched', () => {
  assert.deepEqual(normalizeSettings({ bubble: { x: 10, y: 20 } }).bubble, { x: 10, y: 20 });
});

test('isSettingKey knows the twelve keys and nothing else', () => {
  for (const k of Object.keys(DEFAULTS)) assert.equal(isSettingKey(k), true, k);
  assert.equal(isSettingKey('bubble'), false);
  assert.equal(isSettingKey('__proto__'), false);
  assert.equal(isSettingKey(undefined), false);
});

test('native notification permission is granted only for Meta pages and when the toggle is enabled', () => {
  assert.equal(isPermissionGranted('notifications', { ...DEFAULTS, notifications: true }), true);
  assert.equal(isPermissionGranted('notifications', { ...DEFAULTS, notifications: false }), false);
  assert.equal(isPermissionGranted('media', DEFAULTS), true);
  assert.equal(isPermissionGranted('clipboard-read', DEFAULTS), true);
  assert.equal(isPermissionGranted('geolocation', DEFAULTS), false);
});

// Pinned chats ride along in settings.json like the disc position: not a page setting, but
// validated — thread hrefs only, five at most, no duplicates, and the shape the stack needs.
test('pins are validated and capped, and absent means none', () => {
  assert.deepEqual(normalizeSettings({}).pins, []);
  assert.deepEqual(normalizeSettings({ pins: 'junk' }).pins, []);
  const pins = normalizeSettings({ pins: [
    { href: '/t/1/', name: 'A', avatarUrl: 'u' },
    { href: '/t/1/', name: 'dup' },
    { href: 'https://evil/', name: 'x' },
    { href: '/e2ee/t/2/', name: 3, avatarUrl: 7 },
    { href: '/t/3/' }, { href: '/t/4/' }, { href: '/t/5/' }, { href: '/t/6/' }, { href: '/t/7/' },
  ] }).pins;
  assert.deepEqual(pins.slice(0, 2), [{ href: '/t/1/', name: 'A', avatarUrl: 'u' }, { href: '/e2ee/t/2/', name: '', avatarUrl: null }]);
  assert.equal(pins.length, 5);
  assert.equal(isSettingKey('pins'), false);
});
