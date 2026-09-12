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

const FAN_ITEM = 56;

// Bounds of the bubble window when `itemCount` fan items are shown. The main bubble keeps its
// screen position; the column grows upward when it fits, otherwise downward.
function fanLayout(bubble, itemCount, area) {
  const extra = itemCount * FAN_ITEM;
  const up = bubble.y - extra >= area.y;
  const bounds = { x: bubble.x, y: up ? bubble.y - extra : bubble.y, width: bubble.width, height: bubble.height + extra };
  return { direction: up ? 'up' : 'down', bounds: { ...bounds, ...clampToArea(bounds, area) } };
}

function isClick(dx, dy) {
  return Math.abs(dx) <= CLICK_THRESHOLD && Math.abs(dy) <= CLICK_THRESHOLD;
}

module.exports = { panelPosition, clampToArea, fanLayout, isClick, GAP, CLICK_THRESHOLD, FAN_ITEM };
