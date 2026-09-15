const test = require('node:test');
const assert = require('node:assert');
const {
  PAD,
  centerWithin,
  clampToArea,
  fanLayout,
  isClick,
  panelPosition,
  snapToEdge,
  windowFrame,
} = require('../src/lib/layout');

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
  const p = panelPosition(
    { x: 1500, y: 50, width: 64, height: 64 },
    { x: 1440, y: 0, width: 1440, height: 900 },
    panel,
  );
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

test('snapToEdge rests the bubble 16px in from the nearer side, keeping y', () => {
  assert.deepEqual(snapToEdge({ x: 100, y: 300, width: 64, height: 64 }, area), { x: 16, y: 300 });
  assert.deepEqual(snapToEdge({ x: 1300, y: 300, width: 64, height: 64 }, area), {
    x: 1360,
    y: 300,
  });
});

test('snapToEdge clamps y into the work area and respects a non-zero origin', () => {
  const off = { x: 1440, y: 0, width: 1440, height: 900 };
  assert.deepEqual(snapToEdge({ x: 1450, y: -50, width: 64, height: 64 }, off), { x: 1456, y: 0 });
  assert.deepEqual(snapToEdge({ x: 2800, y: 2000, width: 64, height: 64 }, off), {
    x: 2800,
    y: 836,
  });
});

// The window is the content rect grown by PAD on every side (room for shadows and the count),
// plus any room the landed banner asks for.
test('windowFrame pads the content rect and reports the content offset inside it', () => {
  const f = windowFrame({ x: 100, y: 500, width: 44, height: 44 });
  assert.deepEqual(f, {
    x: 100 - PAD,
    y: 500 - PAD,
    width: 44 + 2 * PAD,
    height: 44 + 2 * PAD,
    contentX: PAD,
    contentY: PAD,
  });
});

test('centerWithin measures from the rect centre', () => {
  const bubble = { x: 100, y: 100, width: 64, height: 64 }; // centre (132,132)
  assert.equal(centerWithin(bubble, { x: 132, y: 132 }, 70), true);
  assert.equal(centerWithin(bubble, { x: 190, y: 132 }, 70), true); // 58px away
  assert.equal(centerWithin(bubble, { x: 132, y: 220 }, 70), false); // 88px away
});

// While a reply is being typed the landed banner grows a second row below the disc; the
// window grows with it so the field and its shadow are never clipped.
test('windowFrame grows below the content by the extra it is given, keeping the content where it was', () => {
  const plain = windowFrame({ x: 100, y: 500, width: 44, height: 44 });
  const grown = windowFrame({ x: 100, y: 500, width: 44, height: 44 }, 40);
  assert.equal(grown.y, plain.y);
  assert.equal(grown.contentY, plain.contentY);
  assert.equal(grown.height, plain.height + 40);
  assert.deepEqual(windowFrame({ x: 100, y: 500, width: 44, height: 44 }, 0), plain);
});

// A larger disc means larger heads, gaps and shadows: the fan's pitch and the window's padding
// scale with it, so the column and its padding stay proportional at every bubble size.
test('fanLayout and windowFrame take a scale for a larger bubble', () => {
  const area = { x: 0, y: 0, width: 1440, height: 900 };
  const big = { x: 100, y: 500, width: 66, height: 66 };
  const r = fanLayout(big, 2, area, 1.5);
  assert.equal(r.bounds.height, 66 + 2 * 52 * 1.5);
  assert.equal(r.bounds.y, 500 - 2 * 52 * 1.5);
  const f = windowFrame(big, 0, 1.5);
  assert.equal(f.x, 100 - PAD * 1.5);
  assert.equal(f.width, 66 + 2 * PAD * 1.5);
  assert.equal(f.contentX, PAD * 1.5);
  // Scale 1 is exactly what it was.
  assert.deepEqual(
    fanLayout({ x: 100, y: 500, width: 44, height: 44 }, 3, area, 1),
    fanLayout({ x: 100, y: 500, width: 44, height: 44 }, 3, area),
  );
});

// The landed banner grows away from the screen edge: room above the content when the disc is
// near the bottom, below it otherwise. Content stays where it was on screen either way.
test('windowFrame takes room above and/or below, keeping the content in place', () => {
  const c = { x: 100, y: 500, width: 44, height: 44 };
  const above = windowFrame(c, { above: 60 });
  assert.equal(above.y, 500 - 60 - PAD);
  assert.equal(above.height, 44 + 60 + 2 * PAD);
  assert.equal(above.contentY, 60 + PAD);
  const below = windowFrame(c, { below: 60 });
  assert.equal(below.y, 500 - PAD);
  assert.equal(below.height, 44 + 60 + 2 * PAD);
  assert.equal(below.contentY, PAD);
  // A bare number still means "below", as before.
  assert.deepEqual(windowFrame(c, 36), windowFrame(c, { below: 36 }));
});

// A column taller than the work area fits neither way. Rather than push the disc off-screen,
// the fan keeps the disc where it is and shows as many rows as the roomier side holds.
test('fanLayout caps the rows when the column fits neither above nor below', () => {
  const area = { x: 0, y: 0, width: 800, height: 400 };
  const disc = { x: 100, y: 300, width: 44, height: 44 }; // 300 above, 56 below
  const r = fanLayout(disc, 11, area); // 11 × 52 = 572 > 400
  assert.equal(r.direction, 'up');
  assert.equal(r.shown, 5); // floor(300 / 52)
  assert.equal(r.bounds.y, 300 - 5 * 52);
  assert.equal(r.bounds.height, 44 + 5 * 52);
  // The disc's own row is untouched, and a fit reports every row shown.
  assert.equal(fanLayout(disc, 3, area).shown, 3);
  const low = { x: 100, y: 20, width: 44, height: 44 }; // more room below
  const d = fanLayout(low, 11, area);
  assert.equal(d.direction, 'down');
  assert.equal(d.shown, Math.floor((400 - 64) / 52));
  assert.equal(d.bounds.y, 20);
});
