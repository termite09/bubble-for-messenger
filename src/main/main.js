const { app, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { createBubble } = require('./bubble');
const { createPanel } = require('./panel');
const { createDismissTarget } = require('./dismiss');
const { fetchAvatar } = require('./avatars');
const { LIMIT: RECENT_LIMIT } = require('../lib/recent');

const RECENT_POLL_MS = 5000;

// Own profile folder, separate from the upstream MessengerApp so both can run side by side.
// The folder was called MessengerBubble before the rename; move it once so logins carry over.
const userData = path.join(app.getPath('appData'), 'Bubble for Messenger');
const legacyUserData = path.join(app.getPath('appData'), 'MessengerBubble');
if (!fs.existsSync(userData) && fs.existsSync(legacyUserData)) {
  try { fs.renameSync(legacyUserData, userData); } catch (e) {}
}
app.setPath('userData', userData);
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

const settings = { bubble: null, ...loadSettings() };

let bubble;
let panel;
let recent = []; // [{ href, name, avatar (data URL), unread }]
let activeHref = null; // thread the panel is showing; null = inbox

// Re-read the chat list from the Messenger page, refresh the fan if it is open, and unroll a
// "message landed" banner when a chat turns unread (or a new unread chat reaches the top).
let recentKey = '';
let seeded = false; // the first read establishes state; it never announces anything
async function refreshRecent() {
  if (!bubble || !panel) return;
  const rows = await panel.readRecentChats();
  const ses = panel.session();
  const next = await Promise.all(rows.map(async (r) => ({
    href: r.href, name: r.name, unread: r.unread, preview: r.preview, time: r.time, avatar: await fetchAvatar(ses, r.avatarUrl),
  })));
  const key = JSON.stringify(next.map((r) => [r.href, r.name, r.unread, r.preview, r.time, Boolean(r.avatar)]));
  if (key === recentKey) return;
  const before = new Map(recent.map((r) => [r.href, r]));
  // Only someone else's message counts: an unread row whose preview is the user's own ("You: …")
  // is a thread Messenger bolded for another reason.
  const landed = seeded && !panel.isVisible() && next.find((r, i) => {
    const old = before.get(r.href);
    if (!r.unread || /^You:/.test(r.preview)) return false;
    return old ? !old.unread || old.preview !== r.preview : i === 0;
  });
  recentKey = key;
  recent = next;
  seeded = true;
  if (bubble.isExpanded()) bubble.expand(recent, false);
  else if (landed) bubble.landed(landed);
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

// The compose button lives in the inbox view, so bring that up first.
async function newMessage() {
  if (!bubble) return;
  activeHref = null;
  await panel.openInbox(bubble.getBounds());
  runInPanel(`(() => {
    const btn = document.querySelector('[aria-label="New message"]') ||
                document.querySelector('[aria-label="Start a new message"]') ||
                document.querySelector('[aria-label="Compose"]');
    if (btn) btn.click();
  })()`);
}

// Open a conversation beside the stack, bringing the stack up if it isn't already.
function openChat(href) {
  activeHref = href;
  if (!bubble.isExpanded()) bubble.expand(recent);
  bubble.setActive(href);
  panel.openThread(href, bubble.getStackBounds());
}

// Cmd+N opens the n-th most recent chat the same way a banner click does (a synthetic click
// on the list row only highlights it at the panel's width).
function openRecent(n) {
  if (bubble && recent[n]) openChat(recent[n].href);
}

function bubbleContextMenu() {
  Menu.buildFromTemplate([
    { label: 'Open Messenger', click: () => { activeHref = null; panel.openInbox(bubble.getBounds()); } },
    { label: 'Reload Messenger', click: () => panel.reload() },
    { type: 'separator' },
    { label: 'Reset Bubble Position', click: () => bubble.resetPosition() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]).popup({ window: bubble.win });
}

function createMenu() {
  const conversations = Array.from({ length: RECENT_LIMIT }, (_, i) => ({
    label: `Recent Chat ${i + 1}`,
    accelerator: `CmdOrCtrl+${i + 1}`,
    click: () => openRecent(i),
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
        { role: 'minimize' },
      ],
    },
  ]));
}

app.whenReady().then(() => {
  if (app.dock) app.dock.hide();
  createMenu();
  persistFacebookCookies();

  // The open conversation's banner reads as active in the stack.
  const syncActive = () => bubble && bubble.setActive(activeHref);

  panel = createPanel({
    onUnread: (n) => {
      if (!bubble) return;
      bubble.setBadge(n);
      refreshRecent();
    },
    onShown: syncActive,
  });
  setInterval(refreshRecent, RECENT_POLL_MS);

  const dismiss = createDismissTarget();

  let saveTimer;
  bubble = createBubble({
    position: settings.bubble,
    dismiss,
    onClick: () => bubble.expand(recent),
    // Pressing the disc while the stack is open, or anywhere outside it, puts it all away.
    onClose: () => panel.hide(),
    onContextMenu: bubbleContextMenu,
    // A conversation opens beyond the stack, which stays (or comes) up so the other chats are
    // one click away without fanning out again.
    onOpenChat: (href) => openChat(href),
    onOpenInbox: () => { activeHref = null; syncActive(); panel.openInbox(bubble.getBounds()); },
    onDismiss: () => app.quit(),
    onMoved: (pos) => {
      panel.follow(bubble.getStackBounds());
      settings.bubble = pos;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveSettings, 300);
    },
  });
});

// The bubble is the app: keep running even when the panel is hidden.
app.on('window-all-closed', () => {});

// Flush cookies before quitting. Electron doesn't wait on async listeners, so hold the quit
// until the flush has landed and then quit again.
let cookiesFlushed = false;
app.on('before-quit', (event) => {
  if (cookiesFlushed) return;
  event.preventDefault();
  session.defaultSession.cookies.flushStore()
    .catch(() => {})
    .then(() => { cookiesFlushed = true; app.quit(); });
});

