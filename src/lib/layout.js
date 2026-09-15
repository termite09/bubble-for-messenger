const GAP = 8;
const CLICK_THRESHOLD = 4;

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

// Move a rect so it lies fully inside a display work area.
function clampToArea(rect, area) {
  return {
    x: Math.round(clamp(rect.x, area.x, area.x + area.width - rect.width)),
    y: Math.round(clamp(rect.y, area.y, area.y + area.height - rect.height)),
  };
}

// Place the panel beside the bubble: to the right if it fits, otherwise to the left;
// top-aligned with the bubble, shifted up when it would overflow the bottom edge.
function panelPosition(bubble, area, panel) {
  let x = bubble.x + bubble.width + GAP;
  if (x + panel.width > area.x + area.width) x = bubble.x - GAP - panel.width;
  return clampToArea({ x, y: bubble.y, width: panel.width, height: panel.height }, area);
}

const FAN_ROW = 44; // a head (same size as the disc)
const FAN_GAP = 8;
const FAN_ITEM = FAN_ROW + FAN_GAP; // pitch
const PAD = 32; // transparent margin around the content: the 8+24px shadow and the count pill

// Content rect (disc plus the stack) when `itemCount` fan rows are shown. The disc keeps its
// screen position; the column grows upward when it fits, otherwise downward — and when it fits
// neither way it grows toward the roomier side with only as many rows (`shown`) as fit, so the
// disc never leaves the screen. `scale` is the bubble size relative to the 44px disc the pitch
// is drawn for.
function fanLayout(bubble, itemCount, area, scale = 1) {
  const pitch = FAN_ITEM * scale;
  const roomAbove = bubble.y - area.y;
  const roomBelow = area.y + area.height - (bubble.y + bubble.height);
  let up = itemCount * pitch <= roomAbove;
  let shown = itemCount;
  if (!up && itemCount * pitch > roomBelow) {
    up = roomAbove >= roomBelow;
    shown = Math.max(0, Math.floor((up ? roomAbove : roomBelow) / pitch));
  }
  const extra = shown * pitch;
  const bounds = {
    x: bubble.x,
    y: up ? bubble.y - extra : bubble.y,
    width: bubble.width,
    height: bubble.height + extra,
  };
  return {
    direction: up ? 'up' : 'down',
    shown,
    bounds: { ...bounds, ...clampToArea(bounds, area) },
  };
}

// The window that holds a content rect: PAD on every side, plus `room` — `{ above, below }`,
// or a number meaning below — for what grows out of the disc row (the landed banner, and its
// reply row). Returns the window rect plus where the content sits inside it. The padding holds
// a shadow drawn in page pixels, so it grows with the bubble `scale`.
function windowFrame(content, room = 0, scale = 1) {
  const { above = 0, below = 0 } = typeof room === 'number' ? { below: room } : room;
  const pad = PAD * scale;
  const top = content.y - above;
  const bottom = content.y + content.height + below;
  return {
    x: content.x - pad,
    y: top - pad,
    width: content.width + 2 * pad,
    height: bottom - top + 2 * pad,
    contentX: pad,
    contentY: content.y - top + pad,
  };
}

const EDGE_MARGIN = 16; // breathing room between a resting disc and the screen edge

// After a drag, pull the bubble to rest near whichever vertical edge its centre is nearer,
// EDGE_MARGIN in from it rather than flush against it.
function snapToEdge(bubble, area) {
  const center = bubble.x + bubble.width / 2;
  const nearRight = center > area.x + area.width / 2;
  const x = nearRight ? area.x + area.width - bubble.width - EDGE_MARGIN : area.x + EDGE_MARGIN;
  return clampToArea({ x, y: bubble.y, width: bubble.width, height: bubble.height }, area);
}

function isClick(dx, dy) {
  return Math.abs(dx) <= CLICK_THRESHOLD && Math.abs(dy) <= CLICK_THRESHOLD;
}

// True when a rect's centre is within `radius` of a point — the drag-to-dismiss hit test.
function centerWithin(rect, point, radius) {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return Math.hypot(cx - point.x, cy - point.y) <= radius;
}

module.exports = {
  panelPosition,
  clampToArea,
  fanLayout,
  windowFrame,
  snapToEdge,
  centerWithin,
  isClick,
  FAN_ITEM,
  PAD,
  EDGE_MARGIN,
};
