const test = require('node:test');
const assert = require('node:assert');
const { press, move, release, armed, ARM_MS } = require('../src/lib/drag');

const area = { x: 0, y: 0, width: 1000, height: 800 };
const anchor = { x: 100, y: 100 };
const size = 44;

test('a press that does not leave the wobble radius is a click; one that folded the stack is nothing', () => {
  let d = press({ cursor: { x: 110, y: 110 }, anchor, expanded: false });
  const m = move(d, { cursor: { x: 112, y: 111 }, anchor, size, area });
  assert.equal(m.position, null);
  assert.equal(m.becameDrag, false);
  assert.equal(release(m.drag, { overDismiss: false }), 'click');
  d = press({ cursor: { x: 110, y: 110 }, anchor, expanded: true });
  assert.equal(release(d, { overDismiss: false }), 'nothing');
});

test('beyond the radius the disc follows the cursor, clamped to the display', () => {
  const d = press({ cursor: { x: 110, y: 110 }, anchor, expanded: false });
  const m = move(d, { cursor: { x: 210, y: 130 }, anchor, size, area });
  assert.equal(m.becameDrag, true);
  assert.deepEqual(m.position, { x: 200, y: 120 });
  const off = move(m.drag, { cursor: { x: 5, y: 5 }, anchor: m.position, size, area });
  assert.deepEqual(off.position, { x: 0, y: 0 });
  // No movement: no position.
  const still = move(off.drag, { cursor: { x: 5, y: 5 }, anchor: { x: 0, y: 0 }, size, area });
  assert.equal(still.position, null);
  assert.equal(still.becameDrag, false);
});

test('the ✕ target hears only when hot changes; a drop on it dismisses, elsewhere snaps', () => {
  const d = press({ cursor: { x: 110, y: 110 }, anchor, expanded: false });
  const over = (p) => p.x > 400;
  let m = move(d, { cursor: { x: 210, y: 130 }, anchor, size, area, overDismiss: over });
  assert.equal(m.hotChanged, false);
  m = move(m.drag, {
    cursor: { x: 510, y: 130 },
    anchor: m.position,
    size,
    area,
    overDismiss: over,
  });
  assert.equal(m.hotChanged, true);
  assert.equal(m.drag.hot, true);
  m = move(m.drag, {
    cursor: { x: 520, y: 130 },
    anchor: m.position,
    size,
    area,
    overDismiss: over,
  });
  assert.equal(m.hotChanged, false);
  // Over the target, but not for long: a snap. Rested there for the arming time: a dismissal.
  assert.equal(release(m.drag, { overDismiss: true, now: 100 }), 'snap');
  assert.equal(release(m.drag, { overDismiss: true, now: ARM_MS }), 'dismiss');
  assert.equal(release(m.drag, { overDismiss: false, now: ARM_MS }), 'snap');
  assert.equal(armed(m.drag, ARM_MS - 1), false);
  assert.equal(armed(m.drag, ARM_MS), true);
});

// The snap to the edge used to be eight fixed steps on a 12 ms timer (about 96 ms, ease-out-
// quad): off the design's one curve, and uneven whenever a tick ran late. It is now read off the
// clock, on the system curve (ease-out-quint, 220 ms).
const { snapX, frameInterval, SNAP_MS } = require('../src/lib/drag');
test('the snap follows the clock on the ease-out-quint curve, 220 ms long', () => {
  assert.equal(SNAP_MS, 220);
  assert.equal(snapX(1080, 1380, 0), 1080);
  assert.equal(snapX(1080, 1380, 110), Math.round(1080 + 300 * (1 - 0.5 ** 5)));
  assert.equal(snapX(1080, 1380, 220), 1380);
  assert.equal(snapX(1080, 1380, 5000), 1380);
  assert.equal(snapX(400, 16, 110), Math.round(400 - 384 * (1 - 0.5 ** 5))); // leftward too
});

// The disc follows the cursor once per frame of the display it is on: a 16 ms tick held it to
// about 60 Hz on a 120 Hz screen.
test('the drag and snap tick once per frame of the display', () => {
  assert.equal(frameInterval(120), 8);
  assert.equal(frameInterval(60), 16);
  assert.equal(frameInterval(0), 16); // unknown
  assert.equal(frameInterval(undefined), 16);
  assert.equal(frameInterval(1000), 4); // not faster than that
});
