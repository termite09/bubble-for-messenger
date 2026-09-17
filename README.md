# Bubble for Messenger

Facebook Messenger as a floating chat head for macOS, with a Windows 11 build in beta. A small
always-on-top bubble shows your unread count, fans out your recent chats, and opens any of them
in a compact panel beside it. No dock icon, no browser tab.

<img src="assets/icon.png" width="128" alt="Bubble for Messenger">

An unofficial wrapper around messenger.com, not affiliated with Meta.

> **Read this before installing.** Bubble reads messenger.com's page to build the bubble, the
> chat heads and the banners. Meta's Terms of Service prohibit accessing their products by
> automated means without permission — explicitly including while signed in to your own
> account — so using this app breaks those terms, and Meta could restrict or disable an account
> for it. No release of this app can change that. What the app does do is avoid the behaviour
> most likely to get an account flagged; what it costs, and what risk is left, is written up in
> [docs/COMPLIANCE-PLAN.md](docs/COMPLIANCE-PLAN.md). Enable two-factor authentication, and
> decide with that in view.

## Install

### macOS

macOS 11 or later, Apple Silicon. On an Intel Mac, build from source.

**Homebrew**

```bash
brew install --cask termite09/tap/bubble-for-messenger
```

Use the full `termite09/tap/…` name: Homebrew 6 requires third-party taps to be trusted, and
installing by full name trusts this cask. Update with
`brew upgrade --cask termite09/tap/bubble-for-messenger`; uninstall with
`brew uninstall --cask bubble-for-messenger` (`--zap` also removes your login and settings).

**By hand**

Download `Bubble-<version>-arm64.dmg` from
[Releases](https://github.com/termite09/bubble-for-messenger/releases) and drag **Bubble** into
Applications.

The builds are not signed with an Apple developer certificate, so macOS blocks the first launch.
Right-click `Bubble.app` → **Open** → **Open**, or run once:

```bash
xattr -d com.apple.quarantine /Applications/Bubble.app
```

On first launch a bubble appears at the bottom-right of the screen and the messenger.com login
page opens beside it. Sign in once; the login is kept.

### Windows (beta)

Windows 11, 64-bit. Windows 10 works too, with square corners. Each
[release](https://github.com/termite09/bubble-for-messenger/releases) has two downloads:

- `Bubble-<version>-x64-setup.exe` — installs for your user account, no admin prompt.
  Recommended.
- `Bubble-<version>-x64-portable.exe` — a single file that runs from wherever you put it.

The builds are not code-signed, so SmartScreen shows *Windows protected your PC* once per
download: **More info → Run anyway**.

There is no tray icon; the bubble's right-click menu is the menu, and shortcuts use `Ctrl`.
The two macOS-only settings (*Show over full-screen apps*, *Glass*) are not shown. To update,
run a newer setup exe over the old one. Uninstall from *Settings → Apps*; your login and
settings live in `%APPDATA%\Bubble for Messenger`.

The Windows build is tested by hand rather than on the author's own desk. If something is off,
please [open an issue](https://github.com/termite09/bubble-for-messenger/issues).

## How it works

- **The bubble** floats over every app and Space, full-screen apps included. Drag it anywhere;
  it snaps to the nearest edge and remembers its place. A blue count shows total unread.
- **A message lands:** the bubble unrolls into a banner — avatar, name, the message — for four
  seconds. Click it to open the chat, or click the text (or ↩) to reply in place: Enter sends,
  Esc cancels. The bubble only takes the keyboard while that field is open.
- **Click the bubble** and your five most recent chats fan out as round heads (a blue dot means
  unread), with an Inbox head last. Pick one and it opens in a compact panel beside the stack.
  With something unread, a click opens the newest message directly. Click anywhere else to put
  it all away.
- **Hover a head** for its name; the pin badge pins it to the top of the stack (up to five).
  Chats can also be pinned from a row in the Inbox.
- **Right-click the bubble** for *Open Messenger*, *Reload Messenger*, *Update to…* (when a
  newer release exists), *Settings…*, *Reset Bubble Position* and *Quit* — or drag the bubble
  onto the ✕ target at the bottom of the screen and hold it there to quit.
- The bubble's mark dims when Messenger is unreachable and shows *Sign in* when nobody is
  signed in. Messenger stays loaded in the background, so messages keep arriving.

## Settings

Right-click the bubble → **Settings…** (`Cmd+,` / `Ctrl+,`). Every change applies at once.

| Tab | Settings |
|-----|----------|
| **Bubble** | Show over full-screen apps · Start at login · Glass · Check for updates · Size |
| **Notifications** | Banner when a message lands · Show the message in the banner · Reply from the banner · macOS notifications from Messenger · Unread count (off / steady / pulsing) · New-message sound |
| **Panel** | Appearance · Spell check · Reopen the last chat · Block Facebook telemetry |

A few need a word:

- *Show over full-screen apps* off also keeps the bubble on one desktop; macOS allows one or
  the other.
- *Check for updates* asks GitHub once a day and shows a menu item; nothing is downloaded on
  its own.
- *New-message sound* is Messenger's own switch (Preferences → Notification sounds); the
  **Open** button takes you there. It sounds only while the bubble is put away.
- *Block Facebook telemetry* cancels Facebook's logging beacons and nothing Messenger needs.
  **Off by default.** It is the part of this app that most clearly interferes with Messenger's
  intended operation, and a session that messages all day while sending no client logs at all
  does not look like any real browser. Turn it on knowing that.

## Keyboard

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + N` | New message |
| `Cmd/Ctrl + 1–5` | Open one of the five most recent chats |
| `Cmd/Ctrl + ,` | Settings |

These work whenever a Bubble window (the panel or Settings) is focused. In Settings, `Tab`
moves through the rows, `Space` flips a switch, `←` `→` choose within a control and move
between tabs, and `Esc` closes.

## Build from source

Node.js 22 or later.

```bash
git clone https://github.com/termite09/bubble-for-messenger.git
cd bubble-for-messenger
npm install
npm start                 # development
npm test
npm run build -- --mac    # Bubble.app and a DMG into dist/
npm run build -- --win    # on Windows: the installer and the portable exe
```

The app keeps its own profile (`~/Library/Application Support/Bubble for Messenger`;
`%APPDATA%\Bubble for Messenger` on Windows), so it runs alongside other Messenger apps without
touching their data.

**Layout**

```
src/main/       Electron main process: app lifecycle, the bubble and panel windows,
                the scripts run inside messenger.com
src/renderer/   the pages inside the bubble, settings and dismiss windows; tokens.css is
                the palette, written once
src/lib/        pure helpers (layout, sites, unread, links, settings, reply…), covered by test/
test/           node --test unit tests
.github/        the release workflow and the Homebrew cask bump
docs/           design specs and plans; PRODUCT.md and DESIGN.md hold the product context
                and the design system the UI follows
```

**Releasing.** Bump `version` in `package.json`, add the entry to `CHANGELOG.md`, commit to
`main`, then tag and push (`git tag v3.0.0 && git push origin main v3.0.0`). GitHub Actions
([release.yml](.github/workflows/release.yml)) builds both platforms, publishes the release
with the changelog's top section as its notes, and bumps the Homebrew cask. The cask step needs
a `HOMEBREW_TAP_TOKEN` secret (a fine-grained token with *Contents: Read and write* on
`homebrew-tap`); without it the release still publishes and only the cask bump is skipped.

## FAQ

**Does it support voice and video calls?** Everything messenger.com supports works; the panel
*is* messenger.com.

**Messenger is in another language and some things don't work.** The app finds Messenger's
controls by their English labels. Set the site's language to English.

**What happened to Instagram messages?** Removed in 3.0.0. Reaching Instagram's usable inbox
needed a phone user agent sent from a desktop, and its inbox could only be driven with
synthetic clicks — together, a session Instagram flags as automated. It was not fixable
without making the app better at hiding rather than better behaved, so it is gone. See
[docs/COMPLIANCE-PLAN.md](docs/COMPLIANCE-PLAN.md).

**`brew upgrade` never offers Bubble.** The tap isn't trusted (installs from before Homebrew 6
have no trust entry). Run `brew trust termite09/tap` once, or upgrade by the full cask name.

**Does it work with VoiceOver?** Partly, by design. The bubble never takes the keyboard, so
the stack is pointer-only — but everything under the pointer is named (the bubble's platform,
count and connection; each head; the satellite), and a landing message is announced. Settings
is fully keyboard-operable.

**Something went wrong.** Open an issue and attach the log:
`~/Library/Application Support/Bubble for Messenger/logs/main.log`
(`%APPDATA%\Bubble for Messenger\logs\main.log` on Windows). It never contains names, messages
or cookies.

## Credits and license

Forked from [stefanminch/messenger-mac](https://github.com/stefanminch/messenger-mac), which
wraps messenger.com in a normal window. This fork replaced the window with the bubble, added
the settings card and the update check, hardened the app (sandboxed renderers, navigation kept
on Meta's hosts, device-cookie-only persistence, a strict CSP), and removed the original's
usage ping.

MIT — see [LICENSE](LICENSE). The upstream copyright notice (Stefan Minch) is kept alongside
this fork's (Alexandros Christou); anything built on this must keep both.

## Disclaimer

This project is not affiliated with, authorized, maintained, sponsored, or endorsed by
Meta/Facebook or any of its affiliates or subsidiaries. Use at your own risk.
