const test = require('node:test');
const assert = require('node:assert');
const { connectionState, signedOut } = require('../src/lib/status');

test('connectionState: offline beats a dropped socket beats fine', () => {
  assert.equal(connectionState({ online: false, socketErrorAt: null }), 'offline');
  assert.equal(connectionState({ online: false, socketErrorAt: 5 }), 'offline');
  assert.equal(connectionState({ online: true, socketErrorAt: 5 }), 'reconnecting');
  assert.equal(connectionState({ online: true, socketErrorAt: null }), 'online');
});

// Messenger sends a signed-out session to a login or checkpoint page on its own hosts.
test('signedOut recognises the login and checkpoint pages', () => {
  assert.equal(signedOut('https://www.messenger.com/login/'), true);
  assert.equal(signedOut('https://www.messenger.com/login/?next=%2Ft%2F1'), true);
  assert.equal(signedOut('https://www.facebook.com/login.php?next=...'), true);
  assert.equal(signedOut('https://www.facebook.com/checkpoint/1501092823525282/'), true);
  assert.equal(signedOut('https://www.messenger.com/t/1/'), false);
  assert.equal(signedOut('https://www.messenger.com/'), false);
  assert.equal(signedOut('https://evil.example/login'), false);
  assert.equal(signedOut('not a url'), false);
});
