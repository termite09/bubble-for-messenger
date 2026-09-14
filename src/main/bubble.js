const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const { isClick, clampToArea, fanLayout, windowFrame, snapToEdge, EDGE_MARGIN } = require('../lib/layout');
const { isThreadHref } = require('../lib/recent');
const { validReply } = require('../lib/reply');
const { BUBBLE_SIZES } = require('../lib/settings');
const { joinAllSpaces } = require('./workspaces');

const RENDERER = path.join(__dirname, '..', 'renderer');

// The page is drawn for a 44px disc; a larger bubble is the same page zoomed, so every
// length below is in page pixels and is multiplied by `scale` where it meets the screen.
const BASE = BUBBLE_SIZES.small;
const BANNER = 250;    // the landed banner; the window extends this far from the disc toward the screen centre

function defaultPosition(size) {
  const { workArea } = screen.getPrimaryDisplay();
  return { x: workArea.x + workArea.width - size - EDGE_MARGIN, y: workArea.y + workArea.height - size - EDGE_MARGIN };
}

// The disc's position (`anchor`) is the source of truth. The window around it is transparent
// padding (room for shadows and the count pill) plus whatever is showing: the banner stack above
// or below the disc, the "message landed" banner, and the docked avatar beside an open panel.
// Clicks fall through the padding: the renderer reports when the cursor is over a card.
function createBubble({ position, onClick, onClose, onMoved, onContextMenu, onHeadMenu, onOpenChat, onOpenInbox, onDismiss, onReply, dismiss, overFullscreen = true, size = BASE }) {
  let SIZE = size;          // the disc, on screen
  let scale = SIZE / BASE;  // page zoom
  const start = position || defaultPosition(SIZE);
  const anchor = clampToArea({ ...start, width: SIZE, height: SIZE }, screen.getDisplayNearestPoint(start).workArea);

  const win = new BrowserWindow({
    x: anchor.x, y: anchor.y, width: SIZE, height: SIZE,
    frame: false, transparent: true, hasShadow: false, resizable: false, fullscreenable: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false,
    webPreferences: {
      preload: path.join(RENDERER, 'bubble-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      zoomFactor: scale,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  joinAllSpaces(win, overFullscreen);
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(RENDERER, 'bubble.html'));
  win.once('ready-to-show', () => { win.showInactive(); applyBounds(); });
  // Settings arrive before the page has loaded at startup; hand them over again once it has.
  let lastSettings = null;
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(scale);
    if (lastSettings) win.webContents.send('bubble:settings', lastSettings);
    applyBounds(); // the page's placement inside the window, lost with the old document
  });

  // While the stack is open, an invisible shield covers the display beneath it (and the panel):
  // a press anywhere that is not a banner puts the stack away, the way a popover closes. It is
  // non-focusable so the click never activates anything, and it sits below the bubble's level.
  const shield = new BrowserWindow({
    frame: false, transparent: true, hasShadow: false, resizable: false, fullscreenable: false, focusable: false, show: false,
    alwaysOnTop: true, skipTaskbar: true,
    webPreferences: { preload: path.join(RENDERER, 'shield-preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  shield.setAlwaysOnTop(true, 'floating');
  joinAllSpaces(shield, overFullscreen);
  shield.loadFile(path.join(RENDERER, 'shield.html'));

  const bounds = () => ({ x: anchor.x, y: anchor.y, width: SIZE, height: SIZE });
  let expanded = false;
  let animGen = 0;    // guards the deferred collapse shrink against a rapid re-expand
  let fanCount = 0;   // rows currently in the fan (incl. the inbox entry)
  let shownRows = null; // fewer than fanCount when the screen has no room for them all
  let direction = 'up';
  let replying = false;   // the landed banner has grown its reply row (keyboard focus is lent)
  let bannerExtra = 0;    // page px the landed banner needs beyond the disc row (its wrapped text, its reply row)

  // Which screen edge the disc rests on decides which way banners extend.
  const edge = () => {
    const area = screen.getDisplayMatching(bounds()).workArea;
    return anchor.x + SIZE / 2 > area.x + area.width / 2 ? 'right' : 'left';
  };

  function layout() {
    const area = screen.getDisplayMatching(bounds()).workArea;
    const extra = bannerExtra * scale;
    // The banner grows away from the screen edge, like the stack; with no stack up, that is
    // decided by whether its extra rows fit above the disc.
    const column = fanCount ? fanLayout(bounds(), fanCount, area, scale) : { direction: anchor.y - extra >= area.y ? 'up' : 'down', bounds: bounds() };
    direction = column.direction;
    if (fanCount && column.shown < fanCount) shownRows = column.shown; // the page is told to trim
    const side = edge();
    const banner = BANNER * scale;
    // The content rect spans the banner width from the disc toward the screen centre.
    const content = {
      x: side === 'right' ? column.bounds.x + SIZE - banner : column.bounds.x,
      y: column.bounds.y, width: banner, height: column.bounds.height,
    };
    const frame = windowFrame(content, null, direction === 'up' ? { above: extra } : { below: extra }, scale);
    // The page works in its own (zoomed) pixels: offsets cross over divided by the scale.
    return {
      content,
      window: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
      renderer: {
        contentX: (side === 'right' ? frame.contentX + banner - SIZE : frame.contentX) / scale,
        contentY: (frame.contentY + (column.bounds.height - SIZE) * (direction === 'up' ? 1 : 0)) / scale,
        edge: side,
        direction,
      },
    };
  }

  function applyBounds() {
    const l = layout();
    win.setBounds(l.window);
    win.webContents.send('bubble:layout', l.renderer);
  }

  function moveTo(x, y) {
    anchor.x = x;
    anchor.y = y;
    applyBounds();
    onMoved({ x, y });
  }

  // Ease the disc to a resting x (edge snap) over a few frames. A new drag or a position reset
  // cancels it so the two never fight over the anchor.
  let snapTimer = null;
  const stopSnap = () => { clearInterval(snapTimer); snapTimer = null; };
  function animateTo(targetX) {
    stopSnap();
    const startX = anchor.x;
    const y = anchor.y;
    const steps = 8;
    let i = 0;
    snapTimer = setInterval(() => {
      i += 1;
      const t = i / steps;
      const eased = 1 - (1 - t) * (1 - t);
      moveTo(Math.round(startX + (targetX - startX) * eased), y);
      if (i >= steps) stopSnap();
    }, 12);
  }

  // A new disc size: the page zooms, and the disc keeps its centre — except that one resting
  // on the top or bottom of the screen stays resting on it, so sizes round-trip without drift —
  // then rests against the side edge again (it may now be too close to it, or past it).
  function resize(next) {
    stopSnap();
    collapse();
    const area = screen.getDisplayMatching(bounds()).workArea;
    const onTop = anchor.y <= area.y;
    const onBottom = anchor.y + SIZE >= area.y + area.height;
    const cx = anchor.x + SIZE / 2;
    const cy = anchor.y + SIZE / 2;
    SIZE = next;
    scale = SIZE / BASE;
    win.webContents.setZoomFactor(scale);
    const y = onTop ? area.y : onBottom ? area.y + area.height - SIZE : cy - SIZE / 2;
    const at = clampToArea({ x: cx - SIZE / 2, y, width: SIZE, height: SIZE }, area);
    moveTo(snapToEdge({ ...at, width: SIZE, height: SIZE }, area).x, at.y);
  }

  const COLLAPSE_MS = 240; // the fold transition is 220ms

  function collapse() {
    if (!expanded) return;
    expanded = false;
    shield.hide();
    const gen = ++animGen;
    win.webContents.send('bubble:fan', { animate: 'out' });
    // Let the fold play, then drop the rows and shrink the window. Sizing on fanCount (not
    // `expanded`) keeps the window large while rows still take layout height.
    setTimeout(() => {
      if (gen !== animGen || expanded) return;
      win.webContents.send('bubble:fan', { animate: 'clear' });
      fanCount = 0;
      applyBounds();
    }, COLLAPSE_MS);
  }

  // Show `items` as a stack of banners by growing the (non-activating) window. Clicking the
  // disc again collapses it — handled by `collapsedOnPress` in the drag logic.
  function expand(items, animate = true) {
    animGen += 1;
    fanCount = items.length + 1;
    expanded = true;
    shownRows = null;
    applyBounds();
    // No room for every row: keep the inbox head and the rows nearest it.
    if (shownRows !== null && shownRows < fanCount) {
      items = items.slice(Math.max(0, items.length - Math.max(0, shownRows - 1)));
      fanCount = items.length + 1;
      applyBounds();
    }
    shield.setBounds(screen.getDisplayMatching(bounds()).bounds);
    if (!shield.isVisible()) shield.showInactive();
    // 'in' plays the deploy; 'update' just swaps the contents (used by the periodic refresh).
    win.webContents.send('bubble:fan', { animate: animate ? 'in' : 'update', items });
  }

  // While the mouse button is down we poll the cursor and move the window under it.
  let drag = null; // { timer, offsetX, offsetY, cursor, collapsedOnPress, moved }
  const owns = (e) => e.sender === win.webContents;

  ipcMain.on('bubble:drag-start', (e) => {
    if (!owns(e) || drag) return;
    stopSnap();
    const collapsedOnPress = expanded;
    if (expanded) { collapse(); onClose('disc'); }
    const cursor = screen.getCursorScreenPoint();
    drag = { offsetX: cursor.x - anchor.x, offsetY: cursor.y - anchor.y, cursor, collapsedOnPress, moved: false, timer: null };
    drag.timer = setInterval(() => {
      const c = screen.getCursorScreenPoint();
      // A press only becomes a drag once the cursor leaves the click-wobble radius.
      if (!drag.moved) {
        if (isClick(c.x - drag.cursor.x, c.y - drag.cursor.y)) return;
        drag.moved = true;
        if (dismiss) dismiss.show(bounds()); // first real movement: reveal the ✕ target
      }
      // Keep the disc fully on whichever display the cursor is over.
      const area = screen.getDisplayNearestPoint(c).workArea;
      const { x: nx, y: ny } = clampToArea({ x: c.x - drag.offsetX, y: c.y - drag.offsetY, width: SIZE, height: SIZE }, area);
      if (nx !== anchor.x || ny !== anchor.y) {
        moveTo(nx, ny);
        if (dismiss) dismiss.setHot(dismiss.isOver(bounds()));
      }
    }, 16);
  });

  ipcMain.on('bubble:drag-end', (e) => {
    if (!owns(e) || !drag) return;
    clearInterval(drag.timer);
    const { collapsedOnPress, moved } = drag;
    drag = null;

    if (moved) {
      const dropped = dismiss && dismiss.isOver(bounds());
      if (dismiss) dismiss.hide();
      if (dropped) { onDismiss(); return; }
      // Rest against the nearer screen edge.
      const area = screen.getDisplayMatching(bounds()).workArea;
      animateTo(snapToEdge(bounds(), area).x);
      return;
    }
    // A click that closed an open fan is done; otherwise it's a request to open one.
    if (!collapsedOnPress) onClick();
  });

  ipcMain.on('bubble:head-menu', (e, href) => {
    if (owns(e) && isThreadHref(href)) onHeadMenu(href);
  });
  ipcMain.on('bubble:context-menu', (e) => {
    if (owns(e)) onContextMenu();
  });
  // The stack stays open after picking a chat, so the next conversation is one click away;
  // the panel opens beyond the banners.
  ipcMain.on('bubble:open-chat', (e, href) => {
    if (!owns(e) || !isThreadHref(href)) return;
    onOpenChat(href);
  });
  ipcMain.on('bubble:open-inbox', (e) => {
    if (!owns(e)) return;
    collapse();
    onOpenInbox();
  });
  // A press outside the stack (on the shield) puts everything away.
  ipcMain.on('shield:click', (e) => {
    if (e.sender !== shield.webContents) return;
    collapse();
    onClose('shield');
  });
  // The window is mostly transparent padding; only pass clicks through when over a card.
  ipcMain.on('bubble:hit', (e, over) => {
    if (!owns(e)) return;
    win.setIgnoreMouseEvents(!over, { forward: true });
  });
  // The window is non-focusable so it never takes the keyboard from the user's work. The reply
  // field is the one exception: focus is lent when it opens and taken back when it closes.
  ipcMain.on('bubble:reply-focus', (e, on) => {
    if (!owns(e)) return;
    replying = Boolean(on);
    win.setFocusable(replying);
    if (replying) win.focus();
  });
  // The page measures the banner whenever it changes and reports what it needs beyond the disc
  // row; the window makes that room on the side the banner grows toward.
  ipcMain.on('bubble:banner-extra', (e, px) => {
    if (!owns(e)) return;
    const next = Math.max(0, Math.min(600, Number(px) || 0));
    if (next === bannerExtra) return;
    bannerExtra = next;
    applyBounds();
  });
  ipcMain.on('bubble:reply', (e, href, text) => {
    if (!owns(e) || !validReply(href, text)) return;
    onReply(href, text.trim());
  });

  return {
    win,
    expand,
    collapse,
    isExpanded: () => expanded,
    setBadge: (n) => win.webContents.send('bubble:badge', n),
    getBounds: bounds,
    // The rect a panel should sit beside: the head column (disc plus stack) while it is open,
    // otherwise just the disc.
    getStackBounds: () => {
      if (!fanCount) return bounds();
      const c = layout().content;
      return { x: edge() === 'right' ? c.x + c.width - SIZE : c.x, y: c.y, width: SIZE, height: c.height };
    },
    setActive: (href) => win.webContents.send('bubble:active', href),
    // A message just arrived for `item`: unroll its banner out of the disc for a moment.
    landed: (item) => win.webContents.send('bubble:landed', item),
    replyResult: (ok) => win.webContents.send('bubble:reply-result', Boolean(ok)),
    // Whether the disc (and the shield beneath an open stack) float over full-screen apps.
    setOverFullscreen: (on) => {
      joinAllSpaces(win, on);
      joinAllSpaces(shield, on);
    },
    setSettings: (s) => {
      lastSettings = s;
      win.webContents.send('bubble:settings', s);
      const next = BUBBLE_SIZES[s.bubbleSize] || BASE;
      if (next !== SIZE) resize(next);
    },
    resetPosition: () => {
      stopSnap();
      collapse();
      const p = defaultPosition(SIZE);
      moveTo(p.x, p.y);
    },
  };
}

module.exports = { createBubble };
