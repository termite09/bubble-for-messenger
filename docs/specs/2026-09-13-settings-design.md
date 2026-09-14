# Settings — design

A settings page so the app's few behaviours are the user's call: whether the bubble floats
over full-screen apps, whether it starts at login, what the banner shows, what the panel
looks like. Ten settings, one small card window in the bubble's own design language,
applied immediately and saved to the existing `settings.json`.

## Settings

| Key | Default | Section | Label / description |
| --- | --- | --- | --- |
| `overFullscreen` | `true` | Bubble | **Show over full-screen apps.** Off keeps the bubble to normal Spaces; a full-screen video or app hides it. |
| `startAtLogin` | `false` | Bubble | **Start at login.** |
| `banner` | `true` | Messages | **Banner when a message lands.** The disc unrolls for a few seconds. |
| `bannerPreview` | `true` | Messages | **Show the message in the banner.** Off shows only who wrote — for screen sharing or public places. |
| `quickReply` | `true` | Messages | **Reply from the banner.** The ↩ on the banner. Off if the bubble should never take the keyboard. |
| `notifications` | `true` | Messages | **macOS notifications from Messenger.** Messenger's own Notification Center banners, in addition to the bubble. |
| `badge` | `true` | Messages | **Unread count on the bubble.** |
| `theme` | `'system'` | Panel | **Appearance**: System / Light / Dark, of the Messenger panel. System follows macOS. |
| `spellcheck` | `true` | Panel | **Spell check.** |
| `blockTelemetry` | `true` | Privacy | **Block Facebook telemetry.** Cancels Facebook's logging beacons (Banzai, Quick Metrics, Pixel, error reports). Nothing Messenger needs to work is touched. |

The existing `bubble` key (disc position) stays in the same file, untouched by the page.

## Model

`src/lib/settings.js` (pure, unit-tested):

- `DEFAULTS` — the table above.
- `THEMES = ['system', 'light', 'dark']`.
- `normalizeSettings(raw)` — from anything (`settings.json` is user-editable, and values also
  arrive over IPC) to a full settings object: every boolean key coerced with `Boolean`, `theme`
  kept only if in `THEMES`, unknown keys dropped, `bubble` passed through as-is (or `null`).
- `isSettingKey(key)` — the ten keys above; the IPC boundary refuses anything else.

## Applying

`main.js` keeps `settings = normalizeSettings(loadSettings())` and an `applySettings(prev)`
that runs at startup (with `prev = null`) and after every change. Each setting has one
apply-point; a change re-runs only the ones whose value differs from `prev`.

| Key | Apply |
| --- | --- |
| `overFullscreen` | `bubble.setOverFullscreen(on)`, `panel.setOverFullscreen(on)`, `dismiss.setOverFullscreen(on)`, settings window likewise. Each goes through `joinAllSpaces(win, on)` (`src/main/workspaces.js`), which passes `skipTransformProcessType: true`: Electron's default re-transforms the process on every call, which brought the Dock icon back and blinked every window when the setting was turned off. The bubble module covers its shield too. |
| `startAtLogin` | `app.setLoginItemSettings({ openAtLogin: on })`, only when `app.isPackaged` — under `npm start` it would register Electron.app itself. |
| `banner` | `refreshRecent` skips `bubble.landed(...)`. |
| `bannerPreview` | `refreshRecent` passes `{ ...landed, preview: '' }`; the renderer already shows "New message" for an empty preview. |
| `quickReply` | `bubble.setSettings({ quickReply })` → renderer toggles `body.no-reply`, which hides ↩ (`#landed-reply`). |
| `notifications` | `restrictPermissions`' request and check handlers grant `'notifications'` only when on. Messenger reads `Notification.permission` before each notification, so it takes effect for the next message. |
| `badge` | `bubble.setBadge(on ? lastUnread : 0)`; `lastUnread` is kept from `onUnread` so switching on shows the count at once. |
| `theme` | `nativeTheme.themeSource = theme`, and the panel swaps Messenger's own `__fb-dark-mode` / `__fb-light-mode` class on `<html>` from `nativeTheme.shouldUseDarkColors` (on every `nativeTheme` `updated` and every page load, since Messenger renders its own choice in). Messenger only follows `prefers-color-scheme` when its own preference is "Device", so the class swap is what makes the setting take effect for every account. |
| `spellcheck` | `panel.session().setSpellCheckerEnabled(on)`. |
| `blockTelemetry` | the `onBeforeRequest` handler cancels only when on. |

## Window

`src/main/settings-window.js` → `createSettingsWindow({ getSettings, onChange })` returning
`{ open(displayBounds), setOverFullscreen(on) }`.

- One `BrowserWindow`, created lazily on first open and then hidden/shown: 360×720, `frame: false`,
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
  section headings with a hairline rule, system-blue for an "on" switch, a segmented control
  for Appearance. Rows are 44 px min, 16 px side padding. A ✕ in the top-right; the title
  "Settings" as the card's header. The ten rows fit 720 px without scrolling.
- IPC: `settings:get`, `settings:set` (main: `isSettingKey` + normalize, save, apply, then
  broadcast `settings:changed` with the full object), `settings:close`. Each handler checks
  `e.sender` is the settings window.

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
