const test = require('node:test');
const assert = require('node:assert');
const {
  initialState,
  reduceRecent,
  refreshPins,
  openChat,
  closeChat,
  discClick,
  pickUnread,
} = require('../src/lib/chats');

const row = (href, extra = {}) => ({
  href,
  name: 'N' + href,
  unread: false,
  preview: 'hi',
  time: '2m',
  avatarUrl: null,
  avatar: null,
  ...extra,
});
const hidden = { visible: false, now: 1000 };

test('the first read seeds state and announces nothing', () => {
  const r = reduceRecent(initialState(), [row('/t/1/', { unread: true })], hidden);
  assert.equal(r.changed, true);
  assert.equal(r.landed, null);
  assert.equal(r.state.seeded, true);
  assert.equal(r.state.recent.length, 1);
});

test("a chat turning unread with a new preview lands; the user's own message never does", () => {
  let s = reduceRecent(initialState(), [row('/t/1/'), row('/t/2/')], hidden).state;
  let r = reduceRecent(s, [row('/t/1/', { unread: true, preview: 'yo' }), row('/t/2/')], hidden);
  assert.equal(r.landed.href, '/t/1/');
  s = r.state;
  // Same unread row with the same preview: nothing new landed.
  r = reduceRecent(
    s,
    [row('/t/1/', { unread: true, preview: 'yo', time: '3m' }), row('/t/2/')],
    hidden,
  );
  assert.equal(r.landed, null);
  assert.equal(r.changed, true); // the time changed
  assert.equal(r.displayChanged, false); // but nothing the stack shows
  // Own message bolded by Messenger: not a landing.
  r = reduceRecent(
    r.state,
    [row('/t/1/', { unread: true, preview: 'You: ok' }), row('/t/2/')],
    hidden,
  );
  assert.equal(r.landed, null);
  // A new unread chat at the top lands.
  r = reduceRecent(
    r.state,
    [row('/t/9/', { unread: true, preview: 'new' }), row('/t/1/'), row('/t/2/')],
    hidden,
  );
  assert.equal(r.landed.href, '/t/9/');
  // While the panel is showing, nothing lands.
  r = reduceRecent(r.state, [row('/t/9/', { unread: true, preview: 'again' }), row('/t/1/')], {
    visible: true,
    now: 1,
  });
  assert.equal(r.landed, null);
});

test('untrusted reads change nothing: null, or an empty list over a non-empty one', () => {
  const s = reduceRecent(initialState(), [row('/t/1/', { unread: true })], hidden).state;
  assert.equal(reduceRecent(s, null, hidden).changed, false);
  const empty = reduceRecent(s, [], hidden);
  assert.equal(empty.changed, false);
  assert.equal(empty.state, s);
  // ...and the rows returning afterwards are not "new" (no spurious landing).
  const back = reduceRecent(empty.state, [row('/t/1/', { unread: true })], hidden);
  assert.equal(back.landed, null);
  assert.equal(back.changed, false);
  // An empty list never seeds either: the page pushes one before its rows render, and the
  // first real read must still be the one that announces nothing.
  const blank = reduceRecent(initialState(), [], hidden);
  assert.equal(blank.state.seeded, false);
  assert.equal(
    reduceRecent(blank.state, [row('/t/1/', { unread: true, preview: 'x' })], hidden).landed,
    null,
  );
});

test('displayChanged tracks only what the stack draws', () => {
  const s = reduceRecent(initialState(), [row('/t/1/')], hidden).state;
  assert.equal(reduceRecent(s, [row('/t/1/', { preview: 'other' })], hidden).displayChanged, false);
  assert.equal(reduceRecent(s, [row('/t/1/', { unread: true })], hidden).displayChanged, true);
  assert.equal(reduceRecent(s, [row('/t/1/', { avatar: 'data:x' })], hidden).displayChanged, true);
  assert.equal(reduceRecent(s, [row('/t/1/', { name: 'Renamed' })], hidden).displayChanged, true);
});

test("refreshPins takes the row's name and picture URL when they differ", () => {
  const pins = [
    { href: '/t/1/', name: 'old', avatarUrl: 'u1' },
    { href: '/t/2/', name: 'B', avatarUrl: null },
  ];
  const same = refreshPins(pins, [row('/t/9/')]);
  assert.equal(same.changed, false);
  assert.equal(same.pins, pins);
  const fresh = refreshPins(pins, [{ ...row('/t/1/'), name: 'new', avatarUrl: 'u2' }]);
  assert.equal(fresh.changed, true);
  assert.deepEqual(fresh.pins[0], { href: '/t/1/', name: 'new', avatarUrl: 'u2' });
  assert.equal(fresh.pins[1], pins[1]);
});

test('open, close and the disc click: reopen within the window, the stack otherwise', () => {
  let s = openChat(initialState(), '/t/1/');
  assert.equal(s.activeHref, '/t/1/');
  assert.equal(discClick(s, 5000, 30).action, 'stack'); // nothing put away yet
  s = closeChat(s, 5000);
  assert.equal(s.activeHref, null);
  assert.deepEqual(s.lastChat, { href: '/t/1/', closedAt: 5000 });
  assert.deepEqual(discClick(s, 20000, 30), { action: 'reopen', href: '/t/1/' });
  assert.equal(discClick(s, 40000, 30).action, 'stack');
  assert.equal(discClick(s, 6000, 0).action, 'stack'); // off
  // Closing the stack with no chat open remembers nothing new.
  assert.equal(closeChat(s, 9000), s);
  // Opening another chat forgets the remembered one.
  assert.equal(openChat(s, '/t/2/').lastChat, null);
});

// Instagram words the user's own last message "You sent an attachment." / "You: hi"; Messenger
// "You: hi". Neither is someone else's message landing.
test("Instagram's own-message wording never lands either", () => {
  const s = reduceRecent(initialState(), [row('/direct/n/A/'), row('/direct/n/B/')], hidden).state;
  const r = reduceRecent(
    s,
    [
      row('/direct/n/A/', { unread: true, preview: 'You sent an attachment.' }),
      row('/direct/n/B/'),
    ],
    hidden,
  );
  assert.equal(r.landed, null);
  const r2 = reduceRecent(
    s,
    [row('/direct/n/A/', { unread: true, preview: 'Youssef: hey' }), row('/direct/n/B/')],
    hidden,
  );
  assert.equal(r2.landed.href, '/direct/n/A/');
});

// A disc click with unread messages opens the newest received one: the chat whose message
// landed last across the platforms, as long as it is still unread — else the focused
// platform's top unread chat — else nothing (the click means what it meant before).
test('pickUnread: the last landed chat that is still unread, across platforms', () => {
  const accounts = {
    messenger: {
      recent: [row('/t/1/', { unread: true }), row('/t/2/')],
      landed: { href: '/t/1/', at: 100 },
    },
    instagram: {
      recent: [row('/direct/n/A/', { unread: true })],
      landed: { href: '/direct/n/A/', at: 200 },
    },
  };
  assert.deepEqual(pickUnread({ focused: 'messenger', accounts }), {
    platform: 'instagram',
    href: '/direct/n/A/',
  });
  // Read since it landed: the next one back.
  accounts.instagram.recent[0].unread = false;
  assert.deepEqual(pickUnread({ focused: 'instagram', accounts }), {
    platform: 'messenger',
    href: '/t/1/',
  });
});

test("pickUnread: nothing landed yet → the focused platform's top unread, never the user's own", () => {
  const accounts = {
    messenger: {
      recent: [row('/t/1/', { unread: true, preview: 'You: k' }), row('/t/2/', { unread: true })],
      landed: null,
    },
    instagram: { recent: [row('/direct/n/A/', { unread: true })], landed: null },
  };
  assert.deepEqual(pickUnread({ focused: 'messenger', accounts }), {
    platform: 'messenger',
    href: '/t/2/',
  });
  accounts.messenger.recent[1].unread = false;
  assert.equal(pickUnread({ focused: 'messenger', accounts }), null);
});
