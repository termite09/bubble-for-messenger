// Every IPC channel, in one place. Main imports these; the preloads (sandboxed, so they cannot
// require this file) spell the same strings, and test/ipc.test.js checks that every literal a
// preload uses is listed here — a renamed channel fails a test instead of silently dropping
// messages.
const CHANNELS = Object.freeze({
  // bubble page ↔ main
  BUBBLE_DRAG_START: 'bubble:drag-start',
  BUBBLE_DRAG_END: 'bubble:drag-end',
  BUBBLE_HIT: 'bubble:hit',
  BUBBLE_CONTEXT_MENU: 'bubble:context-menu',
  BUBBLE_HEAD_MENU: 'bubble:head-menu',
  BUBBLE_PIN_TOGGLE: 'bubble:pin-toggle',
  BUBBLE_OPEN_CHAT: 'bubble:open-chat',
  BUBBLE_OPEN_INBOX: 'bubble:open-inbox',
  BUBBLE_REPLY: 'bubble:reply',
  BUBBLE_REPLY_FOCUS: 'bubble:reply-focus',
  BUBBLE_BANNER_EXTRA: 'bubble:banner-extra',
  BUBBLE_LAYOUT: 'bubble:layout',
  BUBBLE_FAN: 'bubble:fan',
  BUBBLE_ACTIVE: 'bubble:active',
  BUBBLE_OPENED: 'bubble:opened',
  BUBBLE_BADGE: 'bubble:badge',
  BUBBLE_LANDED: 'bubble:landed',
  BUBBLE_REPLY_RESULT: 'bubble:reply-result',
  BUBBLE_SETTINGS: 'bubble:settings',
  BUBBLE_STATE: 'bubble:state',
  // panel preload → main: the chat list's rows; main → preload: read them now
  PANEL_ROWS: 'panel:rows',
  PANEL_READ: 'panel:read',
  // shield, dismiss target
  SHIELD_CLICK: 'shield:click',
  DISMISS_HOT: 'dismiss:hot',
  // settings page ↔ main
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_CLOSE: 'settings:close',
  SETTINGS_RESIZE: 'settings:resize',
  SETTINGS_OPEN_MESSENGER_PREFERENCES: 'settings:open-messenger-preferences',
  SETTINGS_CHANGED: 'settings:changed',
});

module.exports = { CHANNELS };
