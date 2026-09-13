# Quick reply from the landed banner — design

When a message lands, the disc unrolls into a banner (avatar, name, first line) for four
seconds. This adds a reply field to that banner so a short answer never needs the panel: click
↩, type, Enter. The message is sent through the hidden Messenger page.

## Behaviour

- **Affordance.** The landed banner carries a small ↩ control at its far end (the end away from
  the disc, so mirrored for left-edge placement). Clicking the banner body still opens the
  conversation; hovering still holds the banner open. The fan heads get no reply control.
- **Replying state.** Clicking ↩ replaces the first-line text with a single-line field,
  placeholder "Reply to *Name*", and stops the auto-fold timer. The field is focused. Enter with
  non-empty text sends; Esc cancels. The field losing focus (a click anywhere else) cancels.
  Cancel folds the banner after a short delay.
- **Sending.** The field is disabled and the sub-line reads "Sending…". On success it reads
  "Sent" for about a second, then the banner folds. On failure the banner folds and the
  conversation opens in the panel with the typed text in the composer (see Fallback), so
  nothing typed is lost.
- **Limits.** Text is trimmed, must be non-empty and at most 2000 characters. One reply at a time:
  while a send is in flight, ↩ is inert.

## Focus

The bubble window is created `focusable: false` and stays so. Opening the field asks the main
process for focus (`bubble:reply-focus`, on): main calls `win.setFocusable(true)` then
`win.focus()`. Sending or cancelling asks for it back (off): main calls `win.setFocusable(false)`,
which also drops focus. Keyboard focus is therefore taken only by an explicit click on ↩ and
returned within the same interaction. Nothing else about the window changes (level, workspaces,
click-through padding).

## Sending

`bubble:reply` (href, text) is validated in main with the existing `isThreadHref` plus the text
limits, then handed to the panel, which serialises it through its existing open-queue so a fan
click mid-send cannot interleave. The send runs in `scrape.sendReply(wc, href, text)`:

1. **Stage.** If the panel is hidden, show it at opacity 0 the way `stageThread` does (input
   events do not dispatch to a hidden window), remembering that it was hidden. If visible, it
   simply switches thread in view.
2. **Thread.** Reuse `openThread` (trusted click on the list row, reload fallback). Then poll.
3. **Composer.** `[role="main"] [contenteditable="true"][role="textbox"]`, visible. If it already
   holds text, stop: a notification reply is never merged into a draft the user wrote.
4. **Insert.** Focus the composer, `document.execCommand('insertText', false, text)`, then verify
   the composer's text contains the reply.
5. **Send.** Click Messenger's own Send button (`[role="main"]` button whose aria-label contains
   "send", case-insensitive). Success is the composer becoming empty.
6. **Stops.** At any step: the page no longer being on the target thread, the composer
   disappearing, the draft not matching after insert, or a 12 s budget expiring, is a failure.
7. **Unstage.** In `finally`: if the panel was hidden before, hide it again — the list is never
   seen. Restore compact mode as `stageThread` would leave it.

The decision logic is a pure state machine in `src/lib/reply.js`:

```
decideReply(phase, snapshot, expired) -> { action, phase }
  phases:  waiting -> inserted -> confirming
  snapshot: { onThread, composerReady, composerEmpty, draftMatches, sendAvailable }
  actions:  wait | insert | send | success | failure
```

- `waiting`: expired → failure; not onThread or no composer → wait; composer not empty →
  failure; else insert (→ `inserted`).
- `inserted` / `confirming`: not onThread or no composer → failure.
- `inserted`: draft not matching or no send button → failure; else send (→ `confirming`).
- `confirming`: composer empty → success; expired → failure; else wait.

`validReply(href, text)` covers the limits. Both are unit-tested; the DOM loop in `scrape.js`
only feeds the machine and performs the action it names, polling every 250 ms.

## Fallback

On failure main opens the conversation for real (`panel.openThread`) and the banner folds. If
the draft was inserted before the failure, it is already in the composer; the user presses
Enter there. If the failure was an existing draft, that draft is what they see. No automatic
retry, no second insert.

## Testing

- Unit: `decideReply` transitions and stops; `validReply` limits; IPC validation in `bubble.js`
  refuses bad hrefs and empty/over-long text (existing pattern: `isThreadHref` at the boundary).
- Live, on a logged-in profile, with the Send click stubbed out: thread switch from a hidden
  panel, composer found, draft inserted and read back, composer cleared, panel hidden again.
- The final send is verified by a person, to a contact of their choosing.

## Out of scope

Reply from the fan heads or the panel's own chrome; multi-line replies; attachments; a Bubble-
owned macOS notification with a native reply field (possible later on the same send path).
