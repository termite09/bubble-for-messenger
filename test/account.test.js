const test = require('node:test');
const assert = require('node:assert');
require('./helpers/electron-stub').install();
const { createAccount } = require('../src/main/account');
const { INSTAGRAM, MESSENGER } = require('../src/lib/sites');
const { nameHandle } = require('../src/lib/recent');

const row = (href, name, extra = {}) => ({
  href,
  name,
  avatarUrl: 'https://cdn/' + name + '.jpg',
  unread: false,
  preview: 'hi',
  time: '1m',
  ...extra,
});
const tick = () => new Promise((r) => setImmediate(r));

// An account over a stub panel: what the panel was asked, and hooks to play the page's events.
function make({ site = INSTAGRAM, pins = [], landed = '/direct/t/99/', showing = null } = {}) {
  const asked = [];
  const events = { landed: [], changed: 0, unread: [], status: [], pin: [] };
  let settings = { pins, banner: true, bannerPreview: true, reopenLast: 30 };
  let panelOpts;
  const panel = {
    site,
    win: {},
    openThread: async (href, bounds, opts) => {
      asked.push(['open', href, opts]);
      return landed;
    },
    sendReply: async (href, text, opts) => {
      asked.push(['reply', href, text, opts]);
      return true;
    },
    openInbox: async () => asked.push(['inbox']),
    park: async () => asked.push(['park']),
    hide: () => asked.push(['hide']),
    destroy: () => asked.push(['destroy']),
    isLoading: () => false,
    session: () => ({}),
    readRecentChats: async () => [],
    readShowing: async () => showing,
    setPinState: (state) => asked.push(['pin-state', state]),
    visible: false,
  };
  panel.isVisible = () => panel.visible;
  const account = createAccount({
    site,
    createPanel: (opts) => {
      panelOpts = opts;
      return panel;
    },
    fetchAvatar: async (_ses, url) => (url ? 'data:' + url : null),
    settings: () => settings,
    patchPins: (next) => {
      settings = { ...settings, pins: next };
    },
    onLanded: (item) => events.landed.push(item),
    onChanged: () => events.changed++,
    onUnread: (n) => events.unread.push(n),
    onStatus: (s) => events.status.push(s),
    onPin: (href) => events.pin.push(href),
  });
  return { account, panel, asked, events, page: () => panelOpts, settings: () => settings };
}

test('rows pushed by the page become the recent list, with avatars and the platform stamped', async () => {
  const { account, events, page } = make();
  page().onRows([row(nameHandle('A'), 'A'), row(nameHandle('B'), 'B')]);
  await tick();
  await tick();
  assert.equal(events.changed, 1);
  const recent = account.chats().recent;
  assert.equal(recent.length, 2);
  assert.equal(recent[0].avatar, 'data:https://cdn/A.jpg');
  const items = await account.stackItems();
  assert.ok(items.every((it) => it.platform === 'instagram'));
});

test('a message landing is announced whether or not the account is focused', async () => {
  const { events, page } = make();
  page().onRows([row(nameHandle('A'), 'A'), row(nameHandle('B'), 'B')]);
  await tick();
  await tick();
  page().onRows([
    row(nameHandle('A'), 'A', { unread: true, preview: 'yo' }),
    row(nameHandle('B'), 'B'),
  ]);
  await tick();
  await tick();
  assert.equal(events.landed.length, 1);
  assert.equal(events.landed[0].href, nameHandle('A'));
  assert.equal(events.landed[0].platform, 'instagram');
  assert.equal(events.landed[0].avatar, 'data:https://cdn/A.jpg');
});

test('the unread count from the title is passed on; a title flash keeps the last one', () => {
  const { account, events, page } = make();
  page().onUnread(3);
  page().onUnread(null);
  assert.deepEqual(events.unread, [3]);
  assert.equal(account.unread(), 3);
  page().onStatus({ connection: 'offline', signedOut: false });
  assert.equal(account.status().connection, 'offline');
});

test('opening a chat by name learns its thread path and stamps a pinned chat with it', async () => {
  const pins = [{ href: nameHandle('A'), name: 'A', avatarUrl: null, threadHref: null }];
  const { account, asked, settings } = make({ pins, landed: '/direct/t/42/' });
  await account.open(nameHandle('A'), { x: 0, y: 0, width: 44, height: 44 });
  assert.deepEqual(asked[0], ['open', nameHandle('A'), { threadHref: null }]);
  assert.equal(account.chats().activeHref, nameHandle('A'));
  assert.equal(settings().pins[0].threadHref, '/direct/t/42/');
  // Next time, the learned path goes along — for the row and for a reply alike.
  await account.open(nameHandle('A'), {});
  assert.deepEqual(asked[1][2], { threadHref: '/direct/t/42/' });
  await account.reply(nameHandle('A'), 'hi');
  assert.deepEqual(asked[2], ['reply', nameHandle('A'), 'hi', { threadHref: '/direct/t/42/' }]);
  assert.equal(account.threadHrefOf(nameHandle('A')), '/direct/t/42/');
  assert.equal(account.threadHrefOf(nameHandle('B')), null);
});

test("the stack shows this platform's pins only", async () => {
  const pins = [
    { href: '/t/1/', name: 'M', avatarUrl: null },
    { href: nameHandle('I'), name: 'I', avatarUrl: null, threadHref: null },
  ];
  const { account } = make({ pins });
  const items = await account.stackItems();
  assert.deepEqual(
    items.map((i) => i.href),
    [nameHandle('I')],
  );
});

test('a Messenger account passes no thread path along (its handles are paths already)', async () => {
  const { account, asked } = make({ site: MESSENGER, landed: undefined });
  await account.open('/t/1/', {});
  assert.deepEqual(asked[0], ['open', '/t/1/', { threadHref: null }]);
});

test('reads never overlap: a push during a read is served by one more read after it', async () => {
  const { account, page } = make();
  let resolveFirst;
  account.panel.readRecentChats = () => new Promise((r) => (resolveFirst = r));
  const first = account.refresh(); // a poll, waiting on the page
  await tick();
  page().onRows([row(nameHandle('A'), 'A')]); // a push lands meanwhile
  await tick();
  resolveFirst([]);
  await first;
  await tick();
  await tick();
  assert.equal(account.chats().recent.length, 1);
  assert.deepEqual(account.stats(), { pushes: 1, polls: 1 });
});

// Instagram's list only updates while it is the view in front, so a put-away Instagram panel is
// parked on its inbox — after a hide, a blur, and a reply through the hidden page. Messenger's
// list updates behind an open thread and is left alone.
test('an Instagram panel is parked on its inbox whenever it is put away', async () => {
  const { account, asked, page } = make();
  account.hide();
  assert.deepEqual(asked, [['hide'], ['park']]);
  page().onBlurred();
  assert.deepEqual(asked[2], ['park']);
  await account.reply(nameHandle('A'), 'hi');
  assert.deepEqual(asked[asked.length - 1], ['park']);
});

test('a Messenger panel is never parked', async () => {
  const { account, asked, page } = make({ site: MESSENGER });
  account.hide();
  page().onBlurred();
  await account.reply('/t/1/', 'hi');
  assert.ok(!asked.some((a) => a[0] === 'park'));
});

// What landed last is remembered (with when), for the disc click that opens the newest.
test('the last landed chat is remembered with its time', async () => {
  const { account, page } = make();
  assert.equal(account.landed(), null);
  page().onRows([row(nameHandle('A'), 'A'), row(nameHandle('B'), 'B')]);
  await tick();
  await tick();
  page().onRows([
    row(nameHandle('B'), 'B', { unread: true, preview: 'yo' }),
    row(nameHandle('A'), 'A'),
  ]);
  await tick();
  await tick();
  assert.equal(account.landed().href, nameHandle('B'));
  assert.ok(Date.now() - account.landed().at < 5000);
});

// The chat the panel is showing — one the user reached by searching the inbox, say — becomes
// the active chat and can be pinned from the panel's own pin button, whose state follows it.
test('a chat the user navigated to in the panel becomes active and pinnable from the panel', async () => {
  const showing = {
    href: nameHandle('Found'),
    threadHref: '/direct/t/77/',
    name: 'Found',
    avatarUrl: 'https://cdn/f.jpg',
  };
  const { account, events, page, asked, settings } = make({ showing });
  page().onRows([row(nameHandle('A'), 'A')]);
  await tick();
  await tick();
  account.panel.visible = true;
  await page().onNavigated('https://www.instagram.com/direct/t/77/');
  assert.equal(account.chats().activeHref, nameHandle('Found'));
  assert.equal(events.changed, 2); // the rows, then the showing chat
  // No extra head: the stack is pinned and recent chats only.
  const items = await account.stackItems();
  assert.deepEqual(
    items.map((i) => i.href),
    [nameHandle('A')],
  );
  assert.deepEqual(account.rowFor(nameHandle('Found')), showing);
  assert.equal(account.rowFor(nameHandle('Nobody')), null);
  assert.deepEqual(asked[asked.length - 1], ['pin-state', { pins: [] }]);
  // The pin on an inbox row: that row, as the page read it — even one not in the recent list.
  const rowInfo = { href: nameHandle('Old'), name: 'Old', avatarUrl: 'https://cdn/o.jpg' };
  page().onPin(rowInfo);
  assert.equal(settings().pins.length, 0); // the account only reports; main pins
  assert.deepEqual(events.pin, [rowInfo]);
  page().onPin({ href: '/evil/', name: 'x' }); // not a handle: dropped
  page().onPin(null); // nothing under the pointer: dropped
  assert.equal(events.pin.length, 1);
  settings().pins.push({ href: nameHandle('Found'), name: 'Found', avatarUrl: null });
  account.syncPin();
  assert.deepEqual(asked[asked.length - 1], ['pin-state', { pins: [nameHandle('Found')] }]);
  // The thread path was learned from the header: a reply goes by it.
  await account.reply(nameHandle('Found'), 'hi');
  assert.deepEqual(asked.find((a) => a[0] === 'reply')[3], { threadHref: '/direct/t/77/' });
});

test('the inbox is told which rows are pinned', async () => {
  const { account, asked, page } = make({ showing: null });
  account.panel.visible = true;
  await page().onNavigated('https://www.instagram.com/direct/inbox/');
  assert.deepEqual(asked[asked.length - 1], ['pin-state', { pins: [] }]);
});

test('a navigation while the panel is hidden is not a chat the user is looking at', async () => {
  const { account, events, page } = make({ showing: { href: '/direct/n/X/', name: 'X' } });
  await page().onNavigated('https://www.instagram.com/direct/t/1/');
  assert.equal(account.chats().activeHref, null);
  assert.equal(events.changed, 0);
});
