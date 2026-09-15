const test = require('node:test');
const assert = require('node:assert');
const {
  bubbleLayout,
  stackBounds,
  resizeAnchor,
  edgeOf,
  BASE,
  BANNER,
} = require('../src/lib/bubble-layout');
const { PAD, FAN_ITEM, EDGE_MARGIN } = require('../src/lib/layout');

const area = { x: 0, y: 0, width: 1440, height: 900 };
const right = { x: 1440 - 44 - EDGE_MARGIN, y: 800 }; // resting at the right edge, near the bottom

test('a lone disc on the right: the window spans the banner toward the centre, the page places the disc at its far side', () => {
  const l = bubbleLayout({ anchor: right, size: 44, scale: 1, fanCount: 0, bannerExtra: 0, area });
  assert.equal(l.direction, 'up');
  assert.deepEqual(l.window, {
    x: right.x + 44 - BANNER - PAD,
    y: right.y - PAD,
    width: BANNER + 2 * PAD,
    height: 44 + 2 * PAD,
  });
  assert.equal(l.renderer.edge, 'right');
  assert.equal(l.renderer.contentX, PAD + BANNER - 44);
  assert.equal(l.renderer.contentY, PAD);
  assert.deepEqual(
    [l.renderer.base, l.renderer.banner, l.renderer.pitch],
    [BASE, BANNER, FAN_ITEM],
  );
});

test('a stack grows up from the disc; the page anchors the disc at the column foot', () => {
  const l = bubbleLayout({ anchor: right, size: 44, scale: 1, fanCount: 3, bannerExtra: 0, area });
  assert.equal(l.direction, 'up');
  assert.equal(l.window.height, 44 + 3 * FAN_ITEM + 2 * PAD);
  assert.equal(l.renderer.contentY, PAD + 3 * FAN_ITEM);
  assert.equal(l.shown, 3);
});

test("the banner's extra rows go above the disc when there is room, and cross over in page px", () => {
  const l = bubbleLayout({
    anchor: right,
    size: 66,
    scale: 1.5,
    fanCount: 0,
    bannerExtra: 60,
    area,
  });
  assert.equal(l.direction, 'up');
  assert.equal(l.window.height, 66 + 90 + 2 * PAD * 1.5);
  assert.equal(l.renderer.contentY, (PAD * 1.5 + 90) / 1.5);
  const top = bubbleLayout({
    anchor: { x: 10, y: 10 },
    size: 44,
    scale: 1,
    fanCount: 0,
    bannerExtra: 60,
    area,
  });
  assert.equal(top.direction, 'down');
  assert.equal(top.renderer.contentY, PAD);
});

test('stackBounds is the disc alone, or the column beside which the panel sits', () => {
  assert.deepEqual(
    stackBounds({ anchor: right, size: 44, scale: 1, fanCount: 0, bannerExtra: 0, area }),
    { ...right, width: 44, height: 44 },
  );
  const s = stackBounds({ anchor: right, size: 44, scale: 1, fanCount: 2, bannerExtra: 0, area });
  assert.deepEqual(s, {
    x: right.x,
    y: right.y - 2 * FAN_ITEM,
    width: 44,
    height: 44 + 2 * FAN_ITEM,
  });
});

test('resizeAnchor keeps the centre, or the edge it rests on, and re-snaps to the side', () => {
  const bottom = { x: 16, y: 900 - 44 };
  const big = resizeAnchor(bottom, 44, 68, area);
  assert.deepEqual(big, { x: EDGE_MARGIN, y: 900 - 68 });
  assert.deepEqual(resizeAnchor(big, 68, 44, area), bottom);
  const mid = resizeAnchor({ x: 16, y: 400 }, 44, 68, area);
  assert.deepEqual(mid, { x: EDGE_MARGIN, y: 400 - 12 });
  assert.equal(edgeOf({ x: 1000, y: 0 }, 44, area), 'right');
  assert.equal(edgeOf({ x: 100, y: 0 }, 44, area), 'left');
});
