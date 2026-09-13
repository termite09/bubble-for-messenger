# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Electron on macOS. The UI surfaces are HTML/CSS pages inside frameless, transparent
`BrowserWindow`s; the design language is the app's own, not macOS-native controls. macOS
still sets the operating constraints: menu bar, Spaces, full-screen apps, work-area insets,
multi-display geometry.)

## Users

macOS users who keep Facebook Messenger open all day but do their real work in other apps —
often full-screen. They want to notice and answer a message without switching Space, opening
a browser tab, or giving Messenger a dock slot. Distributed publicly as an open-source
release (DMG/zip via GitHub), so it must work on strangers' machines, screens and wallpapers,
not just the author's.

## Product Purpose

Bubble for Messenger turns messenger.com into a floating "chat head": one small always-on-top
bubble, visible on every Space and over full-screen apps, that fans out the five most recent
conversations and opens any of them in a compact panel beside it. Messenger stays loaded
while hidden so messages keep arriving. Success is: the user stays in their work, glances at
the bubble's unread count, opens the right conversation in one or two clicks, replies, and is
back in their app — with the whole thing feeling like a single fluid object rather than a
window manager.

## Positioning

The Android chat-heads interaction model (bubble → fan → conversation), on the Mac, wrapped
around the real messenger.com. A browser tab or the upstream dock-window fork give you
Messenger *in a window*; this gives you Messenger as a *presence* that never takes space until
you ask. The stack's deploy and the banner that unrolls when a message lands are deliberately
crafted — the app is also a craft/animation playground, and that polish is part of the
product, not decoration to trim — but in the register of macOS's own notifications, not
ornament.

## Operating Context

- Lives over other apps: the bubble is a non-focusable, transparent, always-on-top window
  (`screen-saver` level) on all workspaces incl. full-screen. It must read against arbitrary
  wallpapers and app content, light or dark.
- The panel is a frameless 420×640 (inbox) / 420×560 (single thread) `BrowserWindow` loading
  messenger.com, placed beside the bubble (right if it fits, else left), hidden on blur, never
  destroyed.
- A ✕ drop target appears at the bottom of the display while dragging; dropping the bubble on
  it quits.
- Interaction is mouse-first (drag, click, right-click). Keyboard: Cmd+N (new message),
  Cmd+1–5 (open a recent chat). Cmd+Q / right-click → Quit is the only way out (no dock icon).
- Data comes from scraping messenger.com's DOM (recent rows, avatars via the session, unread
  from the tab title); Meta can change that DOM at any time, so degradation paths (fan shows
  only "Open Messenger") are part of the product.
- Own profile dir (`~/Library/Application Support/Bubble for Messenger`) so it can run beside the
  upstream MessengerApp.

## Capabilities and Constraints

- Disc: 44 px grey disc with the Messenger mark; drag anywhere, snaps to nearest vertical edge
  on release, position persisted; blue unread count (`9+` cap); right-click menu (Open
  Messenger, Reload Messenger, Reset Bubble Position, Quit). When a message lands, the disc
  unrolls into a banner (avatar, name, first line) for four seconds.
- Stack: up to 5 recent chats as 250×52 banners (avatar, name, last line, time, blue dot when
  unread), newest first, with an "Open Messenger" banner last; grows up when it fits, else
  down; stays open while a conversation is open so the next chat is one click away; a press
  anywhere outside it closes stack and panel.
- Panel: opens 8 px beyond the stack, framed as a 16 px-radius card with a hairline; the open
  chat's banner reads as active.
- Panel compact mode is injected CSS on messenger.com; the panel cannot go narrower than
  ~400 px or Messenger drops to a single-column layout and shows the list instead of the thread.
- Opening a thread requires a *trusted* click on the list row (synthetic clicks only highlight);
  the app stages this at opacity 0 and reveals once the thread is on screen.
- The bubble page's CSP is `default-src 'self'; img-src 'self' data:` — avatars must arrive as
  data URLs; no external resources.
- Explicitly out of scope so far: pop-out to a full-size window, menu-bar tray icon, sender
  avatar on the main bubble.
- Undecided: whether the app should ever show a first-run/onboarding hint (there is none; the
  bubble simply appears bottom-right).

## Brand Commitments

- Name: **Bubble for Messenger** (`Bubble.app`, `com.termite09.bubble-for-messenger`). The
  "<name> for Messenger" form is deliberate: Messenger is Meta's mark, so the product name
  never leads with it.
- Mark: the Messenger logo (`icon.png` / `icon.icns`) is the only colour the disc carries at
  rest; the app's own surfaces are system-grey cards. The app is an unofficial wrapper and
  must say so; it must not impersonate Meta.
- Unread is macOS system blue `#0a84ff` (count pill and dot); no red anywhere in the app's
  own UI (decided during the September 2026 redesign to the "standing notification" look).
- Voice (README, menus): plain, direct, lower-case-technical; explains *why* things work the
  way they do.

## Evidence on Hand

- `README.md` — feature description, shortcuts, project layout, FAQ, disclaimer.
- `docs/superpowers/specs/2026-09-12-bubble-mode-design.md` and
  `…-chat-heads-design.md` — behavioural specs the code was built from.
- `icon.png`, `icon.icns` — the only visual assets.
- No screenshots, demo video, testimonials, user counts or download figures exist. Do not
  fabricate any for a landing page or README.

## Product Principles

1. **Presence, not a window.** Anything that makes the bubble feel like a window (chrome,
   focus stealing, dock presence, taking space when idle) is a regression.
2. **One system.** Disc, banners and the panel frame share one card language (grey, hairline,
   one shadow, one easing); the stack deploys as a single motion.
3. **Fast to the conversation.** The measure is clicks and milliseconds from "I saw the badge"
   to "I'm typing a reply", without ever flashing the inbox list on the way.
4. **Survive Meta.** The DOM will change; every scrape path degrades to something usable and
   never leaves an invisible window swallowing clicks.
5. **Works on a stranger's Mac.** Multi-display, notch, light/dark wallpaper, Reduce Motion —
   defaults must be sane without configuration.

## Accessibility & Inclusion

No product-specific requirement has been established beyond the above. Reduce Motion is
not currently honoured by the stack/landed animations; recorded as a known gap, not a decision.
