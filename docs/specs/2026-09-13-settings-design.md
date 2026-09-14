# Settings — design

A settings page so the app's few behaviours are the user's call: whether the bubble floats
over full-screen apps, whether it starts at login, how big it is, what the banner shows, what
the panel looks like. Eleven settings on three tabs, one small card window in the bubble's own
design language, applied immediately and saved to the existing `settings.json`.

## Settings

| Key | Default | Section | Label / description |
| --- | --- | --- | --- |
| `overFullscreen` | `true` | Bubble | **Show over full-screen apps.** Off keeps it off full-screen video and apps — and, since macOS draws any all-Spaces window in full-screen Spaces too, on the one desktop it's on. |
| `startAtLogin` | `false` | Bubble | **Start at login.** |
| `bubbleSize` | `'small'` | Bubble | **Size**: Small / Medium / Large — 44 / 56 / 68 px for the disc, the chat heads and the banner. |
| `banner` | `true` | Messages | **Banner when a message lands.** The disc unrolls for a few seconds. |
| `bannerPreview` | `true` | Messages | **Show the message in the banner.** Off shows only who wrote — for screen sharing or public places. |
| `quickReply` | `true` | Messages | **Reply from the banner.** The ↩ on the banner. Off if the bubble should never take the keyboard. |
| `notifications` | `true` | Messages | **macOS notifications from Messenger.** Messenger's own Notification Center banners, in addition to the bubble. |
| `badge` | `'steady'` | Bubble | **Unread count**: Off / Steady / Pulsing. Pulsing breathes the pill between full and a third while anything is unread. A boolean in an older `settings.json` migrates (`true` → steady, `false` → off). |
| `theme` | `'system'` | Panel | **Appearance**: System / Light / Dark, of the Messenger panel. System follows macOS. |

Not a setting, but a row: **New-message sound** (Messages) explains that the sound is Messenger's
own switch (Preferences → Notification sounds) and its *Open* button opens the panel on that
dialog. Messenger keeps that preference per browser profile, so the app's copy starts off.
| `spellcheck` | `true` | Panel | **Spell check.** |
| `blockTelemetry` | `true` | Privacy | **Block Facebook telemetry.** Cancels Facebook's logging beacons (Banzai, Quick Metrics, Pixel, error reports). Nothing Messenger needs to work is touched. |

The existing `bubble` key (disc position) stays in the same file, untouched by the page.

## Model

`src/lib/settings.js` (pure, unit-tested):

- `DEFAULTS` — the table above.
- `THEMES = ['system', 'light', 'dark']`, `BADGES = ['off', 'steady', 'pulse']`,
  `BUBBLE_SIZES = { small: 44, medium: 56, large: 68 }`.
- `normalizeSettings(raw)` — from anything (`settings.json` is user-editable, and values also
  arrive over IPC) to a full settings object: every boolean key coerced with `Boolean`, `theme`
  kept only if in `THEMES`, unknown keys dropped, `bubble` passed through as-is (or `null`).
- `isSettingKey(key)` — the eleven keys above; the IPC boundary refuses anything else.

## Applying

`main.js` keeps `settings = normalizeSettings(loadSettings())` and an `applySettings(prev)`
that runs at startup (with `prev = null`) and after every change. Each setting has one
apply-point; a change re-runs only the ones whose value differs from `prev`.

| Key | Apply |
| --- | --- |
| `overFullscreen` | `bubble.setOverFullscreen(on)`, `panel.setOverFullscreen(on)`, `dismiss.setOverFullscreen(on)`, settings window likewise. Each goes through `joinAllSpaces(win, on)` (`src/main/workspaces.js`): on → `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`, off → `setVisibleOnAllWorkspaces(false, ...)` — measured on macOS 26: a window that joins all Spaces is drawn in full-screen Spaces whatever the auxiliary flag or window level, so off means one desktop. Always with `skipTransformProcessType: true` (Electron's default re-transforms the process on every call: Dock icon back, every window blinking), and every window is created `fullscreenable: false` (FullScreenPrimary conflicts with the auxiliary flag). The bubble module covers its shield too. |
| `startAtLogin` | `app.setLoginItemSettings({ openAtLogin: on })`, only when `app.isPackaged` — under `npm start` it would register Electron.app itself. |
| `banner` | `refreshRecent` skips `bubble.landed(...)`. |
| `bannerPreview` | `refreshRecent` passes `{ ...landed, preview: '' }`; the renderer already shows "New message" for an empty preview. |
| `quickReply` | `bubble.setSettings({ quickReply })` → renderer toggles `body.no-reply`, which hides ↩ (`#landed-reply`). |
| `notifications` | `restrictPermissions`' request and check handlers grant `'notifications'` only when on. Messenger reads `Notification.permission` before each notification, so it takes effect for the next message. |
| `badge` | `bubble.setBadge(mode !== 'off' ? lastUnread : 0)`; `lastUnread` is kept from `onUnread` so switching on shows the count at once. The mode also rides to the bubble page with `quickReply`, which toggles `body.pulse` (a CSS animation on the pill; none under Reduce Motion). |
| `bubbleSize` | `bubble.setSettings(...)` → the bubble page is zoomed by `size / 44` (`webContents.setZoomFactor`; per window, not per origin), and the window geometry in `bubble.js` / `lib/layout.js` (`fanLayout`, `windowFrame`) takes the same scale. The disc keeps its centre, or stays on the screen edge it rests on, then re-snaps to the side. |
| `theme` | `nativeTheme.themeSource = theme`, and the panel swaps Messenger's own `__fb-dark-mode` / `__fb-light-mode` class on `<html>` from `nativeTheme.shouldUseDarkColors` (on every `nativeTheme` `updated` and every page load, since Messenger renders its own choice in). Messenger only follows `prefers-color-scheme` when its own preference is "Device", so the class swap is what makes the setting take effect for every account. |
| `spellcheck` | `panel.session().setSpellCheckerEnabled(on)`. |
| `blockTelemetry` | the `onBeforeRequest` handler cancels only when on. |

## Window

`src/main/settings-window.js` → `createSettingsWindow({ getSettings, setSetting, subscribe,
onOpenMessengerPreferences })` returning `{ open(displayBounds), setOverFullscreen(on) }`.

- One `BrowserWindow`, created lazily on first open and then hidden/shown: 360 wide, as tall as
  the tab it shows (the page measures and asks over `settings:resize`; the top edge stays put), `frame: false`,
  `transparent: true`, `resizable: false`, `alwaysOnTop` at `'floating'`, `skipTaskbar: true`,
  visible on all workspaces (full-screen per the setting), focusable. Placed centred in the
  work area of the display the bubble is on. A second `open` focuses it.
- Closes (hides) on Esc, on its ✕, and via Cmd+W (app menu `close` role). Never destroyed.
- Opened from the disc's right-click menu ("Settings…", above Reset Bubble Position) and from
  the app menu (Cmd+,).
- Page: `src/renderer/settings.html`, `settings-preload.js`, `settings-renderer.js`. Same CSP
  as the bubble page (`default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'
  data:`). Preload exposes `settingsApi.get() → Promise<settings>`, `set(key, value)`,
  `close()`, `onSettings(cb)` (main pushes the normalized state after every change, so the
  page never shows something main refused).
- Design: the bubble's language (DESIGN.md) — graphite card with the panel's 16 px corners and
  hairline, `title` for row labels, `body` in ash for descriptions, `label` caps in ash for
  section headings with a hairline rule, system-blue for an "on" switch, segmented controls
  for the three-way choices. Rows are 44 px min, 16 px side padding. A ✕ in the top-right; the
  title "Settings" as the card's header, and under it a full-width segmented tab bar — **Bubble**
  (over full-screen, start at login, size, unread count), **Messages** (banner, show message,
  reply, macOS notifications, sound), **Panel** (appearance, spell check; a Privacy caption for
  telemetry). One pane is shown at a time; the tab is not remembered.
- IPC: `settings:get`, `settings:set` (main: `isSettingKey` + normalize, save, apply, then
  broadcast `settings:changed` with the full object), `settings:close`, `settings:resize`,
  `settings:open-messenger-preferences` (→ `panel.openPreferences`: the inbox, then Messenger's
  account gear → Preferences, best effort). Each handler checks `e.sender` is the settings window.

## Testing

- Unit: `normalizeSettings` — defaults from `{}`/`undefined`, boolean coercion, bad `theme`
  falls back, unknown keys dropped, `bubble` preserved; `isSettingKey`.
- Live (fresh profile, scripted): open the window; set each key over IPC and read
  `settings.json` back; assert the effects that are observable — telemetry cancellations stop,
  `nativeTheme.themeSource` follows `theme`, the bubble renderer's `no-reply` class follows
  `quickReply`, `setBadge(0)` when `badge` is off, `spellCheckerEnabled` follows. Capture the
  page for a design check.
- Packaged build: start-at-login registers (System Settings → Login Items) and the bubble
  hides over a full-screen app with `overFullscreen` off.

## Out of scope

Page zoom, ignore-muted-conversations, update checks, a global hotkey, import/export.
