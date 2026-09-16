const test = require('node:test');
const assert = require('node:assert');
const { unreadFromTitle, nameFromTitle } = require('../src/lib/unread');

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

// The open thread's name, as the title carries it: "(N) Name | Messenger". No name on the
// inbox ("Messenger", "Chats | Messenger") or during a flash.
test('nameFromTitle reads the open chat’s name out of the title', () => {
  assert.equal(nameFromTitle('Alex | Messenger'), 'Alex');
  assert.equal(nameFromTitle('(3) Alex Smith | Messenger'), 'Alex Smith');
  assert.equal(nameFromTitle('(20+) A | B | Messenger'), 'A | B');
  assert.equal(nameFromTitle('Messenger'), null);
  assert.equal(nameFromTitle('Chats | Messenger'), null);
  assert.equal(nameFromTitle('Alex messaged you'), null);
  assert.equal(nameFromTitle(undefined), null);
});
