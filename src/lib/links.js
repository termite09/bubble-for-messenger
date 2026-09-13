const REDIRECT_HOSTS = ['l.messenger.com', 'l.facebook.com'];

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

// True for a cookie/permission origin on Meta's own domains (suffix match, never substring).
const isMetaHost = (host) => typeof host === 'string' &&
  ['messenger.com', 'facebook.com'].some((d) => onDomain(host.toLowerCase().replace(/^\./, ''), d));

// messenger.com pages stay in the panel; everything else (incl. its l.* link-shim) is external.
function isInternal(url) {
  const host = hostOf(url);
  return Boolean(host) && onDomain(host, 'messenger.com') && !REDIRECT_HOSTS.includes(host);
}

// Main-frame navigations the panel may follow. Meta's login, 2FA and "security check" pages
// live on facebook.com and redirect client-side, so cancelling them strands the login.
function staysInPanel(url) {
  const host = hostOf(url);
  return isInternal(url) || (Boolean(host) && onDomain(host, 'facebook.com') && !REDIRECT_HOSTS.includes(host));
}

// Resolve a link to the http(s) URL that should open in the default browser, or null.
// l.messenger.com / l.facebook.com wrap outbound links in ?u=; unwrap them first.
function browserUrl(url) {
  let u = parseUrl(url);
  if (u && REDIRECT_HOSTS.includes(u.hostname.toLowerCase())) u = parseUrl(u.searchParams.get('u'));
  return isWebUrl(u) ? u.toString() : null;
}

module.exports = { isInternal, staysInPanel, browserUrl, isMetaHost };
