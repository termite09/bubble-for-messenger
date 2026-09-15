const test = require('node:test');
const assert = require('node:assert');
const { unreadFromTitle } = require('../src/lib/unread');

test('plain title has no unread', () => assert.equal(unreadFromTitle('Messenger'), 0));
test('parses count prefix', () => assert.equal(unreadFromTitle('(3) Messenger'), 3));
test('parses count with conversation name', () =>
  assert.equal(unreadFromTitle('(12) Alex | Messenger'), 12));
test('parses overflow marker', () => assert.equal(unreadFromTitle('(20+) Messenger'), 20));
test('tolerates empty/undefined', () => {
  assert.equal(unreadFromTitle(''), 0);
  assert.equal(unreadFromTitle(undefined), 0);
});

// While a chat is unread Messenger flashes the title between "(1) Messenger" and "Name messaged
// you". The flash carries no count but is not "nothing unread": it must not blink the badge.
test('a "messaged you" flash is unknown, not zero', () => {
  assert.equal(unreadFromTitle('Vasilis messaged you'), null);
  assert.equal(unreadFromTitle('Alex and Kim messaged you'), null);
});
test('a plain title with or without a chat name is zero', () => {
  assert.equal(unreadFromTitle('Alex | Messenger'), 0);
  assert.equal(unreadFromTitle('Chats | Messenger'), 0);
});
