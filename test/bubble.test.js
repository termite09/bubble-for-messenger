const test = require('node:test');
const assert = require('node:assert');
const electron = require('./helpers/electron-stub').install();
const { from } = require('./helpers/electron-stub');
const { createBubble } = require('../src/main/bubble');
const { CHANNELS } = require('../src/lib/ipc');
const { PAD, FAN_ITEM } = require('../src/lib/layout');

const makeBubble = (overrides = {}) => {
  const calls = { click: 0, close: [], moved: [], dismiss: 0 };
  const bubble = createBubble({
    position: { x: 1380, y: 800 },
    onClick: () => calls.click++,
    onClose: (why) => calls.close.push(why),
    onMoved: (p) => calls.moved.push(p),
    onContextMenu() {},
    onHeadMenu() {},
    onOpenChat() {},
    onOpenInbox() {},
    onReply() {},
    onDismiss: () => calls.dismiss++,
    dismiss: null,
    ...overrides,
  });
  const win = electron.windows[electron.windows.length - 1];
  win.emit('ready-to-show'); // first layout, as Electron would trigger it
  return { bubble, win, calls };
};
const sentOn = (win, channel) =>
  win.webContents.sent.filter(([c]) => c === channel).map(([, ...a]) => a);

test('the bubble window is a sandboxed, non-focusable, screen-saver-level floating window on all Spaces', () => {
  const { win } = makeBubble();
  assert.equal(win.opts.webPreferences.sandbox, true);
  assert.equal(win.opts.webPreferences.preload.endsWith('bubble-preload.js'), true);
  assert.equal(win.opts.focusable, false);
  assert.equal(win.opts.fullscreenable, false);
  assert.equal(win.level, 'screen-saver');
  assert.deepEqual(win.workspaces, {
    visible: true,
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  });
  assert.deepEqual(win.ignore, { on: true, forward: true });
});

test('a press and release without movement is a click; with movement, a snap to the edge', async () => {
  const { win, calls } = makeBubble();
  electron.screen.cursor = { x: 1400, y: 820 };
  electron.ipcMain.emit(CHANNELS.BUBBLE_DRAG_START, from(win));
  electron.ipcMain.emit(CHANNELS.BUBBLE_DRAG_END, from(win));
  assert.equal(calls.click, 1);
  // A press from another page is ignored.
  electron.ipcMain.emit(CHANNELS.BUBBLE_DRAG_START, { sender: {} });
  electron.ipcMain.emit(CHANNELS.BUBBLE_DRAG_END, { sender: {} });
  assert.equal(calls.click, 1);
  // Drag left by 300px, release: the disc moves with the cursor, then eases back to the right edge.
  electron.ipcMain.emit(CHANNELS.BUBBLE_DRAG_START, from(win));
  electron.screen.cursor = { x: 1100, y: 820 };
  await new Promise((r) => setTimeout(r, 40));
  assert.ok(calls.moved.length >= 1);
  assert.equal(calls.moved[calls.moved.length - 1].x, 1080);
  electron.ipcMain.emit(CHANNELS.BUBBLE_DRAG_END, from(win));
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(calls.click, 1);
  assert.equal(calls.moved[calls.moved.length - 1].x, 1440 - 44 - 16);
});

test('expand grows the window for the rows, tells the page, shows the shield; a press folds it and closes', async () => {
  const { bubble, win, calls } = makeBubble();
  const before = win.getBounds();
  bubble.expand([
    { href: '/t/1/', name: 'A' },
    { href: '/t/2/', name: 'B' },
  ]);
  assert.equal(bubble.isExpanded(), true);
  assert.equal(win.getBounds().height, before.height + 3 * FAN_ITEM); // two rows plus the inbox
  const fan = sentOn(win, CHANNELS.BUBBLE_FAN).pop()[0];
  assert.equal(fan.animate, 'in');
  assert.equal(fan.items.length, 2);
  const shield = electron.windows.find((w) => w.loaded && w.loaded.endsWith('shield.html'));
  assert.equal(shield.visible, true);
  assert.equal(shield.level, 'floating');
  electron.ipcMain.emit(CHANNELS.BUBBLE_DRAG_START, from(win));
  electron.ipcMain.emit(CHANNELS.BUBBLE_DRAG_END, from(win));
  assert.deepEqual(calls.close, ['disc']);
  assert.equal(calls.click, 0); // the press that folded the stack is done
  assert.equal(shield.visible, false);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(win.getBounds().height, before.height);
});

test("the banner's reported room grows the window above the disc near the bottom; nonsense is ignored", () => {
  const { win } = makeBubble();
  const before = win.getBounds();
  electron.ipcMain.emit(CHANNELS.BUBBLE_BANNER_EXTRA, from(win), 60);
  assert.equal(win.getBounds().height, before.height + 60);
  assert.equal(win.getBounds().y, before.y - 60);
  electron.ipcMain.emit(CHANNELS.BUBBLE_BANNER_EXTRA, from(win), 'junk');
  assert.equal(win.getBounds().height, before.height);
  electron.ipcMain.emit(CHANNELS.BUBBLE_BANNER_EXTRA, from(win), 99999);
  assert.equal(win.getBounds().height, before.height + 600);
});

test('a size change zooms the page and keeps the disc on its edge', () => {
  const { bubble, win, calls } = makeBubble();
  bubble.setSettings({ quickReply: true, badge: 'steady', bubbleSize: 'large' });
  assert.equal(win.webContents.zoom, 68 / 44);
  assert.deepEqual(calls.moved.pop(), { x: 1440 - 68 - 16, y: 800 - 12 });
  assert.equal(win.getBounds().width, 250 * (68 / 44) + 2 * PAD * (68 / 44));
});

// Two platforms: the disc is told which mark and count to show and what the other platform's
// satellite says.
test('setPlatform reaches the page and the state handshake; a switch from the page is validated', async () => {
  const switched = [];
  const { bubble, win } = makeBubble({ onSwitch: (id) => switched.push(id) });
  const state = {
    id: 'messenger',
    mark: 'icon.png',
    badge: 3,
    other: { id: 'instagram', label: 'Instagram', mark: 'instagram.svg', count: 2 },
  };
  bubble.setPlatform(state);
  assert.deepEqual(sentOn(win, CHANNELS.BUBBLE_PLATFORM).pop(), [state]);
  const handshake = await electron.ipcMain.handlers.get(CHANNELS.BUBBLE_STATE)(from(win));
  assert.deepEqual(handshake.platform, state);
  electron.ipcMain.emit(CHANNELS.BUBBLE_SWITCH, from(win), 'instagram');
  electron.ipcMain.emit(CHANNELS.BUBBLE_SWITCH, from(win), 'tiktok');
  electron.ipcMain.emit(CHANNELS.BUBBLE_SWITCH, from(win), { id: 'instagram' });
  assert.deepEqual(switched, ['instagram']);
});
