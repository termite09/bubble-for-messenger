# Instagram beside Messenger — design

Instagram DMs (instagram.com/direct) in the same bubble as Messenger. One platform is *in
focus* at a time — its chats in the stack, its count on the disc — while banners and unread
arrive from both. Clicking a banner from the other platform switches focus and opens that
chat. Every existing setting applies to both. Opt-in: off, the app is exactly what it was.

## Decisions

- **Opt-in.** *Instagram messages* on the Bubble tab, off by default. On, a second hidden
  panel loads Instagram's inbox (~460 MB of renderer, which is why it is a switch).
- **The focused platform** is the one the stack shows; the blue count pill is its unread
  count only. Persisted as `platform` in settings.json.
- **The other platform** is a *satellite*: a small pill at the disc's foot with that
  platform's mark and its count. Clicking it switches focus (right-click → *Switch to…* too).
- **A banner from the other platform** wears that platform's mini-mark on its avatar.
  Clicking it switches focus and opens the chat; replying from it sends through that
  platform's page without switching.
- **One session** for both sites: cookies are per domain, "log in with Facebook" works, and
  the permission, telemetry, cookie and spell-check plumbing apply once.

## What the spike found (15 Sept 2026, instagram.com in a 420×640 window)

| Question | Answer |
|---|---|
| Layout at 420 px, desktop UA | Two-pane with the thread list collapsed to an avatar rail: no names, no previews. Names appear only above ~1000 px. |
| Layout at 420 px, **iPhone Safari UA** | Instagram's mobile web app: a single-column inbox (name, preview, time), the thread full-width with a Back arrow. **This is what the panel loads.** |
| Thread ids in the list | None in the DOM at any width (rows are `div[role=button]`, no links). Only React's fiber has them, out of reach of the sandboxed preload. |
| Row anatomy | `[role=button]` containing `span[title]` (the name), `img[alt="user-profile-picture"]`, a preview span, ` · `, and `abbr[aria-label]` holding the short time ("1m"). Unread: the name at `font-weight: 600` (same rule as Messenger) and an 8 px blue dot. |
| Opening a thread | A **synthetic** `row.click()` navigates (pushState) to `/direct/t/<id>/`; no trusted click needed. The list stays in the DOM behind the thread. `loadURL('/direct/t/<id>/')` works too. |
| Back | The thread's `[aria-label="Back"]` (topmost by hit-test) returns to the inbox. The inbox header has its own Back that goes to the home feed. |
| Composer | `[role=textbox][contenteditable=true]` (Lexical, `aria-placeholder="Message..."`). `webContents.insertText` fills it. Typing reveals a `[role=button]` labelled **Send**. |
| Unread count | `document.title` is `(N) Instagram • Messages` — `unreadFromTitle` reads it unchanged. |
| Theme | `<html>` carries `__fb-dark-mode` / `__fb-light-mode` like Messenger; swapping them repaints. Wash: dark `#0c1014`, light `#ffffff`. |
| Sockets | `wss://gateway.instagram.com/ws/lightspeed` (chat) and `/ws/streamcontroller`. |
| Avatars | `instagram.*.fbcdn.net` (already allowed) and `*.cdninstagram.com`. |
| Login cookies | `sessionid`, `ds_user_id` etc. are issued persistent (a year); no rewrite needed. Sign-in lives at `/accounts/login/` (2FA under it), checkpoints at `/challenge/`. |
| Memory | ~240 MB working set for the Instagram renderer on its inbox, ~460 MB with a media-heavy thread open. |
| The list behind a thread | Does **not** update while a thread is the view in front (the title count does). A put-away Instagram panel is therefore *parked* on its inbox — after a hide, a blur, and a reply through the hidden page — so messages keep landing. Messenger's list updates behind an open thread and is left alone (`site.parkOnHide`). |
| One session, two panels | A session keeps one `webRequest` listener per event, so a second panel's liveness watch silently replaced the first's. The panels now share one watch per session (`panel.js watchRequests`), each sorted its own site's traffic by the filter patterns (`lib/links matchesUrlPattern`). |

## Identity: name handles

Instagram rows have no thread id, so an Instagram chat's handle is its **name**:
`/direct/n/<name, RFC 3986-encoded>/` (charset `A-Za-z0-9%._~-`, never spliced raw — scripts
receive the decoded name as a JSON literal). Everything that passes hrefs today (pins, the
active chat, banner click, reply, Cmd+1–5) works unchanged; `isThreadHref` accepts the three
shapes and `platformOfHref` says which platform an href belongs to.

Opening by name clicks the row with that `span[title]`. Once the page lands on
`/direct/t/<id>/` the account remembers `name → thread path`; a pin is stamped with it
(`threadHref`) so a pinned chat that has left the recent list can still be opened by URL. A
pinned chat with neither opens the inbox. Two chats with the same display name in the recent
five read as one head — accepted.

## Modules

- `lib/sites.js` — the two site descriptions (`MESSENGER`, `INSTAGRAM`): id, label, home,
  domain, mark, wash, user agent, socket URLs, login path, which paths the panel may show, and
  `discState({ focused, accounts, badge })` → `{ mark, badge, other }` for the bubble.
- `lib/recent.js` — `THREAD_HREFS`, `isThreadHref`, `platformOfHref`, `nameHandle(name)`,
  `handleName(href)`.
- `lib/rows.js` — `readRowsInstagram` beside `readRows`, both serialised for the preload,
  which picks by `location.hostname`.
- `main/scrape-instagram.js` — the Instagram page scripts, same surface as `scrape.js`
  (`readRecentChats, openThread, openInbox, setCompact, sendReply, …`), sharing `run`, `reload`,
  `setStyle`, `setFrame`, `setTheme`, `deliverReply` from it. `openThread` resolves to the
  thread path it landed on; the reply loop compares `location.pathname` against that.
- `main/panel.js` — `createPanel({ site, … })`: home URL, user agent, wash, socket filter
  (shared per session), navigation guard (`instagram.com` pages outside `/direct`, `/accounts`,
  `/challenge` bounce back to the inbox, in-page navigations included), `park()` (back to the
  inbox without showing), `destroy()` (out of the shared watch, the theme, power and quit
  listeners and its own timers; queued actions are dropped).
- `main/account.js` — one per platform: the panel, `lib/chats` state, unread, status, the
  refresh serialisation, stack items, pin refresh, open/inbox/reply. Emits `onLanded`,
  `onUnread`, `onStatus`, `onChanged` whether or not it is focused; stamps `platform` on items.
- `main/main.js` — composes the bubble, the accounts and focus: `setFocus(id)`, routing by
  `platformOfHref`, menus, settings that create or destroy the Instagram account.

## The bubble page

- `bubble:platform` push `{ mark, badge, other }` (replaces `bubble:badge`; in the state
  handshake too). The disc mark crossfades on a switch (no fade under Reduce Motion).
- **Satellite** `#other`: a `.card` pill at the disc's bottom-left (mirroring the count pill),
  20 px tall, 10 px radius, Graphite, hairline, Lift; the other platform's mark at 12 px and,
  above zero, its count in System Blue 600 11px (`9+`). Shown while its count is above zero;
  otherwise dimmed, mark only, while the disc is hovered — the switch is always one hover
  away. Hidden while a banner shows. `mousedown` never starts a drag; click →
  `bubble:switch`. Hovering it puts "Switch to Instagram" in the status chip.
- (A platform head after the Inbox head was tried and dropped: the satellite is the switch.)
- **Banner**: the avatar wears a 14 px mini-mark of the item's platform (2 px Graphite ring)
  whenever two platforms are on.

## Settings

- `instagram: false` — "**Instagram messages** — also keep Instagram's inbox loaded; the disc
  switches between the two." Turning it on opens Instagram's login beside the disc with a
  "Sign in to Instagram beside me" notice; off destroys the panel (focus returns to Messenger).
- `platform: 'messenger' | 'instagram'` — the focused one; not on the page; reads as
  `messenger` while `instagram` is off.
- Unchanged keys apply to both: `overFullscreen` (every panel), `theme` (nativeTheme), `spellcheck`,
  `blockTelemetry`, `notifications` (the shared session), `banner`, `bannerPreview`,
  `quickReply`, `badge`, `reopenLast` (read per account). The sound *Open* button stays Messenger's.

## Menus

Right-click: *Switch to Instagram* / *Switch to Messenger* first; *Open Instagram* and *Reload
Instagram* beside the Messenger items — all only while the switch is on. Cmd+1–5 open the
focused platform's recent chats.

## Degrade paths

| If | Then |
|---|---|
| A row's name or time span is not found | the row is skipped; an empty list is never a reading |
| The row is not clickable (a thread is open) | the topmost Back is clicked, then the row; else the learned thread URL; else the inbox |
| The Send control is not found | Enter into the focused composer (the Messenger path) |
| The Back control is not found | the inbox is reloaded |
| The composer is not found | the reply fails and the chat opens with the text kept, as today |

## Follow-ups (16 Sept 2026)

- **Disc click opens the newest received message.** Each account remembers the last chat a
  message landed in (`{ href, at }`); `lib/chats pickUnread` picks, across platforms, the
  one that landed last and is still unread (someone else's), else the focused platform's top
  unread row, else nothing — in which case the click means what it did (reopen / stack).
  `openChat` switches focus when the pick is on the other platform.
- **Any chat can be pinned from the panel; pinned heads lead.** The panel preload draws one
  pin button: at the left foot of the inbox row under the pointer (the row as the readers see it — a chat
  outside the recent five included), and over the header of an open chat. A press sends the
  row (or null for the header) on `panel:pin`; main pins or unpins. `panel:pin-state` carries
  which chats are pinned and whether a chat is open. Each site's `readShowing(wc)` names the
  open thread (Messenger: path + title; Instagram: the thread header's bold name, the path
  learned), after waiting for the thread view to draw; the account makes it the active chat.
  A first cut added the showing chat to the stack as a head; that read as a duplicate and was
  dropped. Order: pinned, recent, Inbox; the hairline sits above the first recent head.
- **Homebrew.** `brew update` refreshes the catalogue; `brew upgrade` installs. Since
  Homebrew 6 a cask on an untrusted tap is loaded from the installed copy by a bare
  `brew upgrade`, so it never looks outdated; the full name (`brew upgrade --cask
  termite09/tap/bubble-for-messenger`) trusts it as it goes, as does `brew trust
  termite09/tap`. `lib/install installedByHomebrew` (a Caskroom folder) makes *Update to X…*
  show the command with a Copy button instead of the release page.
- Quit-time races: pushes to a destroyed bubble window and status reports from a destroyed
  panel are dropped.
