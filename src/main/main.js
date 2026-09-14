const { app, Menu, session, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { createBubble } = require('./bubble');
const { createPanel } = require('./panel');
const { createDismissTarget } = require('./dismiss');
const { createSettingsWindow } = require('./settings-window');
const { fetchAvatar } = require('./avatars');
const { LIMIT: RECENT_LIMIT, MAX_PINS, reopenOpen, mergeHeads } = require('../lib/recent');
const { isMetaHost } = require('../lib/links');
const { isTelemetryUrl } = require('../lib/telemetry');
const { normalizeSettings, isSettingKey, isPermissionGranted, BUBBLE_SIZES } = require('../lib/settings');
const { removeStaleLockFiles } = require('../lib/storage');

const RECENT_POLL_MS = 5000;

// Own profile folder, separate from the upstream MessengerApp so both can run side by side.
// The folder was called MessengerBubble before the rename; move it once so logins carry over.
const userData = path.join(app.getPath('appData'), 'Bubble for Messenger');
const legacyUserData = path.join(app.getPath('appData'), 'MessengerBubble');
if (!fs.existsSync(userData) && fs.existsSync(legacyUserData)) {
  try { fs.renameSync(legacyUserData, userData); } catch (e) {}
}
app.setPath('userData', userData);

// One copy at a time: a second launch hands over to the running one and leaves. This must come
// before the lock cleanup below, which would otherwise unlock the running copy's stores.
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
else removeStaleLockFiles(userData);
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

let settings = normalizeSettings(loadSettings());
const settingsListeners = new Set(); // called with the full settings after every change

let bubble;
let panel;
let dismiss;
let settingsWindow;
let lastUnread = 0;

// One setting changed on the page: normalize, save, apply what differs, tell every listener.
function updateSetting(key, value) {
  if (!isSettingKey(key)) return settings;
  const prev = settings;
  settings = normalizeSettings({ ...settings, [key]: value });
  saveSettings();
  applySettings(prev);
  for (const fn of settingsListeners) fn(settings);
  return settings;
}

// What the bubble page needs to know: the reply control, how the count shows, and the disc size.
const rendererSettings = () => ({ quickReply: settings.quickReply, badge: settings.badge, bubbleSize: settings.bubbleSize });

// Every setting has one place it takes effect. `prev` is the state before a change (null at
// startup): only what differs is re-applied, so flipping one switch never touches the rest.
function applySettings(prev) {
  const changed = (key) => !prev || prev[key] !== settings[key];
  if (changed('overFullscreen')) {
    for (const w of [bubble, panel, dismiss, settingsWindow]) if (w) w.setOverFullscreen(settings.overFullscreen);
  }
  // Under `npm start` this would register Electron.app itself as the login item.
  if (changed('startAtLogin') && app.isPackaged) app.setLoginItemSettings({ openAtLogin: settings.startAtLogin });
  if (changed('badge') && bubble) bubble.setBadge(settings.badge !== 'off' ? lastUnread : 0);
  if ((changed('quickReply') || changed('badge') || changed('bubbleSize')) && bubble) bubble.setSettings(rendererSettings());
  if (changed('theme')) nativeTheme.themeSource = settings.theme;
  if (changed('spellcheck') && panel) panel.session().setSpellCheckerEnabled(settings.spellcheck);
  // banner, bannerPreview, notifications and blockTelemetry are read where they matter.
}
let recent = []; // [{ href, name, avatar (data URL), unread }]
let activeHref = null; // thread the panel is showing; null = inbox

// A chat put away — on the disc, on the shield, or by the panel losing focus — stays one disc
// click from reopening for settings.reopenLast seconds. (Reopening brings the stack up beside
// it, so nothing is lost by not distinguishing how it was closed.)
let lastChat = null; // { href, closedAt }
function rememberChat() {
  if (activeHref) lastChat = { href: activeHref, closedAt: Date.now() };
}

// Re-read the chat list from the Messenger page, refresh the fan if it is open, and unroll a
// "message landed" banner when a chat turns unread (or a new unread chat reaches the top).
let recentKey = '';
let seeded = false; // the first read establishes state; it never announces anything
async function refreshRecent() {
  if (!bubble || !panel) return;
  const rows = await panel.readRecentChats();
  if (!rows) return; // the list is scrolled: keep what we last knew rather than read the wrong rows
  const ses = panel.session();
  const next = await Promise.all(rows.map(async (r) => ({
    href: r.href, name: r.name, unread: r.unread, preview: r.preview, time: r.time, avatarUrl: r.avatarUrl, avatar: await fetchAvatar(ses, r.avatarUrl),
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
  refreshPins();
  if (bubble.isExpanded()) showStack(false);
  else if (landed && settings.banner) bubble.landed(settings.bannerPreview ? landed : { ...landed, preview: '' });
}

// The stack: recent chats and pinned ones (lib/recent mergeHeads), each with its picture. A
// pinned chat missing from the list gets its picture from the URL saved when it was pinned.
async function stackItems() {
  const ses = panel.session();
  return Promise.all(mergeHeads(settings.pins, recent).map(async (it) => ('avatar' in it ? it : { ...it, avatar: await fetchAvatar(ses, it.avatarUrl) })));
}
async function showStack(animate = true) {
  bubble.expand(await stackItems(), animate);
}

// A pinned chat that is in the list again keeps its saved name and picture URL fresh, so it
// still shows after the old picture URL has expired.
function refreshPins() {
  const byHref = new Map(recent.map((r) => [r.href, r]));
  let changed = false;
  const pins = settings.pins.map((p) => {
    const row = byHref.get(p.href);
    if (!row || (row.name === p.name && row.avatarUrl === p.avatarUrl)) return p;
    changed = true;
    return { href: p.href, name: row.name, avatarUrl: row.avatarUrl };
  });
  if (changed) { settings = normalizeSettings({ ...settings, pins }); saveSettings(); }
}

function setPins(pins) {
  settings = normalizeSettings({ ...settings, pins });
  saveSettings();
  if (bubble.isExpanded()) showStack(false);
}

// Right-click on a head: pin it, or unpin it.
function headMenu(href) {
  const pinned = settings.pins.some((p) => p.href === href);
  const row = recent.find((r) => r.href === href);
  const full = settings.pins.length >= MAX_PINS;
  Menu.buildFromTemplate([
    pinned
      ? { label: 'Unpin', click: () => setPins(settings.pins.filter((p) => p.href !== href)) }
      : { label: full ? `Pin (${MAX_PINS} pinned already)` : 'Pin', enabled: !full && Boolean(row),
          click: () => setPins([...settings.pins, { href, name: row.name, avatarUrl: row.avatarUrl }]) },
  ]).popup({ window: bubble.win });
}

// Facebook issues session cookies; re-issue them with a 1-year expiry so login survives restarts.
// Every other attribute is copied as issued — in particular SameSite, so a cookie Facebook left
// Lax-by-default does not come back as SameSite=None.
function persistFacebookCookies() {
  session.defaultSession.cookies.on('changed', (_event, cookie, _cause, removed) => {
    if (removed || !cookie.session || !isMetaHost(cookie.domain)) return;
    session.defaultSession.cookies.set({
      url: `https://${cookie.domain.replace(/^\./, '')}${cookie.path}`,
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite || 'unspecified',
      expirationDate: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
    }).catch(() => {});
  });
}

// Electron grants every permission request by default. Only Messenger (and the facebook.com
// login pages the panel may visit) get anything, and only what a chat client needs.
function restrictPermissions() {
  const allowed = (url) => { try { return isMetaHost(new URL(url).hostname); } catch (e) { return false; } };
  const granted = (permission) => isPermissionGranted(permission, settings);
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(allowed(details.requestingUrl || wc.getURL()) && granted(permission));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission, origin) =>
    allowed(origin) && granted(permission));
}

// Drop Facebook's logging beacons at the network layer. Only the pure telemetry sinks listed in
// lib/telemetry are cancelled; everything Messenger needs to work passes untouched.
function blockTelemetry() {
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['*://*.facebook.com/*', '*://*.messenger.com/*'] },
    (details, callback) => callback({ cancel: settings.blockTelemetry && isTelemetryUrl(details.url) }),
  );
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
  lastChat = null;
  activeHref = href;
  if (!bubble.isExpanded()) showStack();
  bubble.setActive(href);
  panel.openThread(href, bubble.getStackBounds());
}

// Cmd+N opens the n-th most recent chat the same way a banner click does (a synthetic click
// on the list row only highlights it at the panel's width).
function openRecent(n) {
  if (bubble && recent[n]) openChat(recent[n].href);
}

function openSettings() {
  if (settingsWindow && bubble) settingsWindow.open(bubble.getBounds());
}

function bubbleContextMenu() {
  Menu.buildFromTemplate([
    { label: 'Open Messenger', click: () => { activeHref = null; panel.openInbox(bubble.getBounds()); } },
    { label: 'Reload Messenger', click: () => panel.reload() },
    { type: 'separator' },
    { label: 'Settings…', click: openSettings },
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
        { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: openSettings },
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

app.on('second-instance', () => { if (bubble) showStack(); });

app.whenReady().then(() => {
  if (!primary) return;
  if (app.dock) app.dock.hide();
  createMenu();
  persistFacebookCookies();
  restrictPermissions();
  blockTelemetry();

  // The open conversation's banner reads as active in the stack.
  const syncActive = () => bubble && bubble.setActive(activeHref);

  panel = createPanel({
    overFullscreen: settings.overFullscreen,
    onUnread: (n) => {
      if (!bubble) return;
      // A title flash ("Name messaged you") says nothing about the count: keep the last one.
      if (n !== null) {
        lastUnread = n;
        bubble.setBadge(settings.badge !== 'off' ? n : 0);
      }
      refreshRecent();
    },
    onShown: syncActive,
    onBlurred: rememberChat,
  });
  setInterval(refreshRecent, RECENT_POLL_MS);

  dismiss = createDismissTarget({ overFullscreen: settings.overFullscreen });

  let saveTimer;
  bubble = createBubble({
    position: settings.bubble,
    dismiss,
    overFullscreen: settings.overFullscreen,
    size: BUBBLE_SIZES[settings.bubbleSize],
    // A disc click brings the stack up — or, soon after a chat was put away by clicking
    // elsewhere, that chat straight back.
    onClick: () => {
      if (reopenOpen(lastChat, Date.now(), settings.reopenLast)) openChat(lastChat.href);
      else showStack();
    },
    // Pressing the disc while the stack is open, or anywhere outside it (the shield), puts it
    // all away — and remembers the open chat for a while.
    onClose: () => {
      rememberChat();
      panel.hide();
    },
    onContextMenu: bubbleContextMenu,
    onHeadMenu: headMenu,
    // A conversation opens beyond the stack, which stays (or comes) up so the other chats are
    // one click away without fanning out again.
    onOpenChat: (href) => openChat(href),
    onOpenInbox: () => { activeHref = null; syncActive(); panel.openInbox(bubble.getBounds()); },
    // A reply typed into the banner goes out through the hidden page. If that fails, the
    // conversation opens with whatever got as far as the composer, so nothing typed is lost.
    onReply: async (href, text) => {
      const ok = await panel.sendReply(href, text);
      bubble.replyResult(ok);
      if (!ok) openChat(href);
    },
    onDismiss: () => app.quit(),
    onMoved: (pos) => {
      panel.follow(bubble.getStackBounds());
      settings.bubble = pos;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveSettings, 300);
    },
  });

  settingsWindow = createSettingsWindow({
    getSettings: () => settings,
    setSetting: updateSetting,
    subscribe: (fn) => settingsListeners.add(fn),
    // Messenger's own switches (notification sounds among them) live in its Preferences.
    onOpenMessengerPreferences: () => { activeHref = null; panel.openPreferences(bubble.getBounds()); },
  });

  applySettings(null);
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

