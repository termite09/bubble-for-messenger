const test = require('node:test');
const assert = require('node:assert');
const { readRecentChats, RECENT_CHATS_SCRIPT } = require('../src/main/scrape');

// The smallest stand-in for a webContents the reader touches: where it is, and what the page
// script returned.
const wc = (url, result) => ({ getURL: () => url, executeJavaScript: async () => result });

test('a scrolled list is untrusted: null, not an empty list', async () => {
  assert.equal(await readRecentChats(wc('https://www.messenger.com/', null)), null);
});

test('rows from the page are normalised', async () => {
  const rows = [
    { href: '/t/1/', name: 'A', avatarUrl: null, unread: false, preview: 'hi', time: '2m' },
  ];
  assert.deepEqual(await readRecentChats(wc('https://www.messenger.com/t/1/', rows)), rows);
});

test('off messenger.com there are no rows', async () => {
  assert.deepEqual(await readRecentChats(wc('https://www.facebook.com/login/', null)), []);
});

test('the page script carries the emoji and scroll helpers', () => {
  assert.match(RECENT_CHATS_SCRIPT, /function spanText\(/);
  assert.match(RECENT_CHATS_SCRIPT, /function listAtTop\(/);
});

const { deliverReply } = require('../src/main/scrape');

// Drive deliverReply with a scripted page: each snapshot is what the page reports on one poll.
function scripted(snapshots, { insertOk = true } = {}) {
  const log = [];
  let i = 0;
  const actions = {
    snapshot: async () => snapshots[Math.min(i++, snapshots.length - 1)],
    insert: async (_wc, text) => {
      log.push('insert:' + text);
      return insertOk;
    },
    send: async () => {
      log.push('send');
      return true;
    },
  };
  let t = 0;
  const deps = {
    actions,
    now: () => t,
    wait: async () => {
      t += 250;
    },
  };
  return { deps, log };
}
const snap = (o) => ({
  onThread: true,
  composerReady: true,
  composerEmpty: true,
  draftMatches: false,
  sendAvailable: false,
  ...o,
});

test('deliverReply inserts, sends, and succeeds when the composer empties', async () => {
  const { deps, log } = scripted([
    snap({ onThread: false }), // still switching thread
    snap(), // ready: insert
    snap({ composerEmpty: false, draftMatches: true, sendAvailable: true }), // draft landed: send
    snap({ composerEmpty: false, draftMatches: true }), // sending
    snap(), // sent
  ]);
  assert.equal(await deliverReply({}, '/t/1/', 'hi', deps), true);
  assert.deepEqual(log, ['insert:hi', 'send']);
});

test('deliverReply refuses to touch a composer that holds a draft', async () => {
  const { deps, log } = scripted([snap({ composerEmpty: false })]);
  assert.equal(await deliverReply({}, '/t/1/', 'hi', deps), false);
  assert.deepEqual(log, []);
});

test('deliverReply fails when the draft never appears or insert is rejected', async () => {
  const rejected = scripted([snap()], { insertOk: false });
  assert.equal(await deliverReply({}, '/t/1/', 'hi', rejected.deps), false);
  const vanished = scripted([
    snap(),
    snap({ composerEmpty: false, draftMatches: false, sendAvailable: true }),
  ]);
  assert.equal(await deliverReply({}, '/t/1/', 'hi', vanished.deps), false);
  assert.deepEqual(vanished.log, ['insert:hi']);
});

test('deliverReply gives up after the budget', async () => {
  const { deps } = scripted([snap({ onThread: false })]);
  assert.equal(await deliverReply({}, '/t/1/', 'hi', deps), false);
});

const { setTheme } = require('../src/main/scrape');

// Messenger picks its theme once, at load, from its own preference; the app steers it by
// swapping the classes Messenger's own toggle uses on <html>.
test("setTheme swaps Messenger's own dark/light classes on <html>", async () => {
  const ran = [];
  const wc = {
    executeJavaScript: async (js) => {
      ran.push(js);
    },
  };
  await setTheme(wc, true);
  await setTheme(wc, false);
  assert.equal(ran.length, 2);
  assert.match(ran[0], /documentElement/);
  assert.match(ran[0], /add\('__fb-dark-mode'\)/);
  assert.match(ran[0], /remove\('__fb-light-mode'\)/);
  assert.match(ran[1], /add\('__fb-light-mode'\)/);
  assert.match(ran[0], /--mb-hairline.*255,255,255/);
  assert.match(ran[1], /--mb-hairline.*0,0,0/);
  assert.match(ran[1], /remove\('__fb-dark-mode'\)/);
});

const { run } = require('../src/main/scrape');

// A page that never answers must not wedge the open queue: every script has a deadline, and
// runs in its own world when the page offers one.
test('run: isolated world when available, and a timeout either way', async () => {
  const calls = [];
  const wc = {
    executeJavaScriptInIsolatedWorld: (world, scripts, gesture) => {
      calls.push([world, scripts[0].code, gesture]);
      return new Promise(() => {});
    },
  };
  await assert.rejects(run(wc, '1 + 1', { timeoutMs: 20 }), /timed out/);
  assert.deepEqual(calls, [[1001, '1 + 1', false]]);
  const plain = { executeJavaScript: async (code) => code.length };
  assert.equal(await run(plain, 'abc'), 3);
});
