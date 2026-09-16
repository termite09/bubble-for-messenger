// What the disc can say about the app's state: whether Messenger is reachable, and whether
// there is a signed-in session behind it.
const { isMetaHost } = require('./links');

// From the liveness state and the network: 'offline' (no network), 'reconnecting' (Messenger's
// chat socket dropped and has not come back), 'online'.
function connectionState({ online, socketErrorAt }) {
  if (!online) return 'offline';
  if (socketErrorAt !== null && socketErrorAt !== undefined) return 'reconnecting';
  return 'online';
}

// A signed-out session lands on a login or checkpoint page on Meta's own hosts: Messenger's
// /login and /checkpoint, Instagram's /accounts/login (2FA under it) and /challenge.
const SIGNED_OUT_PATH = /^\/(login|checkpoint|accounts\/login|challenge)(\/|\.php|$)/;
function signedOut(url) {
  try {
    const u = new URL(url);
    return isMetaHost(u.hostname) && SIGNED_OUT_PATH.test(u.pathname);
  } catch (e) {
    return false;
  }
}

module.exports = { connectionState, signedOut };
