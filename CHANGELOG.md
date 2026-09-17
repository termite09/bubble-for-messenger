# Changelog

## v3.0.0 (2026-09-17) — Bubble for Messenger

Messenger only, and better behaved toward the account it signs into. The full reasoning, with
sources, is in [docs/COMPLIANCE.md](docs/COMPLIANCE.md) and
[docs/COMPLIANCE-PLAN.md](docs/COMPLIANCE-PLAN.md).

### Removed
- **Instagram messages, and everything that served them.** Reaching Instagram's usable inbox
  needed a phone user agent sent from a desktop — an "iPhone" reporting a desktop GPU and no
  touch support — and its rows, its Back control and its Send button could only be driven with
  synthetic `.click()` events, which carry `isTrusted: false`. Together those are close to a
  textbook automated-session signature, on the platform that enforces hardest against one.
  Fixing it would have meant getting better at not being noticed rather than better behaved,
  so the feature is gone: the second panel, the satellite on the disc, platform switching, the
  name-handle chat identity, the Instagram row reader and the Instagram glyph.
- An Instagram pin left in `settings.json` is dropped on load; the `instagram` and `platform`
  settings no longer exist.
- **Meta's Messenger logo is no longer this app's icon.** It was shipped as `icon.png` /
  `icon.icns` — the macOS and Windows app icon, and the mark on the disc at rest. Nominative
  fair use lets a third-party app *refer* to a trademark to say what it works with; it does
  not let one adopt that trademark as its own product identity, which is what an app icon is.
  Meta's trademark policy is explicit that its marks may not be used as or as part of a
  product or app name either.

### Added
- An original app mark: two overlapping speech bubbles, periwinkle on a blue outline. It is
  the icon on both platforms and the disc's mark at rest, and it carries no Meta trademark.

### Changed
- **Facebook telemetry blocking is off by default** (the switch stays). It is the part of this
  app that most clearly interferes with Messenger's intended operation, and a session that
  messages all day while emitting no client logs at all does not resemble a real browser —
  including an ad-blocked one.
- **The login cookies `c_user` and `xs` are no longer rewritten to a 90-day expiry.** Facebook
  issues them as session cookies exactly when the user did not tick "keep me logged in"; the
  app was reversing that choice silently. The device cookies `datr`, `sb` and `fr` are still
  kept — a stable `datr` is how Facebook recognises a returning trusted device, which helps
  the account. Users who declined a persistent login now sign in again after a restart, which
  is what they asked for.
- **The safety poll is five minutes and jittered**, not sixty seconds on the dot. The panel's
  preload already watches the list and pushes rows as they change, so the timer is a net, not
  the mechanism — and a metronome is a cadence no person produces.
- The README now says plainly, above the install instructions, that this app breaks Meta's
  Terms of Service and that an account can be restricted for it.

### Fixed
- **Messenger's own controls are now pressed with real input events.** Four synthetic
  `.click()` calls survived on the Messenger side — the compose button (Cmd+N), the account
  gear and the Preferences menu item, and Messenger's Back control. Each carried
  `isTrusted: false`, which is the same signature Instagram was removed over; they were found
  reviewing the finished 3.0.0 work rather than while planning it. All four now hit-test the
  control and press it with Chromium input, as opening a thread and sending a reply already
  did. The inbox is staged at opacity 0 for its press, because a hidden window dispatches no
  input. A test now fails if any page script in `src/main/` calls `.click()` again.

### Kept, deliberately
- **The panel still sends Electron's own user agent**, which names this app and Electron on
  every request. Substituting a browser's string is the most effective single anti-detection
  change available, and that is precisely why it is not in this release: it would hide what
  the app is rather than make it compliant. Messenger's thread opens and replies continue to
  use real Chromium input events, because a human genuinely clicked and typed.

## v2.7.1 (2026-09-17) — Bubble for Messenger

### Changed
- A long chat name in the hover chip ends with an ellipsis at the column's edge instead of
  running off the window; the *Offline* / *Sign in* chip is bounded the same way.
- The pin badge on a head is drawn at 16px but takes the click from 24px.
- Light appearance: the satellite's unread count is a deeper blue (`#0066cc`, 5:1 on paper;
  the system's blue was 3.7:1). The count pill keeps the system's blue.
- Glass: secondary text steps one tone brighter on dark (`#a5a5aa`) and darker on light
  (`#58585c`), so it keeps 4.5:1 through a 90% card over a white or black wallpaper.
  *Reduce transparency* restores the opaque values.
- Every crossfade is on the 120 ms clock: the mark swap on a platform switch (was 200),
  a clicked head's dim (was 160), the Settings tab switch (was 100).
- The panel frame's light hairline is read from `tokens.css` like the dark one.

### Accessibility
- The disc's button is the face inside the card, and its name carries the platform, the
  count and the connection ("Messenger, 3 unread, offline"). The satellite's name carries its
  count. The satellite, the banner and its reply controls are no longer inside the button,
  where a reader would have treated them as decoration.
- Settings: the tabs are real tabs (Left/Right move and choose, Tab leaves the bar), each
  panel is named by its tab, and each row's control is named by its label and described by
  the line under it, so a reader hears the two apart.

## v2.7.0 (2026-09-16) — Bubble for Messenger

### Added
- **Windows (beta).** The same app on Windows 11: a per-user installer and a portable exe on
  each release, unsigned like the macOS build (SmartScreen → More info → Run anyway, once).
  No tray icon — the bubble's right-click menu is the menu — and no *Glass* or *over
  full-screen apps* rows in Settings, which have no Windows equivalent. Shortcuts use Ctrl.
  macOS is unchanged.

## v2.6.0 (2026-09-16) — Bubble for Messenger

### Added
- **Instagram messages** (Settings → Bubble, off by default): Instagram's inbox loads beside
  Messenger's, and the disc switches between the two. One platform is *in focus* — its chats
  in the stack, its count on the disc — while the other shows as a small satellite at the
  disc's foot carrying its mark and unread count; click it, or right-click → *Switch to…*. Banners land from both platforms (the avatar wears
  the platform's mark); clicking one switches focus and opens the chat, and replying from one
  sends through that platform without switching. The focused platform is remembered across
  launches. Instagram's own login stays in the profile like Messenger's.

- Clicking the disc while something is unread opens the newest received message, on
  whichever platform it arrived, instead of the stack.
- Any chat can be pinned from the inbox: a pin appears on a chat row you hover — one click,
  no need to open it first. On both platforms.
- *Update to X…* shows the Homebrew command (with a Copy button) when Bubble was installed by
  Homebrew, and the README explains `brew update` vs `brew upgrade` and the trust step.

### Fixed
- Opening an Instagram chat right after its panel was put away could fail while the inbox was
  still sliding back in; the row is tried once more.
- A Messenger chat could open with its messages out of view (header and composer only, the
  card still inset). Compact mode looked for the thread card as "the largest opaque box", and
  once a chat held a tall message block — a photo, a video — that block won and every block
  sharing its classes was stretched to the panel's height. The card is now the box that holds
  the composer, and the rule is only written when it names that one element.
- With a chat open, a click on another app closed the chat but did not bring that app
  forward: the invisible shield under the stack took the click. While a chat is showing the
  sheet itself hears the click-away (it loses focus and the stack folds with it), and the
  shield only covers the screen for a stack with no chat open.

### Changed
- Pinned chats sit at the top of the stack, above a hairline; the recent ones follow.
- Pins are five per platform; an Instagram pin remembers the thread it was found in.
- Two panels on one session share one request watch, each hearing its own site's sockets.
- Settings: the *Reopen the last chat* choices take a line of their own under the text
  instead of squeezing the label into a column; keyboard focus is a brighter hairline
  (3:1 on the raised row); the Panel tab no longer repeats its own name as a caption.
- Secondary text is a shade lighter (`#98989d`), so it keeps 4.5:1 on a hovered or focused
  row as well as on the card.
- The banner's reply arrow is drawn, like the ✕, tray and pin. On a long message the
  banner's avatar stays on the disc's row.
- The Inbox chip no longer carries "···"; the app's menu is the disc's right-click.
- Opening the Inbox keeps the stack up, like opening a chat: the inbox sheet sits beside the
  column and the heads stay one click away. Cmd+N and *Open Messenger* do the same.
- Messenger's and Instagram's new-message sound only plays while Bubble is put away. With
  the stack up or a chat showing the message is on screen, so both pages are muted.
- *Report a Problem…* is gone from the menu; the README says where the log is.
- The bubble's own cards follow the Appearance setting (System by default): paper cards with
  graphite text on a light Mac, graphite on a dark one. The panel's hairline and pin badge
  are unchanged.
- **Glass** (Settings → Bubble, on, a trial): the disc, heads and banner let the wallpaper
  through a little — a tint, the way macOS's Tinted Liquid Glass reads — and the Settings
  card is the system's frosted material with the system's own rounded corners. Off for
  solid cards; *Reduce transparency* in macOS does the same.

- For VoiceOver: the disc is named with its platform and unread count, a landed message is
  announced, the reply field is named, and a head's name carries "pinned".
- The palette is written once (`src/renderer/tokens.css`); the app's pages, the panel's
  hairline and the pin button all take their colours from it.
- Profile pictures larger than the biggest disc needs are downscaled before they travel to
  the bubble; the hit test under the cursor runs once per frame; the panel watches
  messenger.com with one structural observer instead of two, ignoring its inline styles.

## v2.5.0 (2026-09-15) — Bubble for Messenger

### Changed
- Hover any head for its name; the pin badge appears on hover and pins or unpins on click.
  The Inbox chip carries "···" (the app's menu) and "+N more" when rows were left out.
- A clicked head shows its ring at once and dims until the chat is showing.
- Reply states: a turning ring while sending, a tick once sent; a failure stays long enough
  to read and says the text is in the chat.
- Clicking the banner's message text opens the reply field.
- The ✕ target arms only after the disc rests on it for a moment (a ring fills), so a fling
  can no longer quit the app.
- The disc's mark dims when Messenger is unreachable (hover: Offline / Reconnecting…) and a
  "Sign in" chip appears when nobody is signed in; clicking the disc then opens the login page.
- Settings tabs are Bubble / Notifications / Panel; the unread count lives with the other
  notification settings; switching tabs fades instead of jumping.
- The panel's hairline is black on the light theme.
- On the first launch the disc introduces itself.

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
