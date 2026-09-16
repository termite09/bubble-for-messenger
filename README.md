# Bubble for Messenger

Facebook Messenger — and Instagram messages — as a floating chat head on macOS: a small
always-on-top bubble that opens your recent chats and a compact panel beside it. No dock icon,
no browser tab. Messenger is always there; Instagram is a switch in Settings, and the bubble
carries one platform at a time with the other's unread count riding along on it.

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

Update later with:

```bash
brew upgrade --cask termite09/tap/bubble-for-messenger
```

(`brew update` alone only refreshes Homebrew's catalogue; `brew upgrade` is what installs
newer versions — of every cask, not just this one. Use the full `termite09/tap/…` name: on a
tap that isn't trusted yet, the short name upgrades nothing, silently.) Uninstall with
`brew uninstall --cask bubble-for-messenger` (add `--zap` to remove your login and settings too).

**By hand:**

1. Download the latest `Bubble-<version>-arm64.dmg` from
   [Releases](https://github.com/termite09/bubble-for-messenger/releases).
2. Open the DMG and drag **Bubble** into **Applications**.
3. First launch only: the app is not signed with an Apple developer certificate, so macOS
   will refuse a normal double-click. **Right-click `Bubble.app` → Open → Open**. (If macOS
   still says the app is damaged, run
   `xattr -d com.apple.quarantine /Applications/Bubble.app` once in Terminal.)
4. A bubble appears at the bottom-right of your screen and the messenger.com login page opens
   beside it. Sign in once; the login is kept.

To update, download the new DMG and replace the app. To uninstall, delete `Bubble.app` and,
if you want your login gone too, `~/Library/Application Support/Bubble for Messenger`.

## How it works

- **The bubble** — a small grey disc with the Messenger mark that floats over every app and every
  Space, full-screen apps included (both are settings). Drag it anywhere; when you let go it snaps
  to the nearest side and its position is remembered. A blue count shows total unread.
- **A message lands** — the disc unrolls into a banner (avatar, name, the whole message, up to
  six lines) for four seconds, then folds back.
- **Reply right there** — click the message text (or the ↩) and a reply field opens. Type,
  press Enter, and it's sent without opening the panel — a tick confirms it; Esc cancels. The
  bubble only takes the keyboard while that field is open.
- **Click the bubble** while something is unread and the newest received message opens right
  away (on whichever platform it arrived), with the stack beside it. Otherwise the click
  deploys a stack of your five most recent chats as round heads, newest at the top (a blue
  dot means unread), plus a paper *Inbox* head for the full inbox. Pick one and that
  conversation (or the inbox) opens in a sheet beside the stack; the open chat wears a white
  ring, and the others stay one click away. Click anywhere else, or the bubble, to put it all
  away — a click on another app also brings that app forward, as it should.
  Messenger stays loaded in the background, so messages keep arriving.
- **Hover a head** for its name; the pin badge that appears pins or unpins it (right-click →
  *Pin* works too). Up to five pinned chats per platform sit at the top of the stack, above a
  hairline, whether or not they're recent. To pin someone who isn't among the recent five,
  open the Inbox: a pin appears on any chat row you hover.
- **The disc says when something's wrong** — its mark dims when Messenger is unreachable
  (hover for *Offline* / *Reconnecting…*) and shows *Sign in* when nobody is signed in.
- **Straight back** — after closing a chat, clicking the bubble within the next 30 seconds (a
  setting) reopens that chat, stack and all, instead of just the stack.
- **Drag to dismiss** — drag the bubble onto the ✕ target that appears at the bottom of the
  screen and hold it there a moment (a ring fills) to quit the app.
- **Right-click the bubble** for *Open Messenger*, *Reload
  Messenger*, *Update to…* when a newer version exists, *Settings…*, *Reset Bubble Position*
  and *Quit*.
- **First launch** — the login page opens by itself and the disc introduces itself.
- **Instagram too** (a setting, off by default) — Instagram's inbox loads beside Messenger's
  and the disc carries one at a time: its chats in the stack, its count in blue. The other
  platform hangs off the disc's foot as a small satellite with its mark and unread count; click
  it (or right-click → *Switch to…*) to swap.
  Messages land from both — the banner's avatar wears the platform's mark — and clicking a
  banner switches to that platform and opens the chat; replying from it doesn't switch.
- Persistent login, native notifications, dark mode, and links opening in your default browser
  all carry over from the original app.

## Settings

Right-click the bubble → **Settings…** (or Cmd+,). Every switch applies at once and is kept in
`settings.json` next to the bubble's position.

**Bubble**
- **Show over full-screen apps** — off keeps the bubble off full-screen video and apps. macOS
  only allows that for a window that stays on one desktop, so while off the bubble doesn't follow
  you to other desktops (Spaces) either.
- **Start at login.**
- **Instagram messages** — also keep Instagram's inbox loaded; the disc switches between the
  two. Turning it on opens Instagram's login beside the disc. It costs a second web page in the
  background (a few hundred MB), which is why it's a switch.
- **Glass** — the disc, heads and banner let the wallpaper through a little, and the Settings
  card is frosted like the system's own menus. Off gives solid cards; macOS's *Reduce
  transparency* does the same.
- **Check for updates** — once a day the app asks GitHub for the latest release; a newer one
  appears in the bubble's menu as *Update to X…*, which opens the release page. Nothing is
  downloaded on its own.
- **Size** — Small / Medium / Large, for the disc, the chat heads and the banner.

**Notifications**
- **Banner when a message lands**, and whether it **shows the message** or only who wrote — for
  screen sharing or public places.
- **Reply from the banner** — the ↩ (or click the message text); off if the bubble should never
  take the keyboard.
- **macOS notifications from Messenger** — Messenger's (and Instagram's) own Notification
  Center banners, in addition to the bubble.
- **Unread count** — Off, Steady, or Pulsing (the count breathes slowly while anything is unread).
- **New-message sound** — this is Messenger's own switch (Preferences → Notification sounds);
  the *Open* button takes you there. Messenger keeps it per profile, so it starts off in Bubble
  even if it's on in your browser. It only sounds while Bubble is put away: with the stack up
  or a chat open you can see the message land, so both platforms are quiet.

**Panel**
- **Appearance** (system / light / dark) for the Messenger panel — whatever Messenger's own
  theme preference says — and for the bubble's own cards: paper on a light Mac, graphite on a
  dark one, the way Notification Center's banners go.
- **Spell check** in the panel.
- **Reopen the last chat** — Off / 15 s / 30 s / 1 min / 5 min: how long after clicking away
  a bubble click goes straight back to that chat.
- **Block Facebook telemetry** — cancels Facebook's logging beacons at the network layer; nothing
  Messenger needs to work is touched. On by default.

Every switch applies to both platforms.

## Keyboard shortcuts

These are app-menu shortcuts: they work whenever a Bubble window (the panel or Settings) is
focused. The Conversations menu shows the five chats by name.

| Shortcut | Action |
|----------|--------|
| `Cmd + N` | New message (opens the inbox) |
| `Cmd + 1-5` | Open one of the focused platform's five most recent chats (1 = most recent) |

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
   git tag v2.6.0
   git push origin main v2.6.0
   ```

The workflow ([release.yml](.github/workflows/release.yml)) refuses a tag that doesn't match
`package.json`, runs the tests, builds the arm64 DMG and zip, creates the GitHub release with
the changelog's top section as its notes, and updates the cask in
[termite09/homebrew-tap](https://github.com/termite09/homebrew-tap) with the new version and
checksum. The tap step needs a `HOMEBREW_TAP_TOKEN` repository secret: a fine-grained personal
access token with *Contents: Read and write* on `homebrew-tap` only. Without it the release is
still published; only the cask bump is skipped.

## Project layout

```
.github/        the release workflow and the script that bumps the Homebrew cask
src/main/       Electron main process
  main.js         app lifecycle, settings, cookie persistence, menu, the platforms and which is in focus
  account.js      one platform, live: its panel, chat state, unread, status, and the reads that keep them fresh
  bubble.js       the disc window: drag, edge-snap, click, the stack, the landed banner, the shield
  panel.js        a site's panel: placement beside the stack, card frame, compact/full mode, liveness
  dismiss.js      the ✕ drop target shown while dragging
  settings-window.js  the Settings… window
  scrape.js       scripts run inside messenger.com: recent chats, open a thread, frame, compact CSS
  scrape-instagram.js  the same for instagram.com's mobile web app (chats opened by name)
  avatars.js      profile pictures fetched through the session, downscaled, as data URLs
src/renderer/   the pages inside the bubble, shield, dismiss and settings windows, and their preloads
  tokens.css      the palette, written once; every page links it and lib/tokens.js reads it
src/lib/        pure helpers (sites, layout, unread parsing, link policy, settings, refresh, reply, telemetry, tokens), covered by test/
test/           node --test unit tests
assets/         the app icon and the Instagram mark
docs/           design specs and plans
PRODUCT.md, DESIGN.md   product context and the design system the UI follows
```

## Differences from the original

Forked from [stefanminch/messenger-mac](https://github.com/stefanminch/messenger-mac), which
wraps messenger.com in a normal Electron window. This fork is a different app built on that
start:

- A floating bubble instead of a dock window (no dock icon): the stack of recent and pinned
  chats, the banner that unrolls when a message lands, replying from the banner, the ✕ drop
  target, and the compact panel beside the stack.
- Instagram as a second platform, one in focus at a time.
- A settings card (over full-screen, size, appearance, glass, sounds, telemetry blocking…),
  Cmd+1–5 for the recent chats, and an opt-in daily update check against GitHub Releases
  (nothing is downloaded on its own). The original's daily usage ping to `counterapi.dev` and
  its welcome window are gone.
- Hardened: sandboxed renderers, navigation and redirects kept on Meta's hosts, links opened
  outside only when they are real `http(s)` URLs elsewhere, session cookies limited to the
  login ones, a strict CSP on the app's own pages, atomic 0600 settings.

## FAQ

**Is this the official Messenger app?** No — it's an unofficial wrapper around messenger.com,
not affiliated with Meta/Facebook.

**Does it support voice/video calls?** Everything messenger.com supports works, since it *is*
messenger.com in the panel.

**How do I quit?** Right-click the bubble → Quit, or drag it onto the ✕ target (there is no
dock icon).

**I clicked in another app while the chat heads were open and nothing happened.** With no
chat open, the first click outside the heads only closes them (the same way a menu closes);
click again. With a chat open, the click closes everything *and* reaches the app you clicked.

**Why does macOS say the app is damaged or from an unidentified developer?** The builds are
not signed or notarized (that needs a paid Apple developer account). Right-click → Open on
the first launch, or clear the quarantine flag as described under Install. If you'd rather not
trust a downloaded binary, build it yourself from source.

**Does it start at login?** Right-click the bubble → Settings… → **Start at login**.

**Messenger is in another language and some things don't work.** The app finds Messenger's
(and Instagram's) controls by their English labels (Back, New message, Preferences, Send…).
Set the site's language to English; everything else is language-independent.

**Instagram shows its phone layout in the panel.** On purpose: Instagram's desktop site folds
its thread list to an avatar rail at the panel's width, so the panel asks for the mobile web
app, which is the one with a readable inbox.

**`brew upgrade` never offers Bubble, or `brew update` "does nothing".** `brew update` only
refreshes Homebrew's catalogue; `brew upgrade` installs newer versions. If `brew upgrade`
still never lists Bubble, the tap isn't trusted (installs from before Homebrew 6 have no
trust entry, and Homebrew then quietly loads the copy it already has): run
`brew trust termite09/tap` once, or upgrade by the full name
`brew upgrade --cask termite09/tap/bubble-for-messenger`, which trusts it as it goes. The
bubble's *Update to X…* menu item shows the command when Bubble was installed by Homebrew.

**Something went wrong — how do I report it?** Open an issue on GitHub and attach the log file
(`~/Library/Application Support/Bubble for Messenger/logs/main.log`). The log never contains
names, messages or cookies.

## License

MIT — see [LICENSE](LICENSE). The upstream wrapper is MIT (declared in its `package.json`,
copyright Stefan Minch); this fork keeps that notice and adds its own (copyright Alexandros
Christou), as MIT requires. Anything you build on this must keep both.

## Disclaimer

This project is not affiliated with, authorized, maintained, sponsored, or endorsed by
Meta/Facebook or any of its affiliates or subsidiaries. Use at your own risk.
