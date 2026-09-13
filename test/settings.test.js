const test = require('node:test');
const assert = require('node:assert');
const { DEFAULTS, THEMES, normalizeSettings, isSettingKey } = require('../src/lib/settings');

test('defaults are what the spec says', () => {
  assert.deepEqual(DEFAULTS, {
    overFullscreen: true, startAtLogin: false, banner: true, bannerPreview: true, quickReply: true,
    notifications: true, badge: true, theme: 'system', spellcheck: true, blockTelemetry: true,
  });
  assert.deepEqual(THEMES, ['system', 'light', 'dark']);
});

test('nothing in, defaults out — with a null bubble position', () => {
  assert.deepEqual(normalizeSettings(undefined), { ...DEFAULTS, bubble: null });
  assert.deepEqual(normalizeSettings({}), { ...DEFAULTS, bubble: null });
  assert.deepEqual(normalizeSettings('junk'), { ...DEFAULTS, bubble: null });
});

test('booleans are coerced, theme is validated, unknown keys are dropped', () => {
  const out = normalizeSettings({ banner: 0, badge: 'yes', theme: 'dark', zoom: 150, startAtLogin: 1 });
  assert.equal(out.banner, false);
  assert.equal(out.badge, true);
  assert.equal(out.theme, 'dark');
  assert.equal(out.startAtLogin, true);
  assert.equal('zoom' in out, false);
  assert.equal(normalizeSettings({ theme: 'sepia' }).theme, 'system');
});

test('the bubble position rides along untouched', () => {
  assert.deepEqual(normalizeSettings({ bubble: { x: 10, y: 20 } }).bubble, { x: 10, y: 20 });
});

test('isSettingKey knows the ten keys and nothing else', () => {
  for (const k of Object.keys(DEFAULTS)) assert.equal(isSettingKey(k), true, k);
  assert.equal(isSettingKey('bubble'), false);
  assert.equal(isSettingKey('__proto__'), false);
  assert.equal(isSettingKey(undefined), false);
});
