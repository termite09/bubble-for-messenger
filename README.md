# Bubble for Messenger

Facebook Messenger as a floating chat head on macOS: a small always-on-top bubble that opens
your recent chats and a compact Messenger panel beside it. No dock icon, no browser tab.

<img src="assets/icon.png" width="128" alt="Bubble for Messenger">

## Install

Requires macOS 11 or later. Builds are for Apple Silicon (M1 and later); on an Intel Mac,
build from source (below).

**With Homebrew:**

```bash
brew install --cask termite09/tap/bubble-for-messenger
```

Use the full `termite09/tap/…` name: since Homebrew 6, third-party taps must be trusted, and
installing by full name trusts just this cask. (If Homebrew prints a notice about *other*
untrusted taps on your machine, that is unrelated and can be ignored.)

Because the app is not signed with an Apple developer certificate, macOS will block the first
launch. Right-click the app in Applications → Open → Open, or clear the quarantine flag once in
Terminal with:

```bash
xattr -d com.apple.quarantine /Applications/Bubble.app
```

Update later with `brew upgrade --cask bubble-for-messenger`; uninstall with
`brew uninstall --cask bubble-for-messenger` (add `--zap` to remove your login and settings too).

**By hand:**

1. Download the latest `Bubble-<version>-arm64.dmg` from
   [Releases](https://github.com/termite09/bubble-for-messenger/releases).
2. Open the DMG and drag **Bubble** into **Applications**.
3. First launch only: the app is not signed with an Apple developer certificate, so macOS
   will refuse a normal double-click. **Right-click `Bubble.app` → Open → Open**. (If macOS
   still says the app is damaged, run
   `xattr -d com.apple.quarantine /Applications/Bubble.app` once in Terminal.)
4. A grey bubble appears at the bottom-right of your screen. Right-click it → **Open Messenger**
   and sign in to messenger.com. You only do this once; the login is kept.

To update, download the new DMG and replace the app. To uninstall, delete `Bubble.app` and,
if you want your login gone too, `~/Library/Application Support/Bubble for Messenger`.

## How it works

- **The bubble** — a 44 px grey disc with the Messenger mark that floats over every app and every
  Space (including full-screen apps). Drag it anywhere; when you let go it snaps to the nearest
  side and its position is remembered. A blue count shows total unread.
- **A message lands** — the disc unrolls into a banner (avatar, name, first line) for four
  seconds, then folds back.
- **Reply right there** — the ↩ at the end of the banner opens a reply field. Type, press Enter,
  and it's sent without opening the panel; Esc cancels. The bubble only takes the keyboard while
  that field is open.
- **Click the bubble** to deploy a stack of your five most recent chats as round heads, newest
  at the top (hover for the name; a blue dot means unread), plus a paper *Open Messenger* head
  for the full inbox. Pick one and that conversation opens in a compact sheet beside the stack;
  the open chat wears a white ring, and the others stay one click away. Click anywhere else, or
  the bubble, to put it all away. Messenger stays loaded in the background, so messages keep
  arriving.
- **Drag to dismiss** — drag the bubble onto the ✕ target that appears at the bottom of the
  screen to quit the app.
- **Right-click the bubble** for *Open Messenger*, *Reload Messenger*, *Settings…*, *Reset Bubble
  Position* and *Quit*.
- Persistent login, native notifications, dark mode, and links opening in your default browser
  all carry over from the original app.

## Settings

Right-click the bubble → **Settings…** (or Cmd+,). Every switch applies at once and is kept in
`settings.json` next to the bubble's position.

**Bubble**
- **Show over full-screen apps** — off keeps the bubble to normal Spaces, so a full-screen video
  or app hides it.
- **Start at login.**
- **Size** — Small / Medium / Large, for the disc, the chat heads and the banner.
- **Unread count** — Off, Steady, or Pulsing (the count breathes slowly while anything is unread).

**Messages**
- **Banner when a message lands**, and whether it **shows the message** or only who wrote — for
  screen sharing or public places.
- **Reply from the banner** — the ↩; off if the bubble should never take the keyboard.
- **macOS notifications from Messenger** — Messenger's own Notification Center banners, in
  addition to the bubble.
- **New-message sound** — this is Messenger's own switch (Preferences → Notification sounds);
  the *Open* button takes you there. Messenger keeps it per profile, so it starts off in Bubble
  even if it's on in your browser.

**Panel**
- **Appearance** (system / light / dark) for the Messenger panel, whatever Messenger's own theme
  preference says.
- **Spell check** in the panel.
- **Block Facebook telemetry** — cancels Facebook's logging beacons at the network layer; nothing
  Messenger needs to work is touched. On by default.

## Keyboard shortcuts (while the panel is open)

| Shortcut | Action |
|----------|--------|
| `Cmd + N` | New message (opens the inbox) |
| `Cmd + 1-5` | Open one of your five most recent chats (1 = most recent) |

## Build from source

Prerequisites: Node.js 22+ and npm.

```bash
git clone https://github.com/termite09/bubble-for-messenger.git
cd bubble-for-messenger
npm install

npm start        # run in development mode
npm test         # unit tests for src/lib and the scrape/frame scripts
npm run build    # build Bubble.app and a DMG into dist/ for this Mac's architecture
```

The app keeps its own profile in `~/Library/Application Support/Bubble for Messenger`, so it
can run alongside the original MessengerApp without sharing (or corrupting) its login data.

## Releasing

Releases are built by GitHub Actions when a `v*` tag is pushed; nothing is built by hand.

1. Bump `version` in `package.json` and add the entry to `CHANGELOG.md`; commit to `main`.
2. Tag and push:

   ```bash
   git tag v2.1.1
   git push origin main v2.1.1
   ```

The workflow ([release.yml](.github/workflows/release.yml)) refuses a tag that doesn't match
`package.json`, runs the tests, builds the arm64 DMG and zip, creates the GitHub release with
the changelog as notes, and updates the cask in
[termite09/homebrew-tap](https://github.com/termite09/homebrew-tap) with the new version and
checksum. The tap step needs a `HOMEBREW_TAP_TOKEN` repository secret: a fine-grained personal
access token with *Contents: Read and write* on `homebrew-tap` only. Without it the release is
still published; only the cask bump is skipped.

## Project layout

```
.github/        the release workflow and the script that bumps the Homebrew cask
src/main/       Electron main process
  main.js         app lifecycle, settings, cookie persistence, menu, wiring
  bubble.js       the disc window: drag, edge-snap, click, the stack, the landed banner, the shield
  panel.js        the Messenger panel: placement beside the stack, card frame, compact/full mode
  dismiss.js      the ✕ drop target shown while dragging
  settings-window.js  the Settings… window
  scrape.js       scripts run inside messenger.com: recent chats, open a thread, frame, compact CSS
  avatars.js      profile pictures fetched through the Messenger session as data URLs
src/renderer/   the pages inside the bubble, shield, dismiss and settings windows, and their preloads
src/lib/        pure helpers (layout, unread parsing, link policy, settings, refresh, reply, telemetry), covered by test/
test/           node --test unit tests
assets/         app icon
docs/           design specs and plans
PRODUCT.md, DESIGN.md   product context and the design system the UI follows
```

## Differences from the original

Forked from [stefanminch/messenger-mac](https://github.com/stefanminch/messenger-mac), which
wraps messenger.com in a normal Electron window.

- Runs as a bubble instead of a dock window (no dock icon).
- Removed the daily usage ping to `counterapi.dev`, the GitHub update check, and the welcome window.
- External links are only opened when they are real `http(s)` URLs on a non-messenger.com host.

## FAQ

**Is this the official Messenger app?** No — it's an unofficial wrapper around messenger.com,
not affiliated with Meta/Facebook.

**Does it support voice/video calls?** Everything messenger.com supports works, since it *is*
messenger.com in the panel.

**How do I quit?** Right-click the bubble → Quit, or drag it onto the ✕ target (there is no
dock icon).

**I clicked in another app while the chat heads were open and nothing happened.** The first
click outside the heads only closes them (the same way a menu closes); click again.

**Why does macOS say the app is damaged or from an unidentified developer?** The builds are
not signed or notarized (that needs a paid Apple developer account). Right-click → Open on
the first launch, or clear the quarantine flag as described under Install. If you'd rather not
trust a downloaded binary, build it yourself from source.

**Does it start at login?** Right-click the bubble → Settings… → **Start at login**.

## License

MIT — see [LICENSE](LICENSE). Copyright the original author (Stefan Minch) for the upstream
wrapper and Alexandros Christou for this fork.

## Disclaimer

This project is not affiliated with, authorized, maintained, sponsored, or endorsed by
Meta/Facebook or any of its affiliates or subsidiaries. Use at your own risk.
