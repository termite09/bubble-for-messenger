// A stand-in for the `electron` module, enough to instantiate the window modules and drive
// their IPC and events. Install with `install()` before requiring any src/main module.
const Module = require('node:module');
const { EventEmitter } = require('node:events');

function makeStub() {
  const windows = [];
  const ipcMain = new EventEmitter();
  ipcMain.handlers = new Map();
  ipcMain.handle = (channel, fn) => ipcMain.handlers.set(channel, fn);
  ipcMain.removeHandler = (channel) => ipcMain.handlers.delete(channel);

  class WebContents extends EventEmitter {
    constructor() { super(); this.sent = []; this.zoom = 1; this.url = ''; this.destroyed = false; this.session = { fetch: async () => ({ ok: false, headers: { get: () => null } }) }; }
    send(channel, ...args) { this.sent.push([channel, ...args]); }
    setZoomFactor(z) { this.zoom = z; }
    getZoomFactor() { return this.zoom; }
    getURL() { return this.url; }
    executeJavaScript() { return Promise.resolve(null); }
    isLoading() { return false; }
    isDestroyed() { return this.destroyed; }
    reload() { this.emit('did-finish-load'); }
  }

  class BrowserWindow extends EventEmitter {
    constructor(opts) {
      super();
      this.opts = opts;
      this.bounds = { x: opts.x || 0, y: opts.y || 0, width: opts.width || 0, height: opts.height || 0 };
      this.visible = false; this.destroyed = false; this.level = null; this.workspaces = null; this.ignore = null; this.focusable = opts.focusable !== false;
      this.webContents = new WebContents();
      this.loaded = null;
      windows.push(this);
    }
    setAlwaysOnTop(_on, level) { this.level = level; }
    setVisibleOnAllWorkspaces(visible, o) { this.workspaces = { visible, ...o }; }
    loadFile(f) { this.loaded = f; }
    loadURL(u) { this.loaded = u; this.webContents.url = u; return Promise.resolve(); }
    setBounds(b) { this.bounds = { ...this.bounds, ...b }; }
    getBounds() { return { ...this.bounds }; }
    setPosition(x, y) { this.bounds.x = x; this.bounds.y = y; }
    setSize(w, h) { this.bounds.width = w; this.bounds.height = h; }
    getSize() { return [this.bounds.width, this.bounds.height]; }
    show() { this.visible = true; }
    showInactive() { this.visible = true; }
    hide() { this.visible = false; }
    focus() {}
    isVisible() { return this.visible; }
    isDestroyed() { return this.destroyed; }
    isFocused() { return false; }
    setIgnoreMouseEvents(on, o) { this.ignore = { on, ...o }; }
    setFocusable(on) { this.focusable = on; }
    setOpacity() {}
    setBackgroundColor() {}
    close() { this.emit('close', { preventDefault() {} }); }
    destroy() { this.destroyed = true; this.emit('closed'); }
  }

  const display = { id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: { x: 0, y: 0, width: 1440, height: 875 } };
  const screen = Object.assign(new EventEmitter(), {
    cursor: { x: 0, y: 0 },
    getPrimaryDisplay: () => display,
    getDisplayMatching: () => display,
    getDisplayNearestPoint: () => display,
    getCursorScreenPoint: () => ({ ...screen.cursor }),
  });

  const app = Object.assign(new EventEmitter(), { isPackaged: false, getPath: () => '/tmp', quit() {}, requestSingleInstanceLock: () => true });
  const nativeTheme = Object.assign(new EventEmitter(), { themeSource: 'system', shouldUseDarkColors: true });
  const powerMonitor = new EventEmitter();
  const session = { defaultSession: { cookies: new EventEmitter(), webRequest: { onBeforeRequest() {} }, setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } };
  const Menu = { buildFromTemplate: (t) => ({ items: t, popup() {} }), setApplicationMenu() {}, getApplicationMenu: () => null };
  const shell = { openExternal: async () => {}, showItemInFolder() {} };

  return { app, BrowserWindow, ipcMain, screen, nativeTheme, powerMonitor, session, Menu, shell, windows };
}

let installed = null;
function install() {
  if (installed) return installed;
  installed = makeStub();
  const load = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'electron') return installed;
    return load.call(this, request, ...rest);
  };
  return installed;
}

// A sender for ipcMain.emit: the page of `win`.
const from = (win) => ({ sender: win.webContents });

module.exports = { install, from };
