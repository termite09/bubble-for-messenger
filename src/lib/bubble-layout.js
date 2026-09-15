// The bubble window's geometry, pure: where the window goes and where the page draws inside it,
// for a disc at `anchor` (top-left, screen px) of `size` px, drawn by a page for a BASE-px disc
// zoomed by `scale`. Everything the page needs to place itself crosses over in page pixels.
const { fanLayout, windowFrame, clampToArea, snapToEdge, FAN_ITEM } = require('./layout');

const BASE = 44;       // the disc the page is drawn for
const BANNER = 250;    // the landed banner; the window extends this far from the disc toward the screen centre

// Which screen edge the disc rests on decides which way banners extend.
const edgeOf = (anchor, size, area) => (anchor.x + size / 2 > area.x + area.width / 2 ? 'right' : 'left');

function bubbleLayout({ anchor, size, scale, fanCount, bannerExtra, area }) {
  const bounds = { x: anchor.x, y: anchor.y, width: size, height: size };
  const extra = bannerExtra * scale;
  // The banner grows away from the screen edge, like the stack; with no stack up, that is
  // decided by whether its extra rows fit above the disc.
  const column = fanCount
    ? fanLayout(bounds, fanCount, area, scale)
    : { direction: anchor.y - extra >= area.y ? 'up' : 'down', bounds, shown: 0 };
  const { direction } = column;
  const side = edgeOf(anchor, size, area);
  const banner = BANNER * scale;
  // The content rect spans the banner width from the disc toward the screen centre.
  const content = {
    x: side === 'right' ? column.bounds.x + size - banner : column.bounds.x,
    y: column.bounds.y, width: banner, height: column.bounds.height,
  };
  const frame = windowFrame(content, direction === 'up' ? { above: extra } : { below: extra }, scale);
  return {
    content,
    direction,
    shown: column.shown,
    window: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    renderer: {
      contentX: (side === 'right' ? frame.contentX + banner - size : frame.contentX) / scale,
      contentY: (frame.contentY + (column.bounds.height - size) * (direction === 'up' ? 1 : 0)) / scale,
      edge: side,
      direction,
      base: BASE,
      banner: BANNER,
      pitch: FAN_ITEM,
    },
  };
}

// The rect a panel should sit beside: the head column (disc plus stack) while it is open,
// otherwise just the disc.
function stackBounds(params) {
  const { anchor, size, fanCount, area } = params;
  if (!fanCount) return { x: anchor.x, y: anchor.y, width: size, height: size };
  const c = bubbleLayout(params).content;
  return { x: edgeOf(anchor, size, area) === 'right' ? c.x + c.width - size : c.x, y: c.y, width: size, height: c.height };
}

// A new disc size: the disc keeps its centre — except that one resting on the top or bottom
// of the screen stays resting on it, so sizes round-trip without drift — then rests against
// the side edge again (it may now be too close to it, or past it).
function resizeAnchor(anchor, oldSize, newSize, area) {
  const onTop = anchor.y <= area.y;
  const onBottom = anchor.y + oldSize >= area.y + area.height;
  const cx = anchor.x + oldSize / 2;
  const cy = anchor.y + oldSize / 2;
  const y = onTop ? area.y : onBottom ? area.y + area.height - newSize : cy - newSize / 2;
  const at = clampToArea({ x: cx - newSize / 2, y, width: newSize, height: newSize }, area);
  return { x: snapToEdge({ ...at, width: newSize, height: newSize }, area).x, y: at.y };
}

module.exports = { bubbleLayout, stackBounds, resizeAnchor, edgeOf, BASE, BANNER };
