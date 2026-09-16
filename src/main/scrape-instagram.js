// Scripts run inside instagram.com's mobile web app (the panel loads it with a phone user
// agent): the same surface as scrape.js, for a page with a different shape. The inbox rows
// are role=button with no thread id, so chats are opened by *name* — the row whose
// span[title] is the name — and a synthetic click is enough (no trusted event needed). The
// list stays in the DOM behind an open thread, as on Messenger, so the thread's own Back
// (the topmost control so labelled) is clicked first when the row is covered. A chat that has
// left the list can still be opened by the thread path learned when it was last open.
const { normalizeRows, handleName, nameHandle, THREAD_HREFS } = require('../lib/recent');
const { ROW_READER_INSTAGRAM_SOURCE } = require('../lib/rows');
const { INSTAGRAM } = require('../lib/sites');
const base = require('./scrape');

const ORIGIN = 'https://www.instagram.com';
const THREAD_PATH = /^\/direct\/t\/\d+\/?$/;
const onInstagram = (wc) => /^https:\/\/(www\.)?instagram\.com\//.test(wc.getURL());

async function readRecentChats(wc) {
  if (!onInstagram(wc)) return [];
  try {
    const raw = await base.run(wc, ROW_READER_INSTAGRAM_SOURCE, { timeoutMs: 2000 });
    return raw === null ? null : normalizeRows(raw);
  } catch (e) {
    return [];
  }
}

// The thread is showing when its composer is in front and the address is a thread's.
const THREAD_SHOWING = `(() => {
  if (!/^\\/direct\\/t\\/\\d+\\/?$/.test(location.pathname)) return false;
  const box = document.querySelector('[role="textbox"][contenteditable="true"]');
  if (!box) return false;
  const r = box.getBoundingClientRect();
  if (r.height <= 0) return false;
  const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
  return !!hit && (hit === box || box.contains(hit));
})()`;
const threadShowing = (wc) => base.run(wc, THREAD_SHOWING).catch(() => false);

// The topmost element under a control's centre is the control itself — i.e. it is in front.
const IN_FRONT = `(el) => {
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0 || r.top < 0 || r.bottom > innerHeight) return false;
  const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
  return !!hit && (hit === el || el.contains(hit));
}`;

const pageActions = {
  // Click the list row named `name` if it is in front. The name is compared, never spliced.
  clickRow: (wc, name) =>
    base
      .run(
        wc,
        `(() => {
    const inFront = ${IN_FRONT};
    for (const row of document.querySelectorAll('[role="button"]')) {
      const title = row.querySelector('span[title]');
      if (!title || !row.querySelector('abbr') || title.getAttribute('title') !== ${JSON.stringify(name)}) continue;
      if (!inFront(row)) return false;
      row.click();
      return true;
    }
    return false;
  })()`,
        { userGesture: true },
      )
      .catch(() => false),
  // The open thread's Back — the one in front; the inbox header's would leave for the feed.
  backToList: async (wc) => {
    const clicked = await base
      .run(
        wc,
        `(() => {
    const inFront = ${IN_FRONT};
    for (const svg of document.querySelectorAll('[aria-label="Back"]')) {
      const control = svg.closest('[role="button"], a, button') || svg.parentElement;
      if (!control || !inFront(control)) continue;
      control.click();
      return true;
    }
    return false;
  })()`,
        { userGesture: true },
      )
      .catch(() => false);
    if (!clicked) return false;
    return base.waitUntil(listInteractive, wc, 2000);
  },
  load: async (wc, url) => {
    await base.reload(wc, url);
    return true;
  },
  // The path the page landed on, once the thread is showing (null if it never does).
  threadPath: async (wc) =>
    (await waitForThread(wc)) ? base.run(wc, 'location.pathname').catch(() => null) : null,
};

// Any thread row is in front, i.e. the list is showing.
const listInteractive = (wc) =>
  base
    .run(
      wc,
      `(() => {
    const inFront = ${IN_FRONT};
    for (const row of document.querySelectorAll('[role="button"]')) {
      if (row.querySelector('span[title]') && row.querySelector('abbr') && inFront(row)) return true;
    }
    return false;
  })()`,
    )
    .catch(() => false);

const waitForThread = (wc, timeout = 4000) => base.waitUntil(threadShowing, wc, timeout);

// Open a chat by its handle — a name handle, or a thread path — and resolve to the thread path
// the page landed on (null if it could not be opened). `threadHref` is the path learned when
// the chat was last open, for a chat no longer in the list.
async function openThread(
  wc,
  href,
  { threadHref = null, actions = pageActions, wait = base.delay } = {},
) {
  if (!THREAD_HREFS.instagram.test(href)) return null;
  const name = handleName(href);
  let opened = false;
  if (name) {
    opened = await actions.clickRow(wc, name);
    if (!opened) {
      // Behind an open thread: back to the list first. Neither in front: the list may still
      // be sliding in (the panel was just parked on it) — once more after a moment.
      const backed = await actions.backToList(wc);
      if (!backed) await wait(400);
      opened = await actions.clickRow(wc, name);
    }
  }
  if (!opened) {
    const path = name ? threadHref : href;
    if (!path || !THREAD_PATH.test(path)) return null;
    opened = await actions.load(wc, ORIGIN + path);
    if (!opened) return null;
  }
  const landed = await actions.threadPath(wc);
  return landed && THREAD_PATH.test(landed) ? landed : null;
}

// The chat the panel is showing, handled by name — the thread header's: the first bold leaf
// span in the header band (the Back control's hidden "Back" text sits there too, in regular
// weight) — with its picture, and its path, learned. Null on the inbox.
async function readShowing(wc) {
  if (!onInstagram(wc)) return null;
  // A navigation reports before the thread view has drawn; give it a moment to.
  if (!(await waitForThread(wc, 2500))) return null;
  const raw = await base
    .run(
      wc,
      `(() => {
    if (!/^\\/direct\\/t\\/\\d+\\/?$/.test(location.pathname)) return null;
    const inBand = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= 64; };
    const header = document.querySelector('[aria-label="Open the details pane of the chat"]') || document;
    const leaves = [...header.querySelectorAll('span')]
      .filter((el) => !el.querySelector('span') && inBand(el) && el.textContent.trim());
    const bold = leaves.find((el) => parseInt(getComputedStyle(el).fontWeight, 10) >= 600);
    const el = bold || leaves.find((el) => el.textContent.trim() !== 'Back');
    const img = [...header.querySelectorAll('img[alt="user-profile-picture"]')].find(inBand);
    return { threadHref: location.pathname, name: el ? el.textContent.trim() : '', avatarUrl: img ? img.src : null };
  })()`,
    )
    .catch(() => null);
  if (!raw || !raw.name || !THREAD_PATH.test(raw.threadHref || '')) return null;
  return {
    href: nameHandle(raw.name),
    threadHref: raw.threadHref,
    name: raw.name,
    avatarUrl: typeof raw.avatarUrl === 'string' ? raw.avatarUrl : null,
  };
}

// Back to the inbox: the thread's Back when one is open, else the inbox itself.
async function openInbox(wc) {
  if (!onInstagram(wc)) return wc.loadURL(INSTAGRAM.home).catch(() => {});
  const path = await base.run(wc, 'location.pathname').catch(() => null);
  if (path && THREAD_PATH.test(path) && (await pageActions.backToList(wc))) return;
  if (path !== '/direct/inbox/') await wc.loadURL(INSTAGRAM.home).catch(() => {});
}

// The composer, and Send: typing reveals a button so labelled; Enter is the fallback.
const COMPOSER = '[role="textbox"][contenteditable="true"]';
const replyActions = {
  ...base.makeReplyActions(COMPOSER),
  send: async (wc) => {
    const clicked = await base
      .run(
        wc,
        `(() => {
    const inFront = ${IN_FRONT};
    for (const b of document.querySelectorAll('[role="button"], button')) {
      if ((b.innerText || b.textContent || '').trim() !== 'Send' || !inFront(b)) continue;
      b.click();
      return true;
    }
    return false;
  })()`,
        { userGesture: true },
      )
      .catch(() => false);
    if (clicked) return true;
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
    return true;
  },
};

async function sendReply(wc, href, text, { threadHref, actions, reply = replyActions, wait } = {}) {
  const path = await openThread(wc, href, { threadHref, actions, ...(wait ? { wait } : {}) });
  if (!path) return false;
  return base.deliverReply(wc, path, text, { actions: reply, ...(wait ? { wait } : {}) });
}

// Compact mode: just the conversation — no Back (navigation is the stack's; its glyph sits
// button > div > span > svg, and the header row around it is the thread's name, which stays),
// no ⓘ, no scrollbars.
const COMPACT_CSS = [
  '[role="button"]:has(> div > span > [aria-label="Back"]),[role="button"]:has(> span > [aria-label="Back"]),[aria-label="Back"]{display:none!important}',
  '[aria-label="Conversation information"]{display:none!important}',
  '::-webkit-scrollbar{width:0!important;height:0!important}',
  '*{scrollbar-width:none!important}',
].join('');
const setCompact = (wc, on) => base.setStyle(wc, 'mb-compact', on ? COMPACT_CSS : '');

module.exports = {
  run: base.run,
  readRecentChats,
  readShowing,
  openThread,
  openInbox,
  sendReply,
  setCompact,
  setFrame: base.setFrame,
  setTheme: base.setTheme,
  openPreferences: async () => false,
  pageActions,
  replyActions,
};
