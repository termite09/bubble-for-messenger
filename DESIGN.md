---
name: Bubble for Messenger
description: A standing macOS notification for messenger.com — one graphite disc, a stack of hairline cards, a framed sheet.
colors:
  graphite: "#1c1c1e"
  raised-graphite: "#2c2c2e"
  avatar-slate: "#3a3a3c"
  paper: "#f5f5f7"
  ash: "#8e8e93"
  hairline: "rgba(255,255,255,.12)"
  hairline-active: "rgba(255,255,255,.28)"
  system-blue: "#0a84ff"
  white: "#ffffff"
typography:
  title:
    fontFamily: "-apple-system, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: "16px"
  title-quiet:
    fontFamily: "-apple-system, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "16px"
  body:
    fontFamily: "-apple-system, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "15px"
  label:
    fontFamily: "-apple-system, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "16px"
  count:
    fontFamily: "-apple-system, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: "18px"
rounded:
  pill: "9px"
  banner: "14px"
  avatar: "16px"
  sheet: "16px"
  disc: "22px"
  target: "28px"
spacing:
  hair: "1px"
  dot-gap: "6px"
  gap: "8px"
  inset: "10px"
  banner-x: "12px"
  landed-x: "14px"
  pad: "32px"
components:
  disc:
    backgroundColor: "{colors.graphite}"
    rounded: "{rounded.disc}"
    size: "44px"
  count-pill:
    backgroundColor: "{colors.system-blue}"
    textColor: "{colors.white}"
    typography: "{typography.count}"
    rounded: "{rounded.pill}"
    padding: "0 5px"
    height: "18px"
  head:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.paper}"
    rounded: "{rounded.disc}"
    size: "44px"
  head-active:
    backgroundColor: "{colors.graphite}"
  head-inbox:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.disc}"
    size: "44px"
  banner-landed:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.paper}"
    typography: "{typography.title}"
    rounded: "{rounded.disc}"
    padding: "0 14px 0 5px"
    width: "252px"
    height: "44px"
  avatar:
    backgroundColor: "{colors.avatar-slate}"
    textColor: "{colors.white}"
    typography: "{typography.title}"
    rounded: "{rounded.avatar}"
    size: "32px"
  unread-dot:
    backgroundColor: "{colors.system-blue}"
    rounded: "3px"
    size: "6px"
  panel-frame:
    rounded: "{rounded.sheet}"
    width: "420px"
  dismiss-target:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.paper}"
    rounded: "{rounded.target}"
    size: "56px"
  dismiss-target-armed:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.graphite}"
    rounded: "{rounded.target}"
    size: "56px"
---

# Design System: Bubble for Messenger

## Overview

**Creative North Star: "The Standing Notification"**

Bubble for Messenger looks like a macOS notification banner that decided to stay. Every surface is the same material: a solid graphite card, a one-pixel white hairline at twelve percent, and one soft lifted shadow. The disc at rest is that card cut to a circle; a conversation is that card stretched to a banner; the open sheet is that card at 420 wide with messenger.com painted inside it. Nothing is translucent, nothing is tinted, nothing glows. The Messenger mark's own raster is the only colour on screen at rest, and blue appears only where the system has to say "unread".

The system is dense and quiet. Five conversations occupy 292 vertical pixels. Type is the system face at three sizes, and the hierarchy is carried by weight and by ash-grey secondaries rather than by size jumps. Motion is a single idea applied everywhere: one ease-out-quint curve at 220 milliseconds, driving transform, opacity, or clip-path and nothing else. The stack does not animate as five cards; it animates as one number, `--p`, that every banner reads its offset and opacity from.

The build refused two things on purpose and they are confirmed rejections: the incumbent "liquid" goo-and-gradient fan, and the category default of a red badge beside a native-looking window. The dismiss target does not turn red when armed; it inverts to paper.

**Key Characteristics:**
- One material: graphite card, 12% hairline, one lifted shadow, on every surface including the ✕ target
- Blue only means unread: the count pill and the 6px dot, nowhere else
- System type at 13 / 12 / 11 px; weight 600 is the entire emphasis vocabulary
- One motion curve (ease-out-quint, 220 ms), one progress value for the stack, no overshoot, no stagger
- The panel is framed, never restyled: messenger.com keeps its own wash, radii and bubbles behind a 16px hairline frame

## Colors

A near-monochrome graphite palette with one semantic accent; the only saturated colour at rest is the raster of the Messenger mark itself.

### Primary
- **System Blue** (`{colors.system-blue}`): the unread count pill and the 6px unread dot in a banner's name row. It is a status colour, not a brand colour; it never fills a button, rule, or background.

### Neutral
- **Graphite** (`{colors.graphite}`): the ground of every card: disc, banners, landed banner, dismiss target. Messenger's own `--web-wash` (falling back to `#1a1a1a`) sits behind the panel, so the sheet reads as the same family without being repainted.
- **Raised Graphite** (`{colors.raised-graphite}`): hover fill for a banner. The only tonal step above the ground.
- **Avatar Slate** (`{colors.avatar-slate}`): fill behind a missing avatar, holding a single white initial.
- **Paper** (`{colors.paper}`): primary text, the ✕ stroke, and the armed dismiss target's fill.
- **Ash** (`{colors.ash}`): the preview line and the time stamp; everything that is secondary.
- **Hairline** (`{colors.hairline}`): the 1px rule on every card and on the panel frame.
- **Active Hairline** (`{colors.hairline-active}`): the same rule brightened on the banner whose conversation is open, which also sits on Raised Graphite.
- **White** (`{colors.white}`): text on the blue count pill and the initial inside Avatar Slate.

### Named Rules
**The Blue Means Unread Rule.** System Blue appears on exactly two elements, the count pill and the unread dot. No blue rules, fills, focus rings, or links anywhere in the app's own chrome.

**The No Red Rule.** There is no destructive colour. The dismiss target arms by inverting Graphite and Paper, not by turning red.

**The Mark Is The Colour Rule.** At rest the only chroma on screen is the Messenger icon raster (24px). The system supplies no gradient, tint, or vibrancy of its own.

## Typography

**Display Font:** none (the system has no display tier)
**Body Font:** system face (`-apple-system, system-ui, sans-serif`)
**Label/Mono Font:** same family; no mono

**Character:** the type reads like a macOS notification: system face, antialiased, nothing above 13px, emphasis by weight and by dropping to Ash rather than by size.

### Hierarchy
- **Title** (600, 13px, 16px): a conversation name in a banner and the landed banner; single line, ellipsised.
- **Title, quiet** (500, 13px, 16px): the "Open Messenger" banner label; a shade lighter than a name so it reads as an action, not a person.
- **Body** (400, 12px, 15px, Ash): the last-message preview; one line, ellipsised, omitted entirely when the scrape has no preview.
- **Label** (400, 11px, Ash): the relative time ("2h", "now") at the banner's right edge.
- **Count** (600, 11px, 18px, White on System Blue): the unread number, capped at "9+".
- **Initial** (600, 13px, White): a single uppercase letter inside Avatar Slate when no avatar image exists.

### Named Rules
**The Thirteen Ceiling Rule.** No text the app itself sets is larger than 13px. Hierarchy comes from 600 versus 400 and Paper versus Ash.

**The One Line Rule.** Every text run in a card is `white-space: nowrap` with an ellipsis. Cards never grow to fit text.

## Layout

The bubble layer is a single column anchored at the disc. The disc is 44px and rests flush against the left or right screen edge (it snaps there after a drag); the heads sit directly over the disc in a single 44px column; only the landed banner (252px) extends into the screen from the disc's edge. The stack grows upward when five rows fit above the disc and downward otherwise, with an 8px gap between disc and stack and an 8px gap between heads (row pitch 52px: 44 head + 8 gap). Rows read newest-first from the top; the paper "Open Messenger" head is always last. A panel opens 8px beyond the column.

The transparent window carries 32px of padding on every side of the content so the 8/24 shadow and the count pill (which overhangs the disc by 8px right and 6px up) are never clipped. The main process reports the disc's position and edge to the page; the page only lays out relative to that.

The conversation panel is a separate 420×640 window (420×560 when a single thread is open in compact mode) placed 8px beyond the bubble layer's bounds, top-aligned with it: to the right if it fits on the display, otherwise to the left, then clamped into the work area. It never goes narrower than 420 because messenger.com collapses to a single column below roughly 400. The stack stays open while a conversation is open; a press anywhere outside the stack closes stack and panel together. There is no responsive breakpoint system: the geometry is fixed pixel values chosen around one 44px disc.

### Named Rules
**The Disc Anchor Rule.** Nothing moves the disc. Stack, landed banner, and panel all take their position from it, and the disc keeps its screen position when the stack opens or closes.

**The Fifty-Two Pitch Rule.** Head rows sit on a 52px pitch (44 + 8). `lib/layout.js` and `bubble-renderer.js` both hardcode it; change one and the fold offsets break.

## Elevation & Depth

Depth is a hybrid of one shadow and one hairline. Every card carries the same lifted shadow and the same 1px 12% white rule; the rule does the work of separating graphite from a dark wallpaper, the shadow does the work of separating it from a light one. There is no second elevation level, no inset shadow, no blur, no vibrancy. Hover does not lift a card; it raises its tone one step to Raised Graphite. The active conversation is not lifted either: it holds that raised tone and its hairline brightens to 28%.

### Shadow Vocabulary
- **Lift** (`box-shadow: 0 8px 24px rgba(0,0,0,.45)`): every card in the bubble layer and the dismiss target. The panel window has no CSS shadow of its own; only the hairline frame.

### Named Rules
**The One Shadow Rule.** There is exactly one shadow value. Elevation is binary: a thing is a card (lifted, hairlined) or it is nothing.

**The Tone And Rule Rule.** State that would be a colour change elsewhere is a tone step and a rule change here: hover raises the card one step; active holds that step and brightens the hairline. No new hues, no transforms.

## Shapes

Everything is a rounded rectangle from the same family, and the radius follows the height. The 44px disc, the 44px heads and the 44px landed banner use 22px (a full circle or pill); the 18px count pill uses 9px; the 32px avatar is a 16px circle; the 12px dot is a 6px circle; the 56px dismiss target is a 28px circle; the 420-wide sheet is clipped to 16px. Borders are always 1px, always the hairline, always inside the box (`box-sizing: border-box`), so a card's outer dimension is the stated one.

The landed banner is shape as motion: a 252×44 pill whose `clip-path` starts as `inset(0 0 0 208px round 22px)` (exactly the disc's own circle at the screen edge) and opens to `inset(0 round 22px)`. One element, no layout, the disc simply lengthens.

### Named Rules
**The Radius Follows Height Rule.** Pills (disc, landed banner, count, avatar, dot, target) are radius = height / 2. Cards that hold two lines (banner, sheet) use 14px or 16px. Nothing is square-cornered.

## Components

### Disc
The resting state: a graphite card cut to a circle with the Messenger mark inside.
- **Shape:** full circle (44px, radius 22px), Graphite, hairline, Lift.
- **Content:** the icon raster at 24px, no tint applied.
- **Count pill:** absolutely positioned 8px past the right edge and 6px above the top; System Blue, White 600 11px on an 18px line, min-width 18px, 0 5px padding, 9px radius. Shows the unread total, "9+" above nine, hidden at zero and hidden while a landed banner is showing.
- **States:** no hover treatment; left-drag moves it, right-click opens the context menu.

### Head
A conversation as a disc: the contact's photo filling a 44px circle, one per recent chat. The
name lives in the tooltip; the row carries no text.
- **Shape:** 44px circle (22px radius), Graphite, hairline, Lift; the photo is cover-fit and
  rounded inside the hairline, or Avatar Slate with a Paper 600 15px initial.
- **Unread:** a 12px System Blue dot with a 2px Graphite ring, overhanging the top-right by 1px.
- **Hover:** the hairline brightens to 28%. No transform.
- **Active:** a 2px Paper ring outside the hairline (`box-shadow: lift, 0 0 0 2px paper`).
- **Deploy:** `transform: translateY(calc((1 - var(--p)) * var(--d)))` and `opacity: var(--p)`, where `--d` is this row's distance to the disc in whole pitches (52px per row) and `--p` is the stack's single progress value.

### Open Messenger head
The last row: the one paper disc in the column, so it never reads as another contact.
- **Shape:** 44px circle, Paper (`{colors.paper}`) fill, hairline, Lift.
- **Content:** the 24px mark, centred.
- **States:** hover brightens the hairline; participates in the same `--p` deploy as the rows above it.

### Landed banner
"A message landed": the disc lengthens into a banner for four seconds, then folds back.
- **Shape:** 252×44, 22px radius (a pill), same material; positioned over the disc at −1px so its hairline coincides with the disc's; padding 0 14px 0 5px so the avatar sits where the mark was.
- **Content:** 32px avatar, name (Title 600) over preview (Body Ash, "New message" when none), the literal "now" (Label Ash).
- **Motion:** `clip-path` from the disc's circle to the full pill over 220ms on the ease-out-quint curve; opacity 0→1 over 120ms linear. Hides the count pill while visible. Auto-folds after 4000ms; hovering holds it, and it folds 1500ms after the cursor leaves.
- **Click:** opens that conversation (the press never starts a disc drag). Hover steps the fill to Raised Graphite.

### Stack
Five heads plus Open Messenger, opened as one motion.
- **Container:** a flex column, 8px gap, `--p: 0` at rest and `--p: 1` when `body.open`; `--p` is a registered `@property` (`<number>`, inherits) so the browser interpolates it over 220ms on the ease-out-quint curve.
- **Order:** newest at the top, Open Messenger at the bottom, on either side of the disc.
- **Fold offsets:** with the stack above the disc, the bottom row is 1 pitch away and the top row 6; below the disc the order inverts. At `--p: 0` every row sits under the disc at opacity 0.
- **Close:** removing `open` runs the same curve in reverse; the window shrinks after the fold has played.

### Panel frame
The conversation sheet: messenger.com framed, not restyled.
- **Shape:** the page's `html` is clipped to a 16px radius; a fixed, pointer-transparent overlay draws a 1px hairline at the same radius on top of everything; a fixed ground layer beneath everything paints Messenger's own `--web-wash`.
- **Size:** 420×640 for the inbox, 420×560 for a single thread; 8px beyond the bubble layer, top-aligned.
- **Compact mode:** hides Messenger's inbox switcher rail, call/info buttons and Back arrow; removes the thread's inset margin and radius so the conversation fills the sheet; hides scrollbars. Messenger's message bubbles, purple own-message fill, and controls are its own and are not part of this system.

### Dismiss target
The ✕ that appears at the bottom of the display while dragging; dropping the disc on it quits.
- **Shape:** 56px circle (radius 28px), Graphite, hairline, Lift; a 22px inline SVG ✕ stroked 2px in Paper.
- **Armed:** when the dragged disc's centre is within range, the target scales to 1.2 over 220ms on the ease-out-quint curve and inverts: Paper fill, Graphite stroke, background and stroke crossfading over 120ms linear.

## Do's and Don'ts

### Do:
- **Do** build every new surface from the one material: Graphite (`#1c1c1e`), a 1px `rgba(255,255,255,.12)` rule, and `0 8px 24px rgba(0,0,0,.45)`.
- **Do** use the single curve `cubic-bezier(.22, 1, .36, 1)` at 220ms for any spatial change, and 120ms linear only for a colour or opacity crossfade riding alongside it.
- **Do** derive grouped motion from one progress value (`--p`) rather than per-item delays.
- **Do** keep radii tied to height: half the height for pills and circles, 16px for the sheet.
- **Do** show state with tone and rule (Raised Graphite on hover; Raised Graphite plus the 28% hairline when active), not with transforms or new colours.
- **Do** leave messenger.com's own content alone inside the frame; the system owns the silhouette, not the page.

### Don't:
- **Don't** introduce gradients, blur, vibrancy, or translucency; the rejected liquid fan is not to be carried forward.
- **Don't** use red anywhere; arming or destructive states invert Graphite and Paper instead.
- **Don't** put System Blue on anything but the unread count and the unread dot.
- **Don't** set app text larger than 13px or use a second family; emphasis is 600 weight or Ash, not size.
- **Don't** animate layout, width, height, or box-shadow; only transform, opacity, and clip-path move.
- **Don't** add a second shadow or elevation level; a thing is either a card or nothing.
