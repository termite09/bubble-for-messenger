# Messenger Bubble for Mac

Facebook Messenger as a floating "chat head" on macOS: a small always-on-top bubble that
opens a compact Messenger panel beside it. No dock icon, no browser tab.

Forked from [stefanminch/messenger-mac](https://github.com/stefanminch/messenger-mac), which
wraps messenger.com in a normal Electron window. This fork replaces the window with the bubble.

<img src="icon.png" width="128" alt="Messenger Bubble">

## How it works

- **Bubble** — a 56 px round Messenger logo that floats over every app and every Space
  (including full-screen apps). Drag it anywhere; when you let go it snaps to the nearest
  side and its position is remembered.
- **Click the bubble** to fan out your five most recent chats as avatar heads (newest at the
  top), plus an *Open Messenger* item for the full inbox. Click an avatar to open just that
  conversation in a compact panel; click the bubble again to collapse the fan. Messenger
  stays loaded in the background, so messages keep arriving.
- **Drag to dismiss** — drag the bubble onto the ✕ target that appears at the bottom of the
  screen to quit the app.
- **Unread badge** — a red count on the bubble for total unread; a red dot on a chat head
  whose conversation is unread.
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
| `main.js` | App lifecycle, settings, cookie persistence, menu, wiring bubble ↔ panel ↔ dismiss |
| `bubble.js` / `bubble.html` / `bubble-renderer.js` / `bubble-preload.js` | The floating bubble: drag, edge-snap, click, fan of chat heads, badge, context menu |
| `panel.js` | The Messenger panel: placement beside the bubble, compact vs full mode, unread detection, link handling |
| `dismiss.js` / `dismiss.html` / … | The ✕ drop target shown while dragging |
| `scrape.js` | Page-side scripts: read recent chats, open a thread, toggle compact mode |
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

MIT License — feel free to modify and distribute.

## Disclaimer

This project is not affiliated with, authorized, maintained, sponsored, or endorsed by
Meta/Facebook or any of its affiliates or subsidiaries. Use at your own risk.
