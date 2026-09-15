const { screen } = require('electron');
const { CHANNELS } = require('../lib/ipc');
const { clampToArea, snapToEdge, EDGE_MARGIN } = require('../lib/layout');
const { bubbleLayout, stackBounds, resizeAnchor, BASE } = require('../lib/bubble-layout');
const dragLib = require('../lib/drag');
const { isThreadHref } = require('../lib/recent');
const { validReply } = require('../lib/reply');
const { BUBBLE_SIZES } = require('../lib/settings');
const { joinAllSpaces } = require('./workspaces');
const { createFloatingWindow, ipcFor } = require('./floating-window');
const { createShield } = require('./shield');

const DRAG_TICK_MS = 16;
const COLLAPSE_MS = 240; // the fold transition is 220ms

function defaultPosition(size) {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + workArea.width - size - EDGE_MARGIN,
    y: workArea.y + workArea.height - size - EDGE_MARGIN,
  };
}

// The disc's position (`anchor`) is the source of truth. The window around it is transparent
// padding (room for shadows and the count pill) plus whatever is showing: the stack above or
// below the disc and the "message landed" banner. Clicks fall through the padding: the page
// reports when the cursor is over a card. The geometry is lib/bubble-layout, the press/drag/
// release rules lib/drag; this module owns the window, the timers and the IPC.
function createBubble({
  position,
  onClick,
  onClose,
  onMoved,
  onContextMenu,
  onHeadMenu,
  onOpenChat,
  onOpenInbox,
  onDismiss,
  onReply,
  dismiss,
  overFullscreen = true,
  size = BASE,
}) {
  let SIZE = size; // the disc, on screen
  let scale = SIZE / BASE; // page zoom: the page is drawn for a BASE-px disc
  const start = position || defaultPosition(SIZE);
  const anchor = clampToArea(
    { ...start, width: SIZE, height: SIZE },
    screen.getDisplayNearestPoint(start).workArea,
  );

  const win = createFloatingWindow({
    level: 'screen-saver',
    x: anchor.x,
    y: anchor.y,
    width: SIZE,
    height: SIZE,
    focusable: false,
    overFullscreen,
    page: 'bubble.html',
    preload: 'bubble-preload.js',
    webPreferences: { zoomFactor: scale, webgl: false },
  });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.once('ready-to-show', () => {
    win.showInactive();
    applyBounds();
  });
  // What the page needs to know; a fresh document (startup, a reload) asks for it.
  let lastSettings = null;
  let lastBadge = 0;
  let lastActive = null;
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(scale);
    endDrag(); // a press the old document never released
  });

  const shield = createShield({
    overFullscreen,
    onPress: () => {
      collapse();
      onClose('shield');
    },
  });

  const bounds = () => ({ x: anchor.x, y: anchor.y, width: SIZE, height: SIZE });
  const area = () => screen.getDisplayMatching(bounds()).workArea;
  let expanded = false;
  let animGen = 0; // guards the deferred collapse shrink against a rapid re-expand
  let fanCount = 0; // rows currently in the fan (incl. the inbox entry)
  let replying = false; // the landed banner has grown its reply row (keyboard focus is lent)
  let bannerExtra = 0; // page px the landed banner needs beyond the disc row

  const layout = () =>
    bubbleLayout({ anchor, size: SIZE, scale, fanCount, bannerExtra, area: area() });

  function applyBounds() {
    const l = layout();
    win.setBounds(l.window);
    win.webContents.send(CHANNELS.BUBBLE_LAYOUT, l.renderer);
    return l;
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
  const stopSnap = () => {
    clearInterval(snapTimer);
    snapTimer = null;
  };
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

  // A new disc size: the page zooms; where the disc goes is lib/bubble-layout resizeAnchor. The
  // stack (and any chat beside it) goes away with the old size, as for a click on the disc.
  function resize(next) {
    stopSnap();
    if (expanded) {
      collapse(true);
      onClose('resize');
    }
    const at = resizeAnchor(anchor, SIZE, next, area());
    SIZE = next;
    scale = SIZE / BASE;
    win.webContents.setZoomFactor(scale);
    moveTo(at.x, at.y);
  }

  // Fold the stack away. `immediate` skips the fold for a change the window is about to be
  // re-laid-out for anyway (a resize, a position reset), so the geometry that follows sees no
  // rows rather than rows that vanish 240ms later.
  function collapse(immediate = false) {
    if (!expanded) return;
    expanded = false;
    shield.hide();
    const gen = ++animGen;
    if (immediate) {
      win.webContents.send(CHANNELS.BUBBLE_FAN, { animate: 'clear' });
      fanCount = 0;
      return;
    }
    win.webContents.send(CHANNELS.BUBBLE_FAN, { animate: 'out' });
    // Let the fold play, then drop the rows and shrink the window. Sizing on fanCount (not
    // `expanded`) keeps the window large while rows still take layout height.
    setTimeout(() => {
      if (gen !== animGen || expanded) return;
      win.webContents.send(CHANNELS.BUBBLE_FAN, { animate: 'clear' });
      fanCount = 0;
      applyBounds();
    }, COLLAPSE_MS);
  }

  // Show `items` as a stack of banners by growing the (non-activating) window. Clicking the
  // disc again collapses it — a press that folded the stack is done, see lib/drag.
  function expand(items, animate = true) {
    animGen += 1;
    fanCount = items.length + 1;
    expanded = true;
    let l = applyBounds();
    // No room for every row: keep the inbox head and the rows nearest it.
    if (l.shown < fanCount) {
      items = items.slice(Math.max(0, items.length - Math.max(0, l.shown - 1)));
      fanCount = items.length + 1;
      l = applyBounds();
    }
    shield.show(screen.getDisplayMatching(bounds()).bounds);
    // 'in' plays the deploy; 'update' just swaps the contents (used by the periodic refresh).
    win.webContents.send(CHANNELS.BUBBLE_FAN, { animate: animate ? 'in' : 'update', items });
  }

  // While the mouse button is down the cursor is sampled and the disc moved under it; what a
  // sample means is lib/drag.
  let drag = null; // lib/drag state while pressed
  let dragTimer = null;
  function endDrag() {
    clearInterval(dragTimer);
    dragTimer = null;
    drag = null;
  }

  const ipc = ipcFor(win);
  ipc.handle(CHANNELS.BUBBLE_STATE, () => ({
    settings: lastSettings,
    layout: layout().renderer,
    badge: lastBadge,
    active: lastActive,
  }));

  ipc.on(CHANNELS.BUBBLE_DRAG_START, () => {
    if (drag) return;
    stopSnap();
    const wasExpanded = expanded;
    if (expanded) {
      collapse();
      onClose('disc');
    }
    drag = dragLib.press({ cursor: screen.getCursorScreenPoint(), anchor, expanded: wasExpanded });
    dragTimer = setInterval(() => {
      const cursor = screen.getCursorScreenPoint();
      // Keep the disc fully on whichever display the cursor is over.
      const step = dragLib.move(drag, {
        cursor,
        anchor,
        size: SIZE,
        area: screen.getDisplayNearestPoint(cursor).workArea,
        overDismiss: (p) => Boolean(dismiss) && dismiss.isOver({ ...p, width: SIZE, height: SIZE }),
      });
      drag = step.drag;
      if (step.becameDrag && dismiss) dismiss.show(bounds()); // first real movement: reveal the ✕ target
      if (step.position) moveTo(step.position.x, step.position.y);
      if (step.hotChanged && dismiss) dismiss.setHot(drag.hot);
    }, DRAG_TICK_MS);
  });

  ipc.on(CHANNELS.BUBBLE_DRAG_END, () => {
    if (!drag) return;
    const outcome = dragLib.release(drag, {
      overDismiss: Boolean(dismiss) && dismiss.isOver(bounds()),
    });
    endDrag();
    if (dismiss) dismiss.hide();
    if (outcome === 'dismiss') onDismiss();
    else if (outcome === 'snap')
      animateTo(snapToEdge(bounds(), area()).x); // rest against the nearer edge
    else if (outcome === 'click') onClick();
  });

  ipc.on(CHANNELS.BUBBLE_HEAD_MENU, (href) => {
    if (isThreadHref(href)) onHeadMenu(href);
  });
  ipc.on(CHANNELS.BUBBLE_CONTEXT_MENU, () => onContextMenu());
  // The stack stays open after picking a chat, so the next conversation is one click away;
  // the panel opens beyond the banners.
  ipc.on(CHANNELS.BUBBLE_OPEN_CHAT, (href) => {
    if (isThreadHref(href)) onOpenChat(href);
  });
  ipc.on(CHANNELS.BUBBLE_OPEN_INBOX, () => {
    collapse();
    onOpenInbox();
  });
  // The window is mostly transparent padding; only pass clicks through when over a card.
  ipc.on(CHANNELS.BUBBLE_HIT, (over) => win.setIgnoreMouseEvents(!over, { forward: true }));
  // The window is non-focusable so it never takes the keyboard from the user's work. The reply
  // field is the one exception: focus is lent when it opens and taken back when it closes.
  ipc.on(CHANNELS.BUBBLE_REPLY_FOCUS, (on) => {
    replying = Boolean(on);
    win.setFocusable(replying);
    if (replying) win.focus();
  });
  // The page measures the banner whenever it changes and reports what it needs beyond the disc
  // row; the window makes that room on the side the banner grows toward.
  ipc.on(CHANNELS.BUBBLE_BANNER_EXTRA, (px) => {
    const next = Math.max(0, Math.min(600, Number(px) || 0));
    if (next === bannerExtra) return;
    bannerExtra = next;
    applyBounds();
  });
  ipc.on(CHANNELS.BUBBLE_REPLY, (href, text) => {
    if (validReply(href, text)) onReply(href, text.trim());
  });

  // A display went away or changed shape: keep the disc on a screen.
  const reclamp = () => {
    const at = clampToArea(bounds(), screen.getDisplayNearestPoint(anchor).workArea);
    if (at.x !== anchor.x || at.y !== anchor.y) moveTo(at.x, at.y);
    else applyBounds();
  };
  screen.on('display-removed', reclamp);
  screen.on('display-metrics-changed', reclamp);

  return {
    win,
    expand,
    collapse,
    isExpanded: () => expanded,
    setBadge: (n) => {
      if (n === lastBadge) return;
      lastBadge = n;
      win.webContents.send(CHANNELS.BUBBLE_BADGE, n);
    },
    getBounds: bounds,
    // The rect a panel should sit beside: the head column (disc plus stack) while it is open,
    // otherwise just the disc.
    getStackBounds: () =>
      stackBounds({ anchor, size: SIZE, scale, fanCount, bannerExtra, area: area() }),
    // The chat the page was asked for is now showing: its head stops looking busy.
    opened: () => win.webContents.send(CHANNELS.BUBBLE_OPENED),
    setActive: (href) => {
      lastActive = href;
      win.webContents.send(CHANNELS.BUBBLE_ACTIVE, href);
    },
    // A message just arrived for `item`: unroll its banner out of the disc for a moment.
    landed: (item) => win.webContents.send(CHANNELS.BUBBLE_LANDED, item),
    replyResult: (ok) => win.webContents.send(CHANNELS.BUBBLE_REPLY_RESULT, Boolean(ok)),
    // Whether the disc (and the shield beneath an open stack) float over full-screen apps.
    setOverFullscreen: (on) => {
      joinAllSpaces(win, on);
      shield.setOverFullscreen(on);
    },
    setSettings: (s) => {
      lastSettings = s;
      win.webContents.send(CHANNELS.BUBBLE_SETTINGS, s);
      const next = BUBBLE_SIZES[s.bubbleSize] || BASE;
      if (next !== SIZE) resize(next);
    },
    resetPosition: () => {
      stopSnap();
      if (expanded) {
        collapse(true);
        onClose('reset');
      }
      const p = defaultPosition(SIZE);
      moveTo(p.x, p.y);
    },
  };
}

module.exports = { createBubble };
