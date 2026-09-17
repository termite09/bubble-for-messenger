// Messenger, live: its panel (a hidden window on the inbox), the chat state (lib/chats),
// what the page last said about unread and reachability, and the reads that keep them fresh.
// main.js composes one of these with the bubble.
const { createPanel: createRealPanel } = require('./panel');
const { fetchAvatar: fetchRealAvatar } = require('./avatars');
const { mergeHeads, platformOfHref } = require('../lib/recent');
const chatsLib = require('../lib/chats');

function createAccount({
  site,
  log,
  settings,
  patchPins,
  overFullscreen = true,
  onLanded = () => {},
  onChanged = () => {},
  onUnread = () => {},
  onStatus = () => {},
  onShown = () => {},
  onBlurred = () => {},
  onHidden = () => {},
  onPin = () => {},
  createPanel = createRealPanel,
  fetchAvatar = fetchRealAvatar,
}) {
  let chats = chatsLib.initialState();
  let unread = 0;
  let status = { connection: 'online', signedOut: false };
  let landed = null; // { href, at }: the last chat a message landed in, for the disc click
  // The chat the panel is showing while the user works in it — one reached by searching the
  // inbox is not in the list, and still deserves a head (with the ring) and a pin.
  let showing = null;
  const panel = createPanel({
    site,
    log,
    overFullscreen,
    onUnread: (n) => {
      // A title flash ("Name messaged you") says nothing about the count: keep the last one.
      if (n === null) return;
      unread = n;
      onUnread(n);
    },
    onRows: (rows) => refresh(rows),
    onStatus: (s) => {
      status = s;
      onStatus(s);
    },
    onShown,
    onBlurred: () => {
      close();
      onBlurred();
    },
    onHidden,
    onNavigated: () => refreshShowing(),
    // The panel's pin button on an inbox row: that row as the page read it (a handle of
    // this site's, a name). Main keeps the pins.
    onPin: (row) => {
      if (!row || typeof row !== 'object') return;
      if (platformOfHref(row.href) === site.id && typeof row.name === 'string')
        onPin({ href: row.href, name: row.name, avatarUrl: row.avatarUrl || null });
    },
  });

  // What the panel's pin buttons show on the inbox's rows: which chats are pinned.
  function syncPin() {
    panel.setPinState({ pins: ownPins().map((p) => p.href) });
  }

  // Where the panel went, while the user is looking at it: the chat it shows becomes the
  // active one (its head in the stack, ringed). An open staged by the app lands on what it
  // asked for and changes nothing.
  async function refreshShowing() {
    if (!panel.isVisible()) return;
    const next = await panel.readShowing().catch(() => null);
    const before = showing;
    showing = next;
    const href = next ? next.href : null;
    const changed = (before && before.href) !== href;
    if (href && chats.activeHref !== href) chats = chatsLib.openChat(chats, href);
    syncPin();
    if (changed) onChanged({ displayChanged: false });
  }

  const stamp = (item) => ({ ...item, platform: site.id });
  const ownPins = () => settings().pins.filter((p) => platformOfHref(p.href) === site.id);
  const otherPins = () => settings().pins.filter((p) => platformOfHref(p.href) !== site.id);

  // Take in the chat list — pushed by the panel's preload as it changes, or read from the
  // page by the safety poll — and say when a chat turned unread with someone else's message.
  // Reads do not overlap: one at a time, with a request arriving mid-read served by one more
  // read after it.
  const stats = { pushes: 0, polls: 0 };
  let refreshing = false;
  let refreshAgain = false;
  let pendingRows = null;
  async function refresh(pushed = null) {
    if (pushed) pendingRows = pushed;
    if (refreshing) {
      refreshAgain = true;
      return;
    }
    refreshing = true;
    try {
      let rows = pendingRows;
      pendingRows = null;
      if (rows) stats.pushes++;
      else {
        if (panel.isLoading()) return; // a page mid-reload has no rows worth reading
        stats.polls++;
        rows = await panel.readRecentChats();
      }
      if (!rows) return; // the list is scrolled: keep what we last knew rather than read the wrong rows
      const ses = panel.session();
      const next = await Promise.all(
        rows.map(async (r) => ({ ...r, avatar: await fetchAvatar(ses, r.avatarUrl) })),
      );
      const result = chatsLib.reduceRecent(chats, next, {
        visible: panel.isVisible(),
        now: Date.now(),
      });
      chats = result.state;
      if (!result.changed) return;
      refreshPins();
      onChanged({ displayChanged: result.displayChanged });
      if (result.landed) {
        landed = { href: result.landed.href, at: Date.now() };
        onLanded(stamp(result.landed));
      }
    } finally {
      refreshing = false;
      if (refreshAgain) {
        refreshAgain = false;
        refresh();
      }
    }
  }

  // A pinned chat that is in the list again keeps its saved name and picture URL fresh.
  function refreshPins() {
    const { pins, changed } = chatsLib.refreshPins(ownPins(), chats.recent);
    if (changed) patchPins([...otherPins(), ...pins]);
  }

  // The stack: recent chats and pinned ones (lib/recent mergeHeads), each with its picture. A
  // pinned chat missing from the list gets its picture from the URL saved when it was pinned.
  async function stackItems() {
    const ses = panel.session();
    return Promise.all(
      mergeHeads(ownPins(), chats.recent).map(async (it) =>
        stamp('avatar' in it ? it : { ...it, avatar: await fetchAvatar(ses, it.avatarUrl) }),
      ),
    );
  }

  // Putting a chat away — on the disc, on the shield, or by the panel losing focus — remembers
  // it for reopening (settings.reopenLast seconds).
  function close() {
    chats = chatsLib.closeChat(chats, Date.now());
  }

  return {
    site,
    panel,
    chats: () => chats,
    unread: () => unread,
    status: () => status,
    landed: () => landed,
    syncPin,
    // What is known about a chat that can be pinned: its list row, or the chat showing.
    rowFor: (href) =>
      chats.recent.find((r) => r.href === href) ||
      (showing && showing.href === href ? showing : null),
    stats: () => ({ ...stats }),
    refresh,
    stackItems,
    close,
    // Open a conversation beside `bounds` (the head column, or the disc).
    async open(href, bounds) {
      chats = chatsLib.openChat(chats, href);
      return panel.openThread(href, bounds);
    },
    openInbox(bounds) {
      chats = chatsLib.openChat(chats, null);
      return panel.openInbox(bounds);
    },
    newMessage: () => panel.newMessage(),
    openPreferences(bounds) {
      chats = chatsLib.openChat(chats, null);
      return panel.openPreferences(bounds);
    },
    async reply(href, text) {
      return panel.sendReply(href, text);
    },
    // A disc click with nothing open: the remembered chat, or the stack.
    discClick: (now, seconds) => chatsLib.discClick(chats, now, seconds),
    hide() {
      panel.hide();
    },
    destroy: () => panel.destroy(),
  };
}

module.exports = { createAccount };
