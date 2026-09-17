const { isMetaHost } = require('./links');

// datr/sb/fr are the device cookies Facebook persists itself — listed so a session-scoped
// issue of them is kept too. A stable datr is how Facebook recognises a returning trusted
// device, so keeping these is good for the account, not merely convenient.
//
// The login pair (c_user, xs) is deliberately NOT here. Facebook issues those as *session*
// cookies precisely when the user did not tick "keep me logged in" — rewriting them with a
// 90-day expiry reversed that choice without telling anyone, and extended a session scope Meta
// set on purpose. Honouring the site's scoping costs a sign-in after a restart for the users
// who asked for exactly that. See docs/COMPLIANCE-PLAN.md §7.1.
//
// Everything else (presence, wd, ...) is transient on purpose and stays as issued.
const LOGIN_COOKIES = new Set(['datr', 'sb', 'fr']);
const PERSIST_DAYS = 90;

// A session cookie from the list, on Meta's hosts, whenever the site (re)sets it — including a
// re-issue with the same value, which would otherwise quietly drop the expiry we gave it. Our
// own rewrite never matches: it is not a session cookie. `cause` is only informative.
function shouldPersistCookie(cookie, cause, removed) {
  return (
    !removed &&
    Boolean(cookie) &&
    cookie.session === true &&
    LOGIN_COOKIES.has(cookie.name) &&
    isMetaHost(cookie.domain)
  );
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
