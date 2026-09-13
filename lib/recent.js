const LIMIT = 5;
const THREAD_HREF = /^\/(e2ee\/)?t\/\d+\/?$/;

// A clean conversation path (/t/<id>/ or /e2ee/t/<id>/) — the only thing we ever splice into a
// page-side selector or a URL, so anything else is refused at the boundary.
const isThreadHref = (href) => typeof href === 'string' && THREAD_HREF.test(href);

// Clean up the raw rows scraped from messenger.com's chat list into what the bubble renders.
function normalizeRows(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const href = r.href;
    const name = typeof r.name === 'string' ? r.name.trim() : '';
    if (!isThreadHref(href) || !name || seen.has(href)) continue;
    seen.add(href);
    // A preview with no letter or digit (Messenger's "·" separator, a lone emoji) is no preview.
    const rawPreview = typeof r.preview === 'string' ? r.preview.trim() : '';
    const preview = /[\p{L}\p{N}]/u.test(rawPreview) ? rawPreview : '';
    // A time stamp is short ("2m", "1h", "Yesterday"); anything longer is some other span.
    const time = typeof r.time === 'string' && r.time.trim().length <= 9 ? r.time.trim() : '';
    out.push({ href, name, avatarUrl: typeof r.avatarUrl === 'string' ? r.avatarUrl : null, unread: Boolean(r.unread), preview, time });
    if (out.length === LIMIT) break;
  }
  return out;
}

module.exports = { normalizeRows, isThreadHref, LIMIT };
