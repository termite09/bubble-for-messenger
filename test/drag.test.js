const test = require('node:test');
const assert = require('node:assert');
const { press, move, release } = require('../src/lib/drag');

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
  assert.equal(release(m.drag, { overDismiss: true }), 'dismiss');
  assert.equal(release(m.drag, { overDismiss: false }), 'snap');
});
