const test = require('node:test');
const assert = require('node:assert');
require('./helpers/electron-stub').install();
const { createAccount } = require('../src/main/account');
const { MESSENGER } = require('../src/lib/sites');

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
function make({ site = MESSENGER, pins = [], landed = undefined, showing = null } = {}) {
  const asked = [];
  const events = { landed: [], changed: 0, unread: [], status: [], pin: [] };
  let settings = { pins, banner: true, bannerPreview: true, reopenLast: 30 };
  let panelOpts;
  const panel = {
    site,
    win: {},
    openThread: async (href, bounds) => {
      asked.push(['open', href]);
      return landed;
    },
    sendReply: async (href, text) => {
      asked.push(['reply', href, text]);
      return true;
    },
    openInbox: async () => asked.push(['inbox']),
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
  page().onRows([row('/t/1/', 'A'), row('/t/2/', 'B')]);
  await tick();
  await tick();
  assert.equal(events.changed, 1);
  const recent = account.chats().recent;
  assert.equal(recent.length, 2);
  assert.equal(recent[0].avatar, 'data:https://cdn/A.jpg');
  const items = await account.stackItems();
  assert.ok(items.every((it) => it.platform === 'messenger'));
});

test('a message landing is announced', async () => {
  const { events, page } = make();
  page().onRows([row('/t/1/', 'A'), row('/t/2/', 'B')]);
  await tick();
  await tick();
  page().onRows([row('/t/1/', 'A', { unread: true, preview: 'yo' }), row('/t/2/', 'B')]);
  await tick();
  await tick();
  assert.equal(events.landed.length, 1);
  assert.equal(events.landed[0].href, '/t/1/');
  assert.equal(events.landed[0].platform, 'messenger');
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

test('opening a chat makes it active and asks the panel for it', async () => {
  const { account, asked } = make();
  await account.open('/t/1/', { x: 0, y: 0, width: 44, height: 44 });
  assert.deepEqual(asked[0], ['open', '/t/1/']);
  assert.equal(account.chats().activeHref, '/t/1/');
  await account.reply('/t/1/', 'hi');
  assert.deepEqual(asked[1], ['reply', '/t/1/', 'hi']);
});

test('the stack shows the pinned chats', async () => {
  const pins = [{ href: '/t/1/', name: 'M', avatarUrl: null }];
  const { account } = make({ pins });
  const items = await account.stackItems();
  assert.deepEqual(
    items.map((i) => i.href),
    ['/t/1/'],
  );
});

test('reads never overlap: a push during a read is served by one more read after it', async () => {
  const { account, page } = make();
  let resolveFirst;
  account.panel.readRecentChats = () => new Promise((r) => (resolveFirst = r));
  const first = account.refresh(); // a poll, waiting on the page
  await tick();
  page().onRows([row('/t/1/', 'A')]); // a push lands meanwhile
  await tick();
  resolveFirst([]);
  await first;
  await tick();
  await tick();
  assert.equal(account.chats().recent.length, 1);
  assert.deepEqual(account.stats(), { pushes: 1, polls: 1 });
});

// Instagram was removed in v3.0.0, and with it the park-on-hide it needed. Messenger's list
// updates behind an open thread, so a put-away panel is left alone.
test('the panel is never parked', async () => {
  const { account, asked, page } = make();
  account.hide();
  page().onBlurred();
  await account.reply('/t/1/', 'hi');
  assert.ok(!asked.some((a) => a[0] === 'park'));
  assert.equal(typeof account.panel.park, 'undefined');
});

// What landed last is remembered (with when), for the disc click that opens the newest.
test('the last landed chat is remembered with its time', async () => {
  const { account, page } = make();
  assert.equal(account.landed(), null);
  page().onRows([row('/t/1/', 'A'), row('/t/2/', 'B')]);
  await tick();
  await tick();
  page().onRows([row('/t/2/', 'B', { unread: true, preview: 'yo' }), row('/t/1/', 'A')]);
  await tick();
  await tick();
  assert.equal(account.landed().href, '/t/2/');
  assert.ok(Date.now() - account.landed().at < 5000);
});

// The chat the panel is showing — one the user reached by searching the inbox, say — becomes
// the active chat and can be pinned from the panel's own pin button, whose state follows it.
test('a chat the user navigated to in the panel becomes active and pinnable from the panel', async () => {
  const showing = { href: '/t/77/', name: 'Found', avatarUrl: 'https://cdn/f.jpg' };
  const { account, events, page, asked, settings } = make({ showing });
  page().onRows([row('/t/1/', 'A')]);
  await tick();
  await tick();
  account.panel.visible = true;
  await page().onNavigated('https://www.messenger.com/t/77/');
  assert.equal(account.chats().activeHref, '/t/77/');
  assert.equal(events.changed, 2); // the rows, then the showing chat
  // No extra head: the stack is pinned and recent chats only.
  const items = await account.stackItems();
  assert.deepEqual(
    items.map((i) => i.href),
    ['/t/1/'],
  );
  assert.deepEqual(account.rowFor('/t/77/'), showing);
  assert.equal(account.rowFor('/t/999/'), null);
  assert.deepEqual(asked[asked.length - 1], ['pin-state', { pins: [] }]);
  // The pin on an inbox row: that row, as the page read it — even one not in the recent list.
  const rowInfo = { href: '/t/5/', name: 'Old', avatarUrl: 'https://cdn/o.jpg' };
  page().onPin(rowInfo);
  assert.equal(settings().pins.length, 0); // the account only reports; main pins
  assert.deepEqual(events.pin, [rowInfo]);
  page().onPin({ href: '/evil/', name: 'x' }); // not a handle: dropped
  page().onPin(null); // nothing under the pointer: dropped
  assert.equal(events.pin.length, 1);
  settings().pins.push({ href: '/t/77/', name: 'Found', avatarUrl: null });
  account.syncPin();
  assert.deepEqual(asked[asked.length - 1], ['pin-state', { pins: ['/t/77/'] }]);
});

test('the inbox is told which rows are pinned', async () => {
  const { account, asked, page } = make({ showing: null });
  account.panel.visible = true;
  await page().onNavigated('https://www.messenger.com/');
  assert.deepEqual(asked[asked.length - 1], ['pin-state', { pins: [] }]);
});

test('a navigation while the panel is hidden is not a chat the user is looking at', async () => {
  const { account, events, page } = make({ showing: { href: '/t/9/', name: 'X' } });
  await page().onNavigated('https://www.messenger.com/t/9/');
  assert.equal(account.chats().activeHref, null);
  assert.equal(events.changed, 0);
});
