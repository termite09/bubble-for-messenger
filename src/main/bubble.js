const { screen, systemPreferences } = require('electron');
const { CHANNELS } = require('../lib/ipc');
const { clampToArea, snapToEdge, EDGE_MARGIN } = require('../lib/layout');
const { bubbleLayout, stackBounds, resizeAnchor, BASE } = require('../lib/bubble-layout');
const dragLib = require('../lib/drag');
const { isThreadHref } = require('../lib/recent');
const { validReply } = require('../lib/reply');
const { BUBBLE_SIZES } = require('../lib/settings');
const { CAPS } = require('../lib/platform');
const { joinAllSpaces } = require('./workspaces');
const { createFloatingWindow, ipcFor } = require('./floating-window');
const { createShield } = require('./shield');

const COLLAPSE_MS = 240; // the fold transition is 220ms
const CHECK_MS = 60 * 1000; // how often the bubble checks that it is still on screen
const PAGE_ANSWER_MS = 2000;
const noLog = { debug() {}, info() {}, warn() {}, error() {} };

// Where the page draws the disc, and how big the page is: whether the disc is on screen.
const PAGE_PROBE = `(() => {
  const r = document.getElementById('disc').getBoundingClientRect();
  return {
    innerWidth, innerHeight,
    disc: { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
    classes: document.body.className,
    visibility: document.visibilityState,
  };
})()`;
// A disc with no part inside the page's viewport is not on screen. A page that could not be
// asked says nothing either way.
const discInside = (page) => {
  if (!page || !page.disc) return true;
  const { left, top, width, height } = page.disc;
  return (
    width > 0 &&
    left < page.innerWidth &&
    left + width > 0 &&
    top < page.innerHeight &&
    top + height > 0
  );
};

// Reduce Motion: the disc goes to its edge without travelling there.
const reducedMotion = () => {
  try {
    return Boolean(systemPreferences.getAnimationSettings().prefersReducedMotion);
  } catch (e) {
    return false;
  }
};
// One tick per frame of the display at `point` (lib/drag frameInterval).
const tickAt = (point) =>
  dragLib.frameInterval(screen.getDisplayNearestPoint(point).displayFrequency);

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
  onPinToggle,
  onOpenChat,
  onOpenInbox,
  onDismiss,
  onReply,
  dismiss,
  overFullscreen = true,
  size = BASE,
  caps = CAPS,
  log = noLog,
}) {
  let over = overFullscreen;
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
    caps,
  });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.once('ready-to-show', () => {
    win.showInactive();
    applyBounds();
  });
  // What the page needs to know; a fresh document (startup, a reload) asks for it.
  let lastSettings = null;
  let lastPlatform = null; // lib/sites discState: the mark and the count
  let lastActive = null;
  let lastStatus = { connection: 'online', signedOut: false };
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

  // Every push to the page goes through here: none after the window is gone (the app quitting
  // while a page still reports).
  const send = (channel, ...args) => {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args);
  };

  const bounds = () => ({ x: anchor.x, y: anchor.y, width: SIZE, height: SIZE });
  const area = () => screen.getDisplayMatching(bounds()).workArea;
  let expanded = false;
  // A focused panel is showing: it hears a click elsewhere itself (it blurs, and the stack
  // folds with it), so the shield stays out of the way and the click reaches the app it was
  // meant for. Only a stack with no panel needs the shield.
  let panelFocused = false;
  let animGen = 0; // guards the deferred collapse shrink against a rapid re-expand
  let fanCount = 0; // rows currently in the fan (incl. the inbox entry)
  let replying = false; // the landed banner has grown its reply row (keyboard focus is lent)
  let bannerExtra = 0; // page px the landed banner needs beyond the disc row

  const layout = () =>
    bubbleLayout({ anchor, size: SIZE, scale, fanCount, bannerExtra, area: area() });

  // The page is told its layout when it changes: a drag moves the window every frame, while
  // where the disc sits inside it changes only when it crosses to another edge or direction.
  // (A fresh document asks for it in the state handshake.)
  let sentLayout = '';
  function applyBounds() {
    const l = layout();
    win.setBounds(l.window);
    const key = JSON.stringify(l.renderer);
    if (key !== sentLayout) {
      sentLayout = key;
      send(CHANNELS.BUBBLE_LAYOUT, l.renderer);
    }
    return l;
  }

  function moveTo(x, y) {
    anchor.x = x;
    anchor.y = y;
    applyBounds();
    onMoved({ x, y });
  }

  // Ease the disc to a resting x (edge snap) on the system curve, its place read off the clock
  // each frame (lib/drag snapX) — or, under Reduce Motion, put it there. A new drag or a
  // position reset cancels it so the two never fight over the anchor.
  let snapTimer = null;
  const stopSnap = () => {
    clearInterval(snapTimer);
    snapTimer = null;
  };
  function animateTo(targetX) {
    stopSnap();
    const startX = anchor.x;
    const y = anchor.y;
    if (reducedMotion() || startX === targetX) {
      if (startX !== targetX) moveTo(targetX, y);
      return;
    }
    const start = Date.now();
    snapTimer = setInterval(() => {
      const elapsed = Date.now() - start;
      moveTo(dragLib.snapX(startX, targetX, elapsed), y);
      if (elapsed >= dragLib.SNAP_MS) stopSnap();
    }, tickAt(anchor));
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
      send(CHANNELS.BUBBLE_FAN, { animate: 'clear' });
      fanCount = 0;
      return;
    }
    send(CHANNELS.BUBBLE_FAN, { animate: 'out' });
    // Let the fold play, then drop the rows and shrink the window. Sizing on fanCount (not
    // `expanded`) keeps the window large while rows still take layout height.
    setTimeout(() => {
      if (gen !== animGen || expanded) return;
      send(CHANNELS.BUBBLE_FAN, { animate: 'clear' });
      fanCount = 0;
      applyBounds();
    }, COLLAPSE_MS);
  }

  // Show `items` as a stack of banners by growing the (non-activating) window. Clicking the
  // disc again collapses it — a press that folded the stack is done, see lib/drag.
  function expand(items, animate = true) {
    animGen += 1;
    const fixed = 1; // the inbox head
    fanCount = items.length + fixed;
    expanded = true;
    let l = applyBounds();
    // No room for every row: keep the inbox head and the rows nearest it, and say how many
    // are left out.
    let hidden = 0;
    if (l.shown < fanCount) {
      const kept = items.slice(Math.max(0, items.length - Math.max(0, l.shown - fixed)));
      hidden = items.length - kept.length;
      items = kept;
      fanCount = items.length + fixed;
      l = applyBounds();
    }
    if (!panelFocused) shield.show(screen.getDisplayMatching(bounds()).bounds);
    // 'in' plays the deploy; 'update' just swaps the contents (used by the periodic refresh).
    send(CHANNELS.BUBBLE_FAN, {
      animate: animate ? 'in' : 'update',
      items,
      hidden,
    });
  }

  // While the mouse button is down the cursor is sampled and the disc moved under it; what a
  // sample means is lib/drag.
  let drag = null; // lib/drag state while pressed
  let dragTimer = null;
  let dragState = 'idle'; // what the ✕ target was last told
  function endDrag() {
    clearInterval(dragTimer);
    dragTimer = null;
    drag = null;
    dragState = 'idle';
  }

  const ipc = ipcFor(win);
  ipc.handle(CHANNELS.BUBBLE_STATE, () => ({
    status: lastStatus,
    settings: lastSettings,
    layout: layout().renderer,
    platform: lastPlatform,
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
    const pressedAt = screen.getCursorScreenPoint();
    drag = dragLib.press({ cursor: pressedAt, anchor, expanded: wasExpanded });
    dragTimer = setInterval(() => {
      const cursor = screen.getCursorScreenPoint();
      // Keep the disc fully on whichever display the cursor is over.
      const now = Date.now();
      const step = dragLib.move(drag, {
        cursor,
        anchor,
        size: SIZE,
        area: screen.getDisplayNearestPoint(cursor).workArea,
        overDismiss: (p) => Boolean(dismiss) && dismiss.isOver({ ...p, width: SIZE, height: SIZE }),
        now,
      });
      drag = step.drag;
      if (step.becameDrag && dismiss) dismiss.show(bounds()); // first real movement: reveal the ✕ target
      if (step.position) moveTo(step.position.x, step.position.y);
      // The target arms once the disc has rested on it: 'arming' while it waits, then 'armed'.
      const state = !drag.hot ? 'idle' : dragLib.armed(drag, now) ? 'armed' : 'arming';
      if (state !== dragState && dismiss) dismiss.setHot(state);
      dragState = state;
    }, tickAt(pressedAt));
  });

  ipc.on(CHANNELS.BUBBLE_DRAG_END, () => {
    if (!drag) return;
    const outcome = dragLib.release(drag, {
      overDismiss: Boolean(dismiss) && dismiss.isOver(bounds()),
      now: Date.now(),
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
  ipc.on(CHANNELS.BUBBLE_PIN_TOGGLE, (href) => {
    if (isThreadHref(href)) onPinToggle(href);
  });
  ipc.on(CHANNELS.BUBBLE_CONTEXT_MENU, () => onContextMenu());
  // The stack stays open after picking a chat — or the inbox — so the next conversation is
  // one click away; the panel opens beyond the banners.
  ipc.on(CHANNELS.BUBBLE_OPEN_CHAT, (href) => {
    if (isThreadHref(href)) onOpenChat(href);
  });
  ipc.on(CHANNELS.BUBBLE_OPEN_INBOX, () => onOpenInbox());
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

  // ---- Still on screen? ------------------------------------------------------------------------
  // A report (Nov 2026) of the bubble vanishing until a relaunch, with nothing in the log. Once a
  // minute the bubble looks at itself — its own window and page, nothing of Messenger's — and
  // when it is not showing (the window hidden, or the disc drawn outside it) logs what it found
  // and recovers it. Opening Bubble again (main.js second-instance) recovers it too.
  async function snapshot() {
    let timer;
    const page = await Promise.race([
      win.webContents.executeJavaScript(PAGE_PROBE).catch(() => null),
      new Promise((resolve) => (timer = setTimeout(resolve, PAGE_ANSWER_MS, 'no answer'))),
    ]).finally(() => clearTimeout(timer));
    return {
      visible: win.isVisible(),
      bounds: win.getBounds(),
      anchor: { ...anchor },
      expanded,
      page,
    };
  }
  // Not showing: say what was found, and put it back — whatever the cause, the bubble is not
  // left gone until a relaunch.
  async function check() {
    if (win.isDestroyed()) return;
    const state = await snapshot();
    if (state.visible && discInside(state.page)) return;
    log.warn('bubble not showing', state);
    await recover('check');
  }
  const checkTimer = setInterval(() => check().catch(() => {}), CHECK_MS);
  if (checkTimer.unref) checkTimer.unref();
  win.on('closed', () => clearInterval(checkTimer));

  async function recover(by) {
    if (win.isDestroyed()) return;
    const before = await snapshot();
    // Onto the desktop in front (joining every Space for a moment does that), then the setting.
    joinAllSpaces(win, true, caps);
    joinAllSpaces(win, over, caps);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.showInactive();
    sentLayout = ''; // the page is told where the disc is, whatever it was told before
    applyBounds();
    log.info('bubble recovered', { by, before });
  }

  return {
    win,
    check,
    recover,
    expand,
    collapse,
    isExpanded: () => expanded,
    setPanelFocused(on) {
      panelFocused = on;
      if (on) shield.hide();
      else if (expanded) shield.show(screen.getDisplayMatching(bounds()).bounds);
    },
    // The mark the disc shows, with its count.
    setPlatform: (state) => {
      lastPlatform = state;
      send(CHANNELS.BUBBLE_PLATFORM, state);
    },
    getBounds: bounds,
    // The rect a panel should sit beside: the head column (disc plus stack) while it is open,
    // otherwise just the disc.
    getStackBounds: () =>
      stackBounds({ anchor, size: SIZE, scale, fanCount, bannerExtra, area: area() }),
    // The chat the page was asked for is now showing: its head stops looking busy.
    opened: () => send(CHANNELS.BUBBLE_OPENED),
    // Whether Messenger is reachable, and whether anyone is signed in.
    setStatus: (status) => {
      lastStatus = status;
      send(CHANNELS.BUBBLE_STATUS, status);
    },
    setActive: (href) => {
      lastActive = href;
      send(CHANNELS.BUBBLE_ACTIVE, href);
    },
    // A message just arrived for `item`: unroll its banner out of the disc for a moment.
    landed: (item) => send(CHANNELS.BUBBLE_LANDED, item),
    replyResult: (ok) => send(CHANNELS.BUBBLE_REPLY_RESULT, Boolean(ok)),
    // Whether the disc (and the shield beneath an open stack) float over full-screen apps.
    setOverFullscreen: (on) => {
      over = on;
      joinAllSpaces(win, on, caps);
      shield.setOverFullscreen(on);
    },
    setSettings: (s) => {
      lastSettings = s;
      send(CHANNELS.BUBBLE_SETTINGS, s);
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
