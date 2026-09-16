const { app, Menu, session, nativeTheme, net, shell, dialog, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { createBubble } = require('./bubble');
const { createAccount } = require('./account');
const { createDismissTarget } = require('./dismiss');
const { createSettingsWindow } = require('./settings-window');
const scrape = require('./scrape');
const { LIMIT: RECENT_LIMIT, MAX_PINS, platformOfHref } = require('../lib/recent');
const { MESSENGER, INSTAGRAM, discState } = require('../lib/sites');
const { pickUnread } = require('../lib/chats');
const { installedByHomebrew, HOMEBREW_UPGRADE, HOMEBREW_TRUST } = require('../lib/install');
const { shouldPersistCookie, persistentCookie } = require('../lib/cookies');
const { isTelemetryUrl } = require('../lib/telemetry');
const { CAPS } = require('../lib/platform');
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
let dismiss;
let settingsWindow;
let updates = { latest: () => null, check: async () => null, due: () => false };

// The platforms, live (main/account): Messenger always, Instagram by its setting. One is in
// focus — its chats in the stack, its count on the disc; the other shows as a satellite.
const accounts = {};
let focused = 'messenger';
const current = () => accounts[focused];
const accountOf = (href) => accounts[platformOfHref(href)] || null;
const eachAccount = (fn) => Object.values(accounts).forEach(fn);

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
    for (const w of [bubble, dismiss, settingsWindow])
      if (w) w.setOverFullscreen(settings.overFullscreen);
    eachAccount((a) => a.panel.setOverFullscreen(settings.overFullscreen));
  }
  // Under `npm start` this would register Electron.app itself as the login item.
  if (changed('startAtLogin') && app.isPackaged)
    app.setLoginItemSettings({ openAtLogin: settings.startAtLogin });
  if (changed('badge')) pushDisc();
  if ((changed('quickReply') || changed('badge') || changed('bubbleSize')) && bubble)
    bubble.setSettings(rendererSettings());
  if (changed('theme')) nativeTheme.themeSource = settings.theme;
  if (changed('spellcheck')) session.defaultSession.setSpellCheckerEnabled(settings.spellcheck);
  if (changed('blockTelemetry')) blockTelemetry(settings.blockTelemetry);
  if (prev && changed('instagram')) {
    if (settings.instagram) addInstagram();
    else removeInstagram();
  }
  // banner, bannerPreview, notifications, reopenLast, platform and pins are read where they matter.
}

// The disc: the focused platform's mark and count, the other's satellite (lib/sites discState).
function disc() {
  const counts = {};
  eachAccount((a) => (counts[a.site.id] = { unread: a.unread() }));
  return discState({ focused, accounts: counts, badge: settings.badge });
}
function pushDisc() {
  if (bubble) bubble.setPlatform(disc());
}
const otherPlatform = () => disc().other;

// The open conversation's head reads as active in the stack.
const syncActive = () => bubble && bubble.setActive(current().chats().activeHref);

// Bring a platform into focus: its chats in the stack, its count on the disc, its status on
// the mark. The other platform's panel goes away (its blur handler remembers its open chat).
function setFocus(id) {
  if (!accounts[id] || id === focused) return;
  current().hide();
  focused = id;
  store.patch({ platform: id });
  pushDisc();
  bubble.setStatus(current().status());
  syncActive();
  if (bubble.isExpanded()) showStack(false);
  refreshMenu();
  log.info('platform focused', { platform: id });
}

function createPlatform(site) {
  const account = createAccount({
    site,
    log,
    overFullscreen: settings.overFullscreen,
    settings: () => settings,
    patchPins: (pins) => store.patch({ pins }),
    onUnread: () => pushDisc(),
    onStatus: (status) => {
      if (bubble && site.id === focused) bubble.setStatus(status);
    },
    // A message landed on either platform: the banner says which.
    onLanded: (item) => {
      if (!bubble || !settings.banner || bubble.isExpanded()) return;
      bubble.landed(settings.bannerPreview ? item : { ...item, preview: '' });
    },
    onChanged: ({ displayChanged }) => {
      if (site.id !== focused || !bubble) return;
      refreshMenu();
      syncActive();
      if (displayChanged && bubble.isExpanded()) showStack(false);
    },
    onShown: () => {
      syncActive();
      if (bubble) {
        bubble.opened();
        bubble.setPanelFocused(true);
      }
      syncSound();
    },
    // The panel put itself away (the user went elsewhere): the stack folds with it, its open
    // chat is remembered by the account, and the ring comes off its head.
    onBlurred: () => {
      if (bubble) bubble.collapse();
      if (site.id === focused) syncActive();
      syncSound();
    },
    onHidden: () => {
      if (bubble) bubble.setPanelFocused(false);
      syncSound();
    },
    // The panel's own pin button on a row of the inbox.
    onPin: (row) => togglePin(row.href, row),
  });
  accounts[site.id] = account;
  return account;
}

// Instagram switched on: its panel loads, and its login page opens beside the disc with a word
// from the disc, as on first launch.
function addInstagram() {
  if (accounts.instagram) return;
  const account = createPlatform(INSTAGRAM);
  pushDisc();
  refreshMenu();
  account.panel.win.webContents.once('did-finish-load', () =>
    setTimeout(() => {
      if (!accounts.instagram || !bubble) return;
      setFocus('instagram');
      account.openInbox(bubble.getBounds());
      bubble.landed({
        href: null,
        name: 'Instagram is here',
        preview:
          'Sign in beside me. Click the small mark on my foot, or the Instagram head in the stack, to switch between the two.',
        avatar: null,
        platform: 'instagram',
        hold: 30000,
      });
    }, 500),
  );
}

function removeInstagram() {
  const account = accounts.instagram;
  if (!account) return;
  if (focused === 'instagram') setFocus('messenger');
  delete accounts.instagram;
  account.destroy();
  pushDisc();
  refreshMenu();
}

async function showStack(animate = true) {
  bubble.expand(await current().stackItems(), animate);
  syncSound();
}

// Messenger (and Instagram) play their own sound when a message arrives. While the stack is
// up or a panel is showing the user is looking at Bubble and sees the message land, so the
// pages are muted; the sound is for when Bubble is put away. (Both pages: a message on the
// platform out of focus would otherwise sound while the other one is open.)
function syncSound() {
  if (!bubble) return;
  const quiet = bubble.isExpanded() || Object.values(accounts).some((a) => a.panel.isVisible());
  eachAccount((a) => a.panel.setMuted(quiet));
}

function setPins(pins) {
  store.patch({ pins });
  eachAccount((a) => a.syncPin());
  if (bubble.isExpanded()) showStack(false);
}

// Pin a chat, or unpin it. Up to MAX_PINS per platform; a chat that is neither in the list
// nor showing in the panel cannot be pinned (nothing is known about it) — but any pinned one
// can be unpinned.
const pinsOf = (href) =>
  settings.pins.filter((p) => platformOfHref(p.href) === platformOfHref(href));
function togglePin(href, known = null) {
  if (settings.pins.some((p) => p.href === href))
    return setPins(settings.pins.filter((p) => p.href !== href));
  const account = accountOf(href);
  const row = known || (account && account.rowFor(href));
  if (!account || !row || pinsOf(href).length >= MAX_PINS) return;
  const pin = { href, name: row.name, avatarUrl: row.avatarUrl };
  const threadHref = account.threadHrefOf(href);
  if (threadHref) pin.threadHref = threadHref;
  setPins([...settings.pins, pin]);
}

// Right-click on a head: pin it, or unpin it.
function headMenu(href) {
  const pinned = settings.pins.some((p) => p.href === href);
  const full = pinsOf(href).length >= MAX_PINS;
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

// Electron grants every permission request by default. Only Meta's messaging sites (and the
// facebook.com login pages the panels may visit) get anything, and only what a chat client needs.
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
// lib/telemetry are cancelled; everything the sites need to work passes untouched.
// The listener costs every matching request a hop through the main process, so it is only
// registered while the setting is on.
function blockTelemetry(on) {
  const filter = {
    urls: ['*://*.facebook.com/*', '*://*.messenger.com/*', '*://*.instagram.com/*'],
  };
  session.defaultSession.webRequest.onBeforeRequest(
    filter,
    on ? (details, callback) => callback({ cancel: isTelemetryUrl(details.url) }) : null,
  );
}

// The compose button lives in Messenger's inbox view, so bring that up first. (Instagram's
// inbox has its own; the panel simply opens there.)
async function newMessage() {
  if (!bubble) return;
  const account = current();
  await openInbox();
  if (account.site.id !== 'messenger') return;
  scrape
    .run(
      account.panel.win.webContents,
      `(() => {
    const btn = document.querySelector('[aria-label="New message"]') ||
                document.querySelector('[aria-label="Start a new message"]') ||
                document.querySelector('[aria-label="Compose"]');
    if (btn) btn.click();
  })()`,
      { userGesture: true },
    )
    .catch((err) => log.debug('panel script failed', { err }));
}

// Open a conversation beside the stack, bringing the stack up if it isn't already — and its
// platform into focus if it isn't. The stack must be up before the panel is placed: it is
// placed beside the column, not the disc.
async function openChat(href) {
  const account = accountOf(href);
  if (!account) return;
  if (account.site.id !== focused) setFocus(account.site.id);
  if (!bubble.isExpanded()) await showStack();
  bubble.setActive(href);
  account.open(href, bubble.getStackBounds());
}

// The inbox beside the stack, the same way a conversation opens: the stack comes up if it
// isn't, and stays, so a chat is still one click away while the inbox shows.
async function openInbox() {
  if (!bubble.isExpanded()) await showStack();
  const opened = current().openInbox(bubble.getStackBounds());
  syncActive();
  return opened;
}

// Cmd+N opens the n-th most recent chat the same way a banner click does (a synthetic click
// on the list row only highlights it at the panel's width).
function openRecent(n) {
  const row = bubble && current().chats().recent[n];
  if (row) openChat(row.href);
}

function openSettings() {
  if (settingsWindow && bubble) settingsWindow.open(bubble.getBounds());
}

function bubbleContextMenu() {
  const update = updates.latest();
  const other = otherPlatform();
  const openItems = Object.values(accounts).flatMap((a) => [
    {
      label: `Open ${a.site.label}`,
      click: () => {
        setFocus(a.site.id);
        openInbox();
      },
    },
    { label: `Reload ${a.site.label}`, click: () => a.panel.reload() },
  ]);
  Menu.buildFromTemplate([
    ...(other
      ? [
          { label: `Switch to ${other.label}`, click: () => setFocus(other.id) },
          { type: 'separator' },
        ]
      : []),
    ...openItems,
    { type: 'separator' },
    ...(update
      ? [{ label: `Update to ${update.version}…`, click: () => offerUpdate(update) }]
      : []),
    { label: 'Settings…', click: openSettings },
    { label: 'Reset Bubble Position', click: () => bubble.resetPosition() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]).popup({ window: bubble.win });
}

// A newer release: the release page — or, for an app Homebrew installed, the command that
// updates it (in full: on an untrusted tap the short name upgrades nothing, silently).
async function offerUpdate(update) {
  if (!installedByHomebrew()) return shell.openExternal(update.url);
  const { response } = await dialog.showMessageBox({
    type: 'info',
    message: `Bubble ${update.version} is available`,
    detail:
      `You installed Bubble with Homebrew. Update it in Terminal:\n\n${HOMEBREW_UPGRADE}\n\n` +
      `If Homebrew says nothing is outdated, trust the tap once:\n${HOMEBREW_TRUST}`,
    buttons: ['Copy Command', 'Open Release Page', 'Later'],
    defaultId: 0,
    cancelId: 2,
  });
  if (response === 0) clipboard.writeText(HOMEBREW_UPGRADE);
  else if (response === 1) shell.openExternal(update.url);
}

// The app menu; rebuilt when the focused platform's recent chats' names change, so Cmd+1–5
// show who they open.
let menuKey = '';
function refreshMenu() {
  const recent = current() ? current().chats().recent : [];
  const key = focused + '\n' + recent.map((r) => r.name).join('\n');
  if (key === menuKey) return;
  menuKey = key;
  createMenu();
}
function createMenu() {
  const recent = current() ? current().chats().recent : [];
  const conversations = Array.from({ length: RECENT_LIMIT }, (_, i) => ({
    label: recent[i] ? recent[i].name : `Recent Chat ${i + 1}`,
    accelerator: `CmdOrCtrl+${i + 1}`,
    enabled: Boolean(recent[i]),
    click: () => openRecent(i),
  }));

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: app.name,
        // The application-menu roles are macOS's; elsewhere this menu is Settings and Quit
        // (the bar itself is not shown on a frameless window, but its accelerators work).
        submenu: CAPS.dock
          ? [
              { role: 'about' },
              { type: 'separator' },
              { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: openSettings },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ]
          : [
              { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: openSettings },
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
                {
                  role: 'toggleDevTools',
                  accelerator: CAPS.dock ? 'CmdOrCtrl+Option+I' : 'CmdOrCtrl+Shift+I',
                },
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
// and the panels have their own, richer guard (panel.js).
app.enableSandbox();
app.on('web-contents-created', (_event, wc) => {
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (event, url) => {
    const isPanel = Object.values(accounts).some((a) => wc === a.panel.win.webContents);
    if (!isPanel && !url.startsWith('file://')) event.preventDefault();
  });
});

app.whenReady().then(() => {
  if (!primary) return;
  if (app.dock) app.dock.hide();
  createMenu();
  persistFacebookCookies();
  restrictPermissions();
  blockTelemetry(settings.blockTelemetry); // before the panels start loading

  createPlatform(MESSENGER);
  if (settings.instagram) createPlatform(INSTAGRAM);
  focused = accounts[settings.platform] ? settings.platform : 'messenger';
  setInterval(() => eachAccount((a) => a.refresh()), RECENT_POLL_MS);

  dismiss = createDismissTarget({ overFullscreen: settings.overFullscreen });

  bubble = createBubble({
    position: settings.bubble,
    dismiss,
    overFullscreen: settings.overFullscreen,
    size: BUBBLE_SIZES[settings.bubbleSize],
    // A disc click opens the newest received message, on either platform — or, with nothing
    // unread, brings the stack up (or, soon after a chat was put away by clicking elsewhere,
    // that chat straight back).
    onClick: () => {
      // Signed out: the stack would be empty; the disc goes straight to the login page.
      if (current().status().signedOut) return openInbox();
      const unread = {};
      eachAccount((a) => (unread[a.site.id] = { recent: a.chats().recent, landed: a.landed() }));
      const pick = pickUnread({ focused, accounts: unread });
      if (pick) return openChat(pick.href);
      const click = current().discClick(Date.now(), settings.reopenLast);
      if (click.action === 'reopen') openChat(click.href);
      else showStack();
    },
    // Pressing the disc while the stack is open, or anywhere outside it (the shield), puts it
    // all away — and remembers the open chat for a while.
    onClose: () => {
      current().close();
      syncActive();
      current().hide();
      syncSound();
    },
    onContextMenu: bubbleContextMenu,
    onHeadMenu: headMenu,
    onPinToggle: togglePin,
    // A conversation opens beyond the stack, which stays (or comes) up so the other chats are
    // one click away without fanning out again.
    onOpenChat: (href) => openChat(href),
    onOpenInbox: openInbox,
    onSwitch: setFocus,
    // A reply typed into the banner goes out through that platform's hidden page, whichever is
    // in focus. If that fails, the conversation opens with whatever got as far as the composer,
    // so nothing typed is lost.
    onReply: async (href, text) => {
      const account = accountOf(href);
      const ok = account ? await account.reply(href, text) : false;
      if (!ok) log.warn('quick reply not delivered; opening the chat', { thread: hashHref(href) });
      bubble.replyResult(ok);
      if (!ok) openChat(href);
    },
    onDismiss: () => app.quit(),
    onMoved: (pos) => {
      current().panel.follow(bubble.getStackBounds());
      store.setPosition(pos);
    },
  });

  settingsWindow = createSettingsWindow({
    getSettings: () => settings,
    setSetting: updateSetting,
    subscribe: (fn) => store.subscribe((s) => fn(s)),
    // Messenger's own switches (notification sounds among them) live in its Preferences.
    onOpenMessengerPreferences: () => {
      setFocus('messenger');
      current().openPreferences(bubble.getBounds());
      syncActive();
    },
  });

  applySettings(null);
  pushDisc();

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
    accounts.messenger.panel.win.webContents.once('did-finish-load', () =>
      setTimeout(() => {
        accounts.messenger.openInbox(bubble.getBounds());
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
      state: () => current().chats(),
      settings: () => settings,
      store,
      accounts,
      focused: () => focused,
      setFocus,
      get panel() {
        return current().panel;
      },
      bubble,
      log,
      refreshRecent: (rows) => current().refresh(rows),
      showStack,
      stats: () => current().stats(),
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
