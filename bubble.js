const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const { isClick, clampToArea, fanLayout, snapToEdge } = require('./lib/layout');

const SIZE = 64;
const MARGIN = 16;

function defaultPosition() {
  const { workArea } = screen.getPrimaryDisplay();
  return { x: workArea.x + workArea.width - SIZE - MARGIN, y: workArea.y + workArea.height - SIZE - MARGIN };
}

// The main bubble's position (`anchor`) is the source of truth; the window grows around it
// when the fan of recent chats is expanded and shrinks back to SIZE×SIZE when collapsed.
function createBubble({ position, onClick, onMoved, onContextMenu, onOpenChat, onOpenInbox, onDismiss, dismiss }) {
  const start = position || defaultPosition();
  const anchor = clampToArea({ ...start, width: SIZE, height: SIZE }, screen.getDisplayNearestPoint(start).workArea);

  const win = new BrowserWindow({
    x: anchor.x, y: anchor.y, width: SIZE, height: SIZE,
    frame: false, transparent: true, hasShadow: false, resizable: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: true, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'bubble-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile('bubble.html');
  win.once('ready-to-show', () => win.showInactive());

  const bounds = () => ({ x: anchor.x, y: anchor.y, width: SIZE, height: SIZE });
  let expanded = false;

  function moveTo(x, y) {
    anchor.x = x;
    anchor.y = y;
    win.setPosition(x, y);
    onMoved({ x, y });
  }

  // Ease the bubble to a resting x (edge snap) over a few frames.
  function animateTo(targetX) {
    const startX = anchor.x;
    const y = anchor.y;
    const steps = 8;
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      const t = i / steps;
      const eased = 1 - (1 - t) * (1 - t);
      moveTo(Math.round(startX + (targetX - startX) * eased), y);
      if (i >= steps) clearInterval(timer);
    }, 12);
  }

  function collapse() {
    if (!expanded) return;
    expanded = false;
    win.webContents.send('bubble:fan', null);
    win.setBounds(bounds());
  }

  // Show `items` as a column next to the main bubble by growing the (non-activating) window.
  // Clicking the bubble again collapses it — handled by `collapsedOnPress` in the drag logic,
  // so we deliberately don't focus the window (a transparent panel can't hold focus, and the
  // resulting blur would collapse the fan the instant it opened).
  function expand(items) {
    const area = screen.getDisplayMatching(bounds()).workArea;
    const { direction, bounds: fanBounds } = fanLayout(bounds(), items.length + 1, area);
    expanded = true;
    win.setBounds(fanBounds);
    win.webContents.send('bubble:fan', { direction, items });
  }

  // While the mouse button is down we poll the cursor and move the window under it.
  let drag = null; // { timer, offsetX, offsetY, startX, startY, collapsedOnPress }
  const owns = (e) => e.sender === win.webContents;

  ipcMain.on('bubble:drag-start', (e) => {
    if (!owns(e) || drag) return;
    const collapsedOnPress = expanded;
    collapse();
    const cursor = screen.getCursorScreenPoint();
    drag = { offsetX: cursor.x - anchor.x, offsetY: cursor.y - anchor.y, startX: anchor.x, startY: anchor.y, collapsedOnPress, moved: false, timer: null };
    drag.timer = setInterval(() => {
      const c = screen.getCursorScreenPoint();
      // Keep the bubble fully on whichever display the cursor is over.
      const area = screen.getDisplayNearestPoint(c).workArea;
      const { x: nx, y: ny } = clampToArea({ x: c.x - drag.offsetX, y: c.y - drag.offsetY, width: SIZE, height: SIZE }, area);
      if (nx !== anchor.x || ny !== anchor.y) {
        if (!drag.moved && dismiss) dismiss.show(bounds()); // first real movement: reveal the ✕ target
        drag.moved = true;
        moveTo(nx, ny);
        if (dismiss) dismiss.setHot(dismiss.isOver(bounds()));
      }
    }, 16);
  });

  ipcMain.on('bubble:drag-end', (e) => {
    if (!owns(e) || !drag) return;
    clearInterval(drag.timer);
    const wasClick = isClick(anchor.x - drag.startX, anchor.y - drag.startY);
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
    if (wasClick && !collapsedOnPress) onClick();
  });

  ipcMain.on('bubble:context-menu', (e) => {
    if (owns(e)) onContextMenu();
  });
  ipcMain.on('bubble:open-chat', (e, href) => {
    if (!owns(e) || typeof href !== 'string') return;
    collapse();
    onOpenChat(href);
  });
  ipcMain.on('bubble:open-inbox', (e) => {
    if (!owns(e)) return;
    collapse();
    onOpenInbox();
  });

  return {
    win,
    expand,
    collapse,
    isExpanded: () => expanded,
    setBadge: (n) => win.webContents.send('bubble:badge', n),
    getBounds: bounds,
    resetPosition: () => {
      collapse();
      const p = defaultPosition();
      anchor.x = p.x;
      anchor.y = p.y;
      win.setPosition(p.x, p.y);
      onMoved(p);
    },
  };
}

module.exports = { createBubble };
