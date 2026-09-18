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
  assert.match(ran[0], /--mb-hairline.*255, ?255, ?255/);
  assert.match(ran[1], /--mb-hairline.*0, ?0, ?0/);
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

const { readShowing } = require('../src/main/scrape');

// The chat the panel is showing, for the stack: the thread path from the address and the
// name from the title; nothing on the inbox or off the site.
test('readShowing names the open thread from the title, or nothing on the inbox', async () => {
  const page = (url, result) => ({ getURL: () => url, executeJavaScript: async () => result });
  assert.deepEqual(
    await readShowing(
      page('https://www.messenger.com/t/1/', {
        href: '/t/1/',
        title: '(2) Alex Smith | Messenger',
        avatarUrl: 'https://cdn/a.jpg',
      }),
    ),
    { href: '/t/1/', name: 'Alex Smith', avatarUrl: 'https://cdn/a.jpg' },
  );
  // The page's path may lack the trailing slash the list rows carry; the handle is the row's.
  assert.equal(
    (
      await readShowing(
        page('https://www.messenger.com/t/1', { href: '/t/1', title: 'A | Messenger' }),
      )
    ).href,
    '/t/1/',
  );
  assert.equal(
    await readShowing(page('https://www.messenger.com/', { href: '/', title: 'Messenger' })),
    null,
  );
  assert.equal(
    await readShowing(
      page('https://www.messenger.com/t/1/', { href: '/t/1/', title: 'Messenger' }),
    ),
    null,
  );
  assert.equal(await readShowing(page('https://www.facebook.com/login/', null)), null);
});

const fs = require('node:fs');
const path = require('node:path');
const { newMessage, pressControl, openPreferences, openInbox } = require('../src/main/scrape');

// A webContents that reports a pressable point for every control and records the input events
// it is given, so a press can be told from an element.click().
function pressable({ point = { x: 40, y: 30 }, url = 'https://www.messenger.com/t/1/' } = {}) {
  const events = [];
  return {
    events,
    getURL: () => url,
    executeJavaScriptInIsolatedWorld: async () => point,
    sendInputEvent: (e) => events.push(e),
    loadURL: async () => {},
  };
}
const kinds = (wc) => wc.events.map((e) => e.type);

// The page must receive real Chromium input, not a synthetic element.click() — the latter
// carries isTrusted: false, which is the signature Instagram was removed over.
// See docs/COMPLIANCE-PLAN.md.
test('a control is pressed with real input events, at the point the page reported', async () => {
  const wc = pressable();
  assert.equal(await pressControl(wc, `document.body`), true);
  assert.deepEqual(kinds(wc), ['mouseMove', 'mouseDown', 'mouseUp']);
  assert.equal(wc.events[1].x, 40);
  assert.equal(wc.events[1].y, 30);
});

test('a control that is absent or covered is not pressed at all', async () => {
  const wc = pressable({ point: null });
  assert.equal(await pressControl(wc, `document.body`), false);
  assert.deepEqual(kinds(wc), []);
});

test('compose, Back and Preferences all go through a real press', async () => {
  const compose = pressable();
  await newMessage(compose);
  assert.deepEqual(kinds(compose), ['mouseMove', 'mouseDown', 'mouseUp']);

  const back = pressable();
  await openInbox(back);
  assert.deepEqual(kinds(back), ['mouseMove', 'mouseDown', 'mouseUp']);

  const prefs = pressable();
  assert.equal(await openPreferences(prefs), true);
  assert.deepEqual(kinds(prefs), [
    'mouseMove',
    'mouseDown',
    'mouseUp', // the account gear
    'mouseMove',
    'mouseDown',
    'mouseUp', // the Preferences item
  ]);
});

// The guard that keeps this from regressing: no page-side script in the main process may call
// .click(), on any control, however convenient.
test('no page script presses a control with element.click()', () => {
  const dir = path.join(__dirname, '..', 'src', 'main');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const code = fs.readFileSync(path.join(dir, file), 'utf8').replace(/^\s*\/\/.*$/gm, ''); // comments may name what is forbidden
    assert.equal(/\.click\(\)/.test(code), false, `${file} calls .click() in a page script`);
  }
});

const { EventEmitter } = require('node:events');
const { openThread } = require('../src/main/scrape');

// Messenger at the panel's width, scripted: `front` is what is in front of the other (the
// thread, or the list), `rows` whether the list has rendered its rows yet, `back` whether the
// thread view offers its Back control. Scripts are told apart by what they look for; a press
// moves the page the way Messenger does (Back slides the list in, a row slides the thread in),
// and a URL load lands on the list with no rows until `rowsAfterMs` have passed.
function narrowPage({
  front = 'thread',
  rows = true,
  back = true,
  listed = true,
  rowsAfterMs = 0,
} = {}) {
  const page = Object.assign(new EventEmitter(), { front, rows, back, events: [], loads: [] });
  const BACK = { x: 20, y: 20 };
  const ROW = { x: 100, y: 100 };
  page.getURL = () => 'https://www.messenger.com/t/1/';
  page.executeJavaScriptInIsolatedWorld = async (_world, [{ code }]) => {
    if (code.includes('mb-back')) {
      if (code.includes("textContent = ''")) return undefined; // the unhide
      return page.front === 'thread' && page.back ? BACK : null;
    }
    if (code.includes('[href^=')) return page.front === 'list' && page.rows && listed ? ROW : null; // rowPoint
    if (code.includes('[href*="/t/"]')) return page.front === 'list' && page.rows; // listInteractive
    if (code.includes('[role="main"]')) return page.front === 'thread'; // threadShowing
    return undefined;
  };
  page.sendInputEvent = (e) => {
    page.events.push(e);
    if (e.type !== 'mouseUp') return;
    if (e.x === BACK.x) page.front = 'list';
    else if (e.x === ROW.x && page.front === 'list' && page.rows) page.front = 'thread';
  };
  page.loadURL = async (url) => {
    page.loads.push(url);
    page.front = 'list';
    page.rows = false;
    setTimeout(() => page.emit('did-finish-load'), 0);
    setTimeout(() => {
      page.rows = true;
    }, rowsAfterMs).unref();
  };
  return page;
}
const presses = (page) => page.events.filter((e) => e.type === 'mouseUp').map((e) => e.x);

test('openThread: the row is pressed straight away when the list is in front', async () => {
  const page = narrowPage({ front: 'list' });
  assert.deepEqual(await openThread(page, '/t/1/'), { via: 'row', landed: true });
  assert.deepEqual(presses(page), [100]);
  assert.deepEqual(page.loads, []);
});

test('openThread: behind an open thread, Back brings the list in and the row is pressed', async () => {
  const page = narrowPage({ front: 'thread' });
  assert.deepEqual(await openThread(page, '/t/1/'), { via: 'back', landed: true });
  assert.deepEqual(presses(page), [20, 100]);
  assert.deepEqual(page.loads, []);
  assert.equal(page.front, 'thread');
});

// The last resort: a page with no Back control to press is loaded at the thread's address,
// which lands on the list. Its rows render some time after the load settles — the row is
// waited for, not looked for once at a fixed moment after the load — and then pressed.
test('openThread: without Back the thread is reloaded, and the row waited for', async () => {
  const page = narrowPage({ front: 'thread', back: false, rowsAfterMs: 900 });
  assert.deepEqual(await openThread(page, '/t/1/'), { via: 'reload', landed: true });
  assert.deepEqual(page.loads, ['https://www.messenger.com/t/1/']);
  assert.deepEqual(presses(page), [100]);
  assert.equal(page.front, 'thread');
});

// A chat that is not in the list (nothing to press) is reported as not landed, so the caller
// can say so; what it reveals is then the list, knowingly.
test('openThread: a chat with no row to press is reported as not landed', async () => {
  const page = narrowPage({ front: 'thread', back: false, listed: false });
  assert.deepEqual(await openThread(page, '/t/1/'), { via: 'reload', landed: false });
  assert.deepEqual(presses(page), []);
});

const { viewport } = require('../src/main/scrape');

// The diagnostic read of the page at reveal: its viewport, and whether the thread is in front.
test('viewport reports the page size and whether the thread shows', async () => {
  const page = narrowPage({ front: 'thread' });
  const inner = page.executeJavaScriptInIsolatedWorld;
  page.executeJavaScriptInIsolatedWorld = async (world, scripts) =>
    scripts[0].code.includes('innerWidth') ? { w: 420, h: 560 } : inner(world, scripts);
  assert.deepEqual(await viewport(page), { w: 420, h: 560, thread: true });
  page.front = 'list';
  assert.deepEqual(await viewport(page), { w: 420, h: 560, thread: false });
});
