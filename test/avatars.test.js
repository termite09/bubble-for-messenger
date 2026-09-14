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

const { fetchAvatar } = require('../src/main/avatars');

// A fake session whose fetch answers with the given headers and body.
const sessionWith = (headers, body = Buffer.from('img'), ok = true) => ({
  fetch: async () => ({ ok, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, arrayBuffer: async () => body }),
});

test('fetchAvatar accepts raster images only, within the size cap', async () => {
  const url = (n) => `https://scontent.xx.fbcdn.net/v/t39/${n}.jpg`;
  assert.equal(await fetchAvatar(sessionWith({ 'content-type': 'image/jpeg; charset=binary' }), url(1)), 'data:image/jpeg;base64,aW1n');
  assert.equal(await fetchAvatar(sessionWith({ 'content-type': 'image/svg+xml' }), url(2)), null);
  assert.equal(await fetchAvatar(sessionWith({ 'content-type': 'text/html' }), url(3)), null);
  assert.equal(await fetchAvatar(sessionWith({ 'content-type': 'image/png', 'content-length': String(2 * 1024 * 1024) }), url(4)), null);
  assert.equal(await fetchAvatar(sessionWith({ 'content-type': 'image/png' }, Buffer.alloc(1024 * 1024 + 1)), url(5)), null);
  assert.equal(await fetchAvatar(sessionWith({ 'content-type': 'image/png' }, Buffer.from('x'), false), url(6)), null);
});
