const MAX_CACHE = 50;
const cache = new Map(); // url -> Promise<string|null>

// Fetch a profile picture through the Messenger session (so cookies apply) and return a data
// URL the bubble can render under its strict CSP. Memoised; failures are cached as null.
function fetchAvatar(ses, url) {
  if (!url) return Promise.resolve(null);
  if (cache.has(url)) return cache.get(url);
  const p = ses.fetch(url)
    .then(async (res) => {
      if (!res.ok) return null;
      const type = res.headers.get('content-type') || 'image/jpeg';
      const buf = Buffer.from(await res.arrayBuffer());
      return `data:${type};base64,${buf.toString('base64')}`;
    })
    .catch(() => null);
  cache.set(url, p);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  return p;
}

module.exports = { fetchAvatar };
