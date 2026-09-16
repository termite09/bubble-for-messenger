# Windows test checklist

For whoever runs a Windows build of Bubble. Take the `windows` artifact of a dry-run release
(or a release's `-setup.exe`), note the Windows version and your monitor scaling, and go down
the list. For anything that fails, a sentence about what happened (and a screenshot if it is
visual) is plenty.

Setup: install or run the exe; SmartScreen → More info → Run anyway; sign in to Messenger.

1. **Shortcuts from the panel.** Open a chat so the panel is focused. `Ctrl+N` opens the
   inbox; `Ctrl+1` opens the most recent chat; `Ctrl+,` opens Settings. (This is the one thing
   the design assumes about Electron on Windows without having measured it — please try it
   first.)
2. **Click-away.** With a chat open, click another app's window: the panel and the heads go
   away and the click reaches that app. With only the heads open (no chat), the first click
   outside only closes the heads.
3. **Click-through.** Move the bubble to the middle of the screen over another window; click
   just beside the disc (the transparent margin): the click should reach the window beneath.
4. **Drag, snap, dismiss.** Drag the disc; it follows the mouse and snaps to the nearest
   screen edge on release. While dragging, a ✕ target appears at the bottom centre; dropping
   the disc on it quits.
5. **Stacking.** Open the stack, then a chat: the disc stays above the panel; the panel stays
   above the shield over the desktop; nothing from Bubble hides behind another Bubble window.
6. **Two monitors, different scaling** (if you have them). Drag the bubble across; it keeps
   its size and the stack opens beside it on either display.
7. **Settings.** Right-click → Settings…: the card has no *Show over full-screen apps* row and
   no *Glass* row; the other switches work; `Esc` and `Ctrl+W` close it; the card has rounded
   corners on Windows 11.
8. **Start at login.** Switch it on, sign out and in: Bubble is running.
9. **Update.** Right-click: *Update to X…* (if there is a newer release) opens the release
   page in the browser.
10. **Full-screen video.** Play a YouTube video full-screen in the browser: the bubble stays
    visible over it (borderless full-screen). That is expected; there is no setting for it on
    Windows.
