> **Historical.** This spec describes the first bubble prototype (September 2026, before the
> redesign). Current behaviour is documented in `README.md` and `DESIGN.md`.

# Chat heads — design

Extends bubble mode: clicking the main bubble fans out the five most recent
conversations as avatar bubbles; clicking one opens that conversation alone.

## Behaviour

- **Main bubble** unchanged: drag, right-click menu, badge = total unread from the title.
- **Click main bubble** → fan of up to 5 avatar items (48 px, 56 px pitch, name as
  tooltip) plus a final Messenger-logo item ("Open Messenger"). Fan grows *up* from the
  bubble when it fits in the work area, else *down*. Click the main bubble again, click an
  item, or focus another window → collapse.
- **Click avatar** → panel opens beside the main bubble in *compact* mode (Messenger's
  inbox-switcher and chat-list columns hidden) on that thread; fan collapses.
- **Messenger-logo item / right-click → Open Messenger** → panel in *full* mode (columns visible).
- **Recent list**: every 5 s while the panel page is on messenger.com, and on every
  title change, main runs a script in the page that returns the first 5 chat rows:
  `{ href, name, avatarUrl, unread }`. `unread` = any span in the row with computed
  font-weight ≥ 600 (Messenger bolds unread rows). Avatars are fetched in main through
  the panel's session (`session.fetch`), cached by URL, and sent to the bubble as data
  URLs; the bubble's CSP stays `img-src 'self' data:`.
- **Degradation**: if the script finds no rows (login page, DOM change), the fan shows
  only the Messenger-logo item.
- **Drag** while expanded: the fan collapses on mousedown, then the normal drag/click
  logic runs. A click that collapsed the fan does not re-expand it.

## Layout

`fanLayout(bubble, itemCount, workArea)` → `{ direction: 'up' | 'down', bounds }` where
`bounds` is the bubble window rect containing the main bubble plus `itemCount` items
(height `64 + itemCount * 56`), clamped to the work area. `bubble` is the main bubble's
64×64 rect, which stays fixed on screen across expand/collapse.

## Structure

| File | Responsibility |
|---|---|
| `lib/layout.js` | + `fanLayout()` |
| `lib/recent.js` | pure `normalizeRows(raw)` — drop rows without href/name, dedupe by href, cap 5 |
| `scrape.js` | page-side script string `RECENT_CHATS_SCRIPT`; `readRecentChats(webContents)`; `openThread(webContents, href)` (clicks the row link, SPA navigation) |
| `avatars.js` | `fetchAvatar(session, url)` → data URL, memoised |
| `bubble.js` / `bubble.html` / `bubble-renderer.js` / `bubble-preload.js` | expand/collapse, item rendering, `bubble:open-chat` / `bubble:open-inbox` IPC |
| `panel.js` | + `setCompact(bool)` (inject/remove CSS), `openThread(href, bubbleBounds)` |
| `main.js` | polling loop, wiring |
