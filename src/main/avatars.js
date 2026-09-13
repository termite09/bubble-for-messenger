const MAX_CACHE = 50;
const cache = new Map(); // url -> Promise<string|null>

const MAX_BYTES = 1024 * 1024;
const CDN_HOSTS = ['fbcdn.net', 'facebook.com', 'messenger.com'];

// Only an https image on Meta's own hosts is worth fetching; the URL comes from the page's DOM.
function isAvatarUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && CDN_HOSTS.some((d) => u.hostname === d || u.hostname.endsWith('.' + d));
  } catch (e) {
    return false;
  }
}

// Fetch a profile picture through the Messenger session and return a data URL the bubble can
// render under its strict CSP. Memoised; failures are cached as null.
function fetchAvatar(ses, url) {
  if (!url || !isAvatarUrl(url)) return Promise.resolve(null);
  if (cache.has(url)) return cache.get(url);
  const p = ses.fetch(url)
    .then(async (res) => {
      const type = res.headers.get('content-type') || '';
      if (!res.ok || !type.startsWith('image/')) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_BYTES) return null;
      return `data:${type};base64,${buf.toString('base64')}`;
    })
    .catch(() => null);
  cache.set(url, p);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  return p;
}

module.exports = { fetchAvatar, isAvatarUrl };
