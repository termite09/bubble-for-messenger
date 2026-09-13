const test = require('node:test');
const assert = require('node:assert');
const { isAvatarUrl } = require('../src/main/avatars');

test('isAvatarUrl accepts only https images on Meta hosts', () => {
  assert.equal(isAvatarUrl('https://scontent.xx.fbcdn.net/v/t1.jpg'), true);
  assert.equal(isAvatarUrl('https://www.messenger.com/img.png'), true);
  assert.equal(isAvatarUrl('http://scontent.xx.fbcdn.net/v/t1.jpg'), false);
  assert.equal(isAvatarUrl('https://fbcdn.net.evil.example/x.jpg'), false);
  assert.equal(isAvatarUrl('file:///etc/passwd'), false);
  assert.equal(isAvatarUrl('not a url'), false);
});
