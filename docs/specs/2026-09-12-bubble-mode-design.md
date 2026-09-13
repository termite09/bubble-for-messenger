# Bubble mode — design

Turn messenger-mac from a dock window into a floating "chat head": a small
always-on-top bubble that opens a compact Messenger panel beside it.

## Behaviour

- **Bubble**: 56×56 px round window showing the Messenger logo. Always on top,
  visible on all Spaces and over full-screen apps. No dock icon. Position is
  persisted in `settings.json` (`bubble.x`, `bubble.y`).
- **Drag** moves the bubble (and the panel if visible). **Click** (movement
  < 4 px between mousedown and mouseup) toggles the panel.
- **Panel**: frameless 420×640 `BrowserWindow` loading `https://www.messenger.com`,
  always on top, all Spaces. Placed beside the bubble: to the right if it fits
  on the bubble's display, else to the left; top-aligned with the bubble,
  shifted up if it would overflow the bottom. Hidden (not destroyed) on blur
  or on bubble click. Stays loaded while hidden so messages keep arriving.
- **Blur guard**: hiding on blur records a timestamp; a bubble click within
  200 ms of that blur is treated as "already closed" and does not reopen.
- **Unread badge**: main listens to the panel's `page-title-updated`; title
  `(N) Messenger` → N, else 0. Sent to the bubble over IPC; bubble draws a red
  badge with N (`9+` above 9), hidden when 0.
- **Right-click on bubble** → native context menu: *Open Messenger*,
  *Reload Messenger*, *Reset bubble position*, *Quit*.
- Kept from the existing app: persistent Facebook cookies, external links open
  in the default browser, Edit menu roles, Cmd+N / Cmd+1-9 / Cmd+Shift+S
  shortcuts acting on the panel.
- Removed: `counterapi.dev` usage ping, GitHub update-check dialog, welcome window.

## Out of scope (v1)

Pop-out to a full-size window, menu-bar tray icon, sender avatar on the bubble.

## Structure

| File | Responsibility |
|---|---|
| `main.js` | App lifecycle, settings load/save, cookie persistence, menu + shortcuts, wiring bubble ↔ panel |
| `bubble.js` | Creates the bubble window; IPC handlers for drag/click/context menu; `setBadge(n)` |
| `bubble.html` | Bubble UI: logo, badge, mousedown/mousemove/mouseup → IPC via `bubble-preload.js` |
| `bubble-preload.js` | `contextBridge` exposing `move(dx,dy)`, `click()`, `contextMenu()`, `onBadge(cb)` |
| `panel.js` | Creates the Messenger panel; `showAt(bubbleBounds)`, `hide()`, `toggle()`, blur guard, title → unread |
| `lib/layout.js` | Pure: `panelPosition(bubbleBounds, displayWorkArea, panelSize)` |
| `lib/unread.js` | Pure: `unreadFromTitle(title)` |
| `test/*.test.js` | `node --test` for the pure modules |

Drag is implemented manually (mousedown → mousemove deltas → `win.setPosition`)
because Electron's CSS `-webkit-app-region: drag` swallows click events on macOS.
