const test = require('node:test');
const assert = require('node:assert');
const { decideReply, validReply, MAX_REPLY_CHARS } = require('../src/lib/reply');

const ready = {
  onThread: true,
  composerReady: true,
  composerEmpty: true,
  draftMatches: false,
  sendAvailable: false,
};

test('waits until the page is on the thread with a composer', () => {
  assert.deepEqual(decideReply('waiting', { ...ready, onThread: false }, false), {
    action: 'wait',
    phase: 'waiting',
  });
  assert.deepEqual(decideReply('waiting', { ...ready, composerReady: false }, false), {
    action: 'wait',
    phase: 'waiting',
  });
});

test('inserts into an empty composer', () => {
  assert.deepEqual(decideReply('waiting', ready, false), { action: 'insert', phase: 'inserted' });
});

test('never merges into a draft the user already wrote', () => {
  assert.deepEqual(decideReply('waiting', { ...ready, composerEmpty: false }, false), {
    action: 'failure',
    phase: 'waiting',
  });
});

test('gives up waiting once the budget is spent', () => {
  assert.deepEqual(decideReply('waiting', { ...ready, onThread: false }, true), {
    action: 'failure',
    phase: 'waiting',
  });
});

test('sends once the draft is in the composer and Send is available', () => {
  const inserted = { ...ready, composerEmpty: false, draftMatches: true, sendAvailable: true };
  assert.deepEqual(decideReply('inserted', inserted, false), {
    action: 'send',
    phase: 'confirming',
  });
});

test('after inserting, the editor gets time to show the draft — until the budget runs out', () => {
  // Messenger's editor reconciles the DOM a tick after insertText lands.
  assert.deepEqual(
    decideReply('inserted', { ...ready, draftMatches: false, sendAvailable: true }, false),
    { action: 'wait', phase: 'inserted' },
  );
  assert.equal(
    decideReply('inserted', { ...ready, draftMatches: false, sendAvailable: true }, true).action,
    'failure',
  );
});

test('after inserting, a draft that is there but not focused is a failure (Enter must not go elsewhere)', () => {
  assert.equal(
    decideReply(
      'inserted',
      { ...ready, composerEmpty: false, draftMatches: true, sendAvailable: false },
      false,
    ).action,
    'failure',
  );
});

test('leaving the thread after inserting is a failure', () => {
  assert.equal(decideReply('inserted', { ...ready, onThread: false }, false).action, 'failure');
  assert.equal(
    decideReply('confirming', { ...ready, composerReady: false }, false).action,
    'failure',
  );
});

test('the send is confirmed by the composer emptying', () => {
  assert.deepEqual(
    decideReply('confirming', { ...ready, composerEmpty: false, draftMatches: true }, false),
    { action: 'wait', phase: 'confirming' },
  );
  assert.deepEqual(decideReply('confirming', ready, false), {
    action: 'success',
    phase: 'confirming',
  });
  assert.equal(
    decideReply('confirming', { ...ready, composerEmpty: false, draftMatches: true }, true).action,
    'failure',
  );
});

test('validReply requires a clean thread href and bounded text', () => {
  assert.equal(validReply('/t/123/', 'hi'), true);
  assert.equal(validReply('/e2ee/t/123/', 'x'.repeat(MAX_REPLY_CHARS)), true);
  assert.equal(validReply('/t/123/', '   '), false);
  assert.equal(validReply('/t/123/', 'x'.repeat(MAX_REPLY_CHARS + 1)), false);
  assert.equal(validReply('/marketplace/', 'hi'), false);
  assert.equal(validReply('/t/123/', 42), false);
});
