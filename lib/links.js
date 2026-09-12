const REDIRECT_HOSTS = ['l.messenger.com', 'l.facebook.com'];

function parseUrl(url) {
  try {
    return new URL(url);
  } catch (e) {
    return null;
  }
}

const isWebUrl = (u) => Boolean(u) && (u.protocol === 'http:' || u.protocol === 'https:');

// messenger.com pages stay in the panel; everything else (incl. its l.* link-shim) is external.
function isInternal(url) {
  const u = parseUrl(url);
  if (!isWebUrl(u)) return false;
  const host = u.hostname.toLowerCase();
  return (host === 'messenger.com' || host.endsWith('.messenger.com')) && !REDIRECT_HOSTS.includes(host);
}

// Resolve a link to the http(s) URL that should open in the default browser, or null.
// l.messenger.com / l.facebook.com wrap outbound links in ?u=; unwrap them first.
function browserUrl(url) {
  let u = parseUrl(url);
  if (u && REDIRECT_HOSTS.includes(u.hostname.toLowerCase())) u = parseUrl(u.searchParams.get('u'));
  return isWebUrl(u) ? u.toString() : null;
}

module.exports = { isInternal, browserUrl };
