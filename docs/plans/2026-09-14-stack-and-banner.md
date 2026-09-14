# Stack and banner — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The landed banner shows the whole message; a chat closed by clicking away reopens on the next disc click for a settable while; heads can be pinned; the paper head reads as "Inbox".

**Architecture:** Pure helpers in `lib/recent.js` (`mergeHeads`, `reopenOpen`) and `lib/settings.js` (`reopenLast`, `pins`); `main.js` owns `lastChat` and the pins, and feeds merged items to the bubble; `bubble.js` grows the window for the banner from a page measurement; the bubble page draws the wrapped banner, the pinned hairline and the inbox caption.

**Tech Stack:** Electron 44, Node 24, `node --test`. No new dependencies.

**Spec:** `docs/specs/2026-09-14-stack-and-banner-design.md`

## Global Constraints

- `settings.json` keeps `bubble` untouched; `pins` rides along the same way. `reopenLast ∈ {0,15,30,60,300}`, default 30.
- Every page px that crosses to main is divided by the bubble scale, as `contentX/Y` already are.
- Run tests with `cd /Users/termite/Projects/messenger-mac && npm test`. Electron scripts need `env -u ELECTRON_RUN_AS_NODE` in this terminal.

---

### Task 1: Inbox head (spec §4)
- [ ] `bubble.html`: tray glyph in `inboxEl()` (inline SVG), `#inbox-label` caption beside it, mirrored for `edge-left`, fades with the stack.
- [ ] Live: caption visible while the stack is open, on the correct side at either edge.

### Task 2: Reopen the last chat (spec §2)
- [ ] Tests: `reopenOpen(lastChat, now, seconds)`; `reopenLast` choices in `normalizeSettings`.
- [ ] `lib/settings.js`: `reopenLast`. `lib/recent.js`: `reopenOpen`.
- [ ] `panel.js`: `onHidden(reason)` — `'blur'` from the blur handler, `'closed'` from `hide()`.
- [ ] `main.js`: `lastChat` set on blur/shield close while `activeHref`; cleared on disc close and on `openChat`; `onClick` reopens when `reopenOpen(...)`.
- [ ] `settings.html`: Panel tab row with five segments.
- [ ] Live: open a chat, click away, click the disc → chat reopens; close by disc → stack.

### Task 3: Whole-message banner (spec §1)
- [ ] Tests: `windowFrame(content, dockY, { above, below })` keeps the old single-`extra` cases and adds room above.
- [ ] `lib/layout.js`: the new signature. `bubble.js`: `bannerExtra` from `bubble:banner-extra` (scaled), applied above when `direction === 'up'`, below otherwise; the reply row goes the same way.
- [ ] `bubble.html` / renderer: banner `height: auto`, `.sub` clamped to 6 lines, `body.up` anchors the banner's bottom to the disc; the page reports its extra after filling and after folding.
- [ ] Live: a long preview at the bottom edge grows upward within the window; at the top edge, downward; reply row still fits.

### Task 4: Pinned chats (spec §3)
- [ ] Tests: `mergeHeads(pins, recent)` order / refresh / dedupe / cap; pins normalisation.
- [ ] `lib/recent.js`: `mergeHeads`. `lib/settings.js`: `pins` passthrough with validation.
- [ ] `main.js`: `pins` in settings, `pin(href)` / `unpin(href)` from a head menu, refresh stored name/avatarUrl from recent rows, items = `mergeHeads(pins, recent)` with avatars; `bubble.expand(items)` everywhere `recent` was passed.
- [ ] `bubble.js`: `bubble:head-menu` → `onHeadMenu(href)`; renderer sends it on head contextmenu, draws `.head.pinned` and the hairline after the last pinned head.
- [ ] Live: pin two chats, order, hairline, unpin; a pinned chat not in recent shows with its initial.

### Task 5: Docs
- [ ] README (How it works: banner, reopen, pins, inbox), settings spec table (`reopenLast`), CHANGELOG `## Unreleased`.
