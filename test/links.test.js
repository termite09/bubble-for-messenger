const test = require('node:test');
const assert = require('node:assert');
const { isInternal, browserUrl } = require('../src/lib/links');

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

test('browserUrl unwraps the mobile shim and the bare facebook.com/l.php form', () => {
  assert.equal(browserUrl('https://lm.facebook.com/l.php?u=https%3A%2F%2Fexample.com%2F'), 'https://example.com/');
  assert.equal(browserUrl('https://www.facebook.com/l.php?u=https%3A%2F%2Fexample.com%2F&h=x'), 'https://example.com/');
  assert.equal(browserUrl('https://facebook.com/l.php?u=https%3A%2F%2Fexample.com%2F'), 'https://example.com/');
  // Only that exact path is a shim; anything else on facebook.com is a page of its own.
  assert.equal(browserUrl('https://www.facebook.com/lol.php?u=https%3A%2F%2Fexample.com%2F'), 'https://www.facebook.com/lol.php?u=https%3A%2F%2Fexample.com%2F');
});

test('the mobile shim and facebook.com/l.php never stay in the panel', () => {
  assert.equal(staysInPanel('https://lm.facebook.com/l.php?u=https%3A%2F%2Fexample.com'), false);
  assert.equal(staysInPanel('https://www.facebook.com/l.php?u=https%3A%2F%2Fexample.com'), false);
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

const { staysInPanel } = require('../src/lib/links');

test('staysInPanel allows messenger.com and facebook.com auth pages', () => {
  assert.equal(staysInPanel('https://www.messenger.com/t/1/'), true);
  assert.equal(staysInPanel('https://www.facebook.com/two_step_verification/authentication/?x=1'), true);
  assert.equal(staysInPanel('https://www.facebook.com/checkpoint/'), true);
});

test('staysInPanel rejects other hosts, lookalikes and non-web schemes', () => {
  assert.equal(staysInPanel('https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.com'), false);
  assert.equal(staysInPanel('https://facebook.com.evil.example/'), false);
  assert.equal(staysInPanel('https://example.com/'), false);
  assert.equal(staysInPanel('javascript:alert(1)'), false);
});

const { isMetaHost } = require('../src/lib/links');

test('isMetaHost matches Meta domains by suffix only, with or without a leading dot', () => {
  assert.equal(isMetaHost('.facebook.com'), true);
  assert.equal(isMetaHost('www.messenger.com'), true);
  assert.equal(isMetaHost('notfacebook.com'), false);
  assert.equal(isMetaHost('facebook.com.evil.example'), false);
  assert.equal(isMetaHost(undefined), false);
});

// Meta's /l.php link shim exists on messenger.com too (and on any of its subdomains): it is a
// redirect out, never a page to keep in the panel with the session.
test('/l.php on messenger.com hosts is the link shim, not an internal page', () => {
  for (const host of ['www.messenger.com', 'messenger.com', 'm.facebook.com']) {
    const url = `https://${host}/l.php?u=https%3A%2F%2Fexample.com%2Fx`;
    assert.equal(isInternal(url), false, host);
    assert.equal(staysInPanel(url), false, host);
    assert.equal(browserUrl(url), 'https://example.com/x', host);
  }
  assert.equal(isInternal('https://www.messenger.com/lol.php'), true);
  assert.equal(isInternal('https://www.messenger.com/l.php/extra'), true);
});

// facebook.com/flx/warn/ is the "you're leaving Facebook" interstitial the link shim 302s to;
// it carries the destination in ?u= just like l.php and is never a page to keep.
test('the flx/warn interstitial is a redirect too', () => {
  const url = 'https://www.facebook.com/flx/warn/?u=https%3A%2F%2Fexample.com%2Fx&h=abc';
  assert.equal(staysInPanel(url), false);
  assert.equal(browserUrl(url), 'https://example.com/x');
});
