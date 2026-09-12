const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const { isClick, clampToArea } = require('./lib/layout');

const SIZE = 64;
const MARGIN = 16;

function defaultPosition() {
  const { workArea } = screen.getPrimaryDisplay();
  return { x: workArea.x + workArea.width - SIZE - MARGIN, y: workArea.y + workArea.height - SIZE - MARGIN };
}

function createBubble({ position, onClick, onMoved, onContextMenu }) {
  const start = position || defaultPosition();
  const area = screen.getDisplayNearestPoint(start).workArea;
  const { x, y } = clampToArea({ ...start, width: SIZE, height: SIZE }, area);

  const win = new BrowserWindow({
    x, y, width: SIZE, height: SIZE,
    frame: false, transparent: true, hasShadow: false, resizable: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false,
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

  // While the mouse button is down we poll the cursor and move the window under it.
  let drag = null; // { timer, offsetX, offsetY, startX, startY }
  const owns = (e) => e.sender === win.webContents;

  ipcMain.on('bubble:drag-start', (e) => {
    if (!owns(e) || drag) return;
    const cursor = screen.getCursorScreenPoint();
    const [wx, wy] = win.getPosition();
    drag = { offsetX: cursor.x - wx, offsetY: cursor.y - wy, startX: wx, startY: wy, timer: null };
    drag.timer = setInterval(() => {
      const c = screen.getCursorScreenPoint();
      // Keep the bubble fully on whichever display the cursor is over.
      const area = screen.getDisplayNearestPoint(c).workArea;
      const { x: nx, y: ny } = clampToArea({ x: c.x - drag.offsetX, y: c.y - drag.offsetY, width: SIZE, height: SIZE }, area);
      const [cx, cy] = win.getPosition();
      if (nx !== cx || ny !== cy) {
        win.setPosition(nx, ny);
        onMoved({ x: nx, y: ny });
      }
    }, 16);
  });

  ipcMain.on('bubble:drag-end', (e) => {
    if (!owns(e) || !drag) return;
    clearInterval(drag.timer);
    const [x2, y2] = win.getPosition();
    const wasClick = isClick(x2 - drag.startX, y2 - drag.startY);
    drag = null;
    if (wasClick) onClick();
  });

  ipcMain.on('bubble:context-menu', (e) => {
    if (owns(e)) onContextMenu();
  });

  return {
    win,
    setBadge: (n) => win.webContents.send('bubble:badge', n),
    getBounds: () => win.getBounds(),
    resetPosition: () => {
      const p = defaultPosition();
      win.setPosition(p.x, p.y);
      onMoved(p);
    },
  };
}

module.exports = { createBubble };
