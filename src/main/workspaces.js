// Every window of the app joins all Spaces; whether it also shows over full-screen apps is the
// user's setting. Electron's default for this call re-transforms the process on every use —
// to a UI element when the window may float over full-screen apps, back to a foreground app
// when it may not — which brought the Dock icon back and blinked every window the moment the
// setting was turned off. main.js hides the Dock itself, so the transform is always skipped.
function joinAllSpaces(win, overFullscreen) {
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: overFullscreen, skipTransformProcessType: true });
}

module.exports = { joinAllSpaces };
