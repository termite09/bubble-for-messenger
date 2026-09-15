const { app, Menu, session, nativeTheme, net, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { createBubble } = require('./bubble');
const { createPanel } = require('./panel');
const { createDismissTarget } = require('./dismiss');
const { createSettingsWindow } = require('./settings-window');
const { fetchAvatar } = require('./avatars');
const scrape = require('./scrape');
const { LIMIT: RECENT_LIMIT, MAX_PINS, mergeHeads } = require('../lib/recent');
const chatsLib = require('../lib/chats');
const { shouldPersistCookie, persistentCookie } = require('../lib/cookies');
const { isTelemetryUrl } = require('../lib/telemetry');
const {
  normalizeSettings,
  isSettingKey,
  isPermissionGranted,
  isMetaOrigin,
  BUBBLE_SIZES,
} = require('../lib/settings');
const { removeStaleLockFiles } = require('../lib/storage');
const { createLog, hashHref } = require('./log');
const { createSettingsStore } = require('./settings-store');
const { createUpdateCheck } = require('./updates');

const RECENT_POLL_MS = 60 * 1000; // a safety net: the panel's preload pushes rows as they change

// Own profile folder, separate from the upstream MessengerApp so both can run side by side.
// The folder was called MessengerBubble before the rename; move it once so logins carry over.
const userData = path.join(app.getPath('appData'), 'Bubble for Messenger');
const legacyUserData = path.join(app.getPath('appData'), 'MessengerBubble');
if (!fs.existsSync(userData) && fs.existsSync(legacyUserData)) {
  try {
    fs.renameSync(legacyUserData, userData);
  } catch (e) {}
}
// The profile is the user's alone, like every Chromium profile.
try {
  fs.mkdirSync(userData, { recursive: true, mode: 0o700 });
  fs.chmodSync(userData, 0o700);
} catch (e) {}
app.setPath('userData', userData);

// One copy at a time: a second launch hands over to the running one and leaves. This must come
// before the lock cleanup below, which would otherwise unlock the running copy's stores.
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
else removeStaleLockFiles(userData);
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

// What went wrong, for a bug report: logs/main.log in the profile. Never page data.
const log = createLog({ dir: path.join(userData, 'logs'), packaged: app.isPackaged });
process.on('unhandledRejection', (reason) => log.error('unhandled rejection', { err: reason }));
process.on('uncaughtException', (err) => log.error('uncaught exception', { err }));
app.on('render-process-gone', (_event, wc, details) =>
  log.error('renderer gone', {
    url: wc.getURL().split('?')[0],
    reason: details.reason,
    exitCode: details.exitCode,
  }),
);
app.on('child-process-gone', (_event, details) =>
  log.error('child process gone', {
    type: details.type,
    reason: details.reason,
    exitCode: details.exitCode,
  }),
);

// The settings: one store (load, normalise, atomic save), mirrored here for the many readers.
const store = createSettingsStore({
  file: settingsPath,
  normalize: normalizeSettings,
  log,
  positionDelayMs: 300,
});
let settings = store.get();
store.subscribe((next, prev) => {
  settings = next;
  applySettings(prev);
});

let bubble;
let panel;
let dismiss;
let settingsWindow;
let lastUnread = 0;
let panelStatus = { connection: 'online', signedOut: false };
let updates = { latest: () => null, check: async () => null, due: () => false };

// One setting changed on the page: the store normalises, saves and notifies; applySettings
// runs from the subscription above. Only page-visible keys may come this way.
function updateSetting(key, value) {
  return isSettingKey(key) ? store.set(key, value) : settings;
}

// What the bubble page needs to know: the reply control, how the count shows, and the disc size.
const rendererSettings = () => ({
  quickReply: settings.quickReply,
  badge: settings.badge,
  bubbleSize: settings.bubbleSize,
});

// Every setting has one place it takes effect. `prev` is the state before a change (null at
// startup): only what differs is re-applied, so flipping one switch never touches the rest.
function applySettings(prev) {
  const changed = (key) => !prev || prev[key] !== settings[key];
  if (changed('overFullscreen')) {
    for (const w of [bubble, panel, dismiss, settingsWindow])
      if (w) w.setOverFullscreen(settings.overFullscreen);
  }
  // Under `npm start` this would register Electron.app itself as the login item.
  if (changed('startAtLogin') && app.isPackaged)
    app.setLoginItemSettings({ openAtLogin: settings.startAtLogin });
  if (changed('badge') && bubble) bubble.setBadge(settings.badge !== 'off' ? lastUnread : 0);
  if ((changed('quickReply') || changed('badge') || changed('bubbleSize')) && bubble)
    bubble.setSettings(rendererSettings());
  if (changed('theme')) nativeTheme.themeSource = settings.theme;
  if (changed('spellcheck') && panel) panel.session().setSpellCheckerEnabled(settings.spellcheck);
  if (changed('blockTelemetry')) blockTelemetry(settings.blockTelemetry);
  // banner, bannerPreview, notifications, reopenLast and pins are read where they matter.
}
// The chat state (lib/chats): the list as last read, the open chat, the one put away.
let chats = chatsLib.initialState();

// The open conversation's banner reads as active in the stack.
const syncActive = () => bubble && bubble.setActive(chats.activeHref);

// Putting a chat away — on the disc, on the shield, or by the panel losing focus — remembers
// it for reopening (settings.reopenLast seconds) and takes the ring off it.
function rememberChat() {
  chats = chatsLib.closeChat(chats, Date.now());
  syncActive();
}

// Take in the chat list — pushed by the panel's preload as it changes, or read from the page
// by the safety poll — refresh the fan if it is open, and unroll a "message landed" banner
// when a chat turns unread. Reads do not overlap: one at a time, with a request arriving
// mid-read served by one more read after it.
const stats = { pushes: 0, polls: 0 };
let refreshing = false;
let refreshAgain = false;
let pendingRows = null;
async function refreshRecent(pushed = null) {
  if (!bubble || !panel) return;
  if (pushed) pendingRows = pushed;
  if (refreshing) {
    refreshAgain = true;
    return;
  }
  refreshing = true;
  try {
    let rows = pendingRows;
    pendingRows = null;
    if (rows) stats.pushes++;
    else {
      if (panel.isLoading()) return; // a page mid-reload has no rows worth reading
      stats.polls++;
      rows = await panel.readRecentChats();
    }
    if (!rows) return; // the list is scrolled: keep what we last knew rather than read the wrong rows
    const ses = panel.session();
    const next = await Promise.all(
      rows.map(async (r) => ({ ...r, avatar: await fetchAvatar(ses, r.avatarUrl) })),
    );
    const result = chatsLib.reduceRecent(chats, next, {
      visible: panel.isVisible(),
      now: Date.now(),
    });
    chats = result.state;
    if (!result.changed) return;
    refreshPins();
    const names = chats.recent.map((r) => r.name).join('\n');
    if (names !== menuNames) {
      menuNames = names;
      createMenu();
    }
    if (bubble.isExpanded()) {
      if (result.displayChanged) showStack(false);
    } else if (result.landed && settings.banner)
      bubble.landed(settings.bannerPreview ? result.landed : { ...result.landed, preview: '' });
  } finally {
    refreshing = false;
    if (refreshAgain) {
      refreshAgain = false;
      refreshRecent();
    }
  }
}

// The stack: recent chats and pinned ones (lib/recent mergeHeads), each with its picture. A
// pinned chat missing from the list gets its picture from the URL saved when it was pinned.
async function stackItems() {
  const ses = panel.session();
  return Promise.all(
    mergeHeads(settings.pins, chats.recent).map(async (it) =>
      'avatar' in it ? it : { ...it, avatar: await fetchAvatar(ses, it.avatarUrl) },
    ),
  );
}
async function showStack(animate = true) {
  bubble.expand(await stackItems(), animate);
}

// A pinned chat that is in the list again keeps its saved name and picture URL fresh.
function refreshPins() {
  const { pins, changed } = chatsLib.refreshPins(settings.pins, chats.recent);
  if (changed) store.patch({ pins });
}

function setPins(pins) {
  store.patch({ pins });
  if (bubble.isExpanded()) showStack(false);
}

// Right-click on a head: pin it, or unpin it.
// Pin a chat, or unpin it. Up to MAX_PINS; a chat not in the list cannot be pinned (nothing is
// known about it) — but any pinned one can be unpinned.
function togglePin(href) {
  if (settings.pins.some((p) => p.href === href))
    return setPins(settings.pins.filter((p) => p.href !== href));
  const row = chats.recent.find((r) => r.href === href);
  if (!row || settings.pins.length >= MAX_PINS) return;
  setPins([...settings.pins, { href, name: row.name, avatarUrl: row.avatarUrl }]);
}

// Right-click on a head: pin it, or unpin it.
function headMenu(href) {
  const pinned = settings.pins.some((p) => p.href === href);
  const full = settings.pins.length >= MAX_PINS;
  Menu.buildFromTemplate([
    pinned
      ? { label: 'Unpin', click: () => togglePin(href) }
      : {
          label: full ? `Pin (${MAX_PINS} pinned already)` : 'Pin',
          enabled: !full,
          click: () => togglePin(href),
        },
  ]).popup({ window: bubble.win });
}

// Facebook issues the login cookies as session cookies; re-issue those (and only those) with an
// expiry so the login survives restarts. The rule and the rewrite live in lib/cookies.
function persistFacebookCookies() {
  session.defaultSession.cookies.on('changed', (_event, cookie, cause, removed) => {
    if (!shouldPersistCookie(cookie, cause, removed)) return;
    session.defaultSession.cookies
      .set(persistentCookie(cookie, Date.now()))
      .catch((err) => log.warn('login cookie not persisted', { name: cookie.name, err }));
  });
}

// Electron grants every permission request by default. Only Messenger (and the facebook.com
// login pages the panel may visit) get anything, and only what a chat client needs.
function restrictPermissions() {
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => {
    callback(
      isMetaOrigin(details.requestingUrl || wc.getURL()) &&
        isPermissionGranted(permission, settings, details),
    );
  });
  session.defaultSession.setPermissionCheckHandler(
    (wc, permission, origin) => isMetaOrigin(origin) && isPermissionGranted(permission, settings),
  );
}

// Drop Facebook's logging beacons at the network layer. Only the pure telemetry sinks listed in
// lib/telemetry are cancelled; everything Messenger needs to work passes untouched.
// The listener costs every matching request a hop through the main process, so it is only
// registered while the setting is on.
function blockTelemetry(on) {
  const filter = { urls: ['*://*.facebook.com/*', '*://*.messenger.com/*'] };
  session.defaultSession.webRequest.onBeforeRequest(
    filter,
    on ? (details, callback) => callback({ cancel: isTelemetryUrl(details.url) }) : null,
  );
}

const runInPanel = (js) =>
  panel &&
  scrape
    .run(panel.win.webContents, js, { userGesture: true })
    .catch((err) => log.debug('panel script failed', { err }));

// The compose button lives in the inbox view, so bring that up first.
async function newMessage() {
  if (!bubble) return;
  chats = chatsLib.openChat(chats, null);
  syncActive();
  await panel.openInbox(bubble.getBounds());
  runInPanel(`(() => {
    const btn = document.querySelector('[aria-label="New message"]') ||
                document.querySelector('[aria-label="Start a new message"]') ||
                document.querySelector('[aria-label="Compose"]');
    if (btn) btn.click();
  })()`);
}

// Open a conversation beside the stack, bringing the stack up if it isn't already. The stack
// must be up before the panel is placed: it is placed beside the column, not the disc.
async function openChat(href) {
  chats = chatsLib.openChat(chats, href);
  if (!bubble.isExpanded()) await showStack();
  bubble.setActive(href);
  panel.openThread(href, bubble.getStackBounds());
}

// Cmd+N opens the n-th most recent chat the same way a banner click does (a synthetic click
// on the list row only highlights it at the panel's width).
function openRecent(n) {
  if (bubble && chats.recent[n]) openChat(chats.recent[n].href);
}

function openSettings() {
  if (settingsWindow && bubble) settingsWindow.open(bubble.getBounds());
}

const ISSUES_URL = 'https://github.com/termite09/bubble-for-messenger/issues/new';

function bubbleContextMenu() {
  const update = updates.latest();
  Menu.buildFromTemplate([
    {
      label: 'Open Messenger',
      click: () => {
        chats = chatsLib.openChat(chats, null);
        syncActive();
        panel.openInbox(bubble.getBounds());
      },
    },
    { label: 'Reload Messenger', click: () => panel.reload() },
    { type: 'separator' },
    ...(update
      ? [{ label: `Update to ${update.version}…`, click: () => shell.openExternal(update.url) }]
      : []),
    { label: 'Settings…', click: openSettings },
    { label: 'Reset Bubble Position', click: () => bubble.resetPosition() },
    // The issue page, and the log beside it in Finder so it can be attached.
    {
      label: 'Report a Problem…',
      click: () => {
        shell.openExternal(ISSUES_URL);
        shell.showItemInFolder(log.path);
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]).popup({ window: bubble.win });
}

// The app menu; rebuilt when the recent chats' names change, so Cmd+1–5 show who they open.
let menuNames = '';
function createMenu() {
  const conversations = Array.from({ length: RECENT_LIMIT }, (_, i) => ({
    label: chats.recent[i] ? chats.recent[i].name : `Recent Chat ${i + 1}`,
    accelerator: `CmdOrCtrl+${i + 1}`,
    enabled: Boolean(chats.recent[i]),
    click: () => openRecent(i),
  }));

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
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
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          // Reload and DevTools act on the focused window — usually the logged-in Messenger page.
          // Development only: DevTools on that page is the "paste this in the console" trap.
          ...(app.isPackaged
            ? []
            : [
                { type: 'separator' },
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools', accelerator: 'CmdOrCtrl+Option+I' },
              ]),
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
        submenu: [{ role: 'minimize' }],
      },
    ]),
  );
}

// A second launch handed over to this one: show the stack — unless this one is on its way out.
let quitting = false;
app.on('second-instance', () => {
  if (bubble && !quitting)
    showStack().catch((err) => log.warn('stack after second launch', { err }));
});

// Every renderer is sandboxed (the window factory sets it per window; this makes it the rule),
// and no page may open a window or leave its own document: the local pages never navigate,
// and the panel has its own, richer guard (panel.js).
app.enableSandbox();
app.on('web-contents-created', (_event, wc) => {
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (event, url) => {
    const isPanel = panel && wc === panel.win.webContents;
    if (!isPanel && !url.startsWith('file://')) event.preventDefault();
  });
});

app.whenReady().then(() => {
  if (!primary) return;
  if (app.dock) app.dock.hide();
  createMenu();
  persistFacebookCookies();
  restrictPermissions();
  blockTelemetry(settings.blockTelemetry); // before the panel starts loading

  panel = createPanel({
    log,
    overFullscreen: settings.overFullscreen,
    onUnread: (n) => {
      if (!bubble) return;
      // A title flash ("Name messaged you") says nothing about the count: keep the last one.
      if (n !== null) {
        lastUnread = n;
        bubble.setBadge(settings.badge !== 'off' ? n : 0);
      }
    },
    onRows: (rows) => refreshRecent(rows),
    onStatus: (status) => {
      panelStatus = status;
      if (bubble) bubble.setStatus(status);
    },
    onShown: () => {
      syncActive();
      if (bubble) bubble.opened();
    },
    onBlurred: rememberChat,
  });
  setInterval(refreshRecent, RECENT_POLL_MS);

  dismiss = createDismissTarget({ overFullscreen: settings.overFullscreen });

  bubble = createBubble({
    position: settings.bubble,
    dismiss,
    overFullscreen: settings.overFullscreen,
    size: BUBBLE_SIZES[settings.bubbleSize],
    // A disc click brings the stack up — or, soon after a chat was put away by clicking
    // elsewhere, that chat straight back.
    onClick: () => {
      // Signed out: the stack would be empty; the disc goes straight to the login page.
      if (panelStatus.signedOut) {
        chats = chatsLib.openChat(chats, null);
        panel.openInbox(bubble.getBounds());
        return;
      }
      const click = chatsLib.discClick(chats, Date.now(), settings.reopenLast);
      if (click.action === 'reopen') openChat(click.href);
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
    onPinToggle: togglePin,
    // A conversation opens beyond the stack, which stays (or comes) up so the other chats are
    // one click away without fanning out again.
    onOpenChat: (href) => openChat(href),
    onOpenInbox: () => {
      chats = chatsLib.openChat(chats, null);
      syncActive();
      panel.openInbox(bubble.getBounds());
    },
    // A reply typed into the banner goes out through the hidden page. If that fails, the
    // conversation opens with whatever got as far as the composer, so nothing typed is lost.
    onReply: async (href, text) => {
      const ok = await panel.sendReply(href, text);
      if (!ok) log.warn('quick reply not delivered; opening the chat', { thread: hashHref(href) });
      bubble.replyResult(ok);
      if (!ok) openChat(href);
    },
    onDismiss: () => app.quit(),
    onMoved: (pos) => {
      panel.follow(bubble.getStackBounds());
      store.setPosition(pos);
    },
  });

  settingsWindow = createSettingsWindow({
    getSettings: () => settings,
    setSetting: updateSetting,
    subscribe: (fn) => store.subscribe((s) => fn(s)),
    // Messenger's own switches (notification sounds among them) live in its Preferences.
    onOpenMessengerPreferences: () => {
      chats = chatsLib.openChat(chats, null);
      syncActive();
      panel.openPreferences(bubble.getBounds());
    },
  });

  applySettings(null);

  // A newer release? A minute after launch, then daily; the bubble's menu says so.
  updates = createUpdateCheck({
    fetch: (u, o) => net.fetch(u, o),
    version: app.getVersion(),
    enabled: () => settings.checkUpdates,
    log,
    onUpdate: (u) => log.info('update available', { version: u.version }),
  });
  setTimeout(() => updates.check(), 60 * 1000).unref();
  setInterval(
    () => {
      if (updates.due()) updates.check();
    },
    60 * 60 * 1000,
  ).unref();

  // First run: nothing to show until the user signs in, so bring the inbox (the login page) up,
  // and let the disc introduce itself.
  if (!store.existed)
    panel.win.webContents.once('did-finish-load', () =>
      setTimeout(() => {
        panel.openInbox(bubble.getBounds());
        bubble.landed({
          href: null,
          name: 'Welcome to Bubble',
          preview:
            'Sign in to Messenger beside me. Then: click me for your chats, right-click for settings, drag me anywhere.',
          avatar: null,
          hold: 30000,
        });
      }, 500),
    );

  // Development only: what a driver attached over --inspect needs to see and poke.
  if (!app.isPackaged)
    global.__bubble = {
      state: () => chats,
      settings: () => settings,
      store,
      panel,
      bubble,
      log,
      refreshRecent,
      showStack,
      stats,
      updates: () => updates,
    };
});

// The bubble is the app: keep running even when the panel is hidden.
app.on('window-all-closed', () => {});

// Flush cookies before quitting. Electron doesn't wait on async listeners, so hold the quit
// until the flush has landed and then quit again.
let cookiesFlushed = false;
app.on('before-quit', (event) => {
  quitting = true;
  if (cookiesFlushed) return;
  event.preventDefault();
  session.defaultSession.cookies
    .flushStore()
    .catch(() => {})
    .then(() => {
      cookiesFlushed = true;
      app.quit();
    });
});
