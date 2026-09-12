# Bubble Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dock window with a floating always-on-top bubble that opens a compact Messenger panel beside it and shows an unread badge.

**Architecture:** Electron main process owns two windows: a tiny transparent `BrowserWindow` (the bubble, `bubble.js`) and a hidden-by-default frameless `BrowserWindow` loading messenger.com (the panel, `panel.js`). Pure layout/parsing logic lives in `lib/` and is unit-tested with `node --test`; window behaviour is wired in `main.js`.

**Tech Stack:** Electron 33, Node 24, `node --test` (built-in runner). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-12-bubble-mode-design.md`

## Global Constraints

- No new npm dependencies.
- `contextIsolation: true`, `nodeIntegration: false` on every window (existing convention).
- Bubble is 56×56 px content inside a 64×64 window (4 px margin for badge overflow); panel default 420×640, min 360×480.
- Click vs drag threshold: 4 px. Blur guard: 200 ms.
- Remove `counterapi.dev` ping, GitHub update check, welcome window.

---

### Task 1: Pure helpers — `lib/unread.js`, `lib/layout.js`

**Files:**
- Create: `lib/unread.js`, `lib/layout.js`, `test/unread.test.js`, `test/layout.test.js`
- Modify: `package.json` (add `"test": "node --test"`)

**Interfaces:**
- Produces: `unreadFromTitle(title: string): number`
- Produces: `panelPosition(bubble: Rect, workArea: Rect, panel: {width,height}): {x,y}`; `clampToArea(rect: Rect, workArea: Rect): {x,y}`; `isClick(dx: number, dy: number): boolean`. `Rect = {x,y,width,height}`.

- [ ] **Step 1: Write failing tests**

```js
// test/unread.test.js
const test = require('node:test');
const assert = require('node:assert');
const { unreadFromTitle } = require('../lib/unread');

test('plain title has no unread', () => assert.equal(unreadFromTitle('Messenger'), 0));
test('parses count prefix', () => assert.equal(unreadFromTitle('(3) Messenger'), 3));
test('parses count with conversation name', () => assert.equal(unreadFromTitle('(12) Alex | Messenger'), 12));
test('parses overflow marker', () => assert.equal(unreadFromTitle('(20+) Messenger'), 20));
test('tolerates empty/undefined', () => { assert.equal(unreadFromTitle(''), 0); assert.equal(unreadFromTitle(undefined), 0); });
```

```js
// test/layout.test.js
const test = require('node:test');
const assert = require('node:assert');
const { panelPosition, clampToArea, isClick } = require('../lib/layout');

const area = { x: 0, y: 0, width: 1440, height: 900 };
const panel = { width: 420, height: 640 };

test('panel opens to the right of the bubble by default', () => {
  const p = panelPosition({ x: 100, y: 100, width: 64, height: 64 }, area, panel);
  assert.deepEqual(p, { x: 172, y: 100 });
});
test('panel flips to the left near the right edge', () => {
  const p = panelPosition({ x: 1350, y: 100, width: 64, height: 64 }, area, panel);
  assert.deepEqual(p, { x: 922, y: 100 });
});
test('panel shifts up near the bottom edge', () => {
  const p = panelPosition({ x: 100, y: 800, width: 64, height: 64 }, area, panel);
  assert.deepEqual(p, { x: 172, y: 260 });
});
test('panel respects a display whose origin is not 0,0', () => {
  const p = panelPosition({ x: 1500, y: 50, width: 64, height: 64 }, { x: 1440, y: 0, width: 1440, height: 900 }, panel);
  assert.deepEqual(p, { x: 1572, y: 50 });
});
test('clampToArea keeps a rect on screen', () => {
  assert.deepEqual(clampToArea({ x: -50, y: 2000, width: 64, height: 64 }, area), { x: 0, y: 836 });
  assert.deepEqual(clampToArea({ x: 10, y: 10, width: 64, height: 64 }, area), { x: 10, y: 10 });
});
test('isClick uses a 4px threshold', () => {
  assert.equal(isClick(3, 0), true);
  assert.equal(isClick(0, 4), true);
  assert.equal(isClick(5, 0), false);
});
```

- [ ] **Step 2: Run `npm test`** → FAIL (module not found)

- [ ] **Step 3: Implement**

```js
// lib/unread.js
// messenger.com sets the tab title to "(N) Messenger" / "(N) Name | Messenger" when unread.
function unreadFromTitle(title) {
  const m = /^\((\d+)\+?\)/.exec(String(title || '').trim());
  return m ? parseInt(m[1], 10) : 0;
}
module.exports = { unreadFromTitle };
```

```js
// lib/layout.js
const GAP = 8;
const CLICK_THRESHOLD = 4;

function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

function clampToArea(rect, area) {
  return {
    x: Math.round(clamp(rect.x, area.x, area.x + area.width - rect.width)),
    y: Math.round(clamp(rect.y, area.y, area.y + area.height - rect.height)),
  };
}

// Place the panel beside the bubble: right if it fits, else left; top-aligned, shifted up at the bottom edge.
function panelPosition(bubble, area, panel) {
  let x = bubble.x + bubble.width + GAP;
  if (x + panel.width > area.x + area.width) x = bubble.x - GAP - panel.width;
  return clampToArea({ x, y: bubble.y, width: panel.width, height: panel.height }, area);
}

function isClick(dx, dy) {
  return Math.abs(dx) <= CLICK_THRESHOLD && Math.abs(dy) <= CLICK_THRESHOLD;
}

module.exports = { panelPosition, clampToArea, isClick, GAP, CLICK_THRESHOLD };
```

Add to `package.json` scripts: `"test": "node --test"`.

- [ ] **Step 4: Run `npm test`** → all PASS
- [ ] **Step 5: Commit** — `feat: pure helpers for unread parsing and panel layout`

---

### Task 2: Bubble window — `bubble.html`, `bubble-preload.js`, `bubble.js`

**Files:**
- Create: `bubble.html`, `bubble-preload.js`, `bubble.js`

**Interfaces:**
- Consumes: `isClick`, `clampToArea` from `lib/layout.js`.
- Produces: `createBubble({ position, onClick, onMoved, onContextMenu }) → { win, setBadge(n), getBounds(), setPosition(x,y) }`.
  - `position`: `{x,y} | null` (null → bottom-right of primary display).
  - `onClick()` fires on a mouseup with movement ≤ 4 px. `onMoved({x,y})` fires after every drag step. `onContextMenu()` fires on right-click.

- [ ] **Step 1: `bubble.html`**

```html
<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  html, body { margin: 0; background: transparent; overflow: hidden; user-select: none; -webkit-user-select: none; }
  #bubble { position: absolute; left: 4px; top: 4px; width: 56px; height: 56px; border-radius: 50%;
            overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.35); cursor: default; }
  #bubble img { width: 100%; height: 100%; display: block; -webkit-user-drag: none; pointer-events: none; }
  #badge { position: absolute; right: 0; top: 0; min-width: 20px; height: 20px; padding: 0 6px; box-sizing: border-box;
           border-radius: 10px; background: #ff3b30; color: #fff; font: 600 12px/20px -apple-system, sans-serif;
           text-align: center; border: 2px solid #fff; display: none; }
  #badge.visible { display: block; }
</style></head>
<body>
  <div id="bubble"><img src="icon.png" alt=""></div>
  <div id="badge"></div>
  <script>
    const bubble = document.getElementById('bubble');
    const badge = document.getElementById('badge');
    bubble.addEventListener('mousedown', (e) => { if (e.button === 0) window.bubble.dragStart(); });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) window.bubble.dragEnd(); });
    window.addEventListener('blur', () => window.bubble.dragEnd());
    bubble.addEventListener('contextmenu', (e) => { e.preventDefault(); window.bubble.contextMenu(); });
    window.bubble.onBadge((n) => {
      badge.textContent = n > 9 ? '9+' : String(n);
      badge.classList.toggle('visible', n > 0);
    });
  </script>
</body></html>
```

- [ ] **Step 2: `bubble-preload.js`**

```js
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bubble', {
  dragStart: () => ipcRenderer.send('bubble:drag-start'),
  dragEnd: () => ipcRenderer.send('bubble:drag-end'),
  contextMenu: () => ipcRenderer.send('bubble:context-menu'),
  onBadge: (cb) => ipcRenderer.on('bubble:badge', (_e, n) => cb(n)),
});
```

- [ ] **Step 3: `bubble.js`** — drag is done by polling the cursor from main while the mouse is down (CSS drag regions swallow clicks on macOS).

```js
const { BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const { isClick, clampToArea } = require('./lib/layout');

const SIZE = 64;

function defaultPosition() {
  const { workArea } = screen.getPrimaryDisplay();
  return { x: workArea.x + workArea.width - SIZE - 16, y: workArea.y + workArea.height - SIZE - 16 };
}

function createBubble({ position, onClick, onMoved, onContextMenu }) {
  const start = position || defaultPosition();
  const area = screen.getDisplayNearestPoint(start).workArea;
  const { x, y } = clampToArea({ ...start, width: SIZE, height: SIZE }, area);

  const win = new BrowserWindow({
    x, y, width: SIZE, height: SIZE,
    frame: false, transparent: true, hasShadow: false, resizable: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'bubble-preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile('bubble.html');
  win.once('ready-to-show', () => win.showInactive());

  let drag = null; // { timer, offsetX, offsetY, startX, startY }
  const owns = (e) => e.sender === win.webContents;

  ipcMain.on('bubble:drag-start', (e) => {
    if (!owns(e) || drag) return;
    const cursor = screen.getCursorScreenPoint();
    const [wx, wy] = win.getPosition();
    drag = { offsetX: cursor.x - wx, offsetY: cursor.y - wy, startX: wx, startY: wy, timer: null };
    drag.timer = setInterval(() => {
      const c = screen.getCursorScreenPoint();
      const nx = c.x - drag.offsetX, ny = c.y - drag.offsetY;
      const [cx, cy] = win.getPosition();
      if (nx !== cx || ny !== cy) { win.setPosition(nx, ny); onMoved({ x: nx, y: ny }); }
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

  ipcMain.on('bubble:context-menu', (e) => { if (owns(e)) onContextMenu(); });

  return {
    win,
    setBadge: (n) => win.webContents.send('bubble:badge', n),
    getBounds: () => win.getBounds(),
    setPosition: (px, py) => { win.setPosition(px, py); onMoved({ x: px, y: py }); },
    resetPosition: () => { const p = defaultPosition(); win.setPosition(p.x, p.y); onMoved(p); },
  };
}

module.exports = { createBubble };
```

- [ ] **Step 4: Commit** — `feat: floating bubble window with drag, click and badge`

---

### Task 3: Messenger panel — `panel.js`

**Files:**
- Create: `panel.js`
- Modify: `preload.js` (unchanged content; reused by the panel)

**Interfaces:**
- Consumes: `panelPosition` from `lib/layout.js`; `unreadFromTitle` from `lib/unread.js`.
- Produces: `createPanel({ onUnread }) → { win, toggle(bubbleBounds), showAt(bubbleBounds), hide(), follow(bubbleBounds), reload(), isVisible() }`. `onUnread(n)` called on every title change.

- [ ] **Step 1: `panel.js`**

```js
const { BrowserWindow, shell, screen } = require('electron');
const path = require('path');
const { panelPosition } = require('./lib/layout');
const { unreadFromTitle } = require('./lib/unread');

const BLUR_GUARD_MS = 200;

// l.messenger.com / l.facebook.com wrap outbound links; unwrap to the real URL.
function externalUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'l.messenger.com' || u.hostname === 'l.facebook.com') return u.searchParams.get('u');
  } catch (e) {}
  return null;
}
const isInternal = (url) => url.includes('messenger.com') && !url.includes('l.messenger.com');

function createPanel({ onUnread }) {
  const win = new BrowserWindow({
    width: 420, height: 640, minWidth: 360, minHeight: 480,
    show: false, frame: false, alwaysOnTop: true, skipTaskbar: true,
    roundedCorners: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadURL('https://www.messenger.com');

  let lastBlur = 0;
  win.on('blur', () => { lastBlur = Date.now(); win.hide(); });

  win.webContents.on('page-title-updated', (_e, title) => onUnread(unreadFromTitle(title)));

  win.webContents.setWindowOpenHandler(({ url }) => {
    const ext = externalUrl(url);
    if (ext || !isInternal(url)) { shell.openExternal(ext || url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const ext = externalUrl(url);
    if (ext || !isInternal(url)) { event.preventDefault(); shell.openExternal(ext || url); }
  });

  function place(bubbleBounds) {
    const area = screen.getDisplayMatching(bubbleBounds).workArea;
    const [w, h] = win.getSize();
    const { x, y } = panelPosition(bubbleBounds, area, { width: w, height: h });
    win.setPosition(x, y);
  }

  const api = {
    win,
    isVisible: () => win.isVisible(),
    showAt(bubbleBounds) { place(bubbleBounds); win.show(); win.focus(); },
    hide() { win.hide(); },
    follow(bubbleBounds) { if (win.isVisible()) place(bubbleBounds); },
    reload() { win.webContents.reload(); },
    toggle(bubbleBounds) {
      // A bubble click that just blurred (and hid) the panel must not reopen it.
      if (Date.now() - lastBlur < BLUR_GUARD_MS) return;
      if (win.isVisible()) api.hide(); else api.showAt(bubbleBounds);
    },
  };
  return api;
}

module.exports = { createPanel };
```

- [ ] **Step 2: Commit** — `feat: frameless always-on-top Messenger panel anchored to bubble`

---

### Task 4: Rewrite `main.js` to wire bubble ↔ panel

**Files:**
- Modify: `main.js` (full rewrite — drop update check, usage ping, welcome window)

**Interfaces:**
- Consumes: `createBubble`, `createPanel`.

- [ ] **Step 1: `main.js`**

```js
const { app, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { createBubble } = require('./bubble');
const { createPanel } = require('./panel');

app.setPath('userData', path.join(app.getPath('appData'), 'MessengerApp'));
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (e) { return {}; }
}
function saveSettings() {
  try { fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2)); } catch (e) {}
}
const settings = { sidebarVisible: true, bubble: null, ...loadSettings() };

let bubble, panel;

// Facebook issues session cookies; re-issue them with a 1-year expiry so login survives restarts.
function persistFacebookCookies() {
  session.defaultSession.cookies.on('changed', (_event, cookie, _cause, removed) => {
    const fb = cookie.domain.includes('facebook.com') || cookie.domain.includes('messenger.com');
    if (removed || !cookie.session || !fb) return;
    session.defaultSession.cookies.set({
      url: `https://${cookie.domain.replace(/^\./, '')}${cookie.path}`,
      name: cookie.name, value: cookie.value, domain: cookie.domain, path: cookie.path,
      secure: cookie.secure, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite || 'no_restriction',
      expirationDate: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
    }).catch(() => {});
  });
}

const runInPanel = (js) => panel && panel.win.webContents.executeJavaScript(js).catch(() => {});

function applySidebarState() {
  runInPanel(`(() => { const s = document.querySelector('[aria-label="Inbox switcher"]'); if (s) s.style.display = ${settings.sidebarVisible} ? '' : 'none'; })()`);
}
function toggleSidebar() { settings.sidebarVisible = !settings.sidebarVisible; saveSettings(); applySidebarState(); }
function newMessage() {
  runInPanel(`(() => { const b = document.querySelector('[aria-label="New message"]') || document.querySelector('[aria-label="Start a new message"]') || document.querySelector('[aria-label="Compose"]'); if (b) b.click(); })()`);
}
function switchToConversation(n) {
  runInPanel(`(() => { const links = [...document.querySelectorAll('[role="row"]')].map(r => r.querySelector('a[role="link"][href*="/t/"]')).filter(Boolean); if (links[${n}]) links[${n}].click(); })()`);
}

function bubbleContextMenu() {
  Menu.buildFromTemplate([
    { label: 'Open Messenger', click: () => panel.showAt(bubble.getBounds()) },
    { label: 'Reload Messenger', click: () => panel.reload() },
    { type: 'separator' },
    { label: 'Reset Bubble Position', click: () => bubble.resetPosition() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]).popup({ window: bubble.win });
}

function createMenu() {
  const conversations = Array.from({ length: 9 }, (_, i) => ({
    label: `Conversation ${i + 1}`, accelerator: `CmdOrCtrl+${i + 1}`, click: () => switchToConversation(i),
  }));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'toggleDevTools', accelerator: 'CmdOrCtrl+Option+I' }] },
    { label: 'Conversations', submenu: [{ label: 'New Message', accelerator: 'CmdOrCtrl+N', click: newMessage }, { type: 'separator' }, ...conversations] },
    { label: 'Window', submenu: [{ label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+Shift+S', click: toggleSidebar }, { role: 'minimize' }] },
  ]));
}

app.whenReady().then(() => {
  if (app.dock) app.dock.hide();
  createMenu();
  persistFacebookCookies();

  panel = createPanel({ onUnread: (n) => bubble && bubble.setBadge(n) });
  panel.win.webContents.on('did-finish-load', () => setTimeout(applySidebarState, 1000));

  let saveTimer;
  bubble = createBubble({
    position: settings.bubble,
    onClick: () => panel.toggle(bubble.getBounds()),
    onContextMenu: bubbleContextMenu,
    onMoved: (pos) => {
      panel.follow(bubble.getBounds());
      settings.bubble = pos;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveSettings, 300);
    },
  });
});

app.on('window-all-closed', () => {}); // keep running; the bubble is the app
app.on('before-quit', async () => { await session.defaultSession.cookies.flushStore(); });
```

- [ ] **Step 2: Run `npm start`; verify manually**
  - Bubble appears bottom-right, over every app and Space; no dock icon.
  - Click → panel opens to the right (or left near the edge) with Messenger loaded and logged in.
  - Click elsewhere → panel hides; click bubble → reopens (no double-toggle).
  - Drag bubble → panel follows; position persists after quitting (right-click → Quit) and relaunching.
  - Send yourself a message from your phone → badge appears with count; open the chat → badge clears.
  - Cmd+C / Cmd+V work in the panel (Edit menu accelerators still route with the dock hidden). If not, keep the dock visible and note the deviation.
- [ ] **Step 3: Commit** — `feat: bubble mode — app runs as floating chat head`

---

### Task 5: Docs

**Files:**
- Modify: `README.md` (Features + shortcuts sections), `preload.js` (no change), `package.json` description

- [ ] **Step 1:** Replace the Features list with the bubble behaviour (bubble, click-to-open panel, unread badge, right-click menu, persistent login, external links, dark mode). Remove "Auto-Update Check" and the Download/Installation sections pointing at upstream releases; keep Build from Source. Note the fork and that tracking was removed.
- [ ] **Step 2: Commit** — `docs: describe bubble mode`
