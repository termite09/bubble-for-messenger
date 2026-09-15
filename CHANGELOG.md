# Changelog

## v2.4.0 (2026-09-15) — Bubble for Messenger

### Security
- Server-side redirects can no longer carry the Messenger panel (and the session) off Meta's
  hosts: redirects are guarded like navigations, and `/l.php` on messenger.com is recognised as
  the link shim. A landing elsewhere returns to the inbox.
- Only the login cookies (c_user, xs, datr, sb, fr) are kept past the session — for 90 days,
  whenever the site sets them, host-only ones staying host-only — instead of every Facebook
  session cookie for a sliding year.
- Every renderer is sandboxed; no page can open a window or leave its document. Scripts run in
  the Messenger page use their own isolated world and time out, so a page that never answers
  cannot wedge the app.
- One instance at a time; a second launch hands over. Only LevelDB lock files are cleaned up at
  start, in the known store directories.
- `settings.json` is saved atomically, kept aside if unreadable, and is 0600; the profile is
  0700. The position in it is validated (a hand-edited file could crash startup).
- Permissions: https Meta origins only; camera/microphone but never the screen. Avatars: raster
  types only, size checked before download. Strings from the page are length-capped.
- Reload and DevTools are development-only menu items.
- Releases: the Homebrew token is exposed to its one step only; the cask checksum is of the
  built artifact; actions are pinned; a SHA256SUMS asset is published.

### Fixed
- The same message could land twice, and an old unread chat was re-announced every quarter
  hour: chat-list reads were concurrent and a page mid-reload was read as "no chats".
- A closed chat stayed the active one (ring on its head; reopen re-armed by closing the stack).
- A chat opened from a collapsed bubble placed the panel beside the disc, not the stack.
- A stack too tall for the screen pushed the disc off it; it now shows fewer rows.
- Resizing the bubble left a chat open beside a vanished stack.
- An invisible staged panel swallowed clicks for up to 12 s.
- A reply whose result never came blocked the banner for good.
- The app hung on quit (the panel refused to close). A display going away now re-clamps the disc.

### Changed
- Messenger's chat list is watched from inside the page and pushed to the app when it changes;
  the app no longer polls it every 5 s (or every second while something was unread). A 60 s
  safety poll remains.
- The hidden page is reloaded for a reason — after sleep, a dropped connection that stayed
  down, a failed load, ten quiet minutes online — instead of blindly every 15 minutes, never
  while it is showing, with a backoff. Each reload is logged with its reason.
- The Messenger panel is an opaque window with the system's rounded corners (a transparent one
  with a shadow was recomposited every frame). The corner radius is now the system's.
- Chromium's background throttling is on for the hidden Messenger page (trial: messages still
  arrived within seconds at 1, 10 and 30 minutes hidden).
- The click-outside shield and the ✕ target are made on first use; the small pages have no
  WebGL; Messenger's scripts are cached compiled; the fan updates its heads in place; the count
  pulses at a fraction of the compositor cost; the telemetry listener exists only while on.
- Quick replies are committed as one text insertion (emoji included) instead of a key event per
  character.

### Added
- **Check for updates** (Bubble tab, on by default): once a day, from GitHub; a newer release
  appears in the bubble's menu as *Update to X…*.
- **Report a Problem…** in the bubble's menu opens the issue page and shows the log
  (`logs/main.log` in the profile; never names, messages or cookies).
- On a first run the inbox (the login page) opens by itself.
- The Conversations menu names the chats behind Cmd+1–5.
- VoiceOver names for the heads; a real tablist in Settings.

### Internal
- The chat state, the bubble's geometry, the drag machine, cookie and update rules are pure
  modules with tests (143 tests, up from 95); a stub `electron` drives the window modules.
- One window factory and one IPC helper for the four windows; one list of IPC channel names.
- CI runs the tests and the linter on every push; ESLint, Prettier and dependabot are set up.

## v2.3.0 (2026-09-14) — Bubble for Messenger

### Added
- The landed banner shows the whole message, wrapped up to six lines, and grows away from
  the screen edge.
- **Pinned chats**: right-click a head → Pin. Up to five sit next to the Inbox head under a
  hairline, whether or not they're recent.
- **Reopen the last chat** (Panel): after closing a chat, a bubble click within 30 seconds
  (Off / 15 s / 30 s / 1 min / 5 min) goes straight back to it.
- The paper head is now an inbox tray, captioned "Inbox" on hover, so it no longer looks
  like a second Messenger bubble.

## v2.2.0 (2026-09-14) — Bubble for Messenger

### Added
- Settings are on three tabs — Bubble, Messages, Panel — and the card is only as tall as the
  tab it shows.
- **Size** (Bubble): Small / Medium / Large. The disc, chat heads, banner and count scale
  together.
- **Unread count** (Bubble) is now Off / Steady / Pulsing; Pulsing breathes the count slowly
  while anything is unread. An older on/off setting carries over.
- **New-message sound** (Messages): the sound is Messenger's own switch, kept per profile, so
  it starts off in Bubble; the row's *Open* button opens Messenger's Preferences on it.

### Fixed
- **Show over full-screen apps** now takes effect. macOS draws any window that joins all
  Spaces in full-screen Spaces too, so off now keeps the bubble on the desktop it is on
  (it no longer follows you to other desktops while off). Windows are also no longer
  `fullscreenable`, which conflicted with the flag the setting toggles.
- The unread count no longer blinks: Messenger flashes its tab title with "Name messaged
  you" while something is unread, which the app read as zero unread.
- Turning **Show over full-screen apps** off brought the Dock icon back and blinked every
  window: Electron re-transforms the process type on each visibility call, which the app
  now skips (it hides the Dock itself).
- The **macOS notifications from Messenger** switch is back in Settings; its row had been
  dropped in 2.1.1.
- **Appearance** now themes the Messenger panel for every account. Messenger only follows
  the system scheme when its own preference is "Device"; the app now swaps Messenger's own
  light/dark classes directly, on every change and every page load.

## v2.1.1 (2026-09-13) — Bubble for Messenger

### Fixed
- The fullscreen-app visibility toggle no longer hides the whole Bubble app when turned off.
- The setting now only controls whether the bubble appears over full-screen apps, while keeping the app accessible and the settings window reopenable.

## v2.1.0 (2026-09-13) — Bubble for Messenger

### Added
- Settings (right-click the bubble → Settings…, or Cmd+,): show over full-screen apps, start at
  login, the banner and what it shows, reply from the banner, Messenger's macOS notifications,
  the unread count, panel appearance, spell check, and telemetry blocking.
- Reply from the banner: when a message lands, the ↩ at the banner's end opens a reply field.
  Enter sends it through the hidden Messenger page; Esc or clicking elsewhere cancels. If the
  send can't complete, the conversation opens with your text in the composer.

### Changed
- Smaller download: the build ships Chromium's English locale only (the app has no other
  language) and the DMG uses maximum compression — 128 MB → ~102 MB, 288 MB → 240 MB installed.
- Messenger is kept live while hidden: the page is no longer background-throttled, reloads
  after the Mac wakes from sleep and every quarter hour in the background (never while the
  panel is showing), and Facebook's static error page is retried with backoff.
- Facebook's logging beacons (Banzai, Quick Metrics, Pixel, error reporting) are cancelled at
  the network layer. Nothing Messenger needs to work is touched.
- Tracking redirects via `lm.facebook.com` and `facebook.com/l.php` are unwrapped before a link
  opens in the browser, like `l.messenger.com` / `l.facebook.com` already were.

### Fixed
- Emoji in chat previews were dropped ("Kim: 😢" read "Kim:"; an emoji-only message had no
  preview): Messenger draws them as sprite images, which are now read back as their glyph.
- After scrolling the inbox in the panel, the fan and the landed banner could show whatever rows
  happened to be on screen as "most recent". The list is virtualised; it is now only read while
  scrolled to the top, and the last known chats are kept otherwise.

---

## v2.0.2 (2026-09-13) — Bubble for Messenger

### Fixed
- The panel showed nothing when not logged in, so a fresh install had no way to sign in. The
  rounded-corner clip on the page used `<html>`'s own box as its shape, and on messenger.com's
  login page that box is 0 px tall (the page is entirely positioned content), so the whole page
  was clipped away. The frame now pins `<html>` to the viewport and lets `<body>` scroll, so the
  clip is always the visible panel — on the login page, the cookie prompt and the app alike.

---

## v2.0.1 (2026-09-13) — Bubble for Messenger

### Fixed
- Fixed a startup crash caused by stale Chromium/Electron lock files left behind after crashes or forced quits.
- The app now removes stale storage locks in its user-data folder before Electron initializes its browser databases.

### Changed
- Added a regression test covering stale lock cleanup.

---

## v2.0.0 (2026-09-13) — Bubble for Messenger

The fork becomes its own app.

### Changed
- **New name and identity**: Bubble for Messenger (`Bubble.app`), MIT-licensed with a LICENSE file.
- **The whole UI**: a floating grey disc instead of a dock window. Click it for a stack of your
  five most recent chats as round heads (newest first); pick one and the conversation opens
  in a compact card beside the stack. A banner unrolls from the disc when a message lands;
  click it to open that chat. Click anywhere else to put it all away.
- Panel framed as a 16 px card that fills edge to edge in single-thread mode.
- Cmd+1–5 open your recent chats; Cmd+N opens the inbox to compose.

### Removed
- The dock window, native title bar, auto-update check, welcome screen and the usage ping.
- Toggle Sidebar (Cmd+Shift+S); the compact panel has no sidebar.

### Fixed
- The transparent window no longer intercepts clicks around the disc.
- A shaky click is a click, not a drag.
- The panel can no longer be left invisible but click-blocking if Messenger fails to load.
- Login cookies are flushed before quit.

---

# Upstream release notes (stefanminch/messenger-mac)

## v1.3.0 (2025-12-27)

### New Features
- **Native Title Bar** - Standard macOS title bar for better window management
- **External Links** - Shared/forwarded links now open in your default browser instead of inside the app

### Bug Fixes
- Fixed issue where forwarded links (via l.messenger.com) were opening inside Electron

---

## v1.2.0 (2025-12-26)

### New Features
- **Auto-Update Check** - Automatically checks for new versions on startup
- **Keyboard Shortcuts** - Cmd+N for new message, Cmd+1-9 for conversations
- **Toggle Sidebar** - Cmd+Shift+S to show/hide sidebar
- **Welcome Screen** - First-launch guide showing features and shortcuts
- **Power Saving** - Background throttling to reduce CPU/battery usage

---

## v1.1.0 (2025-12-25)

### New Features
- Persistent login sessions
- Native macOS notifications

---

## v1.0.0 (2025-12-24)

- Initial release
- Basic Messenger wrapper for macOS
