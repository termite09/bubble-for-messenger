const LIMIT = 5;
// A chat's handle: its Messenger thread path (/t/<id>/ or /e2ee/t/<id>/). This is the only
// thing we ever splice into a page-side selector or a URL, so anything else is refused at the
// boundary.
const THREAD_HREFS = Object.freeze({
  messenger: /^\/(e2ee\/)?t\/\d+\/?$/,
});

const platformOfHref = (href) =>
  typeof href === 'string' && THREAD_HREFS.messenger.test(href) ? 'messenger' : null;
const isThreadHref = (href) => platformOfHref(href) !== null;

// The text of a chat-list span with Messenger's emoji put back. Messenger draws emoji as sprite
// <img>s (alt = the glyph) or background-image spans (aria-label = the glyph); textContent drops
// both, so "Kim: 😢" would read "Kim:" and an emoji-only message would have no preview at all.
// Self-contained (no closures) because it is also serialised into the page — see scrape.js.
function spanText(node) {
  if (!node) return '';
  if (node.nodeType === 3) return node.nodeValue || '';
  if (node.nodeType !== 1) return '';
  // A glyph is short and starts with a pictograph; anything wordier is a label, not an emoji.
  const glyph = (v) =>
    v && v.length <= 24 && /^\p{Extended_Pictographic}/u.test(v.trim()) ? v.trim() : '';
  if (node.tagName === 'IMG') {
    return /emoji/i.test(node.getAttribute('src') || '') ? glyph(node.getAttribute('alt')) : '';
  }
  let out = '';
  for (const child of Array.from(node.childNodes || [])) out += spanText(child);
  return out || glyph(node.getAttribute('aria-label'));
}

// Clean up the raw rows scraped from messenger.com's chat list into what the bubble renders.
// Strings are bounded: they reach the screen and settings.json, whatever the page says.
const MAX_NAME = 200;
const MAX_PREVIEW = 1000;
const MAX_URL = 2048;
function normalizeRows(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const href = r.href;
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, MAX_NAME) : '';
    if (!isThreadHref(href) || !name || seen.has(href)) continue;
    seen.add(href);
    // A preview needs a letter, digit or emoji; Messenger's lone "·" separator is no preview.
    const rawPreview = typeof r.preview === 'string' ? r.preview.trim().slice(0, MAX_PREVIEW) : '';
    const preview = /[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(rawPreview) ? rawPreview : '';
    // A time stamp is short ("2m", "1h", "Yesterday"); anything longer is some other span.
    const time = typeof r.time === 'string' && r.time.trim().length <= 9 ? r.time.trim() : '';
    const avatarUrl = typeof r.avatarUrl === 'string' ? r.avatarUrl.slice(0, MAX_URL) : null;
    out.push({ href, name, avatarUrl, unread: Boolean(r.unread), preview, time });
    if (out.length === LIMIT) break;
  }
  return out;
}

// Whether the chat list is scrolled to its top. The list is virtualised, so once the user has
// scrolled it the rows in the DOM are whatever is on screen, not the most recent chats — a read
// taken then would be wrong, and worse, would announce old chats as newly landed. Walks up from
// a row to the first overflowing ancestor (stopping at `root`); no such ancestor means nothing
// has scrolled. Self-contained (no closures) because it is also serialised into the page.
function listAtTop(row, root) {
  for (let el = row && row.parentElement; el && el !== root; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight + 16) return el.scrollTop <= 8;
  }
  return true;
}

// What the stack shows: the pinned chats in pin order, then up to `limit` recent chats that
// are not pinned. A pinned chat also in the list is refreshed from its row (name, avatar,
// unread, preview); one that is not shows as it was pinned, never unread.
const MAX_PINS = 5;
function mergeHeads(pins, recent, limit = LIMIT) {
  const byHref = new Map(recent.map((r) => [r.href, r]));
  const pinnedHrefs = new Set(pins.map((p) => p.href));
  const pinned = pins.map((p) => ({
    unread: false,
    preview: '',
    ...p,
    ...(byHref.get(p.href) || {}),
    pinned: true,
  }));
  const rest = recent
    .filter((r) => !pinnedHrefs.has(r.href))
    .slice(0, limit)
    .map((r) => ({ ...r, pinned: false }));
  return [...pinned, ...rest];
}

// A chat the user closed by clicking away stays one disc click from reopening for `seconds`.
function reopenOpen(lastChat, now, seconds) {
  if (!seconds || !lastChat || !isThreadHref(lastChat.href)) return false;
  return now - lastChat.closedAt <= seconds * 1000;
}

module.exports = {
  mergeHeads,
  MAX_PINS,
  reopenOpen,
  normalizeRows,
  isThreadHref,
  platformOfHref,
  THREAD_HREFS,
  spanText,
  listAtTop,
  LIMIT,
};
