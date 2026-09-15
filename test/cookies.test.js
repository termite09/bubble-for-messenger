const test = require('node:test');
const assert = require('node:assert');
const {
  shouldPersistCookie,
  persistentCookie,
  LOGIN_COOKIES,
  PERSIST_DAYS,
} = require('../src/lib/cookies');

const base = {
  name: 'xs',
  value: 'v',
  domain: '.messenger.com',
  hostOnly: false,
  path: '/',
  secure: true,
  httpOnly: true,
  session: true,
  sameSite: 'lax',
};

// Only the login pair (and Facebook's device cookies) are kept past the session, whenever the
// site sets them as session cookies, and only on Meta's hosts.
test('shouldPersistCookie: session login cookies from the site, nothing else', () => {
  assert.equal(shouldPersistCookie(base, 'explicit', false), true);
  assert.equal(shouldPersistCookie({ ...base, name: 'c_user' }, 'explicit', false), true);
  assert.equal(shouldPersistCookie({ ...base, name: 'presence' }, 'explicit', false), false); // transient
  assert.equal(shouldPersistCookie({ ...base, name: 'wd' }, 'explicit', false), false);
  assert.equal(shouldPersistCookie({ ...base, session: false }, 'explicit', false), false); // already persistent (our own rewrite included)
  assert.equal(shouldPersistCookie(base, 'inserted-no-change-overwrite', false), true); // a same-value re-issue drops the expiry
  assert.equal(shouldPersistCookie(base, 'overwrite', false), true);
  assert.equal(shouldPersistCookie(base, 'explicit', true), false); // a removal
  assert.equal(shouldPersistCookie({ ...base, domain: '.evil.com' }, 'explicit', false), false);
  assert.equal(shouldPersistCookie(null, 'explicit', false), false);
  assert.deepEqual([...LOGIN_COOKIES].sort(), ['c_user', 'datr', 'fr', 'sb', 'xs']);
});

test('persistentCookie: same attributes, 90-day expiry, host-only stays host-only', () => {
  const now = 1_700_000_000_000;
  const out = persistentCookie(base, now);
  assert.deepEqual(out, {
    url: 'https://messenger.com/',
    name: 'xs',
    value: 'v',
    domain: '.messenger.com',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
    expirationDate: 1_700_000_000 + PERSIST_DAYS * 86400,
  });
  const hostOnly = persistentCookie(
    { ...base, domain: 'www.messenger.com', hostOnly: true, sameSite: undefined },
    now,
  );
  assert.equal('domain' in hostOnly, false); // the url's host makes it host-only, as issued
  assert.equal(hostOnly.url, 'https://www.messenger.com/');
  assert.equal(hostOnly.sameSite, 'unspecified');
});
