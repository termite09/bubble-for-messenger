# Windows — design

The same app on Windows: the bubble, the stack, the panels, the settings card, unchanged in
look and behaviour. Windows 11 is the target — it rounds frameless windows on its own, which
is the one visual the app leans on the OS for. Windows 10 is not refused; it gets square
corners. Nothing is designed for Windows specifically: no tray icon, no new surfaces. The
bubble's right-click menu is the app's menu there, as the menu bar is on macOS.

## Decisions

- **No tray icon.** The bubble is the app's only presence (the Dock is hidden on macOS for the
  same reason). Settings, Reset Position, Update, Reload and Quit are all on the bubble's
  right-click menu already.
- **The look does not change.** Fonts already fall back from `-apple-system` to `system-ui`
  (Segoe UI). Corners come from Windows 11. The Glass setting and the "over full-screen apps"
  setting are hidden where the OS has no equivalent; the values stay in settings.json.
- **Capabilities, not OS names.** One pure module says what the platform can do; main-process
  code branches on those answers. Six differences, one place.
- **Beta.** Tested by a friend against a CI build, not by the author on a desk. The README says
  so, and a checklist tells the tester what to look at.
- **Unsigned**, like the macOS build. SmartScreen's "Windows protected your PC" gets the same
  documented click-through as Gatekeeper's.
- **macOS is unchanged.** Every capability is true on darwin, so each branch resolves to
  today's call; the stacking registry is never created there; the menu template, the Glass
  and full-screen rows, the Homebrew path and the release files are the same. The tests
  cover the darwin case of every branch explicitly.

## What differs from macOS (as read from the source, 16 Sept 2026)

| macOS | Windows | Where |
|---|---|---|
| Window levels: `screen-saver` (bubble, dismiss target) above `floating` (panel, shield, settings) | Every topmost window is one tier; the most recently shown is on top | `floating-window.js` |
| `setVisibleOnAllWorkspaces` joins every Space, incl. full-screen ones | No Spaces; topmost windows show over borderless-fullscreen apps and under exclusive-fullscreen ones, whatever we do | `workspaces.js` |
| `setVibrancy('popover')` under the settings card | No vibrancy API (Win 11 has `backgroundMaterial`; not used — the look stays as it is) | `settings-window.js` |
| `roundedCorners: true` on the opaque panel and settings window | Cross-platform in Electron 44 (default `true`; on Windows 11 it is what rounds a frameless window) — passed through unchanged | `panel.js`, `settings-window.js` |
| `app.dock.hide()` | No Dock (`app.dock` is undefined; already guarded) | `main.js` |
| Homebrew cask detection and upgrade command | No Homebrew; the update item opens the release page | `lib/install.js`, `main.js` |
| App menu with `about`, `hide`, `hideOthers`, `unhide`; DevTools on `Cmd+Option+I` | Those roles are macOS-only; DevTools convention is `Ctrl+Shift+I` | `main.js createMenu` |
| Settings card closes on `Cmd+W` (`metaKey`) | `Ctrl+W` (`ctrlKey`) | `settings-renderer.js` |

Portable as is: everything in `lib/`, the scrapers and preloads, IPC, sandboxing, cookie
persistence, `nativeTheme`, `setLoginItemSettings`, `getPath('appData')` (→ `%APPDATA%`),
the single-instance lock, `frame: false` + `transparent` + `setIgnoreMouseEvents(…, {
forward: true })` + `showInactive()` + non-focusable windows.

## `lib/platform.js`

```js
capabilities(platform) → {
  windowLevels,          // darwin: NSWindow levels; else one topmost tier
  spaces,                // darwin: joinAllSpaces does something; else a no-op
  vibrancy,              // darwin: setVibrancy exists; else the opaque ground colour
  dock,                  // darwin
  homebrew,              // darwin
}
```

All five are `platform === 'darwin'`; the point of the module is that call sites ask about
the capability, so Linux later is a matter of changing answers here. `CAPS =
capabilities(process.platform)` is the export main-process code uses.

## Window layer

**Stacking without levels.** When `!CAPS.windowLevels`, `createFloatingWindow` records each
window with its requested level. On any recorded window's `show` event — and, a tick later,
its `focus` event: activation raises a window on Windows too — every *visible*
recorded window of a higher level is `moveTop()`-ed, lowest of those first, so the order
ends up bubble/dismiss above panel/shield/settings — what the levels give macOS. Records
drop on `closed`. No call site changes: showing the shield or panel re-raises the bubble by
itself. The ordering is a pure function, `raiseOrder(shownLevel, windows)` → the windows to
raise, in order, in `lib/` with a test.

**Spaces.** `joinAllSpaces` returns without calling anything when `!CAPS.spaces`. The
settings card hides the *over full-screen apps* row on those platforms (the renderer asks
main for the capabilities once, through the existing settings IPC).

**Vibrancy.** `frosted()` also requires `CAPS.vibrancy`, so the card takes the opaque ground
colour; `visualEffectState` is only passed when it means something; the *Glass* row is hidden
like the Spaces row.

**Rounded corners.** Cross-platform since Electron 44, so `roundedCorners: true` flows through
unchanged everywhere, unlike `visualEffectState` above.

## Menus and shortcuts

The application menu stays. On Windows a frameless window shows no menu bar but Electron
still routes the menu's accelerators while a window of the app is focused, so `Ctrl+N`,
`Ctrl+1–5` and `Ctrl+,` keep working from the panel — this is the one Electron behaviour
the design relies on without having measured it, so it is the first item on the tester's
checklist. If it turns out false, the fallback is `before-input-event` on the panel window;
not built until needed.

The template drops `about`, `hide`, `hideOthers` and `unhide` when `!CAPS.dock` (they are
the macOS application-menu roles), and the DevTools accelerator is `CmdOrCtrl+Shift+I` off
macOS. The settings card's close key checks `metaKey || ctrlKey`.

## Install and update

- `installedByHomebrew()` returns false when `!CAPS.homebrew`, so the update item opens the
  release page — the existing non-Homebrew path.
- `package.json` build: `win.target` = `nsis` (per-user, no admin prompt, one-click) and
  `portable`; `win.icon` = `assets/icon.png` (1024 px; electron-builder converts it to an
  `.ico` at build time, so none is committed). `artifactName` is set for both targets — the
  defaults would give the installer and the portable exe the same name — so the workflow can
  name the files it expects.
- Profile: `%APPDATA%\Bubble for Messenger` (the same `getPath('appData')` join).
- Start at login: `setLoginItemSettings` writes the Run registry key, pointing at the
  installed exe or, for the portable build, the exe the user kept: the launcher unpacks to
  `%TEMP%` and names the real file in `PORTABLE_EXECUTABLE_FILE`.

## CI and release

- `ci.yml`: a matrix of `ubuntu-latest` and `windows-latest`. `node --test` and eslint run on
  both; a Windows-only slip (a hard-coded `/`, a CRLF-sensitive test) fails the build.
- `release.yml`: two jobs. `build` is a matrix — `macos-latest` produces the dmg and zip,
  `windows-latest` the installer and portable exe — and each uploads its `dist/` outputs as a
  workflow artifact. `publish` downloads both, writes one `SHA256SUMS`, and creates the
  release and bumps the Homebrew cask as today. The dry run (`workflow_dispatch`) stops after
  `build`, leaving downloadable artifacts: that is the build the tester gets.
- The Homebrew step stays macOS-only; the Windows files are simply extra release assets.

## Docs

- README: a Windows subsection under installation (installer and portable, the SmartScreen
  click-through, where the profile lives, how to remove it), a "Windows support is beta" note,
  and `Cmd` → `Cmd / Ctrl` in the shortcut table.
- `docs/windows-test-checklist.md`, for the tester: accelerators from the panel; click-away
  puts the panel away; clicks pass through the bubble window's transparent padding; drag,
  snap, and the dismiss target; stacking (bubble stays above the panel and shield); two
  monitors at different scaling; start at login; the update dialog; Settings shows no Glass
  or full-screen rows.
- CHANGELOG entry under the next version.

## Tests

- `platform.test.js`: capabilities for `darwin`, `win32`, `linux`.
- `raiseOrder` ordering: shown window's level vs. others, hidden windows skipped, order low
  to high; and that with `windowLevels` the factory records nothing.
- `workspaces.test.js`: the no-op case, beside the existing darwin case.
- `settings-window.test.js`: no vibrancy → ground colour even with `glass` on; with vibrancy
  → `setVibrancy('popover')` as today.
- `install.test.js`: not Homebrew when the capability is off; the Caskroom cases unchanged.
- Existing tests unchanged; CI runs all of them on Windows too.

## Out of scope

A tray icon, winget or Scoop packaging, code signing, Windows 10 corner emulation,
`backgroundMaterial` glass, Linux.
