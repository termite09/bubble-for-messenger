# Bubble for Messenger

Facebook Messenger as a floating "chat head" on macOS: a small always-on-top bubble that
opens a compact Messenger panel beside it. No dock icon, no browser tab.

Forked from [stefanminch/messenger-mac](https://github.com/stefanminch/messenger-mac), which
wraps messenger.com in a normal Electron window. This fork replaces the window with the bubble.

<img src="icon.png" width="128" alt="Bubble for Messenger">

## How it works

- **The disc** — a 44 px grey disc with the Messenger mark that floats over every app and every
  Space (including full-screen apps). Drag it anywhere; when you let go it snaps to the nearest
  side and its position is remembered. A blue count shows total unread.
- **A message lands** — the disc unrolls into a banner (avatar, name, first line) for four
  seconds, then folds back.
- **Click the disc** to deploy a stack of your five most recent chats as round heads, newest
  at the top (hover for the name; a blue dot means unread), plus a paper *Open Messenger* head
  for the full inbox. Pick one and that conversation opens in a compact sheet beside the stack;
  the open chat wears a white ring, and the others stay one click away. Click anywhere else, or
  the disc, to put it all away. Messenger stays loaded in the background, so messages keep
  arriving.
- **Drag to dismiss** — drag the disc onto the ✕ target that appears at the bottom of the
  screen to quit the app.
- **Right-click the disc** for *Open Messenger*, *Reload Messenger*, *Reset Bubble Position*
  and *Quit*.
- Persistent login, native notifications, dark mode, and links opening in your default browser
  all carry over from the original app.

## Keyboard shortcuts (while the panel is open)

| Shortcut | Action |
|----------|--------|
| `Cmd + N` | New message (opens the inbox) |
| `Cmd + 1-5` | Open one of your five most recent chats (1 = most recent) |

## Build from source

Prerequisites: Node.js 18+ and npm.

```bash
git clone <this repo>
cd messenger-mac
npm install

# Run in development mode
npm start

# Unit tests (layout, unread parsing, link handling)
npm test

# Build a .app / DMG into dist/
npm run build
```

The app keeps its own profile in `~/Library/Application Support/Bubble for Messenger`, so it can run
alongside the original MessengerApp without sharing (or corrupting) its login data. You log in
once inside the bubble.

## Project layout

| File | Responsibility |
|------|----------------|
| `main.js` | App lifecycle, settings, cookie persistence, menu, wiring bubble ↔ panel ↔ dismiss |
| `bubble.js` / `bubble.html` / `bubble-renderer.js` / `bubble-preload.js` | The disc: drag, edge-snap, click, the stack of heads, the landed banner, unread count, context menu |
| `shield.html` / `shield-preload.js` / `shield-renderer.js` | The invisible catch window behind an open stack: a press anywhere else closes it |
| `panel.js` | The Messenger panel: placement beside the disc, card frame, compact vs full mode, unread detection, link handling |
| `dismiss.js` / `dismiss.html` / … | The ✕ drop target shown while dragging |
| `scrape.js` | Page-side scripts: read recent chats (name, preview, time, unread), open a thread, frame and compact mode |
| `avatars.js` | Fetch profile pictures through the Messenger session as data URLs |
| `lib/` | Pure helpers (`layout.js`, `unread.js`, `links.js`, `recent.js`) covered by `test/` |

## Differences from the original

- Runs as a bubble instead of a dock window (no dock icon).
- Removed the daily usage ping to `counterapi.dev`, the GitHub update check, and the welcome window.
- External links are only opened when they are real `http(s)` URLs on a non-messenger.com host.

## FAQ

**Is this the official Messenger app?** No — it's an unofficial wrapper around messenger.com,
not affiliated with Meta/Facebook.

**Does it support voice/video calls?** Everything messenger.com supports works, since it *is*
messenger.com in the panel.

**How do I quit?** Right-click the bubble → Quit (there is no dock icon).

## License

MIT — see [LICENSE](LICENSE). Copyright the original author (Stefan Minch) for the upstream
wrapper and Alexandros Christou for this fork.

## Disclaimer

This project is not affiliated with, authorized, maintained, sponsored, or endorsed by
Meta/Facebook or any of its affiliates or subsidiaries. Use at your own risk.
