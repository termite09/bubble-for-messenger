---
version: 1
slug: "src-renderer-settings-html"
primary_target: "src/renderer/settings.html"
related_targets: ["src/renderer/settings-renderer.js","src/main/settings-window.js"]
---

# Surface: the settings card (settings.html)

Scope: the one preferences surface, a 360×720 card opened from the disc's menu or Cmd+,.
Mode: Operate. Audience: the same Mac user, a minute after install or when a full-screen video
made them wish the bubble were gone. Task: find one of ten switches, flip it, close. Every
change applies at once; there is no Save. Constraints: a frameless transparent window, so the
card draws its own silhouette; ten settings in four groups; one three-way choice (Appearance);
copy explains why in an ash line that may wrap to two — this sheet is read, not glanced, so
DESIGN.md's One Line Rule (for cards in the stack) is deliberately not applied here, and the
sheet is sized (720) to hold every description without scrolling.

## Direction contract

THESIS: the settings are one more card from the same stack — the standing notification, held
open long enough to read. It refuses the category default (a macOS System Settings clone: a
sidebar, blue toggles, a grey window) and any form vocabulary (fieldsets, buttons, save bars).

OWN-WORLD: DESIGN.md's material, unchanged: graphite ground, 12% hairline, 16px sheet radius,
system face at 13/12/11, weight and ash for hierarchy. Controls are drawn in that material: a
switch is a 36×22 graphite pill with a hairline that, when on, inverts to paper with a graphite
knob — the same inversion the ✕ target uses to arm. Blue appears nowhere on this surface (blue
means unread). The appearance choice is three hairline-divided segments; the chosen one holds
the raised tone. Focus is the hairline, never a ring — at 45% (`--rule-focus`), which holds 3:1 on the raised row a focused control always sits on; hover stays at 28%. Recognisable with the copy removed:
a graphite sheet, four ash captions, ten rows of hairline, ten small pills, some paper, some not.

STORY: the user opens it, reads the row that matches the thing that bothered them, flips it,
sees it take effect behind the card, and closes. Nothing asks to be saved.

FIRST VIEWPORT: the whole surface is one viewport: a 44px header row ("Settings" 600 — not
"Bubble", which would stack over the first group's caption; ✕ at the right, draggable), then
four groups each with an 11px uppercase ash caption and 44px-minimum rows: label (500) over
one or two ash lines, control at the right on a 16px inset; rows separated by a hairline that
starts at the text edge, and a row under the cursor or holding keyboard focus steps to Raised
Graphite (Tone and Rule) — that step, plus the focus hairline on the focused control, is the
focus expression; never a ring. A control too wide to share its row (the five reopen
choices) takes a full-width line under the text, in the tab bar's clothes (16 Sep 2026). The primary action is any switch; the first row is
"Show over full-screen apps", the reason this surface exists.

FORM: extension inside the established world, shaped directly. No seed key: new-work.md §3
exempts "a local extension or a precisely specified narrow request" from the concept roll,
and this surface's structure (four groups, ten named rows, one three-way control, 360 wide)
was fixed by the approved spec before design began. Signature interaction: the paper
inversion of a switch, 220ms on the one curve, knob by transform only; the segments crossfade
their tone on the 120ms clock.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the
verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Unresolved
- (resolved 16 Sep 2026: the banner's reply arrow is a drawn SVG,
  one vocabulary with the ✕, tray and pin — DESIGN.md's Drawn Icon Rule.)
