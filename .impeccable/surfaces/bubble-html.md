---
version: 1
slug: "bubble-html"
primary_target: "bubble.html"
related_targets: ["bubble-renderer.js","panel.js","scrape.js"]
---

# Surface: the bubble layer (bubble.html + the panel silhouette)

Scope: the always-on-top chat head, its fan of recent chats, and the frame the conversation
panel wears. Mode: Operate. Audience: Mac users working in other apps who want to reach a
conversation in one or two clicks. Task: notice a message, open the right chat, reply, return.
Constraints: non-focusable transparent windows; Messenger content is scraped, so previews can
be absent; the panel is messenger.com and is only framed, never restyled.

## Direction contract

THESIS: Messenger as a standing macOS notification that never has to be swiped away. It refuses
the category default (a round logo with a red badge beside a native-looking window) and the
incumbent liquid-goo fan.

OWN-WORLD: solid system-grey cards (#1c1c1e ground, #2c2c2e raised), 1px white rule at 12%
(28% when active), soft lifted shadow 0 8px 24px rgba(0,0,0,.45), 14px card radius / 22px
disc radius, SF Pro (system) 13px semibold names, 12px #8e8e93 secondary, 11px time. Blue
#0a84ff only on the unread count, unread dot, and the user's own message bubbles. No
gradients, no vibrancy, no red. Recognisable with all content removed: a column of equal
grey rounded cards with a hairline, one disc at the foot.

STORY: the visitor sees a quiet disc with a blue count, understands "someone wrote", clicks,
reads five names with previews, picks one, and is typing within two seconds; the sheet has
nothing above the sender row, so the conversation is the whole surface.

FIRST VIEWPORT: at rest a 44px disc (mark 24px) with a blue 18px count top-right. On a new
message a 252×44 banner (avatar 32, name, one preview line, "now") unrolls out of the disc
via clip-path for 4 s and rolls back. Click: five 44px photo heads deploy over the disc, 8px
apart, from one 0→1 progress value (position and opacity both derived); the column reads
newest-first top-down with a paper "Open Messenger" head last; names are tooltips (user
asked for the rows to become minimal heads again, 13 Sep 2026). Pick one: the stack stays
up and the panel appears 8px beyond the head column as a 420-wide sheet (Messenger's
layout floor) with a 16px radius and the same hairline; the open head wears a 2px paper
ring. A press anywhere outside the stack, or on the disc, puts stack and panel away
(user-requested amendments, 13 Sep 2026; the earlier docked-avatar idea was dropped).
Signature interaction: the one-progress deploy and the banner unroll.
Motion grammar: transform/opacity/clip-path only, 220ms ease-out-quint, no overshoot, no
stagger beyond what the single progress curve produces.

FORM: grounded candidate 6 of 7 (Notification Stack), assigned by seed key 82491547
(scope direction, mode operate); chosen by the user over The Island (pick) and The Poster
Rail (competitive challenger) after seeing rendered mockups.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review,
the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Unresolved
- Sheet shadow relies on macOS's window shadow around the clipped panel; unverified in captures.
- A light overlay-scrollbar tab was seen on the sheet's right edge right after a thread opened.
