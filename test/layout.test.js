const test = require('node:test');
const assert = require('node:assert');
const { panelPosition, clampToArea, isClick } = require('../lib/layout');

const area = { x: 0, y: 0, width: 1440, height: 900 };
const panel = { width: 420, height: 640 };

test('panel opens to the right of the bubble by default', () => {
  const p = panelPosition({ x: 100, y: 100, width: 64, height: 64 }, area, panel);
  assert.deepEqual(p, { x: 172, y: 100 });
});

test('panel flips to the left near the right edge', () => {
  const p = panelPosition({ x: 1350, y: 100, width: 64, height: 64 }, area, panel);
  assert.deepEqual(p, { x: 922, y: 100 });
});

test('panel shifts up near the bottom edge', () => {
  const p = panelPosition({ x: 100, y: 800, width: 64, height: 64 }, area, panel);
  assert.deepEqual(p, { x: 172, y: 260 });
});

test('panel respects a display whose origin is not 0,0', () => {
  const p = panelPosition({ x: 1500, y: 50, width: 64, height: 64 }, { x: 1440, y: 0, width: 1440, height: 900 }, panel);
  assert.deepEqual(p, { x: 1572, y: 50 });
});

test('clampToArea keeps a rect on screen', () => {
  assert.deepEqual(clampToArea({ x: -50, y: 2000, width: 64, height: 64 }, area), { x: 0, y: 836 });
  assert.deepEqual(clampToArea({ x: 10, y: 10, width: 64, height: 64 }, area), { x: 10, y: 10 });
});

test('isClick uses a 4px threshold', () => {
  assert.equal(isClick(3, 0), true);
  assert.equal(isClick(0, 4), true);
  assert.equal(isClick(5, 0), false);
});

const { fanLayout } = require('../lib/layout');

test('fan grows upward when there is room above the bubble', () => {
  const r = fanLayout({ x: 100, y: 500, width: 64, height: 64 }, 3, area);
  assert.equal(r.direction, 'up');
  assert.deepEqual(r.bounds, { x: 100, y: 332, width: 64, height: 232 });
});

test('fan grows downward near the top of the screen', () => {
  const r = fanLayout({ x: 100, y: 40, width: 64, height: 64 }, 3, area);
  assert.equal(r.direction, 'down');
  assert.deepEqual(r.bounds, { x: 100, y: 40, width: 64, height: 232 });
});

test('fan with no items is just the bubble', () => {
  const r = fanLayout({ x: 100, y: 500, width: 64, height: 64 }, 0, area);
  assert.deepEqual(r.bounds, { x: 100, y: 500, width: 64, height: 64 });
});
