const { normalizeRows, LIMIT } = require('../lib/recent');

// Runs inside messenger.com. Reads the first rows of the chat list. Messenger renders each
// conversation as [role="row"] containing a link to /t/<id>/ (or /e2ee/t/<id>/), the avatar
// <img> and name/preview spans; unread rows are drawn in bold.
const RECENT_CHATS_SCRIPT = `(() => {
  const out = [];
  for (const row of document.querySelectorAll('[role="row"]')) {
    const link = row.querySelector('a[role="link"][href*="/t/"]');
    if (!link) continue;
    const img = row.querySelector('img');
    const spans = [...row.querySelectorAll('span[dir="auto"]')].map((s) => s.textContent.trim()).filter(Boolean);
    const unread = [...row.querySelectorAll('span')].some((s) => parseInt(getComputedStyle(s).fontWeight, 10) >= 600);
    const name = (img && img.alt) || spans[0] || '';
    // After the name come the last-message preview and a short time stamp ("2m", "Yesterday").
    const rest = spans.filter((t) => t !== name);
    const timeIdx = rest.findIndex((t) => /^(\\d+\\s?[smhdw]|[A-Z][a-z]{2}|Yesterday|Now)$/.test(t));
    const time = timeIdx >= 0 ? rest[timeIdx] : '';
    // Skip the lone "·" Messenger puts between preview and time.
    const preview = rest.find((t, i) => i !== timeIdx && t !== '·') || '';
    out.push({
      // Use the clean pathname (/t/123/) — the DOM href can carry a ?focus_target=1 query.
      href: new URL(link.href).pathname,
      name,
      avatarUrl: img ? img.src : null,
      unread,
      preview,
      time,
    });
    if (out.length === ${LIMIT}) break;
  }
  return out;
})()`;

const onMessenger = (wc) => /^https:\/\/(www\.)?messenger\.com\//.test(wc.getURL());

async function readRecentChats(wc) {
  if (!onMessenger(wc)) return [];
  try {
    return normalizeRows(await wc.executeJavaScript(RECENT_CHATS_SCRIPT, true));
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
  return wc.executeJavaScript(`(() => {
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
  })()`, true).catch(() => null);
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
    const onFail = (_e, code, _desc, _url, isMainFrame) => { if (isMainFrame && code !== ERR_ABORTED) done(); };
    wc.on('did-finish-load', onLoad);
    wc.on('did-fail-load', onFail);
    timer = setTimeout(done, LOAD_TIMEOUT_MS);
    wc.loadURL(url).catch(() => {}); // failures arrive via did-fail-load / the timeout
  });
}

// The conversation is showing when [role=main] is the topmost element at its own centre.
// (Presence alone is not enough: the list keeps its layout behind an open thread.)
function threadShowing(wc) {
  return wc.executeJavaScript(`(() => {
    const m = document.querySelector('[role="main"]');
    if (!m) return false;
    const r = m.getBoundingClientRect();
    if (r.height < 200) return false;
    const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    return !!(el && m.contains(el));
  })()`, true).catch(() => false);
}

// Any conversation row is clickable, i.e. the list is in front.
function listInteractive(wc) {
  return wc.executeJavaScript(`(() => {
    for (const a of document.querySelectorAll('a[role="link"][href*="/t/"]')) {
      const r = a.getBoundingClientRect();
      if (r.width <= 60 || r.height <= 20 || r.top < 0 || r.bottom > innerHeight) continue;
      const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
      if (el && (el === a || a.contains(el))) return true;
    }
    return false;
  })()`, true).catch(() => false);
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
  const point = await wc.executeJavaScript(`(() => {
    let s = document.getElementById('mb-back');
    if (!s) { s = document.createElement('style'); s.id = 'mb-back'; document.head.appendChild(s); }
    s.textContent = '[aria-label="Back"]{display:block!important;opacity:0!important;pointer-events:auto!important}';
    const b = document.querySelector('[aria-label="Back"]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return r.width > 0 ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
  })()`, true).catch(() => null);
  const unhide = () => wc.executeJavaScript(`(() => { const s = document.getElementById('mb-back'); if (s) s.textContent = ''; })()`, true).catch(() => {});
  if (!point) { await unhide(); return false; }
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
  if (!point && await backToList(wc)) point = await rowPoint(wc, href); // fast client-side path
  if (!point) {
    await reload(wc, 'https://www.messenger.com' + href); // last resort
    point = await rowPoint(wc, href);
  }
  if (!point) return;
  click(wc, point);
  if (await waitForThread(wc)) return;
  // A click that lands while the list is still sliding in only highlights the row; once more.
  point = await rowPoint(wc, href);
  if (point) { click(wc, point); await waitForThread(wc); }
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
  return wc.executeJavaScript(`(() => {
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
  })()`, true).catch(() => '').then((css) => setStyle(wc, 'mb-fit', css));
}

// Set the text of a persistent <style id> in the page (created on first use, toggled after).
function setStyle(wc, id, css) {
  return wc.executeJavaScript(`(() => {
    let s = document.getElementById(${JSON.stringify(id)});
    if (!s) { s = document.createElement('style'); s.id = ${JSON.stringify(id)}; document.head.appendChild(s); }
    s.textContent = ${JSON.stringify(css)};
  })()`, true).catch(() => {});
}

const setCompact = (wc, on) => Promise.all([
  setStyle(wc, 'mb-compact', on ? COMPACT_CSS : ''),
  on ? fitThread(wc) : setStyle(wc, 'mb-fit', ''),
]);

// The panel window is transparent; this gives the page the same card silhouette as the bubble
// layer: 16px corners over Messenger's own wash, a 1px hairline, and a lifted shadow. One fixed
// overlay is appended to <body> once; it takes no pointer events and survives re-renders.
const RADIUS = 16;
const FRAME_CSS = [
  // Both html and body go transparent: a body background would propagate to the canvas, which
  // the clip-path cannot round. The wash is painted instead on a fixed layer under everything.
  'html{background:transparent!important;clip-path:inset(0 round ' + RADIUS + 'px)}',
  'body{background:transparent!important}',
  '#mb-ground{position:fixed;inset:0;z-index:-1;pointer-events:none;background:var(--web-wash,#1a1a1a)}',
  '#mb-frame{position:fixed;inset:0;z-index:2147483647;pointer-events:none;box-sizing:border-box;border-radius:' + RADIUS + 'px;' +
    'border:1px solid rgba(255,255,255,.12)}',
  // Overlay scrollbars would otherwise ride the sheet's edge over the hairline.
  '::-webkit-scrollbar,::-webkit-scrollbar-thumb{display:none!important;width:0!important;background:transparent!important}',
].join('');

function setFrame(wc, on) {
  return wc.executeJavaScript(`(() => {
    for (const id of ['mb-ground', 'mb-frame']) {
      if (!document.getElementById(id)) { const d = document.createElement('div'); d.id = id; document.body.appendChild(d); }
    }
  })()`, true).catch(() => {}).then(() => setStyle(wc, 'mb-frame-css', on ? FRAME_CSS : ''));
}

// Back to the chat list. In the narrow layout an open thread shows a Back button.
function openInbox(wc) {
  if (!onMessenger(wc)) return wc.loadURL('https://www.messenger.com/').catch(() => {});
  return wc.executeJavaScript(`(() => {
    const back = document.querySelector('[aria-label="Back"]');
    if (back) back.click();
  })()`, true).catch(() => {});
}

module.exports = { readRecentChats, openThread, openInbox, setCompact, setFrame, RECENT_CHATS_SCRIPT };
