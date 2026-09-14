# Changelog

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
