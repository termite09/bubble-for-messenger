const test = require('node:test');
const assert = require('node:assert');
const { isInternal, browserUrl } = require('../lib/links');

test('messenger.com pages are internal', () => {
  assert.equal(isInternal('https://www.messenger.com/t/123'), true);
  assert.equal(isInternal('https://messenger.com/'), true);
});

test('link shim and lookalike hosts are not internal', () => {
  assert.equal(isInternal('https://l.messenger.com/l.php?u=https%3A%2F%2Fexample.com'), false);
  assert.equal(isInternal('https://messenger.com.evil.example/'), false);
  assert.equal(isInternal('https://evil.example/?x=messenger.com'), false);
  assert.equal(isInternal('not a url'), false);
});

test('browserUrl unwraps the link shim', () => {
  assert.equal(browserUrl('https://l.messenger.com/l.php?u=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1'), 'https://example.com/a?b=1');
  assert.equal(browserUrl('https://l.facebook.com/l.php?u=http%3A%2F%2Fexample.com'), 'http://example.com/');
});

test('browserUrl passes plain http(s) links through', () => {
  assert.equal(browserUrl('https://example.com/page'), 'https://example.com/page');
});

test('browserUrl refuses non-web schemes', () => {
  assert.equal(browserUrl('file:///etc/passwd'), null);
  assert.equal(browserUrl('javascript:alert(1)'), null);
  assert.equal(browserUrl('https://l.messenger.com/l.php?u=file%3A%2F%2F%2Fetc%2Fpasswd'), null);
  assert.equal(browserUrl('https://l.messenger.com/l.php'), null);
  assert.equal(browserUrl('garbage'), null);
});
