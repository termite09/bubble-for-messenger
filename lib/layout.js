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

function isClick(dx, dy) {
  return Math.abs(dx) <= CLICK_THRESHOLD && Math.abs(dy) <= CLICK_THRESHOLD;
}

module.exports = { panelPosition, clampToArea, isClick, GAP, CLICK_THRESHOLD };
