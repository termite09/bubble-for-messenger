const MAX_CACHE = 50;
const cache = new Map(); // key -> { promise, at }
const FAIL_TTL_MS = 60 * 1000; // a failed fetch is retried after a minute, not remembered for good
const FETCH_TIMEOUT_MS = 8000;

const MAX_BYTES = 1024 * 1024;
const CDN_HOSTS = ['fbcdn.net', 'facebook.com', 'messenger.com'];

// Messenger's picture URLs carry a signature in the query that changes on every page load;
// the path names the picture. Caching by path keeps a picture across reloads.
function cacheKey(url) {
  try { const u = new URL(url); return u.hostname + u.pathname; } catch (e) { return url; }
}

// Only an https image on Meta's own hosts is worth fetching; the URL comes from the page's DOM.
function isAvatarUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && CDN_HOSTS.some((d) => u.hostname === d || u.hostname.endsWith('.' + d));
  } catch (e) {
    return false;
  }
}

// The raster formats a profile picture comes in; anything else (SVG in particular) is refused.
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

// Fetch a profile picture through the Messenger session and return a data URL the bubble can
// render under its strict CSP. Memoised by picture (see cacheKey); a failure is remembered
// only briefly; a fetch that hangs gives up after FETCH_TIMEOUT_MS.
function fetchAvatar(ses, url, now = Date.now) {
  if (!url || !isAvatarUrl(url)) return Promise.resolve(null);
  const key = cacheKey(url);
  const hit = cache.get(key);
  if (hit && (hit.ok !== false || now() - hit.at < FAIL_TTL_MS)) return hit.promise;
  const entry = { at: now(), ok: null, promise: null };
  entry.promise = ses.fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    .then(async (res) => {
      const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!res.ok || !IMAGE_TYPES.has(type)) return null;
      if (Number(res.headers.get('content-length')) > MAX_BYTES) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_BYTES) return null;
      return `data:${type};base64,${buf.toString('base64')}`;
    })
    .catch(() => null)
    .then((result) => { entry.ok = result !== null; return result; });
  cache.set(key, entry);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  return entry.promise;
}

module.exports = { fetchAvatar, isAvatarUrl };
