const test = require('node:test');
const assert = require('node:assert');
const { MESSENGER, siteOf, discState } = require('../src/lib/sites');

test('the site describes where it lives and how its pages are told apart', () => {
  assert.equal(MESSENGER.id, 'messenger');
  assert.equal(MESSENGER.home, 'https://www.messenger.com/');
  assert.equal(MESSENGER.domain, 'messenger.com');
  assert.equal(siteOf('messenger'), MESSENGER);
  assert.equal(siteOf('other'), null);
});

// The panel does not pretend to be a browser it is not. A substituted user agent would hide
// that this is an Electron app rather than make it compliant — see docs/COMPLIANCE-PLAN.md.
test('the panel sends no substituted user agent', () => {
  assert.equal(MESSENGER.userAgent, null);
});

// Instagram was removed in v3.0.0; nothing may quietly reintroduce a second site.
test('Messenger is the only site', () => {
  const { SITES } = require('../src/lib/sites');
  assert.deepEqual(Object.keys(SITES), ['messenger']);
  assert.equal(siteOf('instagram'), null);
});

test('the site paints its own wash and joins its own sockets', () => {
  assert.equal(MESSENGER.wash(true), '#1a1a1a');
  assert.equal(MESSENGER.wash(false), '#f5f5f5');
  assert.ok(MESSENGER.socketUrls.some((u) => u.includes('edge-chat.messenger.com')));
});

test('panelPath keeps every messenger.com page in the panel', () => {
  assert.equal(MESSENGER.panelPath('/anything/'), true);
});

// What the disc shows: Messenger's mark and its count.
test('discState: the mark and the unread count', () => {
  assert.deepEqual(discState({ accounts: { messenger: { unread: 5 } }, badge: 'steady' }), {
    id: 'messenger',
    label: 'Messenger',
    mark: MESSENGER.mark,
    badge: 5,
  });
});

test('discState: the badge off zeroes the count, and no account reads as none', () => {
  assert.equal(discState({ accounts: { messenger: { unread: 3 } }, badge: 'off' }).badge, 0);
  assert.equal(discState({ accounts: {}, badge: 'steady' }).badge, 0);
});
