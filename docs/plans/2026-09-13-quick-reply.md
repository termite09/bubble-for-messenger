# Quick Reply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A ↩ control on the landed banner opens a reply field; Enter sends the text through the hidden Messenger page, so a short answer never needs the panel.

**Architecture:** A pure state machine (`lib/reply.js`) decides each step of the send; `scrape.js` feeds it DOM snapshots from the panel page and performs the action it names; `panel.js` stages the page invisibly and serialises sends through its open-queue; `bubble.js` lends the non-focusable bubble window keyboard focus only while the field is open; the renderer draws the field in the existing banner.

**Tech Stack:** Electron 44, Node 24, `node --test`. No new dependencies.

**Spec:** `docs/specs/2026-09-13-quick-reply-design.md`

## Global Constraints

- Reply text: trimmed, non-empty, at most 2000 characters. Delivery budget 12 s, polling every 250 ms.
- The bubble window is `focusable: false` at rest; focus is taken only between ↩ and send/cancel.
- Never insert into a composer that already holds text. Never click Send unless the page is still on the target thread and the draft matches.
- The panel is hidden again after a send that started hidden; the inbox is never seen.
- Existing conventions: pure logic in `src/lib/` with `node --test` tests; hrefs validated with `isThreadHref` at every boundary; comments explain *why*.
- Run tests with `cd /Users/termite/Projects/messenger-mac && npm test`. Electron scripts need `env -u ELECTRON_RUN_AS_NODE` in this terminal.

---

### Task 1: Reply state machine and validation (`lib/reply.js`)

**Files:**
- Create: `src/lib/reply.js`
- Test: `test/reply.test.js`

**Interfaces:**
- Produces: `decideReply(phase, snapshot, expired) -> { action, phase }` with phases `'waiting' | 'inserted' | 'confirming'`, actions `'wait' | 'insert' | 'send' | 'success' | 'failure'`, snapshot `{ onThread, composerReady, composerEmpty, draftMatches, sendAvailable }`; `validReply(href, text) -> boolean`; `MAX_REPLY_CHARS = 2000`, `REPLY_BUDGET_MS = 12000`, `REPLY_POLL_MS = 250`.

- [ ] **Step 1: Write the failing tests**

```js
// test/reply.test.js
const test = require('node:test');
const assert = require('node:assert');
const { decideReply, validReply, MAX_REPLY_CHARS } = require('../src/lib/reply');

const ready = { onThread: true, composerReady: true, composerEmpty: true, draftMatches: false, sendAvailable: false };

test('waits until the page is on the thread with a composer', () => {
  assert.deepEqual(decideReply('waiting', { ...ready, onThread: false }, false), { action: 'wait', phase: 'waiting' });
  assert.deepEqual(decideReply('waiting', { ...ready, composerReady: false }, false), { action: 'wait', phase: 'waiting' });
});

test('inserts into an empty composer', () => {
  assert.deepEqual(decideReply('waiting', ready, false), { action: 'insert', phase: 'inserted' });
});

test('never merges into a draft the user already wrote', () => {
  assert.deepEqual(decideReply('waiting', { ...ready, composerEmpty: false }, false), { action: 'failure', phase: 'waiting' });
});

test('gives up waiting once the budget is spent', () => {
  assert.deepEqual(decideReply('waiting', { ...ready, onThread: false }, true), { action: 'failure', phase: 'waiting' });
});

test('sends once the draft is in the composer and Send is available', () => {
  const inserted = { ...ready, composerEmpty: false, draftMatches: true, sendAvailable: true };
  assert.deepEqual(decideReply('inserted', inserted, false), { action: 'send', phase: 'confirming' });
});

test('after inserting, a missing draft or Send button is a failure', () => {
  assert.equal(decideReply('inserted', { ...ready, composerEmpty: false, draftMatches: false, sendAvailable: true }, false).action, 'failure');
  assert.equal(decideReply('inserted', { ...ready, composerEmpty: false, draftMatches: true, sendAvailable: false }, false).action, 'failure');
});

test('leaving the thread after inserting is a failure', () => {
  assert.equal(decideReply('inserted', { ...ready, onThread: false }, false).action, 'failure');
  assert.equal(decideReply('confirming', { ...ready, composerReady: false }, false).action, 'failure');
});

test('the send is confirmed by the composer emptying', () => {
  assert.deepEqual(decideReply('confirming', { ...ready, composerEmpty: false, draftMatches: true }, false), { action: 'wait', phase: 'confirming' });
  assert.deepEqual(decideReply('confirming', ready, false), { action: 'success', phase: 'confirming' });
  assert.equal(decideReply('confirming', { ...ready, composerEmpty: false, draftMatches: true }, true).action, 'failure');
});

test('validReply requires a clean thread href and bounded text', () => {
  assert.equal(validReply('/t/123/', 'hi'), true);
  assert.equal(validReply('/e2ee/t/123/', 'x'.repeat(MAX_REPLY_CHARS)), true);
  assert.equal(validReply('/t/123/', '   '), false);
  assert.equal(validReply('/t/123/', 'x'.repeat(MAX_REPLY_CHARS + 1)), false);
  assert.equal(validReply('/marketplace/', 'hi'), false);
  assert.equal(validReply('/t/123/', 42), false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/reply.test.js`
Expected: fails with `Cannot find module '../src/lib/reply'`.

- [ ] **Step 3: Implement**

```js
// src/lib/reply.js
const { isThreadHref } = require('./recent');

const MAX_REPLY_CHARS = 2000;
const REPLY_BUDGET_MS = 12 * 1000;
const REPLY_POLL_MS = 250;

// A reply is a thread path (validated like every other href we splice into the page) and a
// trimmed, bounded piece of text.
const validReply = (href, text) => isThreadHref(href) && typeof text === 'string' &&
  text.trim().length > 0 && [...text.trim()].length <= MAX_REPLY_CHARS;

// One step of sending a reply through the Messenger page. The page side polls its DOM into a
// snapshot { onThread, composerReady, composerEmpty, draftMatches, sendAvailable } and does
// whatever action this names; the phases are waiting (for the thread) → inserted (text is in
// the composer) → confirming (Send was clicked; the composer emptying is the proof).
function decideReply(phase, snapshot, expired) {
  if (phase === 'waiting') {
    if (expired) return { action: 'failure', phase };
    if (!snapshot.onThread || !snapshot.composerReady) return { action: 'wait', phase };
    // Never merge a reply into text the user already drafted there.
    if (!snapshot.composerEmpty) return { action: 'failure', phase };
    return { action: 'insert', phase: 'inserted' };
  }
  // Once text is in, any navigation away is a hard stop: never click Send elsewhere.
  if (!snapshot.onThread || !snapshot.composerReady) return { action: 'failure', phase };
  if (phase === 'inserted') {
    if (!snapshot.draftMatches || !snapshot.sendAvailable) return { action: 'failure', phase };
    return { action: 'send', phase: 'confirming' };
  }
  if (snapshot.composerEmpty) return { action: 'success', phase };
  if (expired) return { action: 'failure', phase };
  return { action: 'wait', phase };
}

module.exports = { decideReply, validReply, MAX_REPLY_CHARS, REPLY_BUDGET_MS, REPLY_POLL_MS };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/reply.test.js` — expected: 9 pass. Then `npm test` — all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reply.js test/reply.test.js
git commit -m "feat(reply): state machine and validation for quick reply"
```

---

### Task 2: Delivering a reply through the page (`scrape.js`)

**Files:**
- Modify: `src/main/scrape.js` (add after `openThread`, export new names)
- Test: `test/scrape.test.js` (append)

**Interfaces:**
- Consumes: `decideReply`, `REPLY_BUDGET_MS`, `REPLY_POLL_MS` from Task 1; existing `openThread(wc, href)`, `delay(ms)`.
- Produces: `replyActions = { snapshot(wc, href, text), insert(wc, text), send(wc) }` (page-side actions, replaceable for tests and dry runs); `deliverReply(wc, href, text, deps = {}) -> Promise<boolean>` where `deps = { actions = replyActions, now = Date.now, wait = delay }`; `sendReply(wc, href, text) -> Promise<boolean>` = `openThread` then `deliverReply`.

- [ ] **Step 1: Write the failing tests**

Append to `test/scrape.test.js`:

```js
const { deliverReply } = require('../src/main/scrape');

// Drive deliverReply with a scripted page: each snapshot is what the page reports on one poll.
function scripted(snapshots, { insertOk = true } = {}) {
  const log = [];
  let i = 0;
  const actions = {
    snapshot: async () => snapshots[Math.min(i++, snapshots.length - 1)],
    insert: async (_wc, text) => { log.push('insert:' + text); return insertOk; },
    send: async () => { log.push('send'); return true; },
  };
  let t = 0;
  const deps = { actions, now: () => t, wait: async () => { t += 250; } };
  return { deps, log };
}
const snap = (o) => ({ onThread: true, composerReady: true, composerEmpty: true, draftMatches: false, sendAvailable: false, ...o });

test('deliverReply inserts, sends, and succeeds when the composer empties', async () => {
  const { deps, log } = scripted([
    snap({ onThread: false }),                                             // still switching thread
    snap(),                                                                // ready: insert
    snap({ composerEmpty: false, draftMatches: true, sendAvailable: true }), // draft landed: send
    snap({ composerEmpty: false, draftMatches: true }),                    // sending
    snap(),                                                                // sent
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
  const vanished = scripted([snap(), snap({ composerEmpty: false, draftMatches: false, sendAvailable: true })]);
  assert.equal(await deliverReply({}, '/t/1/', 'hi', vanished.deps), false);
  assert.deepEqual(vanished.log, ['insert:hi']);
});

test('deliverReply gives up after the budget', async () => {
  const { deps } = scripted([snap({ onThread: false })]);
  assert.equal(await deliverReply({}, '/t/1/', 'hi', deps), false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/scrape.test.js`
Expected: the four new tests fail (`deliverReply is not a function`).

- [ ] **Step 3: Implement**

In `src/main/scrape.js`, add to the require line at the top:

```js
const { decideReply, REPLY_BUDGET_MS, REPLY_POLL_MS } = require('../lib/reply');
```

Add after `openThread`:

```js
// Page-side halves of a quick reply. Kept as replaceable actions so the delivery loop can be
// driven by a scripted page in tests, and so a live check can run everything but the Send.
const COMPOSER = '[role="main"] [contenteditable="true"][role="textbox"]';
const replyActions = {
  // What the loop needs to know this instant. `href` is a validated thread path.
  snapshot: (wc, href, text) => wc.executeJavaScript(`(() => {
    const box = [...document.querySelectorAll(${JSON.stringify(COMPOSER)})].find((el) => el.getBoundingClientRect().height > 0) || null;
    const content = box ? (box.textContent || '') : '';
    const send = [...document.querySelectorAll('[role="main"] [role="button"], [role="main"] button')]
      .find((b) => /send/i.test(b.getAttribute('aria-label') || '') && b.getBoundingClientRect().height > 0) || null;
    const want = ${JSON.stringify(href)}.replace(/\\/$/, '');
    return {
      onThread: location.pathname.replace(/\\/$/, '') === want,
      composerReady: !!box,
      composerEmpty: !content.trim(),
      draftMatches: content.includes(${JSON.stringify(text)}),
      sendAvailable: !!send,
    };
  })()`, true).catch(() => null),
  // insertText goes through the editor's own input pipeline, so the draft is real to Messenger.
  insert: (wc, text) => wc.executeJavaScript(`(() => {
    const box = [...document.querySelectorAll(${JSON.stringify(COMPOSER)})].find((el) => el.getBoundingClientRect().height > 0);
    if (!box) return false;
    box.focus();
    return document.execCommand('insertText', false, ${JSON.stringify(text)});
  })()`, true).catch(() => false),
  send: (wc) => wc.executeJavaScript(`(() => {
    const b = [...document.querySelectorAll('[role="main"] [role="button"], [role="main"] button')]
      .find((b) => /send/i.test(b.getAttribute('aria-label') || '') && b.getBoundingClientRect().height > 0);
    if (!b) return false;
    b.click();
    return true;
  })()`, true).catch(() => false),
};

// Put `text` in the thread's composer and send it, polling the page into the reply state
// machine until it reports success or failure. Assumes the page is already being put on the
// thread (sendReply does that). Never sends anywhere but the target thread.
async function deliverReply(wc, href, text, { actions = replyActions, now = Date.now, wait = delay } = {}) {
  const deadline = now() + REPLY_BUDGET_MS;
  let phase = 'waiting';
  for (;;) {
    const snapshot = await actions.snapshot(wc, href, text);
    if (!snapshot) return false;
    const decision = decideReply(phase, snapshot, now() >= deadline);
    phase = decision.phase;
    switch (decision.action) {
      case 'wait': await wait(REPLY_POLL_MS); break;
      case 'insert': if (!await actions.insert(wc, text)) return false; break;
      case 'send': if (!await actions.send(wc)) return false; await wait(REPLY_POLL_MS); break;
      case 'success': return true;
      default: return false;
    }
  }
}

async function sendReply(wc, href, text) {
  await openThread(wc, href);
  return deliverReply(wc, href, text);
}
```

Update the export line:

```js
module.exports = { readRecentChats, openThread, openInbox, setCompact, setFrame, sendReply, deliverReply, replyActions, RECENT_CHATS_SCRIPT, FRAME_CSS };
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test` — all pass, including the four new scrape tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/scrape.js test/scrape.test.js
git commit -m "feat(reply): deliver a reply through the Messenger page"
```

---

### Task 3: Panel staging for a send (`panel.js`)

**Files:**
- Modify: `src/main/panel.js` (the `api` object and a new `stageReply` next to `stageThread`)

**Interfaces:**
- Consumes: `scrape.sendReply(wc, href, text)` from Task 2.
- Produces: `panel.sendReply(href, text) -> Promise<boolean>` (serialised through the open-queue).

- [ ] **Step 1: Implement** (no unit test: this is window plumbing, verified live in Task 7)

Add after `stageInbox`:

```js
  // Send a reply through the page without showing it: a hidden window does not dispatch the
  // trusted row click, so stage it at opacity 0 like a thread open, then hide it again. If the
  // panel is already showing, it simply switches to that thread in view.
  async function stageReply(href, text) {
    const wasHidden = !win.isVisible();
    if (wasHidden) { win.setOpacity(0); win.showInactive(); }
    try {
      return await scrape.sendReply(win.webContents, href, text);
    } finally {
      // Never leave the invisible window up: it would swallow clicks meant for what's under it.
      if (wasHidden) { win.hide(); win.setOpacity(1); }
    }
  }
```

Add to `api`:

```js
    sendReply: (href, text) => enqueue(() => stageReply(href, text)).then((ok) => ok === true),
```

Note: `enqueue` swallows rejections into `undefined`, hence the `=== true`.

- [ ] **Step 2: Run tests**

Run: `npm test` — still all pass (no behaviour change yet).

- [ ] **Step 3: Commit**

```bash
git add src/main/panel.js
git commit -m "feat(reply): stage the panel invisibly for a send"
```

---

### Task 4: Focus lending and reply IPC (`bubble.js`, `bubble-preload.js`)

**Files:**
- Modify: `src/main/bubble.js` (new `onReply` option, two `ipcMain.on` handlers, `replyResult` in the returned api)
- Modify: `src/renderer/bubble-preload.js`

**Interfaces:**
- Consumes: `validReply` from Task 1.
- Produces: `createBubble({ ..., onReply(href, text) })`; `bubble.replyResult(ok)`; preload `bubbleApi.replyFocus(on)`, `bubbleApi.sendReply(href, text)`, `bubbleApi.onReplyResult(cb)`.

- [ ] **Step 1: Implement main side**

In `src/main/bubble.js`, extend the require and the signature:

```js
const { isThreadHref } = require('../lib/recent');
const { validReply } = require('../lib/reply');
```

```js
function createBubble({ position, onClick, onClose, onMoved, onContextMenu, onOpenChat, onOpenInbox, onDismiss, onReply, dismiss }) {
```

Add after the `bubble:hit` handler:

```js
  // The window is non-focusable so it never takes the keyboard from the user's work. The reply
  // field is the one exception: focus is lent when it opens and taken back when it closes.
  ipcMain.on('bubble:reply-focus', (e, on) => {
    if (!owns(e)) return;
    win.setFocusable(Boolean(on));
    if (on) win.focus();
  });
  ipcMain.on('bubble:reply', (e, href, text) => {
    if (!owns(e) || !validReply(href, text)) return;
    onReply(href, text.trim());
  });
```

Add to the returned object:

```js
    replyResult: (ok) => win.webContents.send('bubble:reply-result', Boolean(ok)),
```

- [ ] **Step 2: Implement preload**

In `src/renderer/bubble-preload.js`, add inside `exposeInMainWorld`:

```js
  replyFocus: (on) => ipcRenderer.send('bubble:reply-focus', Boolean(on)),
  sendReply: (href, text) => ipcRenderer.send('bubble:reply', href, text),
  onReplyResult: (cb) => ipcRenderer.on('bubble:reply-result', (_event, ok) => cb(ok)),
```

- [ ] **Step 3: Run tests and commit**

Run: `npm test` — all pass.

```bash
git add src/main/bubble.js src/renderer/bubble-preload.js
git commit -m "feat(reply): lend focus to the bubble and accept a reply over IPC"
```

---

### Task 5: The reply field in the banner (`bubble.html`, `bubble-renderer.js`)

**Files:**
- Modify: `src/renderer/bubble.html` (styles + markup of `#landed`)
- Modify: `src/renderer/bubble-renderer.js` (the "A message landed" section)

**Interfaces:**
- Consumes: `bubbleApi.replyFocus`, `bubbleApi.sendReply`, `bubbleApi.onReplyResult` from Task 4.

- [ ] **Step 1: Markup**

Replace the `#landed` markup in `bubble.html` with:

```html
      <div id="landed" class="card">
        <div class="av" id="landed-av"></div>
        <div class="text">
          <div class="name" id="landed-name"></div>
          <div class="sub" id="landed-sub"></div>
          <input id="landed-input" type="text" maxlength="2000" autocomplete="off" spellcheck="true">
        </div>
        <div class="time">now</div>
        <button id="landed-reply" type="button" title="Reply" aria-label="Reply">&#x21A9;</button>
      </div>
```

- [ ] **Step 2: Styles**

Add after the `.time` rule in `bubble.html`:

```css
    /* Reply: ↩ at the banner's far end swaps the first line for a field. The field is the
       only thing in the app that ever holds keyboard focus. */
    #landed-reply {
      flex: none; width: 24px; height: 24px; margin-right: -6px; border: 0; border-radius: 12px; padding: 0;
      background: transparent; color: var(--dim); font: 14px/24px -apple-system, system-ui, sans-serif; cursor: default;
    }
    #landed-reply:hover { background: var(--rule); color: var(--ink); }
    #landed-input {
      display: none; width: 100%; box-sizing: border-box; margin: 0; padding: 0; border: 0; outline: 0;
      background: transparent; color: var(--ink); font: 12px/15px -apple-system, system-ui, sans-serif;
      -webkit-user-select: text; user-select: text;
    }
    #landed-input::placeholder { color: var(--dim); }
    body.replying #landed-sub, body.replying #landed .time, body.replying #landed-reply { display: none; }
    body.replying #landed-input { display: block; }
    body.replying #landed:hover { background: var(--card); }
    body.sending #landed-input { display: none; }
    body.sending #landed-sub { display: block; }
```

Also make `.text` accept the input: `.text` already is a column flex; no change needed.

- [ ] **Step 3: Renderer**

Replace the "A message landed" section of `bubble-renderer.js` with:

```js
// ---- "A message landed" ----------------------------------------------------------------------
const landedInput = document.getElementById('landed-input');
const landedReply = document.getElementById('landed-reply');
let landedTimer;
let landedHref = null;
let sending = false; // one reply in flight at a time; ↩ is inert meanwhile

const fold = (after) => {
  clearTimeout(landedTimer);
  landedTimer = setTimeout(() => body.classList.remove('landed'), after);
};

window.bubbleApi.onLanded((item) => {
  if (body.classList.contains('replying') || sending) return; // don't yank a reply out from under the user
  landedHref = item.href;
  fillAvatar(landedAv, item);
  landedName.textContent = item.name;
  landedSub.textContent = item.preview || 'New message';
  landedInput.placeholder = 'Reply to ' + item.name;
  body.classList.add('landed');
  fold(4000);
});
// Clicking the banner opens that conversation. It lives inside the disc, so stop the press
// from starting a drag and the release from counting as a disc click.
landed.addEventListener('mousedown', (e) => e.stopPropagation());
// Hovering holds the banner open; it folds shortly after the cursor leaves (unless replying).
landed.addEventListener('mouseenter', () => clearTimeout(landedTimer));
landed.addEventListener('mouseleave', () => { if (!body.classList.contains('replying') && !sending) fold(1500); });
landed.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!landedHref || body.classList.contains('replying') || sending) return;
  body.classList.remove('landed');
  clearTimeout(landedTimer);
  window.bubbleApi.openChat(landedHref);
});

// ---- Reply from the banner --------------------------------------------------------------------
function openReply() {
  if (!landedHref || sending) return;
  clearTimeout(landedTimer);
  body.classList.add('replying');
  landedInput.value = '';
  window.bubbleApi.replyFocus(true);
  landedInput.focus();
}
function closeReply() {
  body.classList.remove('replying');
  window.bubbleApi.replyFocus(false);
}
landedReply.addEventListener('click', (e) => { e.stopPropagation(); openReply(); });
landedInput.addEventListener('click', (e) => e.stopPropagation());
landedInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeReply(); fold(300); }
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const text = landedInput.value.trim();
  if (!text) return;
  sending = true;
  closeReply();
  body.classList.add('sending');
  landedSub.textContent = 'Sending…';
  window.bubbleApi.sendReply(landedHref, text);
});
// Clicking anywhere else takes focus away; that is a cancel.
landedInput.addEventListener('blur', () => { if (body.classList.contains('replying')) { closeReply(); fold(300); } });
window.bubbleApi.onReplyResult((ok) => {
  sending = false;
  body.classList.remove('sending');
  landedSub.textContent = ok ? 'Sent' : 'Couldn’t send — opened the chat';
  fold(ok ? 1200 : 300);
});
```

- [ ] **Step 4: Run tests, then load the page for syntax**

Run: `npm test` — all pass. Then a syntax check of the renderer: `node --check src/renderer/bubble-renderer.js`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/bubble.html src/renderer/bubble-renderer.js
git commit -m "feat(reply): reply field in the landed banner"
```

---

### Task 6: Wire it in `main.js`

**Files:**
- Modify: `src/main/main.js` (`createBubble` options)

**Interfaces:**
- Consumes: `panel.sendReply` (Task 3), `bubble.replyResult` (Task 4), existing `openChat(href)`.

- [ ] **Step 1: Implement**

Add to the `createBubble({...})` options in `main.js`, after `onOpenInbox`:

```js
    // A reply typed into the banner goes out through the hidden page. If that fails, the
    // conversation opens with whatever got as far as the composer, so nothing typed is lost.
    onReply: async (href, text) => {
      const ok = await panel.sendReply(href, text);
      bubble.replyResult(ok);
      if (!ok) openChat(href);
    },
```

- [ ] **Step 2: Run tests and commit**

Run: `npm test` — all pass.

```bash
git add src/main/main.js
git commit -m "feat(reply): send banner replies through the panel"
```

---

### Task 7: Live verification (send stubbed) and docs

**Files:**
- Create (scratchpad, throwaway): `dryrun.js`
- Modify: `CHANGELOG.md`, `README.md`

- [ ] **Step 1: Dry run on the logged-in profile** (Bubble.app must be quit)

```js
// <scratchpad>/dryrun.js — everything but the Send click.
const { app, BrowserWindow } = require('electron');
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
require('/Users/termite/Projects/messenger-mac/src/main/main.js');
const scrape = require('/Users/termite/Projects/messenger-mac/src/main/scrape.js');

app.whenReady().then(() => setTimeout(async () => {
  const panel = BrowserWindow.getAllWindows().find((w) => /messenger\.com/.test(w.webContents.getURL()));
  const wc = panel.webContents;
  const rows = await scrape.readRecentChats(wc);
  const href = rows && rows[0] && rows[0].href;
  log('target thread:', href, 'panel visible:', panel.isVisible());
  const seen = [];
  const actions = {
    snapshot: async (...a) => { const s = await scrape.replyActions.snapshot(...a); seen.push(s); return s; },
    insert: scrape.replyActions.insert,
    // Never sends: pretend Send was clicked, then clear the draft ourselves so the loop sees success.
    send: async () => { log('SEND (stubbed)'); await wc.executeJavaScript(`(() => { const b = document.querySelector('[role="main"] [contenteditable="true"][role="textbox"]'); b.focus(); document.execCommand('selectAll'); document.execCommand('delete'); })()`, true); return true; },
  };
  panel.setOpacity(0); panel.showInactive();
  await scrape.openThread(wc, href);
  const ok = await scrape.deliverReply(wc, href, 'bubble dry run — not sent', { actions });
  panel.hide(); panel.setOpacity(1);
  log('result:', ok, 'snapshots:', JSON.stringify(seen.slice(0, 4)), '… final:', JSON.stringify(seen[seen.length - 1]));
  app.quit();
}, 8000));
```

Run: `env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron <scratchpad>/dryrun.js`
Expected: `result: true`; snapshots progress `onThread:false` → ready → `draftMatches:true, sendAvailable:true` → composer empty; the panel ends hidden.

- [ ] **Step 2: Docs**

`CHANGELOG.md` under *Unreleased → Added*:

```
- Reply from the banner: when a message lands, the ↩ at the banner's end opens a reply field.
  Enter sends it through the hidden Messenger page; Esc or clicking elsewhere cancels. If the
  send can't complete, the conversation opens with your text in the composer.
```

`README.md`, in "How it works" after the *A message lands* bullet:

```
- **Reply right there** — the ↩ at the end of the banner opens a reply field. Type, press Enter,
  and it's sent without opening the panel; Esc cancels.
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md README.md
git commit -m "docs: quick reply from the banner"
```

- [ ] **Step 4: Hand over the real send**

Ask the user to run `npm start`, wait for a message (or have someone send one), press ↩, type, Enter — to a contact of their choosing. Confirm "Sent" appears and the message shows in Messenger.
