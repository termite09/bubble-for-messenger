const test = require('node:test');
const assert = require('node:assert');
const { DEFAULTS, THEMES, BADGES, BUBBLE_SIZES, normalizeSettings, isSettingKey, isPermissionGranted } = require('../src/lib/settings');

test('defaults are what the spec says', () => {
  assert.deepEqual(DEFAULTS, {
    overFullscreen: true, startAtLogin: false, bubbleSize: 'small', banner: true, bannerPreview: true, quickReply: true,
    notifications: true, badge: 'steady', theme: 'system', spellcheck: true, blockTelemetry: true,
  });
  assert.deepEqual(THEMES, ['system', 'light', 'dark']);
  assert.deepEqual(BADGES, ['off', 'steady', 'pulse']);
  assert.deepEqual(BUBBLE_SIZES, { small: 44, medium: 56, large: 68 });
});

test('nothing in, defaults out — with a null bubble position', () => {
  assert.deepEqual(normalizeSettings(undefined), { ...DEFAULTS, bubble: null });
  assert.deepEqual(normalizeSettings({}), { ...DEFAULTS, bubble: null });
  assert.deepEqual(normalizeSettings('junk'), { ...DEFAULTS, bubble: null });
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
});

// Before 2.2 the unread count was a switch; a saved boolean keeps meaning what it meant.
test('a boolean badge from an older settings.json migrates', () => {
  assert.equal(normalizeSettings({ badge: true }).badge, 'steady');
  assert.equal(normalizeSettings({ badge: false }).badge, 'off');
});

test('the bubble position rides along untouched', () => {
  assert.deepEqual(normalizeSettings({ bubble: { x: 10, y: 20 } }).bubble, { x: 10, y: 20 });
});

test('isSettingKey knows the eleven keys and nothing else', () => {
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
