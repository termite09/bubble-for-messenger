// The chat state and its transitions, pure: what the recent list last said, which chat is
// open, which one was put away. main.js holds one state object and calls these.
const { reopenOpen } = require('./recent');

const initialState = () => ({
  recent: [], // rows from the list, each with its avatar data URL
  recentKey: '', // everything a row carries: a change means a read is new
  displayKey: '', // what the stack draws: a change means the stack must be redrawn
  seeded: false, // the first read establishes state; it never announces anything
  activeHref: null, // the chat the panel is showing; null = inbox or nothing
  lastChat: null, // { href, closedAt }: put away, one disc click from reopening for a while
});

const fullKey = (rows) =>
  JSON.stringify(rows.map((r) => [r.href, r.name, r.unread, r.preview, r.time, Boolean(r.avatar)]));
const displayKeyOf = (rows) =>
  JSON.stringify(rows.map((r) => [r.href, r.name, r.unread, Boolean(r.avatar)]));

const unchanged = (state) => ({ state, landed: null, changed: false, displayChanged: false });

// A new read of the list. `rows` is null when the list could not be trusted (scrolled), and an
// empty list is not trusted over a non-empty one either: it is what a page mid-reload says.
// `landed` is the chat that just turned unread with someone else's message — never the user's
// own ("You: …", a thread Messenger bolds for another reason), never while the panel shows.
function reduceRecent(state, rows, { visible }) {
  if (!rows) return unchanged(state);
  // An empty list is never a reading: a page mid-load pushes one before its rows render. (So
  // an account with no chats at all is seeded by its first chat, whose arrival is not announced.)
  if (rows.length === 0) return unchanged(state);
  const key = fullKey(rows);
  if (key === state.recentKey) return unchanged(state);
  const before = new Map(state.recent.map((r) => [r.href, r]));
  const landed =
    state.seeded && !visible
      ? rows.find((r, i) => {
          const old = before.get(r.href);
          if (!r.unread || /^You:/.test(r.preview)) return false;
          return old ? !old.unread || old.preview !== r.preview : i === 0;
        }) || null
      : null;
  const displayKey = displayKeyOf(rows);
  return {
    state: { ...state, recent: rows, recentKey: key, displayKey, seeded: true },
    landed,
    changed: true,
    displayChanged: displayKey !== state.displayKey,
  };
}

// A pinned chat that is in the list again keeps its saved name and picture URL fresh, so it
// still shows after the old picture URL has expired.
function refreshPins(pins, recent) {
  const byHref = new Map(recent.map((r) => [r.href, r]));
  let changed = false;
  const next = pins.map((p) => {
    const r = byHref.get(p.href);
    if (!r || (r.name === p.name && r.avatarUrl === p.avatarUrl)) return p;
    changed = true;
    return { href: p.href, name: r.name, avatarUrl: r.avatarUrl };
  });
  return { pins: changed ? next : pins, changed };
}

const openChat = (state, href) => ({ ...state, activeHref: href, lastChat: null });

// Putting a chat away: remembered for reopening, and no longer the open one.
const closeChat = (state, now) =>
  state.activeHref
    ? { ...state, activeHref: null, lastChat: { href: state.activeHref, closedAt: now } }
    : state;

// A click on the disc with nothing open: the remembered chat, or the stack.
const discClick = (state, now, seconds) =>
  reopenOpen(state.lastChat, now, seconds)
    ? { action: 'reopen', href: state.lastChat.href }
    : { action: 'stack' };

module.exports = { initialState, reduceRecent, refreshPins, openChat, closeChat, discClick };
