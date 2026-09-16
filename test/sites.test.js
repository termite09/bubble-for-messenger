const test = require('node:test');
const assert = require('node:assert');
const { MESSENGER, INSTAGRAM, siteOf, discState } = require('../src/lib/sites');

test('each site describes where it lives and how its pages are told apart', () => {
  assert.equal(MESSENGER.id, 'messenger');
  assert.equal(MESSENGER.home, 'https://www.messenger.com/');
  assert.equal(MESSENGER.domain, 'messenger.com');
  assert.equal(MESSENGER.userAgent, null);
  assert.equal(INSTAGRAM.id, 'instagram');
  assert.equal(INSTAGRAM.home, 'https://www.instagram.com/direct/inbox/');
  assert.equal(INSTAGRAM.domain, 'instagram.com');
  assert.match(INSTAGRAM.userAgent, /iPhone/); // the mobile web app is the one with a usable inbox
  assert.equal(siteOf('instagram'), INSTAGRAM);
  assert.equal(siteOf('messenger'), MESSENGER);
  assert.equal(siteOf('other'), null);
});

test('each site paints its own wash and joins its own sockets', () => {
  assert.equal(MESSENGER.wash(true), '#1a1a1a');
  assert.equal(INSTAGRAM.wash(true), '#0c1014');
  assert.equal(INSTAGRAM.wash(false), '#ffffff');
  assert.ok(MESSENGER.socketUrls.some((u) => u.includes('edge-chat.messenger.com')));
  assert.ok(INSTAGRAM.socketUrls.some((u) => u.includes('gateway.instagram.com')));
});

// The Instagram panel is a messenger, not a browser: only its inbox, threads and the sign-in
// pages belong in it. Messenger's panel keeps every messenger.com page, as before.
test('panelPath says which of a site’s pages the panel may show', () => {
  assert.equal(INSTAGRAM.panelPath('/direct/inbox/'), true);
  assert.equal(INSTAGRAM.panelPath('/direct/t/1/'), true);
  assert.equal(INSTAGRAM.panelPath('/accounts/login/'), true);
  assert.equal(INSTAGRAM.panelPath('/challenge/x/'), true);
  assert.equal(INSTAGRAM.panelPath('/'), false);
  assert.equal(INSTAGRAM.panelPath('/explore/'), false);
  assert.equal(MESSENGER.panelPath('/anything/'), true);
  assert.equal(INSTAGRAM.parkOnHide, true);
  assert.equal(MESSENGER.parkOnHide, false);
});

// What the disc shows: the focused site's mark and count, and the other site as a satellite
// with its own count — or no satellite while Instagram is off.
test('discState: focused count on the disc, the other platform as a satellite', () => {
  const both = { messenger: { unread: 5 }, instagram: { unread: 2 } };
  assert.deepEqual(discState({ focused: 'messenger', accounts: both, badge: 'steady' }), {
    id: 'messenger',
    label: 'Messenger',
    mark: MESSENGER.mark,
    badge: 5,
    other: { id: 'instagram', label: 'Instagram', mark: INSTAGRAM.mark, count: 2 },
  });
  assert.deepEqual(discState({ focused: 'instagram', accounts: both, badge: 'pulse' }).other, {
    id: 'messenger',
    label: 'Messenger',
    mark: MESSENGER.mark,
    count: 5,
  });
});

test('discState: no satellite with one account, and no counts with the badge off', () => {
  const one = { messenger: { unread: 3 } };
  assert.deepEqual(discState({ focused: 'messenger', accounts: one, badge: 'steady' }), {
    id: 'messenger',
    label: 'Messenger',
    mark: MESSENGER.mark,
    badge: 3,
    other: null,
  });
  const off = discState({
    focused: 'messenger',
    accounts: { messenger: { unread: 3 }, instagram: { unread: 1 } },
    badge: 'off',
  });
  assert.equal(off.badge, 0);
  assert.equal(off.other.count, 0);
});
