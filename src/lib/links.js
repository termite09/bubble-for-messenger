const REDIRECT_HOSTS = ['l.messenger.com', 'l.facebook.com', 'lm.facebook.com'];
const META_DOMAINS = ['messenger.com', 'facebook.com'];

function parseUrl(url) {
  try {
    return new URL(url);
  } catch (e) {
    return null;
  }
}

const isWebUrl = (u) => Boolean(u) && (u.protocol === 'http:' || u.protocol === 'https:');

function hostOf(url) {
  const u = parseUrl(url);
  return isWebUrl(u) ? u.hostname.toLowerCase() : null;
}

const onDomain = (host, domain) => host === domain || host.endsWith('.' + domain);

// Meta wraps outbound links in a tracking redirect: the l.* / lm.* shim hosts, or /l.php on any
// of its own hosts (facebook.com, messenger.com and their subdomains). Only the exact /l.php path
// counts there; the rest of those sites is pages.
function isRedirect(u) {
  const host = u.hostname.toLowerCase();
  return (
    REDIRECT_HOSTS.includes(host) ||
    (isMetaHost(host) && REDIRECT_PATHS.has(u.pathname.replace(/\/$/, '')))
  );
}
// /l.php is the shim; /flx/warn is the "you're leaving Facebook" page it sends some links to.
const REDIRECT_PATHS = new Set(['/l.php', '/flx/warn']);

// True for a cookie/permission origin on Meta's own domains (suffix match, never substring).
const isMetaHost = (host) =>
  typeof host === 'string' &&
  META_DOMAINS.some((d) => onDomain(host.toLowerCase().replace(/^\./, ''), d));

// Pages on the panel's own site (`domain`: messenger.com) stay in the panel;
// everything else (incl. the l.* link-shims) is external.
function isInternal(url, domain = 'messenger.com') {
  const u = parseUrl(url);
  const host = hostOf(url);
  return Boolean(host) && onDomain(host, domain) && !isRedirect(u);
}

// Main-frame navigations the panel may follow. Meta's login, 2FA and "security check" pages
// live on facebook.com and redirect client-side, so cancelling them strands the login.
function staysInPanel(url, domain = 'messenger.com') {
  const u = parseUrl(url);
  const host = hostOf(url);
  return (
    isInternal(url, domain) || (Boolean(host) && onDomain(host, 'facebook.com') && !isRedirect(u))
  );
}

// Resolve a link to the http(s) URL that should open in the default browser, or null.
// The tracking shims carry the real destination in ?u=; unwrap them first.
function browserUrl(url) {
  let u = parseUrl(url);
  if (u && isRedirect(u)) u = parseUrl(u.searchParams.get('u'));
  return isWebUrl(u) ? u.toString() : null;
}

// Whether a URL matches one of Chromium's webRequest filter patterns (`<scheme>://<host>/<path>`,
// where the scheme may be `*`, the host may start with `*.` — matching the domain itself and
// any subdomain — and the path may contain `*`). A session keeps one webRequest listener per
// event, so the panels' watches share one and sort the traffic by these.
function matchesUrlPattern(url, pattern) {
  const m = /^(\*|[a-z]+):\/\/(\*\.)?([^/*]+)\/(.*)$/.exec(pattern);
  const u = parseUrl(url);
  if (!m || !u) return false;
  const [, scheme, anySub, host, pathPattern] = m;
  if (scheme !== '*' && u.protocol !== scheme + ':') return false;
  const h = u.hostname.toLowerCase();
  if (anySub ? !onDomain(h, host.toLowerCase()) : h !== host.toLowerCase()) return false;
  const path = u.pathname + u.search;
  const re = new RegExp('^/' + pathPattern.split('*').map(escapeRegExp).join('.*') + '$');
  return re.test(path);
}
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { isInternal, staysInPanel, browserUrl, isMetaHost, matchesUrlPattern };
