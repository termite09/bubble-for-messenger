# Meta policy compliance — audit and remediation

Status: analysis only. No code in this commit changes behaviour.
Audited at v2.7.1, September 2026.

## The finding that should come first

**Full compliance with Meta's policies and this app's current feature set are mutually
exclusive.** There is no configuration of Bubble that is both compliant and functional as
described in `PRODUCT.md`. The app's reason to exist — a bubble that knows your unread count,
fans out your recent chats and lets you reply in place — is built on reading messenger.com's
DOM, and Meta's Terms of Service prohibit exactly that:

> You may not access or collect data from our Products using automated means (without our prior
> permission) or attempt to access data you do not have permission to access, **regardless of
> whether such automated access or collection is undertaken while logged-in to a Facebook
> account.**

The emphasised clause was added specifically to close the defence this app would otherwise
rely on: *"it's the user's own inbox, and they're signed in."* That argument is foreclosed in
the text of the terms.

There is no compliant alternative route to the same data. Meta's Messenger Platform API serves
Pages and business accounts; there is no public API that exposes a personal Messenger or
Instagram Direct inbox to a third-party desktop client. So "use the official API instead" is
not an available fix.

## The distinction that actually matters for account bans

The question "are we violating the ToS?" and the question "will our users get banned?" have
**different answers and different fixes**, and conflating them leads to fixing the wrong things.

- **DOM scraping is the ToS violation.** It is also nearly invisible to Meta. Reading
  `[role="row"]` out of a page that is already rendered generates no extra requests, no unusual
  traffic, no API signature. It is a contract breach, not a detectable event.
- **Account bans come from fingerprint and behavioural anomalies** — a session that looks
  unlike any real browser session. Those signals are largely *incidental* to the scraping, and
  they are the most fixable things in this codebase.

In other words: the feature you cannot give up is not what puts your users' accounts at risk.
Three things that are not load-bearing for any feature are.

Credit where due — one major risk factor is already handled correctly. The app drives the page
with Chromium-level trusted input (`wc.sendInputEvent`, `wc.insertText` in
`src/main/scrape.js:156-290`), not JavaScript `dispatchEvent`. From messenger.com's perspective
these carry `isTrusted: true` and are indistinguishable from a real mouse and keyboard. The
comments at `scrape.js:261` and in `PRODUCT.md` show this was a deliberate choice. Most bots are
caught on exactly this signal; this app is not exposed to it.

---

## Tier 1 — raises ban probability, and costs no features to fix

### 1.1 Telemetry blocking is on by default

`src/lib/settings.js:23` (`blockTelemetry: true`), enforced at `src/main/main.js:341-343`
against `session.defaultSession`.

The block list (`src/lib/telemetry.js`) cancels `/ajax/bz`, `/a/bz`, `/ajax/bnzai` — Banzai,
Meta's client-side event-logging firehose — plus Quick Metrics, Scribe and `/ajax/error/`.

The list itself is carefully scoped and the warning comment not to widen it is correct; nothing
messaging-related is blocked. The problem is not what it breaks, it is **what it makes the
session look like.** Meta's integrity systems consume client-side telemetry. A session that
actively opens threads and sends messages for hours while emitting *zero* client logs and *zero*
JS error reports does not resemble any real browser session, including one running an ad
blocker — ad blockers do not typically strip Banzai while leaving `/api/graphql` intact.

> Confidence: **reasoned inference, not documented fact.** Meta does not publish which signals
> feed its anti-automation models. What is documented is that this traffic is integrity-relevant
> and that the pattern is anomalous. I could not verify a causal link to enforcement.

**Change:** default `blockTelemetry` to `false`. Keep the switch and keep the implementation —
a user who opts in has made an informed choice. Shipping it on by default silently enrols every
user in the anomaly. This is also the clause of the ToS most directly about interference
("do anything to interfere with or impair the intended operation of the Products").

Feature cost: none. The setting stays.

### 1.2 The Instagram panel sends an iPhone User-Agent from a desktop

`src/lib/sites.js:8` (`IPHONE_UA`), applied at `src/main/floating-window.js:95`.

The panel claims to be Safari on iOS 17.5 while running Chromium on macOS or Windows. The
User-Agent string is the *only* thing that changes. Everything else the page can read
contradicts it:

| Signal | Claims | Actually reports |
|---|---|---|
| `navigator.platform` | iPhone | `MacIntel` / `Win32` |
| `navigator.maxTouchPoints` | touch device | `0` |
| WebGL renderer | Apple GPU | desktop GPU string |
| `screen.width/height` | phone screen | desktop resolution |
| `devicePixelRatio` | 2–3 | typically 1–2 |

An "iPhone" with no touch support and a discrete desktop GPU is not a subtle inconsistency. It
is a reliable automation tell, and Instagram enforces against automation more aggressively than
Facebook does. **This is the single highest per-user ban risk in the codebase**, and it applies
only to users who have switched Instagram on.

The UA exists for a purely cosmetic reason, documented honestly at `sites.js:5-7`: Instagram's
desktop site collapses its thread list to an avatar rail below ~1000px, so the mobile site is
loaded to get a usable 420px layout.

**Options, best first:**

1. **Widen the Instagram panel past ~1000px** and use the desktop site with the real
   User-Agent. Costs the compact panel for Instagram only; removes the mismatch entirely.
2. **Inject CSS to make the desktop inbox usable at 420px**, as is already done for Messenger's
   compact mode. More work, keeps the layout, removes the mismatch.
3. **Keep the mobile layout but make the fingerprint coherent** — override `navigator.platform`,
   `maxTouchPoints`, `screen.*` and `devicePixelRatio` to match the claimed device. This reduces
   the *detectability* but increases the *deception*: it moves from "wrong UA" to "deliberately
   forged device identity." Worse under the ToS, better against a ban. Not recommended if the
   goal is compliance rather than evasion.
4. **Drop the Instagram panel.** Fully compliant, costs the feature.

### 1.3 Session cookies are rewritten to a 90-day expiry

`src/lib/cookies.js` — `shouldPersistCookie` / `persistentCookie`, `PERSIST_DAYS = 90`.

Facebook issues `c_user` and `xs` as **session** cookies when the user does *not* tick "keep me
logged in." The app detects that (`cookie.session === true`) and rewrites them with a 90-day
expiry. The code comment is accurate about the mechanism and does not hide it.

Two problems:

- **It overrides an explicit user security choice.** A user who declined a persistent login gets
  one anyway, without being told. That is the opposite of what they asked for, and it is the
  kind of thing that is hard to defend if a user's account is later compromised on a shared
  machine.
- **It extends a session lifetime Meta deliberately scoped.** Session-scoped auth cookies
  surviving across process restarts for 90 days is, in itself, an anomaly against the account.

Note the app already correctly persists `datr`/`sb`/`fr` — the device-trust cookies. Keeping
*those* stable is genuinely helpful for ban risk (a stable `datr` is how Meta recognises a
trusted device). The problem is specifically the auth pair.

**Change:** stop rewriting `c_user` and `xs`. Keep persisting `datr`/`sb`/`fr`. If login
survival matters, surface it honestly — a "stay signed in" switch in Settings, defaulting off,
that says what it does. The user then makes the choice Facebook offered them.

Feature cost: users who declined "keep me logged in" sign in again after a restart — which is
what they asked for.

---

## Tier 2 — automation surface, lower ban signal

### 2.1 Fixed-cadence polling

`src/main/main.js:28` (`RECENT_POLL_MS = 60s`), `src/main/panel.js:14`
(`LIVENESS_TICK_MS = 30s`), reload backoff at `src/lib/liveness.js:10`.

Machine-exact 60s and 30s intervals are a weak automation signal — humans do not refresh on a
metronome. Volume is low and the cadence is not aggressive, so this is a minor contributor
rather than a trigger. Jittering the intervals (±20%) is a cheap, no-cost mitigation.

### 2.2 An always-loaded background session

The panel is never destroyed, so a session stays open indefinitely. Combined with the reload-on-
stall loop in `liveness.js`, an account can show continuous presence far beyond human usage
patterns. Low risk on its own; worth knowing it compounds with 1.1.

### 2.3 Injected CSS and scripts

Compact-mode CSS and the isolated-world readers (`WORLD = 1001`, `scrape.js:19-29`). Running in
an isolated world is the right call technically. This is a ToS interference issue, not a
detection issue.

---

## Tier 3 — legal exposure to the developer, zero ban risk to users

**These do not affect accounts at all.** They are trademark risk to you personally, and they are
the items most likely to produce a takedown of the repo, the release or the Homebrew tap.

Meta's trademark policy:

> You may not use or register, or otherwise claim trademark rights in, any Meta trademark, or
> any part of any Meta trademark, including as or as part of any trademark, service mark,
> company name, trade name, username, mobile app name or domain name.

### 3.1 The app icon is Meta's Messenger logo

`assets/icon.png`, `assets/icon.icns` — the official Messenger mark, shipped as the application
icon on macOS (`package.json` → `build.mac.icon`) and Windows (`build.win.icon`), and as the
disc mark at rest.

**This is the least defensible item in the audit.** Nominative fair use permits *referring* to a
trademark to describe compatibility; it does not permit adopting the mark as your own product's
identity. `PRODUCT.md` states this deliberately ("the Messenger logo is the only colour the disc
carries at rest") — it is an intentional design decision, and it is the one that most clearly
requires a licence Meta does not grant.

**Change:** commission or draw an original mark. Where a Messenger reference is genuinely needed
to orient the user, a neutral glyph plus the word "Messenger" in text is defensible; the logo is
not.

### 3.2 `assets/instagram.svg` reproduces the Instagram glyph

A hand-drawn reconstruction of the Instagram camera mark, including the official gradient stops
(`#fdf497 → #fd5949 → #d6249f → #285AEB`). Redrawing a logo rather than copying the file is not
a defence — trademark protects the mark, not the file.

### 3.3 "Messenger" in the product name, bundle ID and repository

`package.json` → `name: "bubble-for-messenger"`, `appId: "com.termite09.bubble-for-messenger"`;
the GitHub repo; the Homebrew cask.

Meta's policy text explicitly covers "mobile app name or domain name," so by **Meta's policy**
this is non-compliant. Two honest caveats:

- `PRODUCT.md` records that the "<name> for Messenger" form was chosen deliberately so the
  product name never leads with Messenger. That instinct is right and it is the conventional
  safe-harbour form.
- Under trademark **law**, nominative fair use gives "X for Messenger" a real argument. Meta's
  policy is stricter than the law requires.

So this is a judgement call about risk appetite, not a clear-cut breach the way 3.1 is. It is
also the most expensive to change: the `appId` determines the settings directory
(`~/Library/Application Support/Bubble for Messenger`), so renaming it strands existing users'
settings and logins and requires a Homebrew cask rename.

If you change it, ship a migration that copies the old profile directory forward.

### 3.4 What is already correct

The README's disclaimer is well done and should stay:

> This project is not affiliated with, authorized, maintained, sponsored, or endorsed by
> Meta/Facebook or any of its affiliates or subsidiaries.

"An unofficial wrapper around messenger.com, not affiliated with Meta" in the opening paragraph
is also correct placement — prominent, not buried.

---

## What "fully comply" actually costs

If the requirement is genuine full compliance, here is what survives.

**Survives:**

- The floating always-on-top window and all of its window management.
- Loading messenger.com in a panel. A wrapper around a website is just a browser.
- Unread count read from `document.title`. Reading the title your own browser window already
  displays is defensible — a browser renders titles. Gray, but the strongest of the gray areas.
- Messenger's own desktop notifications (the site's feature, not yours).
- Settings, appearance, spell check, positioning, drag-to-dismiss.

**Does not survive:**

- The chat-head fan-out — requires reading the thread list.
- Banners showing sender and message text — requires reading message content.
- Reply-in-place from the banner — requires driving the composer.
- Avatars on the heads — requires fetching from Meta's CDNs (`src/main/avatars.js`).
- Pinned chats, the recent-chats stack, per-chat unread dots.
- The Instagram panel.

That is roughly the upstream project this was forked from: messenger.com in a window. The
bubble's interaction model — the thing that makes it Bubble — does not survive full compliance.

## Three honest positions

1. **Full compliance.** Strip to the list above, rebrand, ship a much smaller app. Zero ban
   risk, zero takedown risk, and most of the product is gone.
2. **Minimise ban risk, accept the ToS breach.** Fix Tier 1 (telemetry default, Instagram UA,
   cookie rewrite) and Tier 3.1/3.2 (icon and glyph). Keep scraping. Users' accounts become
   materially safer; you remain in breach of the ToS and exposed to a takedown, but you are in
   the same position as every other unofficial client, with the worst trademark exposure
   removed. **This is the best value per unit of work, and it is what I would recommend if the
   app is to keep existing in its current form.**
3. **Seek permission.** Meta's Automated Data Collection Terms state that accepting them does
   not itself constitute permission — it must be granted separately in writing. Realistically
   this is not granted for personal-inbox desktop clients, but it is the only route to a
   compliant version of the current feature set.

**Position 2 does not make you compliant.** It makes your users much less likely to be banned.
Those are different goals, and the request was to achieve the first — which, as stated at the
top, is not achievable while the app does what it does.

## Confidence and limits of this audit

- **Directly quoted and verified:** Meta's ToS automated-access clause; Meta's trademark policy
  wording; the Automated Data Collection Terms' separate-written-permission requirement. Meta's
  own domains are blocked from this environment, so these were obtained via search-result
  extracts rather than fetched from `facebook.com` / `meta.com` first-hand. **Re-read them at
  source before acting on anything here.**
- **Verified by reading this codebase:** every file and line reference above.
- **Inference, flagged inline:** the causal link between telemetry blocking, fingerprint
  mismatch and actual enforcement. Meta does not publish its detection signals. The reasoning is
  stated so you can judge it.
- **Not established:** I found a report of a third-party Meta client's users receiving *"We
  suspect automated behaviour on your account"* ([mautrix/meta issue
  #44](https://github.com/mautrix/meta/issues/44)), but that thread has no maintainer response
  and no root-cause analysis. It shows the risk category is real for clients of this kind; it
  does not establish which signal caused it. Several other search results on Meta ban detection
  come from antidetect-browser and proxy vendors, who have a commercial incentive to overstate
  detection sophistication — I have not relied on them.
- **This is not legal advice.** Trademark exposure in particular turns on jurisdiction and on
  facts outside the code.

## Sources

- Meta Terms of Service — <https://www.facebook.com/terms.php>
- Meta Automated Data Collection Terms —
  <https://www.facebook.com/legal/automated_data_collection_terms>
- Meta Platforms Trademarks — <https://www.meta.com/brand/resources/meta/our-trademarks/>
- Messenger brand assets — <https://www.meta.com/brand/resources/facebook/messenger-icon/>
- Meta brand permission requests — <https://www.meta.com/brand/resources/meta/my-request/>
