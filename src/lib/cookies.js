const { isMetaHost } = require('./links');

// Facebook issues the login pair (c_user, xs) as session cookies unless "keep me logged in" was
// ticked; the app keeps them so the login survives a restart. datr/sb/fr are the device cookies
// Facebook persists itself — listed so a session-scoped issue of them is kept too. Everything
// else (presence, wd, ...) is transient on purpose and stays as issued.
const LOGIN_COOKIES = new Set(['c_user', 'xs', 'datr', 'sb', 'fr']);
const PERSIST_DAYS = 90;

// Only a cookie the site just set ('explicit' — not our own rewrite, which arrives as
// 'overwrite' and is no longer a session cookie anyway), on Meta's hosts, from the list.
function shouldPersistCookie(cookie, cause, removed) {
  return !removed && cause === 'explicit' && Boolean(cookie) && cookie.session === true &&
    LOGIN_COOKIES.has(cookie.name) && isMetaHost(cookie.domain);
}

// The same cookie with an expiry. Every attribute is copied as issued — sameSite in particular,
// and a host-only cookie stays host-only: `domain` is omitted so the url's host scopes it.
function persistentCookie(cookie, nowMs) {
  const host = cookie.domain.replace(/^\./, '');
  const out = {
    url: `https://${host}${cookie.path || '/'}`,
    name: cookie.name,
    value: cookie.value,
    path: cookie.path || '/',
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite || 'unspecified',
    expirationDate: Math.floor(nowMs / 1000) + PERSIST_DAYS * 24 * 60 * 60,
  };
  if (!cookie.hostOnly) out.domain = cookie.domain;
  return out;
}

module.exports = { shouldPersistCookie, persistentCookie, LOGIN_COOKIES, PERSIST_DAYS };
