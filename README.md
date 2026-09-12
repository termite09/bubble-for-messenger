# Messenger Bubble for Mac

Facebook Messenger as a floating "chat head" on macOS: a small always-on-top bubble that
opens a compact Messenger panel beside it. No dock icon, no browser tab.

Forked from [stefanminch/messenger-mac](https://github.com/stefanminch/messenger-mac), which
wraps messenger.com in a normal Electron window. This fork replaces the window with the bubble.

<img src="icon.png" width="128" alt="Messenger Bubble">

## How it works

- **Bubble** — a 56 px round Messenger logo that floats over every app and every Space
  (including full-screen apps). Drag it anywhere; its position is remembered.
- **Click the bubble** to open Messenger in a compact panel next to it (it flips to the other
  side near a screen edge). Click the bubble again, or anywhere else, to hide it. Messenger
  stays loaded in the background, so messages keep arriving.
- **Unread badge** — a red count appears on the bubble when you have unread chats.
- **Right-click the bubble** for *Open Messenger*, *Reload Messenger*, *Reset Bubble Position*
  and *Quit*.
- Persistent login, native notifications, dark mode, and links opening in your default browser
  all carry over from the original app.

## Keyboard shortcuts (while the panel is open)

| Shortcut | Action |
|----------|--------|
| `Cmd + N` | New message |
| `Cmd + 1-9` | Switch to conversation 1-9 |
| `Cmd + Shift + S` | Toggle Messenger's inbox sidebar |

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

The app keeps its own profile in `~/Library/Application Support/MessengerBubble`, so it can run
alongside the original MessengerApp without sharing (or corrupting) its login data. You log in
once inside the bubble.

## Project layout

| File | Responsibility |
|------|----------------|
| `main.js` | App lifecycle, settings, cookie persistence, menu, wiring bubble ↔ panel |
| `bubble.js` / `bubble.html` / `bubble-renderer.js` / `bubble-preload.js` | The floating bubble window: drag, click, badge, context menu |
| `panel.js` | The Messenger panel: placement beside the bubble, show/hide, unread detection, link handling |
| `lib/` | Pure helpers (`layout.js`, `unread.js`, `links.js`) covered by `test/` |

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

MIT License — feel free to modify and distribute.

## Disclaimer

This project is not affiliated with, authorized, maintained, sponsored, or endorsed by
Meta/Facebook or any of its affiliates or subsidiaries. Use at your own risk.
