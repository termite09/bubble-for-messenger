const { CAPS } = require('../lib/platform');

// Every window of the app either joins all Spaces or lives on the desktop it is on, by the
// user's "show over full-screen apps" setting. On current macOS a window that joins all
// Spaces is drawn in full-screen Spaces too, whatever its level or the FullScreenAuxiliary
// flag says (measured: the flag alone changed nothing, at 'floating' or 'screen-saver'), so
// keeping the bubble off full-screen apps means not joining all Spaces at all.
//
// Two Electron defaults are avoided on the way: the call re-transforms the process type
// (Dock icon back, every window blinking) unless told to skip it — main.js hides the Dock
// itself — and a window that is `fullscreenable` carries FullScreenPrimary, which conflicts
// with the auxiliary flag; every window is created `fullscreenable: false`.
//
// No Spaces (Windows): a topmost window shows over borderless-fullscreen apps and under
// exclusive-fullscreen ones whatever is asked, so the call is not made.
function joinAllSpaces(win, overFullscreen, caps = CAPS) {
  if (!caps.spaces) return;
  win.setVisibleOnAllWorkspaces(overFullscreen, {
    visibleOnFullScreen: overFullscreen,
    skipTransformProcessType: true,
  });
}

module.exports = { joinAllSpaces };
