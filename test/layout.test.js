const test = require('node:test');
const assert = require('node:assert');
const { panelPosition, clampToArea, isClick } = require('../src/lib/layout');

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

const { fanLayout } = require('../src/lib/layout');

// Each fan row is a 44px head with an 8px gap (52px pitch), stacked away from the disc.
test('fan grows upward when there is room above the bubble', () => {
  const r = fanLayout({ x: 100, y: 500, width: 44, height: 44 }, 3, area);
  assert.equal(r.direction, 'up');
  assert.deepEqual(r.bounds, { x: 100, y: 344, width: 44, height: 200 });
});

test('fan grows downward near the top of the screen', () => {
  const r = fanLayout({ x: 100, y: 40, width: 44, height: 44 }, 3, area);
  assert.equal(r.direction, 'down');
  assert.deepEqual(r.bounds, { x: 100, y: 40, width: 44, height: 200 });
});

test('fan with no items is just the bubble', () => {
  const r = fanLayout({ x: 100, y: 500, width: 44, height: 44 }, 0, area);
  assert.deepEqual(r.bounds, { x: 100, y: 500, width: 44, height: 44 });
});

const { snapToEdge } = require('../src/lib/layout');

test('snapToEdge rests the bubble 16px in from the nearer side, keeping y', () => {
  assert.deepEqual(snapToEdge({ x: 100, y: 300, width: 64, height: 64 }, area), { x: 16, y: 300 });
  assert.deepEqual(snapToEdge({ x: 1300, y: 300, width: 64, height: 64 }, area), { x: 1360, y: 300 });
});

test('snapToEdge clamps y into the work area and respects a non-zero origin', () => {
  const off = { x: 1440, y: 0, width: 1440, height: 900 };
  assert.deepEqual(snapToEdge({ x: 1450, y: -50, width: 64, height: 64 }, off), { x: 1456, y: 0 });
  assert.deepEqual(snapToEdge({ x: 2800, y: 2000, width: 64, height: 64 }, off), { x: 2800, y: 836 });
});

const { windowFrame, PAD } = require('../src/lib/layout');

// The window is the content rect grown by PAD on every side (room for shadows and the count),
// and additionally stretched to reach a docked avatar at the panel's top edge.
test('windowFrame pads the content rect and reports the content offset inside it', () => {
  const f = windowFrame({ x: 100, y: 500, width: 44, height: 44 }, null);
  assert.deepEqual(f, { x: 100 - PAD, y: 500 - PAD, width: 44 + 2 * PAD, height: 44 + 2 * PAD, contentX: PAD, contentY: PAD });
});

test('windowFrame stretches up to a dock above the content, keeping the content where it was', () => {
  const f = windowFrame({ x: 100, y: 500, width: 44, height: 44 }, 300);
  assert.equal(f.y, 300 - PAD);
  assert.equal(f.height, 544 + PAD - (300 - PAD));
  assert.equal(f.contentY, 500 - 300 + PAD);
});

test('windowFrame ignores a dock that is already inside the content span', () => {
  const f = windowFrame({ x: 100, y: 300, width: 44, height: 244 }, 400);
  assert.equal(f.y, 300 - PAD);
  assert.equal(f.contentY, PAD);
});

const { centerWithin } = require('../src/lib/layout');

test('centerWithin measures from the rect centre', () => {
  const bubble = { x: 100, y: 100, width: 64, height: 64 }; // centre (132,132)
  assert.equal(centerWithin(bubble, { x: 132, y: 132 }, 70), true);
  assert.equal(centerWithin(bubble, { x: 190, y: 132 }, 70), true);  // 58px away
  assert.equal(centerWithin(bubble, { x: 132, y: 220 }, 70), false); // 88px away
});
