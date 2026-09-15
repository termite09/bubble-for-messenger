// The chat-list reader that runs inside messenger.com, as plain functions. They are serialised
// into the page by scrape.js (`ROW_READER_SOURCE`) and copied verbatim into the panel's
// preload, which runs sandboxed and cannot require this file; test/panel-preload.test.js
// holds the copy to the original. Nothing here may close over anything.
const { spanText, listAtTop, LIMIT } = require('./recent');

// Messenger renders each conversation as [role="row"] containing a link to /t/<id>/ (or
// /e2ee/t/<id>/), the avatar <img> and name/preview spans; unread rows are drawn in bold.
// Returns null (not a list) when the list has been scrolled: it is virtualised, so its DOM
// rows are then not the most recent. The row query is scoped to the list once one is found.
function readRows(limit, spanText, listAtTop) {
  const first = document.querySelector('[role="row"]');
  const list = (first && first.closest('[role="grid"]')) || document;
  const out = [];
  for (const row of list.querySelectorAll('[role="row"]')) {
    const link = row.querySelector('a[role="link"][href*="/t/"]');
    if (!link) continue;
    if (!out.length && !listAtTop(row, document.body)) return null;
    const img = row.querySelector('img');
    const spans = [...row.querySelectorAll('span[dir="auto"]')].map((s) => spanText(s).trim()).filter(Boolean);
    // Unread rows are bold; the name span decides, and only it is measured.
    const nameSpan = row.querySelector('span[dir="auto"] span, span[dir="auto"]');
    const unread = !!nameSpan && parseInt(getComputedStyle(nameSpan).fontWeight, 10) >= 600;
    const name = (img && img.alt) || spans[0] || '';
    // After the name come the last-message preview and a short time stamp ("2m", "Yesterday").
    const rest = spans.filter((t) => t !== name);
    const timeIdx = rest.findIndex((t) => /^(\d+\s?[smhdw]|[A-Z][a-z]{2}|Yesterday|Now)$/.test(t));
    const time = timeIdx >= 0 ? rest[timeIdx] : '';
    // Skip the lone "·" Messenger puts between preview and time.
    const preview = rest.find((t, i) => i !== timeIdx && t !== '·') || '';
    out.push({
      // Use the clean pathname (/t/123/) — the DOM href can carry a ?focus_target=1 query.
      href: new URL(link.href).pathname,
      name,
      avatarUrl: img ? img.src : null,
      unread,
      preview,
      time,
    });
    if (out.length === limit) break;
  }
  return out;
}

// One expression that reads the rows: what scrape.js runs in the page.
const ROW_READER_SOURCE = `(${readRows.toString()})(${LIMIT}, ${spanText.toString()}, ${listAtTop.toString()})`;

module.exports = { readRows, ROW_READER_SOURCE };
