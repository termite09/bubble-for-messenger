# Meta compliance and account-safety plan

Scope: every file in `src/`, `assets/`, `.github/`, and the repository's own naming.
Audited at v2.7.1. Companion to `COMPLIANCE.md`, which holds the policy analysis; this
document is the remediation plan.

---

## 0. Status at v3.0.0

This document was written as a plan. Most of it has since been carried out, so read the items
below as the record of what was decided and why, not as outstanding work.

| Item | State |
|---|---|
| §5 Instagram — synthetic clicks, iPhone UA, park-on-hide | **Removed entirely.** The platform is gone, not patched. |
| §6.1 Telemetry blocking on by default | **Done** — defaults to off; the switch stays. |
| §6.2 Messenger's trusted input | **Kept, and extended.** See below. |
| §7.1 Session cookie rewrite | **Done** — `c_user`/`xs` no longer rewritten; `datr`/`sb`/`fr` still persist. |
| §7.2 Metronomic polling | **Done** — five minutes, jittered ±25%, self-rescheduling. |
| §8.1 Messenger logo as the app icon | **Done** — replaced with an original mark. |
| §8.2 Instagram glyph | **Done** — removed with the platform. |
| §8.3 "Messenger" in the app name / appId / repo / cask | **Open, deliberately.** The judgement call in §8.3 stands; nothing has changed. |
| §8.4 Disclaimer | **Strengthened** — the README now states the ToS position above the install steps. |
| §3 / S1 The Electron user agent | **Unchanged, deliberately.** Still names this app and Electron on every request. |
| §7.3 Notification-driven banners | **Not done.** Still the largest remaining reduction in collection surface. |
| §2.2 Always-loaded background session | **Not addressed.** Inherent to the product. |
| §2.3 Injected CSS and isolated-world scripts | **Not addressed.** Inherent to compact mode and to reading the list. |

### One thing this plan missed, found in the v3.0.0 review

§5.1 named synthetic `.click()` as an Instagram defect. It was not only Instagram's. Four of
them survived on the **Messenger** side and were caught reviewing the finished work:

- `newMessage` — the compose button, on Cmd+N
- `openPreferences` — the account gear, then the Preferences menu item
- `openInbox` — Messenger's Back control

Every one carried `isTrusted: false`, the same signature the Instagram removal was justified
by. All four now go through `scrape.pressControl`, which hit-tests the control and presses it
with real Chromium input. `stageInbox` renders the panel at opacity 0 for the press, because a
hidden window does not dispatch input — the same staging a thread open already used.

Each of those presses stands for something the user actually did (a keystroke, a click on the
Inbox head, the Open button in Settings), which is why this is §2's *honest* column and not its
*evasion* one. `test/scrape.test.js` now fails if any page script in `src/main/` calls
`.click()` again.

**The lesson worth keeping:** the audit found the defect on the platform that had already been
flagged and stopped looking. Reviewing the finished change, rather than the change you planned,
is what caught the rest.

---

## 1. The honest answer, before the plan

**You asked whether accounts can still be locked or banned even after every fix here. Yes.
They can. The risk is reduced, not removed, and it cannot be removed while the app automates
a personal Meta account.**

Four reasons, none of which any amount of engineering fixes:

1. **Automating a personal account is the enforcement category itself.** Meta does not
   enforce against "badly implemented automation," it enforces against automation. A
   well-behaved implementation is a smaller target, not a different category of thing.
2. **Detection is opaque and moves.** Meta publishes nothing about its signals and changes
   them without notice. A change that is invisible today can be a flag next month, and you
   will find out from your users' locked accounts.
3. **Timing is a fingerprint you cannot fully erase.** Even with perfect input fidelity, the
   interval between "panel becomes visible" and "row click" is machine-consistent in a way
   human hesitation is not.
4. **Your account is already flagged.** An account that has received an automated-behaviour
   notice sits at a lower threshold from then on. Fixes reduce new signal; they do not clear
   the existing mark.

**The only change that removes the risk category is removing the automation.** Section 9 sets
out what that costs. Everything between here and there is probability reduction, and should be
described to your users in exactly those terms.

---

## 2. The line this plan will not cross

Many things that reduce ban risk are not compliance measures — they are **detection evasion**.
The distinction matters, because you asked for compliance and because the two pull in opposite
directions legally: evading a technical access control is an aggravating fact, not a mitigating
one, and it converts a terms-of-service dispute into something with a worse shape.

The test this plan applies:

- **Legitimate — make the client behave like what it actually is.** When a human physically
  clicks a chat head, translating that into a real input event is a *faithful* representation
  of what happened. Removing invented anomalies (blocked telemetry, rewritten cookie expiry,
  metronomic polling) makes the session more honest, not less.
- **Evasion — make the client misrepresent what it is.** Forging `navigator.platform`,
  `maxTouchPoints`, WebGL renderer strings or screen dimensions to defeat fingerprinting;
  hiding that this is Electron. These buy time in an arms race you lose, and they are the
  facts a lawyer would put in bold.

Items below are tagged **[honest]** or **[evasion]**. The evasion ones are listed so you know
they exist and can decide with your eyes open — **this plan recommends against all of them.**

---

## 3. What Meta can actually see today

Ranked by how cheaply Meta could act on it.

| # | Signal | Where | Cost to Meta |
|---|---|---|---|
| S1 | UA string says `Electron/44.3.0` and `Bubble/2.7.1` | `sites.js:17` → default UA | **Trivial.** One header match identifies every install. |
| S2 | Instagram actions are `isTrusted: false` | `scrape-instagram.js` | Cheap. One event-listener check. |
| S3 | iPhone UA with desktop platform/GPU/touch | `sites.js:8` | Cheap. Any fingerprint script. |
| S4 | Session emits no Banzai logs while active | `settings.js:23` | Moderate. Absence-of-signal analysis. |
| S5 | Metronomic 60s / 30s cadence | `main.js:28`, `panel.js:14` | Moderate. Timing analysis. |
| S6 | Session auth cookies outliving their issued scope | `cookies.js` | Moderate. |
| S7 | Inbox navigation on every bubble dismiss | `account.js:94` | Moderate. |
| S8 | DOM reads | `rows.js` | **Very high / effectively invisible.** No traffic. |

The thing worth sitting with: **the feature you cannot give up (S8) is the cheapest to hide,
and the things that expose you (S1–S3) are incidental.** That asymmetry is what makes this
plan worth doing.

### S1 deserves its own paragraph

`MESSENGER` in `src/lib/sites.js:17` sets `userAgent: null`, and
`src/main/floating-window.js:95` only calls `setUserAgent` when a value is present. So the
Messenger panel sends **Electron's default User-Agent**, which by Electron's documented
behaviour embeds the app name and version and the Electron version — approximately:

```
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)
Bubble/2.7.1 Chrome/1xx.0.0.0 Electron/44.3.0 Safari/537.36
```

**messenger.com is being told, in a header, on every single request, that it is talking to a
third-party Electron app called Bubble.** If Meta ever wants to enumerate or block this app's
users, that is a one-line rule.

> **Verify this yourself before acting on it.** I could not run Electron in this environment
> (`node_modules` is absent), so this is inferred from Electron's documented default, not
> measured. Check with:
> `npm install && npx electron -e "const{app,BrowserWindow}=require('electron');app.whenReady().then(()=>console.log(new BrowserWindow({show:false}).webContents.getUserAgent()))"`

**Recommendation: leave it as it is. [honest]** Replacing it with a stock Chrome string is
**[evasion]** — it is the single most effective anti-detection change available, and that is
precisely why it is not a compliance measure. It is also the change most likely to be read as
deliberate circumvention. If the honest UA is unacceptable to you, that is a strong signal that
the right answer is Section 9, not a better disguise.

---

## 4. Phase 0 — today, before any code

For you personally, and for anything you tell users:

1. **Turn off *Instagram messages* in Settings.** It is off by default; it is the switch that
   produced the notice.
2. **Do not send Instagram DMs through Bubble** until Phase 1 ships.
3. **Use Instagram normally from your phone** for a week or so. Genuine trusted interaction
   from a coherent device is what rebuilds an account's standing.
4. **Enable two-factor authentication** on both accounts. This is the one mitigation the
   mautrix bridge maintainers — the most credible source here, since they run a client in this
   exact risk category — recommend explicitly for reducing automated-activity blocks.
5. **Post a security advisory on the repo** telling existing Instagram users to switch the
   setting off. Users enabled a feature that put their accounts at risk on your say-so; they
   should hear about it from you rather than from a lock screen. This is the single most
   important item in Phase 0.

---

## 5. Phase 1 — Instagram (highest risk, do first)

Instagram flagged an account. Everything here is load-bearing.

### 1.1 Replace synthetic clicks with real input **[honest]**

**The defect.** `src/main/scrape-instagram.js` drives every interaction with JavaScript
`.click()`:

- `pageActions.clickRow` → `row.click()` — opening a chat
- `pageActions.backToList` → `control.click()` — navigating back
- `replyActions.send` → `b.click()` on the Send button — **sending a DM**; the trusted Enter
  is only the fallback, and Instagram's mobile composer does show a Send button, so the
  synthetic path is the one that normally runs

Events dispatched by `.click()` carry `isTrusted: false` unconditionally, per the DOM spec.
The `userGesture: true` flag passed to `executeJavaScriptInIsolatedWorld` sets Chromium's
*user-activation* state, which is a different mechanism — it does not make the event trusted.

The module header says *"a synthetic click is enough (no trusted event needed)."* That is true
of whether the click **works**. It says nothing about whether it is **logged**.

**The fix.** Port the technique `scrape.js` already uses for Messenger. `scrape.js:72-95`
(`rowPoint`) hit-tests an element to a viewport point, and `scrape.js:156-158` dispatches real
`mouseMove` / `mouseDown` / `mouseUp` through `wc.sendInputEvent`. This is existing, tested
machinery — not new work.

For each of the three call sites:

1. Change the page-side script to **return the element's hit-tested centre point** instead of
   calling `.click()`. The `IN_FRONT` helper already computes exactly this; have it return
   `{x, y}` rather than a boolean.
2. Dispatch the click from the main process with `wc.sendInputEvent`, as `scrape.js` does.
3. Keep the existing "is it in front" guard — it is correct and prevents clicking through an
   overlay.

Suggested shape, mirroring `scrape.js:145-158`:

```js
// scrape-instagram.js — replace row.click() with a hit-tested trusted click.
const pointOf = (wc, script) => base.run(wc, script).catch(() => null);

async function trustedClick(wc, point) {
  if (!point) return false;
  wc.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y });
  wc.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  wc.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  return true;
}
```

**Why this is [honest] and not [evasion]:** a human did physically click the chat head. A real
input event is the *more* faithful representation of that; `.click()` is the synthetic stand-in.
Reasonable people can disagree here, and you should know the counter-argument exists — but the
human intent behind each of these three actions is genuine, which is not true of a background
poll.

**Test impact:** `test/scrape-instagram.test.js` drives `pageActions` through fakes. The fakes
will need `sendInputEvent` stubs; `test/scrape.test.js` already has the pattern.

### 1.2 Remove the User-Agent mismatch **[honest]**

`src/lib/sites.js:8`. The iPhone UA exists for one cosmetic reason, documented honestly at
`sites.js:5-7`: Instagram's desktop site collapses its thread list to an avatar rail below
~1000px.

Options, best first:

1. **Widen the Instagram panel past ~1000px and drop `IPHONE_UA`.** Set `userAgent: null` so
   the panel is honestly an Electron desktop client. Costs the compact 420px panel for
   Instagram only. **Recommended** — it removes S3 entirely for one layout concession.
2. **Inject CSS to make the desktop inbox usable at 420px.** You already do exactly this for
   Messenger (`setCompact`, `COMPACT_CSS`). More work; keeps the layout; removes S3.
3. **Drop the Instagram panel.** Fully removes Instagram risk. See Section 9.
4. ~~Forge the rest of the fingerprint to match the iPhone UA~~ **[evasion]** — listed only to
   be explicit that it is the wrong direction. It converts an inconsistency into a deliberate
   forgery.

### 1.3 Stop parking on every hide **[honest]**

`src/main/account.js:94` → `panel.park()` → `openInbox()` on **every** bubble dismissal. A user
who opens and closes the bubble 40 times a day generates 40 inbox navigations on top of the
poll.

Change: park **at most once per N minutes**, and only when the panel is actually sitting on a
thread. Track `lastParkedAt`; skip if within, say, 5 minutes. `INSTAGRAM.parkOnHide` in
`sites.js:47` stays, but gains a minimum interval.

### 1.4 Gate Instagram behind informed consent **[honest]**

The setting is off by default, which is right. It should also say what it costs. In
`settings.html`, next to *Instagram messages*, add plain text:

> Instagram enforces against third-party clients more aggressively than Messenger.
> Enabling this carries a real risk of your Instagram account being restricted or disabled.

Do not soften this. A user who turns it on should be making an informed choice.

---

## 6. Phase 2 — Messenger

### 2.1 Telemetry blocking default **[honest]**

`src/lib/settings.js:23` → `blockTelemetry: true`; enforced `src/main/main.js:341-343`.

Change the default to `false`. Keep the switch, keep `src/lib/telemetry.js` exactly as it is —
the list is carefully scoped and the "never widen this" comment is correct.

Two reasons. It is the ToS clause most directly about interference ("do anything to interfere
with or impair the intended operation of the Products"), and a session that messages actively
while emitting zero client logs is anomalous in a way even an ad-blocked browser is not.

> Confidence: **inference.** Meta does not publish which signals feed its models. What is
> established is that this traffic is integrity-relevant; the causal link to enforcement is my
> reasoning, not a documented fact.

Note this is a **Messenger-side** concern. The block list targets Facebook paths (`/ajax/bz`,
`/ajax/qm`, `/common/scribe_endpoint`); Instagram's client logging does not use them, so this
was not a contributor to the Instagram notice.

Update the README line — currently *"cancels Facebook's logging beacons and nothing Messenger
needs. On by default."* — to say off by default and to note the trade-off.

### 2.2 Messenger input is already correct — keep it that way

`scrape.js:156-158` (trusted mouse events), `scrape.js:277-290` (`wc.insertText`, trusted Enter).
`PRODUCT.md` records that this was deliberate. **Do not "simplify" any of this to `.click()`.**
Add a comment at each site saying why, so a future refactor does not undo it.

Worth stating plainly: this is the reason Messenger has not flagged while Instagram has.

---

## 7. Phase 3 — cross-cutting

### 3.1 Session cookie expiry **[honest]**

`src/lib/cookies.js`. `shouldPersistCookie` matches session-scoped `c_user` / `xs` — which is
exactly the state that means *the user did not tick "keep me logged in"* — and rewrites them to
90 days.

Change: **remove `c_user` and `xs` from `LOGIN_COOKIES`. Keep `datr`, `sb`, `fr`.**

The device cookies are the ones worth persisting and they help you: a stable `datr` is how Meta
recognises a returning trusted device, so keeping it is *good* for ban risk. The auth pair is
the problem — it reverses a user's explicit security choice and extends a scope Meta set
deliberately.

If login survival matters enough to keep, make it a Settings switch defaulting **off**, worded
honestly ("Stay signed in after quitting — overrides Messenger's own choice not to").

Cost: users who declined persistent login sign in again after a restart. That is what they
asked for.

### 3.2 Poll cadence **[honest]**

- `src/main/main.js:28` — `RECENT_POLL_MS = 60s`
- `src/main/panel.js:14` — `LIVENESS_TICK_MS = 30s`

Two changes:

1. **Jitter both by ±25%.** One line each. Removes the metronome without changing behaviour.
2. **Consider dropping the 60s poll entirely.** `src/renderer/panel-preload.js` already watches
   the list and pushes rows on change, debounced 250ms — the poll is described in
   `main.js:28` as *"a safety net."* A passive observer on a page the user's own browser is
   already rendering is a materially better posture than an active timer: zero extra traffic,
   no cadence. If you keep it, widen it to 5 minutes.

`src/lib/liveness.js` needs **no change** — reload-only-for-a-reason with backoff, never while
visible, never in a loop. It is the best-behaved part of the codebase.

### 3.3 Prefer the site's own notifications over polling **[honest, architectural]**

`main.js:322-329` already handles notification permission for Meta origins, and there is
already a *"macOS notifications from Messenger"* setting. Messenger and Instagram both fire Web
Notifications on new messages.

Driving the **banner** from those events instead of from list diffs would be event-driven
rather than polled, would use the site's own intended mechanism, and would be the single
largest reduction in "automated collection" surface available without losing the feature.

Larger piece of work; worth scoping separately. The recent-chats *stack* still needs the list.

---

## 8. Phase 4 — trademark and repository

**None of this affects account bans.** It is takedown risk to you. Included because you asked
for the whole repo.

| Item | Location | Action |
|---|---|---|
| Messenger logo as app icon | `assets/icon.png`, `assets/icon.icns`, `package.json` `build.mac.icon` / `build.win.icon` | **Replace with an original mark.** Least defensible item in the repo. |
| Instagram glyph | `assets/instagram.svg` | Replace with a neutral glyph. Redrawing a logo is not a defence. |
| Disc mark at rest | `PRODUCT.md` "Brand Commitments"; `bubble-renderer.js` | Update the spec — it currently *mandates* the Messenger logo. |
| "Messenger" in app name | `package.json` `name`, `build.appId`, `productName` | Judgement call — see below. |
| Cask + release title | `.github/scripts/update-homebrew-tap.sh` (cask id, `name`, `desc`), `.github/workflows/release.yml:142` | Follows the naming decision. |
| Disclaimer | `README.md` | **Already correct. Keep it.** |
| Logging hygiene | `src/main/log.js` | **Already correct** — no names, previews, cookies or avatar URLs; hrefs hashed. |

**Precedent worth copying:** [Caprine](https://github.com/sindresorhus/caprine) is the
longest-running unofficial Messenger desktop client. It uses an **original mark and a name
containing no Meta trademark**, with the disclaimer *"Caprine is a third-party app and is not
affiliated with Facebook."* I searched its issue tracker and found **no** reports of account
bans and **no** trademark takedown — so do not repeat that as a cautionary tale, repeat it as a
model. (It is also a pure wrapper that does not automate, which is Section 9's point.)

**On the name.** Meta's policy text is explicit — *"as or as part of any trademark, service
mark, company name, trade name, username, mobile app name or domain name"* — so
"Bubble for Messenger" is non-compliant by policy. But nominative fair use gives "X for Y" a
real argument in law, and `PRODUCT.md` shows you already chose the conservative form
deliberately. This is risk appetite, not a clear breach the way the icon is.

If you do rename: `appId` determines the profile directory, so **ship a migration**. The
pattern already exists at `main.js:30-37`, which moved `MessengerBubble` → `Bubble for
Messenger`. Reuse it; do not strand logins.

---

## 9. What full compliance actually requires

If the requirement is genuine compliance rather than reduced risk, the automation goes.

**Keep:** the floating always-on-top window and all window management; messenger.com in a
panel; unread count from `document.title`; Messenger's own notifications; Settings, appearance,
spell check, positioning, drag-to-dismiss.

**Remove:** the chat-head fan-out (needs the thread list); banners with sender and message text
(needs message content); reply-in-place (needs driving the composer); avatars
(`src/main/avatars.js` fetches from Meta CDNs); pinned chats; per-chat unread dots; the
Instagram panel entirely.

That is approximately Caprine, or the upstream fork this came from. **The bubble's interaction
model — the thing that makes it Bubble — does not survive.** That is the real cost, and it is
why this is a decision rather than a task.

### A middle option worth considering

**Ship Messenger only; drop Instagram.** Messenger's automation already uses trusted input and
has not flagged; Instagram's uses synthetic clicks and has. If you do not want to do Phase 1
properly, removing the Instagram panel removes the demonstrated risk in one commit — and
removes S3, most of S2, and S7 with it.

---

## 10. Suggested order

| Phase | Work | Risk removed | Feature cost |
|---|---|---|---|
| 0 | Advisory, 2FA, Instagram off | Stops the bleeding | Instagram, temporarily |
| 1.1 | Trusted input on Instagram | S2 | None |
| 1.2 | Drop the iPhone UA | S3 | Compact IG panel |
| 1.3–1.4 | Park interval, consent text | S7 | None |
| 2.1 | Telemetry default off | S4 | None (opt-in) |
| 3.1 | Stop rewriting auth cookies | S6 | Re-login on restart |
| 3.2 | Jitter / drop the poll | S5 | None |
| 4 | Icon and glyph | Takedown risk | New artwork |
| 3.3 | Notification-driven banners | Large S8 reduction | Rework |
| 9 | Strip automation | All | Most of the product |

Phases 1–3 are roughly a day's work and no user-visible loss except the Instagram panel width
and the re-login. **They do not make the app compliant.** They make it materially less likely
to get someone locked out.

---

## 11. Confidence, and what I could not verify

- **Verified by reading this repo:** every file and line reference above.
- **Verified from Meta's published terms:** the automated-access clause, the trademark wording,
  the separate-written-permission requirement. Meta's own domains are **blocked from this
  environment**, so these came from search extracts rather than first-hand fetches.
  **Re-read them at source before acting.**
- **Inferred, not measured:** the Electron UA contents (S1) — `node_modules` is absent, so I
  could not run it. Verify with the command in Section 3.
- **Inferred, flagged inline:** every causal claim linking a signal to enforcement. Meta
  publishes nothing here.
- **Weak sources, not relied on:** much of the Instagram-enforcement material online is from
  antidetect-browser, proxy and growth-tool vendors with a commercial interest in the subject.
  Their directional consensus (fingerprinting, third-party access, action rhythm) matches the
  code analysis, which is why it appears — not because any one of them is authoritative.
- **Checked and found absent:** no account-ban reports in Caprine's issue tracker; no trademark
  takedown against Caprine. I looked for both and did not find them, so neither is used as
  evidence here.
- **Unresolved:** [mautrix/meta#44](https://github.com/mautrix/meta/issues/44) records a
  third-party Meta client's user receiving the same notice you did, with no maintainer response
  and no root cause. It establishes the risk category is real for clients of this kind. It does
  not establish which signal fires.
- **Not legal advice.**
