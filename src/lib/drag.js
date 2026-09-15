// The disc's press → drag → release machine, pure. The window module samples the cursor and
// applies the positions; this decides what a sample means.
const { isClick, clampToArea } = require('./layout');

// The ✕ target arms only once the disc has rested on it this long: a fast fling that grazes
// the bottom of the screen must not quit the app.
const ARM_MS = 350;

// A press at `cursor` on a disc at `anchor`. Whether the stack was open decides what a plain
// click means on release: a press that folded the stack is done, not a request to open one.
function press({ cursor, anchor, expanded }) {
  return {
    origin: cursor,
    offsetX: cursor.x - anchor.x,
    offsetY: cursor.y - anchor.y,
    collapsedOnPress: expanded,
    moved: false,
    hot: false,
    hotSince: null, // when the disc arrived over the target
  };
}

// A cursor sample while pressed. Nothing happens inside the click-wobble radius; beyond it
// the press is a drag, and the disc follows the cursor, kept fully on the display it is over.
// `overDismiss` is whether the disc's new place is over the ✕ target; `hotChanged` says so
// only when that answer changed, so the target is not told sixty times a second.
function move(drag, { cursor, anchor, size, area, overDismiss = () => false, now = 0 }) {
  if (!drag.moved && isClick(cursor.x - drag.origin.x, cursor.y - drag.origin.y))
    return { drag, position: null, becameDrag: false, hotChanged: false };
  const becameDrag = !drag.moved;
  const at = clampToArea(
    { x: cursor.x - drag.offsetX, y: cursor.y - drag.offsetY, width: size, height: size },
    area,
  );
  const position = at.x !== anchor.x || at.y !== anchor.y ? at : null;
  const hot = position ? Boolean(overDismiss(position)) : drag.hot;
  const hotSince = hot ? (drag.hot ? drag.hotSince : now) : null;
  return {
    drag: { ...drag, moved: true, hot, hotSince },
    position,
    becameDrag,
    hotChanged: hot !== drag.hot,
  };
}

// Armed once the disc has rested on the target long enough.
const armed = (drag, now) => drag.hot && drag.hotSince !== null && now - drag.hotSince >= ARM_MS;

// The button came up: a drop on the armed ✕ dismisses; any other drag rests against the
// nearer edge; a click opens the stack unless the press already closed it.
function release(drag, { overDismiss, now = 0 }) {
  if (drag.moved) return overDismiss && armed(drag, now) ? 'dismiss' : 'snap';
  return drag.collapsedOnPress ? 'nothing' : 'click';
}

module.exports = { press, move, release, armed, ARM_MS };
