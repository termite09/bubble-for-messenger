const test = require('node:test');
const assert = require('node:assert');
const { raiseOrder, LEVEL_RANK } = require('../src/lib/stacking');

// On Windows every always-on-top window is one tier and the last shown is on top. macOS's
// levels are kept by hand: when a window shows, every visible window of a higher level is
// raised over it again, lowest first, so the order ends up as the levels say.
test('showing a floating window raises the visible screen-saver windows over it', () => {
  const bubble = { level: 'screen-saver', visible: true, id: 'bubble' };
  const dismiss = { level: 'screen-saver', visible: false, id: 'dismiss' };
  const shield = { level: 'floating', visible: true, id: 'shield' };
  const panel = { level: 'floating', visible: true, id: 'panel' };
  assert.deepEqual(
    raiseOrder('floating', [bubble, dismiss, shield, panel]).map((e) => e.id),
    ['bubble'],
  );
});

test('showing the highest level raises nothing; hidden windows are left alone', () => {
  const bubble = { level: 'screen-saver', visible: true };
  const panel = { level: 'floating', visible: true };
  assert.deepEqual(raiseOrder('screen-saver', [bubble, panel]), []);
  assert.deepEqual(raiseOrder('normal', [{ level: 'floating', visible: false }]), []);
});

test('several higher levels come back lowest first', () => {
  const a = { level: 'screen-saver', visible: true, id: 'a' };
  const b = { level: 'status', visible: true, id: 'b' };
  const c = { level: 'floating', visible: true, id: 'c' };
  assert.deepEqual(
    raiseOrder('normal', [a, b, c]).map((e) => e.id),
    ['c', 'b', 'a'],
  );
  assert.ok(LEVEL_RANK.floating < LEVEL_RANK['screen-saver']);
});
