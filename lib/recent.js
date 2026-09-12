const LIMIT = 5;
const THREAD_HREF = /^\/(e2ee\/)?t\/\d+\/?$/;

// Clean up the raw rows scraped from messenger.com's chat list into what the bubble renders.
function normalizeRows(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const href = typeof r.href === 'string' ? r.href : '';
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!THREAD_HREF.test(href) || !name || seen.has(href)) continue;
    seen.add(href);
    out.push({ href, name, avatarUrl: typeof r.avatarUrl === 'string' ? r.avatarUrl : null, unread: Boolean(r.unread) });
    if (out.length === LIMIT) break;
  }
  return out;
}

module.exports = { normalizeRows, LIMIT };
