const test = require('node:test');
const assert = require('node:assert');
const scrape = require('../src/main/scrape-instagram');
const { nameHandle } = require('../src/lib/recent');

const wc = (url, result) => ({ getURL: () => url, executeJavaScript: async () => result });

test('rows from Instagram are normalised; off instagram.com there are none', async () => {
  const rows = [
    {
      href: nameHandle('primeweb'),
      name: 'primeweb',
      avatarUrl: null,
      unread: true,
      preview: 'hi',
      time: '2m',
    },
  ];
  assert.deepEqual(
    await scrape.readRecentChats(wc('https://www.instagram.com/direct/inbox/', rows)),
    rows,
  );
  assert.equal(
    await scrape.readRecentChats(wc('https://www.instagram.com/direct/inbox/', null)),
    null,
  );
  assert.deepEqual(await scrape.readRecentChats(wc('https://www.facebook.com/login/', rows)), []);
});

// The page-side steps of opening a chat, scripted: what each would find on the page.
function pageActions({ rowClicks = [], back = false, loads = true, path = '/direct/t/99/' }) {
  const log = [];
  let clicks = 0;
  return {
    log,
    actions: {
      clickRow: async (_wc, name) => {
        log.push('row:' + name);
        return rowClicks[Math.min(clicks++, rowClicks.length - 1)] || false;
      },
      backToList: async () => {
        log.push('back');
        return back;
      },
      load: async (_wc, url) => {
        log.push('load:' + url);
        return loads;
      },
      threadPath: async () => path,
    },
  };
}

test('openThread clicks the named row and resolves to the thread path it lands on', async () => {
  const { actions, log } = pageActions({ rowClicks: [true] });
  const path = await scrape.openThread(null, nameHandle('Spyros Lontos'), { actions });
  assert.equal(path, '/direct/t/99/');
  assert.deepEqual(log, ['row:Spyros Lontos']);
});

// The list may still be sliding in (the panel was just parked on it): one more try after a
// moment before giving up on the row.
test('openThread tries the row once more when neither it nor Back was in front', async () => {
  const { actions, log } = pageActions({ rowClicks: [false, true], back: false });
  const waits = [];
  assert.equal(
    await scrape.openThread(null, nameHandle('racers'), {
      actions,
      wait: async (ms) => waits.push(ms),
    }),
    '/direct/t/99/',
  );
  assert.deepEqual(log, ['row:racers', 'back', 'row:racers']);
  assert.equal(waits.length, 1);
});

test('openThread goes back to the list when the row is behind an open thread', async () => {
  const { actions, log } = pageActions({ rowClicks: [false, true], back: true });
  assert.equal(await scrape.openThread(null, nameHandle('racers'), { actions }), '/direct/t/99/');
  assert.deepEqual(log, ['row:racers', 'back', 'row:racers']);
});

test('openThread falls back to the learned thread URL, and to nothing without one', async () => {
  const now = async () => {};
  const known = pageActions({ rowClicks: [false], back: false });
  assert.equal(
    await scrape.openThread(null, nameHandle('gone'), {
      actions: known.actions,
      threadHref: '/direct/t/42/',
      wait: now,
    }),
    '/direct/t/99/',
  );
  assert.deepEqual(known.log, [
    'row:gone',
    'back',
    'row:gone',
    'load:https://www.instagram.com/direct/t/42/',
  ]);
  const unknown = pageActions({ rowClicks: [false], back: false });
  assert.equal(
    await scrape.openThread(null, nameHandle('gone'), { actions: unknown.actions, wait: now }),
    null,
  );
  assert.ok(!unknown.log.some((l) => l.startsWith('load:')));
});

test('openThread loads a thread path directly and refuses anything else', async () => {
  const { actions, log } = pageActions({});
  assert.equal(await scrape.openThread(null, '/direct/t/7/', { actions }), '/direct/t/99/');
  assert.deepEqual(log, ['load:https://www.instagram.com/direct/t/7/']);
  assert.equal(await scrape.openThread(null, '/t/1/', { actions }), null);
  assert.equal(await scrape.openThread(null, "/direct/n/x'/", { actions }), null);
});

test('sendReply fails when the chat cannot be opened, else replies on the resolved path', async () => {
  const closed = pageActions({ rowClicks: [false], back: false });
  assert.equal(
    await scrape.sendReply(null, nameHandle('gone'), 'hi', { actions: closed.actions }),
    false,
  );
  const open = pageActions({ rowClicks: [true] });
  const seen = [];
  const reply = {
    snapshot: async (_wc, href) => {
      seen.push(href);
      return {
        onThread: true,
        composerReady: true,
        composerEmpty: true,
        draftMatches: false,
        sendAvailable: false,
      };
    },
    insert: async () => true,
    send: async () => true,
  };
  // The loop needs one more snapshot after the insert, then after the send, to report success.
  let n = 0;
  reply.snapshot = async (_wc, href) => {
    seen.push(href);
    n++;
    if (n === 1)
      return {
        onThread: true,
        composerReady: true,
        composerEmpty: true,
        draftMatches: false,
        sendAvailable: false,
      };
    if (n === 2)
      return {
        onThread: true,
        composerReady: true,
        composerEmpty: false,
        draftMatches: true,
        sendAvailable: true,
      };
    return {
      onThread: true,
      composerReady: true,
      composerEmpty: true,
      draftMatches: false,
      sendAvailable: false,
    };
  };
  const ok = await scrape.sendReply(null, nameHandle('Spyros Lontos'), 'hi', {
    actions: open.actions,
    reply,
    wait: async () => {},
  });
  assert.equal(ok, true);
  assert.ok(seen.every((h) => h === '/direct/t/99/'));
});

// The chat the panel is showing: handled by name (the header's), with the thread path learned.
test('readShowing gives the open thread a name handle and its path', async () => {
  assert.deepEqual(
    await scrape.readShowing(
      wc('https://www.instagram.com/direct/t/5/', {
        threadHref: '/direct/t/5/',
        name: 'racers',
        avatarUrl: 'https://cdn/r.jpg',
      }),
    ),
    {
      href: nameHandle('racers'),
      threadHref: '/direct/t/5/',
      name: 'racers',
      avatarUrl: 'https://cdn/r.jpg',
    },
  );
  assert.equal(await scrape.readShowing(wc('https://www.instagram.com/direct/inbox/', null)), null);
  assert.equal(
    await scrape.readShowing(
      wc('https://www.instagram.com/direct/t/5/', { threadHref: '/direct/t/5/', name: '' }),
    ),
    null,
  );
});
