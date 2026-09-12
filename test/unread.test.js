const test = require('node:test');
const assert = require('node:assert');
const { unreadFromTitle } = require('../lib/unread');

test('plain title has no unread', () => assert.equal(unreadFromTitle('Messenger'), 0));
test('parses count prefix', () => assert.equal(unreadFromTitle('(3) Messenger'), 3));
test('parses count with conversation name', () => assert.equal(unreadFromTitle('(12) Alex | Messenger'), 12));
test('parses overflow marker', () => assert.equal(unreadFromTitle('(20+) Messenger'), 20));
test('tolerates empty/undefined', () => {
  assert.equal(unreadFromTitle(''), 0);
  assert.equal(unreadFromTitle(undefined), 0);
});
