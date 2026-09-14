// Every window of the app joins all Spaces; whether it also shows over full-screen apps is the
// user's setting. Two things Electron does by default get in the way, and both are handled:
//
// - This call re-transforms the process on every use — to a UI element when the window may
//   float over full-screen apps, back to a foreground app (Dock icon and all) when it may not.
//   main.js hides the Dock itself, so the transform is always skipped.
// - A window that is `fullscreenable` (the default) carries FullScreenPrimary, and AppKit
//   ignores FullScreenAuxiliary — the flag this call toggles — while Primary is set, so the
//   setting did nothing either way. Every window is therefore created `fullscreenable: false`.
function joinAllSpaces(win, overFullscreen) {
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: overFullscreen, skipTransformProcessType: true });
}

module.exports = { joinAllSpaces };
