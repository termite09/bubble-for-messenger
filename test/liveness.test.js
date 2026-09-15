const test = require('node:test');
const assert = require('node:assert');
const {
  initial,
  reduce,
  decide,
  SOCKET_GRACE_MS,
  STALE_MS,
  BACKOFF_MS,
} = require('../src/lib/liveness');

const MIN = 60 * 1000;
const up = { visible: false, online: true };
const play = (events) => events.reduce((s, [ev, t]) => reduce(s, ev, t), initial(0));

test('a page just loaded, with traffic, never reloads', () => {
  const s = play([
    ['loaded', 0],
    ['socket-open', 1000],
    ['request-ok', 5 * MIN],
  ]);
  assert.deepEqual(decide(s, { ...up, now: 9 * MIN }), { reload: false, reason: null });
});

test('waking from sleep reloads once, when online, and never while the panel shows', () => {
  let s = play([
    ['loaded', 0],
    ['resume', 60 * MIN],
  ]);
  assert.deepEqual(decide(s, { visible: true, online: true, now: 60 * MIN + 1 }), {
    reload: false,
    reason: 'visible',
  });
  assert.deepEqual(decide(s, { visible: false, online: false, now: 60 * MIN + 1 }), {
    reload: false,
    reason: 'offline',
  });
  assert.deepEqual(decide(s, { ...up, now: 60 * MIN + 1 }), { reload: true, reason: 'resume' });
  s = reduce(s, 'reload', 60 * MIN + 1);
  s = reduce(s, 'loaded', 60 * MIN + 5000);
  assert.equal(decide(s, { ...up, now: 61 * MIN }).reload, false);
});

test('a connection that errored and did not come back within the grace period reloads', () => {
  let s = play([
    ['loaded', 0],
    ['socket-open', 1000],
    ['request-ok', 9 * MIN],
    ['socket-error', 10 * MIN],
  ]);
  assert.equal(decide(s, { ...up, now: 10 * MIN + SOCKET_GRACE_MS - 1 }).reload, false);
  assert.deepEqual(decide(s, { ...up, now: 10 * MIN + SOCKET_GRACE_MS }), {
    reload: true,
    reason: 'socket-error',
  });
  // ...unless it reconnected on its own.
  s = reduce(s, 'socket-open', 10 * MIN + 30000);
  assert.equal(decide(s, { ...up, now: 20 * MIN }).reload, false);
});

test('no completed request for a long while, online, means a stall', () => {
  const s = play([
    ['loaded', 0],
    ['request-ok', 2 * MIN],
  ]);
  assert.equal(decide(s, { ...up, now: 2 * MIN + STALE_MS - 1 }).reload, false);
  assert.deepEqual(decide(s, { ...up, now: 2 * MIN + STALE_MS }), {
    reload: true,
    reason: 'stale',
  });
  assert.equal(decide(s, { visible: false, online: false, now: 2 * MIN + STALE_MS }).reload, false);
});

test('a failed load is retried with the error backoff', () => {
  let s = play([
    ['loaded', 0],
    ['fail-load', 5 * MIN],
  ]);
  assert.equal(decide(s, { ...up, now: 5 * MIN + 1000 }).reload, false);
  assert.deepEqual(decide(s, { ...up, now: 5 * MIN + 15000 }), {
    reload: true,
    reason: 'fail-load',
  });
});

test('reloads back off while nothing improves, and the backoff resets once the page is alive again', () => {
  let s = play([
    ['loaded', 0],
    ['resume', 10 * MIN],
  ]);
  s = reduce(s, 'reload', 10 * MIN);
  s = reduce(s, 'resume', 10 * MIN + 1000); // another wake right after
  assert.equal(decide(s, { ...up, now: 10 * MIN + 2000 }).reload, false); // within the first backoff
  assert.equal(decide(s, { ...up, now: 10 * MIN + BACKOFF_MS[0] }).reload, true);
  s = reduce(s, 'reload', 10 * MIN + BACKOFF_MS[0]);
  s = reduce(s, 'resume', 10 * MIN + BACKOFF_MS[0] + 1000);
  assert.equal(decide(s, { ...up, now: 10 * MIN + BACKOFF_MS[0] + BACKOFF_MS[0] }).reload, false); // second backoff is longer
  assert.equal(decide(s, { ...up, now: 10 * MIN + BACKOFF_MS[0] + BACKOFF_MS[1] }).reload, true);
  // Alive again (a socket opened a while after the reload): the next reason is honoured promptly.
  s = reduce(s, 'reload', 20 * MIN);
  s = reduce(s, 'loaded', 20 * MIN + 3000);
  s = reduce(s, 'socket-open', 20 * MIN + 2 * MIN);
  s = reduce(s, 'resume', 30 * MIN);
  assert.equal(decide(s, { ...up, now: 30 * MIN + BACKOFF_MS[0] }).reload, true);
});

// The Mac's dark wakes run the app for a moment with no network: nothing that happens between
// suspend and resume is a reason to reload; the resume itself is.
test('asleep means no reloads, whatever the page looks like; the wake reloads once', () => {
  let s = play([
    ['loaded', 0],
    ['request-ok', MIN],
    ['suspend', 2 * MIN],
  ]);
  assert.deepEqual(decide(s, { ...up, now: 30 * MIN }), { reload: false, reason: 'asleep' });
  s = reduce(s, 'resume', 60 * MIN);
  assert.deepEqual(decide(s, { ...up, now: 60 * MIN + 1 }), { reload: true, reason: 'resume' });
});
