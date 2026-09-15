const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSettingsStore } = require('../src/main/settings-store');
const { normalizeSettings, DEFAULTS } = require('../src/lib/settings');

const tmpStore = (initial) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bubble-settings-'));
  const file = path.join(dir, 'settings.json');
  if (initial !== undefined) fs.writeFileSync(file, initial);
  return { dir, file, store: createSettingsStore({ file, normalize: normalizeSettings }) };
};

test('a missing file means defaults and "did not exist"; a saved file comes back normalised', () => {
  const { dir, file, store } = tmpStore();
  assert.equal(store.existed, false);
  assert.deepEqual(store.get(), { ...DEFAULTS, bubble: null, pins: [] });
  store.set('theme', 'dark');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).theme, 'dark');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const again = createSettingsStore({ file, normalize: normalizeSettings });
  assert.equal(again.existed, true);
  assert.equal(again.get().theme, 'dark');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('set/patch normalise, refuse unknown keys, save once, and tell subscribers', () => {
  const { dir, store } = tmpStore('{}');
  const seen = [];
  store.subscribe((s, prev) => seen.push([prev.theme, s.theme]));
  const before = store.get();
  assert.equal(store.set('zoom', 150), before); // not a key: nothing happens
  store.set('theme', 'sepia'); // not a value: default stays
  assert.equal(store.get().theme, 'system');
  store.patch({ pins: [{ href: '/t/1/', name: 'A', avatarUrl: null }], badge: 'pulse' });
  assert.equal(store.get().badge, 'pulse');
  assert.equal(store.get().pins.length, 1);
  assert.deepEqual(seen, [
    ['system', 'system'],
    ['system', 'system'],
  ]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a corrupt file is kept aside, not overwritten, and defaults are used', () => {
  const { dir, file, store } = tmpStore('{ not json');
  assert.equal(store.existed, true);
  assert.equal(store.corrupt, true);
  store.set('theme', 'dark');
  const kept = fs.readdirSync(dir).find((n) => n.startsWith('settings.json.corrupt-'));
  assert.ok(kept);
  assert.equal(fs.readFileSync(path.join(dir, kept), 'utf8'), '{ not json');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).theme, 'dark');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the bubble position is saved a moment later, not on every move', async () => {
  const { dir, file, store } = tmpStore('{}');
  store.setPosition({ x: 1, y: 2 });
  store.setPosition({ x: 3, y: 4 });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).bubble, undefined);
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).bubble, { x: 3, y: 4 });
  assert.deepEqual(store.get().bubble, { x: 3, y: 4 });
  fs.rmSync(dir, { recursive: true, force: true });
});
