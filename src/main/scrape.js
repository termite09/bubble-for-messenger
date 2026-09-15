// Messenger's UI must be in English: the scripts below find controls by their English labels
// and text — aria-label "Back", "New message", the account gear's "Settings, help and more",
// the "Preferences" menu item, the "You: " prefix of one's own messages, and the short time
// stamps ("2m", "Yesterday"). Another language leaves those paths as no-ops.
const { normalizeRows } = require('../lib/recent');
const { ROW_READER_SOURCE } = require('../lib/rows');
const { decideReply, REPLY_BUDGET_MS, REPLY_POLL_MS } = require('../lib/reply');

// Runs inside messenger.com: the chat-list reader from lib/rows.
const RECENT_CHATS_SCRIPT = ROW_READER_SOURCE;

// Every script the app runs in the page goes through here: in its own isolated world (the
// page's JS cannot swap out the DOM built-ins these scripts rely on), with a deadline (a page
// that never answers must not wedge the open queue), and with a user gesture only for the
// scripts that click. `wc` in tests is a fake with executeJavaScript alone.
const WORLD = 1001;
function run(wc, code, { timeoutMs = 3000, userGesture = false } = {}) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('page script timed out')), timeoutMs);
  });
  const exec = wc.executeJavaScriptInIsolatedWorld
    ? wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code }], userGesture)
    : wc.executeJavaScript(code, userGesture);
  return Promise.race([exec, deadline]).finally(() => clearTimeout(timer));
}

const onMessenger = (wc) => /^https:\/\/(www\.)?messenger\.com\//.test(wc.getURL());

// The chat list, or null when the page's rows can't be trusted right now (see the script).
async function readRecentChats(wc) {
  if (!onMessenger(wc)) return [];
  try {
    const raw = await run(wc, RECENT_CHATS_SCRIPT, { timeoutMs: 2000 });
    return raw === null ? null : normalizeRows(raw);
  } catch (e) {
    return [];
  }
}

// Find the conversation's list row and return the viewport point to click, or null if no row is
// actually clickable right now. Several links can share the thread href (avatar, hidden prefetch),
// and when a thread is open the list rows are still in the DOM at their old positions but sit
// *behind* the thread pane — so we require the point to hit-test to the row itself (topmost),
// which makes a covered list fall through to the reload path used for switching.
function rowPoint(wc, href) {
  return run(
    wc,
    `(() => {
    const links = [...document.querySelectorAll('a[role="link"][href^=${JSON.stringify(href)}]')]
      .sort((a, b) => {
        const ra = a.getBoundingClientRect(); const rb = b.getBoundingClientRect();
        return rb.width * rb.height - ra.width * ra.height;
      });
    for (const a of links) {
      const r = a.getBoundingClientRect();
      if (r.width <= 60 || r.height <= 20 || r.top < 0 || r.bottom > innerHeight) continue;
      const x = Math.round(r.left + r.width / 2);
      const y = Math.round(r.top + r.height / 2);
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === a || a.contains(hit))) return { x, y };
    }
    return null;
  })()`,
  ).catch(() => null);
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const LOAD_TIMEOUT_MS = 15000;
const ERR_ABORTED = -3; // a superseded navigation (e.g. a redirect); the replacement still loads

// Load `url` and settle once the page has finished or failed loading — bounded by a timeout so a
// dead network can never leave the caller (and an invisible panel) waiting forever.
function reload(wc, url) {
  return new Promise((resolve) => {
    let timer;
    const done = () => {
      clearTimeout(timer);
      wc.removeListener('did-finish-load', onLoad);
      wc.removeListener('did-fail-load', onFail);
      resolve();
    };
    const onLoad = () => setTimeout(done, 700);
    const onFail = (_e, code, _desc, _url, isMainFrame) => {
      if (isMainFrame && code !== ERR_ABORTED) done();
    };
    wc.on('did-finish-load', onLoad);
    wc.on('did-fail-load', onFail);
    timer = setTimeout(done, LOAD_TIMEOUT_MS);
    wc.loadURL(url).catch(() => {}); // failures arrive via did-fail-load / the timeout
  });
}

// The conversation is showing when [role=main] is the topmost element at its own centre.
// (Presence alone is not enough: the list keeps its layout behind an open thread.)
function threadShowing(wc) {
  return run(
    wc,
    `(() => {
    const m = document.querySelector('[role="main"]');
    if (!m) return false;
    const r = m.getBoundingClientRect();
    if (r.height < 200) return false;
    const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    return !!(el && m.contains(el));
  })()`,
  ).catch(() => false);
}

// Any conversation row is clickable, i.e. the list is in front.
function listInteractive(wc) {
  return run(
    wc,
    `(() => {
    for (const a of document.querySelectorAll('a[role="link"][href*="/t/"]')) {
      const r = a.getBoundingClientRect();
      if (r.width <= 60 || r.height <= 20 || r.top < 0 || r.bottom > innerHeight) continue;
      const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      if (el && (el === a || a.contains(el))) return true;
    }
    return false;
  })()`,
  ).catch(() => false);
}

function click(wc, point) {
  wc.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y });
  wc.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  wc.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 });
}

async function waitUntil(check, wc, timeout) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check(wc)) return true;
    await delay(60);
  }
  return false;
}

// Return to the list client-side (~100ms) instead of reloading (~1-2s): un-hide the Back
// control just long enough to click it, then hide it again. The panel is held invisible by the
// caller during this, so the control is never clickable — or visible — to the user.
async function backToList(wc) {
  const point = await run(
    wc,
    `(() => {
    let s = document.getElementById('mb-back');
    if (!s) { s = document.createElement('style'); s.id = 'mb-back'; document.head.appendChild(s); }
    s.textContent = '[aria-label="Back"]{display:block!important;opacity:0!important;pointer-events:auto!important}';
    const b = document.querySelector('[aria-label="Back"]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return r.width > 0 ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
  })()`,
  ).catch(() => null);
  const unhide = () =>
    run(
      wc,
      `(() => { const s = document.getElementById('mb-back'); if (s) s.textContent = ''; })()`,
    ).catch(() => {});
  if (!point) {
    await unhide();
    return false;
  }
  click(wc, point);
  const ok = await waitUntil(listInteractive, wc, 2000);
  await unhide();
  return ok;
}

const waitForThread = (wc, timeout = 4000) => waitUntil(threadShowing, wc, timeout);

// Open a conversation. At the panel's narrow width Messenger only slides into a thread on a
// *trusted* click of its list row — a synthetic a.click() or a URL load just highlights it — so
// we inject a real mouse event at the row. If the row isn't clickable (a thread is already open,
// so the list is behind it) we reload to the list first. Resolves once the thread is on screen,
// letting the caller keep the panel hidden until then so the list transition is never seen.
async function openThread(wc, href) {
  let point = await rowPoint(wc, href);
  if (!point && (await backToList(wc))) point = await rowPoint(wc, href); // fast client-side path
  if (!point) {
    await reload(wc, 'https://www.messenger.com' + href); // last resort
    point = await rowPoint(wc, href);
  }
  if (!point) return;
  click(wc, point);
  if (await waitForThread(wc)) return;
  // A click that lands while the list is still sliding in only highlights the row; once more.
  point = await rowPoint(wc, href);
  if (point) {
    click(wc, point);
    await waitForThread(wc);
  }
}

// Page-side halves of a quick reply. Kept as replaceable actions so the delivery loop can be
// driven by a scripted page in tests, and so a live check can run everything but the Send.
// The composer counts only when it is actually in front: at the panel's width the thread pane
// sits *behind* the list with its composer rendered but visibility:hidden, and a hidden
// composer takes neither focus nor text. Sending is a trusted Enter into the focused composer —
// what the user would press — rather than a Send button, whose label is localised and shares
// its wording with "Send a like" / "Send a voice clip".
const COMPOSER = '[role="main"] [contenteditable="true"][role="textbox"]';
const FIND_COMPOSER = `[...document.querySelectorAll(${JSON.stringify(COMPOSER)})].find((el) => {
  const r = el.getBoundingClientRect();
  if (r.height <= 0 || getComputedStyle(el).visibility === 'hidden') return false;
  const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
  return !!hit && (hit === el || el.contains(hit));
}) || null`;
const replyActions = {
  // What the loop needs to know this instant. `href` is a validated thread path.
  snapshot: (wc, href, text) =>
    run(
      wc,
      `(() => {
    const box = ${FIND_COMPOSER};
    const content = box ? (box.textContent || '') : '';
    const want = ${JSON.stringify(href)}.replace(/\\/$/, '');
    return {
      onThread: location.pathname.replace(/\\/$/, '') === want,
      composerReady: !!box,
      composerEmpty: !content.trim(),
      draftMatches: content.includes(${JSON.stringify(text)}),
      sendAvailable: !!box && document.activeElement === box,
    };
  })()`,
    ).catch(() => null),
  // Messenger's editor ignores execCommand('insertText') and synthetic paste; only trusted
  // input reaches it. So: focus the composer in the page, then commit the text the way an
  // input method does (insertText) — one event for the whole reply, emoji included — and, if
  // the editor did not take it, type it as key events, one per character.
  insert: async (wc, text, href) => {
    const focused = await run(
      wc,
      `(() => {
      const box = ${FIND_COMPOSER};
      if (!box) return false;
      box.focus();
      return document.activeElement === box;
    })()`,
      { userGesture: true },
    ).catch(() => false);
    if (!focused) return false;
    if (typeof wc.insertText === 'function') {
      await wc.insertText(text).catch(() => {});
      await delay(REPLY_POLL_MS);
      const after = href ? await replyActions.snapshot(wc, href, text) : null;
      // The editor took it, or the check could not tell: the delivery loop decides. Only a
      // clear "not there" falls back to typing — anything else could double the text.
      if (!after || after.draftMatches) return true;
    }
    for (const ch of text) wc.sendInputEvent({ type: 'char', keyCode: ch });
    return true;
  },
  send: async (wc) => {
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
    return true;
  },
};

// Put `text` in the thread's composer and send it, polling the page into the reply state
// machine until it reports success or failure. Assumes the page is already being put on the
// thread (sendReply does that). Never sends anywhere but the target thread.
async function deliverReply(
  wc,
  href,
  text,
  { actions = replyActions, now = Date.now, wait = delay } = {},
) {
  const deadline = now() + REPLY_BUDGET_MS;
  let phase = 'waiting';
  for (;;) {
    const snapshot = await actions.snapshot(wc, href, text);
    if (!snapshot) return false;
    const decision = decideReply(phase, snapshot, now() >= deadline);
    phase = decision.phase;
    switch (decision.action) {
      case 'wait':
        await wait(REPLY_POLL_MS);
        break;
      case 'insert':
        if (!(await actions.insert(wc, text, href))) return false;
        await wait(REPLY_POLL_MS);
        break;
      case 'send':
        if (!(await actions.send(wc))) return false;
        await wait(REPLY_POLL_MS);
        break;
      case 'success':
        return true;
      default:
        return false;
    }
  }
}

async function sendReply(wc, href, text) {
  await openThread(wc, href);
  return deliverReply(wc, href, text);
}

// Compact mode strips Messenger down to just the open thread: hide the left icon rail, the
// per-thread voice/video/info buttons, and the Back arrow (navigation is via the fan, and the
// list it returns to is not part of this view). The conversation-list column is deliberately
// NOT hidden — at this width Messenger sizes the thread through that container, so removing it
// collapses the message area. A <style> tag is toggled (not removed) so it survives the SPA's
// re-renders while compact mode is on.
const COMPACT_CSS = [
  '[role="navigation"][aria-label="Inbox switcher"]{display:none!important}',
  '[aria-label="Start a voice call"],[aria-label="Start a video call"],[aria-label="Conversation information"],[aria-label="Back"]{display:none!important}',
  // Messenger sizes the thread row to the viewport minus a 32px allowance; take the full height.
  'div:has(> [role="main"]),[role="main"],[role="main"]>div{padding:0!important;margin:0!important;height:100vh!important;max-height:100vh!important}',
  // No scrollbar gutter — it reserved 15px on the right and read as a fixed bar.
  '::-webkit-scrollbar{width:0!important;height:0!important}',
  '*{scrollbar-width:none!important}',
].join('');

// The thread itself is a rounded card inset 16px from the left and capped 32px short of the
// viewport. Its only handle is a bag of atomic classes, so find it by shape (the largest
// opaque box inside [role=main]) and write a rule for that exact class combination. Runs
// again on every compact apply, so a Messenger deploy that renames classes self-heals.
function fitThread(wc) {
  return run(
    wc,
    `(() => {
    const m = document.querySelector('[role="main"]');
    if (!m) return '';
    let card = null, best = 0;
    for (const el of m.querySelectorAll('div')) {
      const r = el.getBoundingClientRect();
      if (r.width < 300 || r.height < 300 || r.width * r.height <= best) continue;
      if (getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)') continue;
      card = el; best = r.width * r.height;
    }
    if (!card || !card.classList.length) return '';
    return '.' + [...card.classList].map((c) => CSS.escape(c)).join('.') +
      '{margin:0!important;border-radius:0!important;height:100vh!important;max-height:100vh!important}';
  })()`,
  )
    .catch(() => '')
    .then((css) => setStyle(wc, 'mb-fit', css));
}

// Set the text of a persistent <style id> in the page (created on first use, toggled after).
function setStyle(wc, id, css) {
  return run(
    wc,
    `(() => {
    let s = document.getElementById(${JSON.stringify(id)});
    if (!s) { s = document.createElement('style'); s.id = ${JSON.stringify(id)}; document.head.appendChild(s); }
    s.textContent = ${JSON.stringify(css)};
  })()`,
  ).catch(() => {});
}

const setCompact = (wc, on) =>
  Promise.all([
    setStyle(wc, 'mb-compact', on ? COMPACT_CSS : ''),
    on ? fitThread(wc) : setStyle(wc, 'mb-fit', ''),
  ]);

// The panel window is opaque with the system's rounded corners (a transparent window with a
// shadow is recomposited every frame); the page gets a hairline just inside that edge. html
// is pinned to the viewport and body does the scrolling: on the login page html and body are
// 0px tall (everything on it is positioned), and the page would otherwise show nothing.
const RADIUS = 10; // macOS's radius for a frameless rounded window
const FRAME_CSS = [
  'html{height:100%!important;overflow:hidden!important}',
  'body{height:100%!important;overflow:auto!important;position:relative!important}',
  '#mb-frame{position:fixed;inset:0;z-index:2147483647;pointer-events:none;box-sizing:border-box;border-radius:' +
    RADIUS +
    'px;' +
    'border:1px solid var(--mb-hairline,rgba(255,255,255,.12))}',
  // Overlay scrollbars would otherwise ride the sheet's edge over the hairline.
  '::-webkit-scrollbar,::-webkit-scrollbar-thumb{display:none!important;width:0!important;background:transparent!important}',
].join('');

function setFrame(wc, on) {
  return run(
    wc,
    `(() => {
    if (!document.getElementById('mb-frame')) { const d = document.createElement('div'); d.id = 'mb-frame'; document.body.appendChild(d); }
  })()`,
  )
    .catch(() => {})
    .then(() => setStyle(wc, 'mb-frame-css', on ? FRAME_CSS : ''));
}

// Messenger decides its theme once, at load, from its own preference (Light / Dark / Device);
// only "Device" follows prefers-color-scheme, so setting nativeTheme alone did nothing for most
// accounts. Its toggle works by swapping two classes on <html>, which every theme variable
// (--card-background, --primary-text, --web-wash ...) keys off; the app swaps them itself.
function setTheme(wc, dark) {
  const [add, remove] = dark
    ? ['__fb-dark-mode', '__fb-light-mode']
    : ['__fb-light-mode', '__fb-dark-mode'];
  return run(
    wc,
    `(() => {
    const c = document.documentElement.classList;
    // The frame's hairline: white on the dark wash, black on the light one.
    document.documentElement.style.setProperty('--mb-hairline', ${dark ? "'rgba(255,255,255,.12)'" : "'rgba(0,0,0,.12)'"});
    c.remove('${remove}');
    c.add('${add}');
  })()`,
  ).catch(() => {});
}

// Messenger's Preferences dialog, where its own switches (notification sounds, dark mode) are:
// the account gear at the top of the inbox, then the first item of its menu.
function openPreferences(wc) {
  return run(
    wc,
    `(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const gear = [...document.querySelectorAll('[aria-label]')].find((e) => /Settings, help and more$/.test(e.getAttribute('aria-label')));
    if (!gear) return false;
    gear.click();
    await wait(500);
    const item = [...document.querySelectorAll('[role="menuitem"]')].find((e) => /^Preferences/.test(e.innerText));
    if (!item) return false;
    item.click();
    return true;
  })()`,
    { userGesture: true, timeoutMs: 6000 },
  ).catch(() => false);
}

// Back to the chat list. In the narrow layout an open thread shows a Back button.
function openInbox(wc) {
  if (!onMessenger(wc)) return wc.loadURL('https://www.messenger.com/').catch(() => {});
  return run(
    wc,
    `(() => {
    const back = document.querySelector('[aria-label="Back"]');
    if (back) back.click();
  })()`,
    { userGesture: true, timeoutMs: 3000 },
  ).catch(() => {});
}

module.exports = {
  run,
  readRecentChats,
  openThread,
  openInbox,
  openPreferences,
  setCompact,
  setFrame,
  setTheme,
  sendReply,
  deliverReply,
  replyActions,
  RECENT_CHATS_SCRIPT,
  FRAME_CSS,
};
