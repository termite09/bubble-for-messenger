# Whole-message banner, reopen, pinned chats, inbox head — design

Four changes to the bubble's stack and banner: the landed banner shows the whole message; a
chat closed by clicking away is one click from reopening for a while; chats can be pinned to
the stack; and the paper "Open Messenger" head says what it is.

## 1. The banner shows the whole message

- The banner keeps its width (250 page px, scaled with the bubble size) and grows in height:
  the message wraps up to **6 lines** (`-webkit-line-clamp: 6`), an ellipsis beyond. Clicking
  it opens the chat, as today. The text is what Messenger's chat-list row carries for the
  thread (its full last-message preview; Messenger itself caps very long ones).
- It grows **away from the screen edge**: upward when the stack would grow up (disc near the
  bottom), downward otherwise — `body.up` / `body.down`, which the layout already sets.
- The page measures the banner after filling it and reports the room it needs beyond the disc
  row (`bubble:banner-extra`, page px). Main keeps that as `bannerExtra` and gives the window
  the room on the right side: `windowFrame(content, dockY, { above, below })` replaces the
  single `extra` (the reply row is `below` when the banner grows down, and is added to the
  banner's own room). When the banner folds, the page reports 0.
- The reply row sits under the wrapped text (grid rows `auto 36px`); replying, sending, the
  fold-on-leave and the Reduce Motion rules are unchanged. "Show the message in the banner"
  off still shows only the name.

## 2. Reopen the last chat

- When the panel hides because the user **clicked away** — its own blur, or the click-outside
  shield — while a chat was open, main remembers `lastChat = { href, closedAt }`. Closing by
  clicking the disc (a deliberate close) clears it; so does opening another chat.
- Clicking the disc while nothing is open and `Date.now() - closedAt <= reopenLast * 1000`
  opens that chat directly (`openChat(href)`: stack up, chat beside it). Otherwise the stack
  opens as today.
- Setting `reopenLast` (seconds): `0 | 15 | 30 | 60 | 300`, default `30`, on the Panel tab as
  **Reopen the last chat** — Off / 15 s / 30 s / 1 min / 5 min — "Clicking the bubble within
  this time goes straight back to it."
- Pure: `reopenOpen(lastChat, now, seconds) -> boolean` in `lib/recent.js`.

## 3. Pinned chats

- **Pinning.** Right-click a head → native menu with **Pin** or **Unpin** (main builds it from
  `bubble:head-menu` with the head's href). Up to **5** pins; when full, Pin is disabled with
  "5 pinned already". Right-clicking the disc keeps the app menu.
- **Model.** `pins: [{ href, name, avatarUrl }]` in `settings.json`, in the order pinned,
  passed through the normaliser like `bubble` (valid thread hrefs only, strings for
  name/avatarUrl, max 5, no duplicates). Not a page-visible setting.
- **Stack.** `mergeHeads(pins, recent)` (`lib/recent.js`) → pinned first in pin order, each
  refreshed from the recent row when present (name, avatarUrl, unread, preview), then recent
  rows not pinned, at most 5. Each item carries `pinned: true|false`. Pinned chats absent from
  the list have `unread: false`. Their avatars go through `fetchAvatar` from the stored URL;
  when that fails (Messenger's CDN URLs expire) the head shows the initial, and the stored URL
  is replaced the next time the chat appears in the list.
- **Look.** A hairline between the last pinned head and the first recent one, drawn in the gap
  (the pitch is unchanged). Cmd+1–5 keep meaning the five most recent chats.
- The landed banner and Reopen ignore pins.

## 4. The inbox head

- The paper head shows an **inbox glyph** (a tray: three short lines over a base, in graphite)
  instead of the Messenger mark, `title` "Inbox".
- While the stack is open a small caption **"Inbox"** sits beside it on the side away from the
  screen edge: `label` type on a graphite chip (the raised tone with the hairline), so it reads
  over any wallpaper. It fades with the stack.

## Settings and window

- `lib/settings.js`: `reopenLast` (choice of `[0, 15, 30, 60, 300]`, default 30) and `pins`
  (passthrough, validated). `DEFAULTS` gains `reopenLast: 30`.
- Settings page: the Panel tab gains the Reopen row (five segments).

## Testing

- Unit: `mergeHeads` (order, refresh from recent, dedupe, cap), pins normalisation (hrefs,
  cap, duplicates), `reopenOpen` (window, off, no last chat), `windowFrame` with room above,
  `reopenLast` choices.
- Live (driver): a long preview wraps and the window grows the right way at each edge; a chat
  closed by blur reopens on the next disc click and not after a deliberate close; pin/unpin
  from the head menu, pinned order, the hairline; the inbox caption.

## Out of scope

Pinning from the panel, reordering pins, more than five pins, per-chat mute.
