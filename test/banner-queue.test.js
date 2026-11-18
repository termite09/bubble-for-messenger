const test = require('node:test');
const assert = require('node:assert');
const { createBannerQueue } = require('../src/renderer/banner-queue');

// A message that lands while the bubble is busy — the stack up, a reply being typed or sent —
// used to get no banner at all. It waits, newest message per chat, a few chats at most, and is
// shown once the bubble is free; opening that chat first makes the wait moot.
test('banners wait one per chat, oldest first, a few at most', () => {
  const q = createBannerQueue(3);
  q.add({ href: '/t/1/', preview: 'a' });
  q.add({ href: '/t/2/', preview: 'b' });
  q.add({ href: '/t/1/', preview: 'a2' }); // the newest message, at the back of the line
  assert.equal(q.size(), 2);
  q.add({ href: '/t/3/' });
  q.add({ href: '/t/4/' }); // over the limit: the oldest wait goes
  assert.deepEqual(
    [q.next(), q.next(), q.next(), q.next()].map((i) => i && i.href),
    ['/t/1/', '/t/3/', '/t/4/', null],
  );
});

test('a chat opened while its banner waits is dropped; the inbox drops them all', () => {
  const q = createBannerQueue();
  q.add({ href: '/t/1/' });
  q.add({ href: '/t/2/' });
  q.drop('/t/1/');
  assert.equal(q.next().href, '/t/2/');
  q.add({ href: '/t/3/' });
  q.clear();
  assert.equal(q.next(), null);
});

test('the bubble page loads the queue before its own script', () => {
  const html = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'src', 'renderer', 'bubble.html'),
    'utf8',
  );
  const queue = html.indexOf('<script src="banner-queue.js">');
  assert.ok(queue > 0 && queue < html.indexOf('<script src="bubble-renderer.js">'));
});
