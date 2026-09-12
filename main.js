const { app, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { createBubble } = require('./bubble');
const { createPanel } = require('./panel');
const { createDismissTarget } = require('./dismiss');
const { fetchAvatar } = require('./avatars');

const RECENT_POLL_MS = 5000;

// Own profile folder, separate from the upstream MessengerApp so both can run side by side.
app.setPath('userData', path.join(app.getPath('appData'), 'MessengerBubble'));
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (e) {
    return {};
  }
}

function saveSettings() {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (e) {}
}

const settings = { sidebarVisible: true, bubble: null, ...loadSettings() };

let bubble;
let panel;
let recent = []; // [{ href, name, avatar (data URL), unread }]

// Re-read the chat list from the Messenger page and refresh the fan if it is open.
let recentKey = '';
async function refreshRecent() {
  if (!bubble || !panel) return;
  const rows = await panel.readRecentChats();
  const ses = panel.session();
  const next = await Promise.all(rows.map(async (r) => ({
    href: r.href, name: r.name, unread: r.unread, avatar: await fetchAvatar(ses, r.avatarUrl),
  })));
  const key = JSON.stringify(next.map((r) => [r.href, r.name, r.unread, Boolean(r.avatar)]));
  if (key === recentKey) return;
  recentKey = key;
  recent = next;
  if (bubble.isExpanded()) bubble.expand(recent);
}

// Facebook issues session cookies; re-issue them with a 1-year expiry so login survives restarts.
function persistFacebookCookies() {
  session.defaultSession.cookies.on('changed', (_event, cookie, _cause, removed) => {
    const fb = cookie.domain.includes('facebook.com') || cookie.domain.includes('messenger.com');
    if (removed || !cookie.session || !fb) return;
    session.defaultSession.cookies.set({
      url: `https://${cookie.domain.replace(/^\./, '')}${cookie.path}`,
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite || 'no_restriction',
      expirationDate: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
    }).catch(() => {});
  });
}

const runInPanel = (js) => panel && panel.win.webContents.executeJavaScript(js).catch(() => {});

function applySidebarState() {
  runInPanel(`(() => {
    const sidebar = document.querySelector('[aria-label="Inbox switcher"]');
    if (sidebar) sidebar.style.display = ${settings.sidebarVisible} ? '' : 'none';
  })()`);
}

function toggleSidebar() {
  settings.sidebarVisible = !settings.sidebarVisible;
  saveSettings();
  applySidebarState();
}

function newMessage() {
  runInPanel(`(() => {
    const btn = document.querySelector('[aria-label="New message"]') ||
                document.querySelector('[aria-label="Start a new message"]') ||
                document.querySelector('[aria-label="Compose"]');
    if (btn) btn.click();
  })()`);
}

function switchToConversation(n) {
  runInPanel(`(() => {
    const links = [...document.querySelectorAll('[role="row"]')]
      .map((row) => row.querySelector('a[role="link"][href*="/t/"]'))
      .filter(Boolean);
    if (links[${n}]) links[${n}].click();
  })()`);
}

function bubbleContextMenu() {
  Menu.buildFromTemplate([
    { label: 'Open Messenger', click: () => panel.openInbox(bubble.getBounds()) },
    { label: 'Reload Messenger', click: () => panel.reload() },
    { type: 'separator' },
    { label: 'Reset Bubble Position', click: () => bubble.resetPosition() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]).popup({ window: bubble.win });
}

function createMenu() {
  const conversations = Array.from({ length: 9 }, (_, i) => ({
    label: `Conversation ${i + 1}`,
    accelerator: `CmdOrCtrl+${i + 1}`,
    click: () => switchToConversation(i),
  }));

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'toggleDevTools', accelerator: 'CmdOrCtrl+Option+I' },
      ],
    },
    {
      label: 'Conversations',
      submenu: [
        { label: 'New Message', accelerator: 'CmdOrCtrl+N', click: newMessage },
        { type: 'separator' },
        ...conversations,
      ],
    },
    {
      label: 'Window',
      submenu: [
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+Shift+S', click: toggleSidebar },
        { role: 'minimize' },
      ],
    },
  ]));
}

app.whenReady().then(() => {
  if (app.dock) app.dock.hide();
  createMenu();
  persistFacebookCookies();

  panel = createPanel({
    onUnread: (n) => {
      if (!bubble) return;
      bubble.setBadge(n);
      refreshRecent();
    },
  });
  panel.win.webContents.on('did-finish-load', () => setTimeout(applySidebarState, 1000));
  setInterval(refreshRecent, RECENT_POLL_MS);

  const dismiss = createDismissTarget();

  let saveTimer;
  bubble = createBubble({
    position: settings.bubble,
    dismiss,
    onClick: () => bubble.expand(recent),
    onContextMenu: bubbleContextMenu,
    onOpenChat: (href) => panel.openThread(href, bubble.getBounds()),
    onOpenInbox: () => panel.openInbox(bubble.getBounds()),
    onDismiss: () => app.quit(),
    onMoved: (pos) => {
      panel.follow(bubble.getBounds());
      settings.bubble = pos;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveSettings, 300);
    },
  });
});

// The bubble is the app: keep running even when the panel is hidden.
app.on('window-all-closed', () => {});

// Flush cookies before quitting
app.on('before-quit', async () => {
  await session.defaultSession.cookies.flushStore();
});

