// Messenger is kept loaded, hidden, for days at a time. Its live connection does not survive
// that indefinitely — a laptop sleeping, a network change, a failed load all leave a page that
// looks fine but never receives another message. The cure is a reload, taken only for a
// reason, only when nobody is looking, and never in a loop. This is the rule, pure; panel.js
// feeds it events and asks it what to do.
const { errorRetryDelay } = require('./refresh');

const SOCKET_GRACE_MS = 2 * 60 * 1000; // a dropped socket gets this long to reconnect on its own
const STALE_MS = 10 * 60 * 1000; // no completed Meta request for this long, online: a stall
const BACKOFF_MS = [30 * 1000, 2 * 60 * 1000, 10 * 60 * 1000]; // between reloads that change nothing
const ALIVE_AFTER_MS = 60 * 1000; // traffic this long after a reload proves it helped

const initial = (now) => ({
  loadedAt: now,
  lastRequestAt: now,
  socketErrorAt: null,
  resumePending: false,
  failLoadAt: null,
  failCount: 0,
  lastReloadAt: null,
  reloadCount: 0,
});

// Events: loaded, fail-load, socket-open, socket-error, request-ok, resume, reload (we did).
function reduce(state, event, now) {
  switch (event) {
    case 'loaded':
      return {
        ...state,
        loadedAt: now,
        lastRequestAt: now,
        failLoadAt: null,
        resumePending: false,
        socketErrorAt: null,
      };
    case 'fail-load':
      return { ...state, failLoadAt: now, failCount: state.failCount + 1 };
    case 'socket-open':
      return { ...alive(state, now), socketErrorAt: null, lastRequestAt: now };
    case 'socket-error':
      return { ...state, socketErrorAt: state.socketErrorAt || now };
    case 'request-ok':
      return { ...alive(state, now), lastRequestAt: now };
    case 'resume':
      return { ...state, resumePending: true };
    case 'reload':
      return {
        ...state,
        lastReloadAt: now,
        reloadCount: state.reloadCount + 1,
        resumePending: false,
        socketErrorAt: null,
        failLoadAt: null,
        failCount: state.failCount,
      };
    default:
      return state;
  }
}

// Traffic well after a reload means the reload worked: the next one need not wait long.
const alive = (state, now) =>
  state.lastReloadAt !== null && now - state.lastReloadAt >= ALIVE_AFTER_MS
    ? { ...state, reloadCount: 0 }
    : state;

function decide(state, { visible, online, now }) {
  const none = (reason) => ({ reload: false, reason });
  if (visible) return none('visible');
  if (!online) return none('offline');
  const backoff =
    state.lastReloadAt === null
      ? 0
      : BACKOFF_MS[Math.min(state.reloadCount - 1, BACKOFF_MS.length - 1)];
  if (state.lastReloadAt !== null && now - state.lastReloadAt < backoff) return none('backoff');
  if (state.failLoadAt !== null)
    return now - state.failLoadAt >= errorRetryDelay(state.failCount - 1)
      ? { reload: true, reason: 'fail-load' }
      : none('fail-wait');
  if (state.resumePending) return { reload: true, reason: 'resume' };
  if (state.socketErrorAt !== null && now - state.socketErrorAt >= SOCKET_GRACE_MS)
    return { reload: true, reason: 'socket-error' };
  if (now - Math.max(state.lastRequestAt, state.loadedAt) >= STALE_MS)
    return { reload: true, reason: 'stale' };
  return none(null);
}

module.exports = { initial, reduce, decide, SOCKET_GRACE_MS, STALE_MS, BACKOFF_MS };
