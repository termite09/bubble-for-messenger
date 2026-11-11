// Quick-reply drafts, by chat: text typed into the banner's field outlives a click elsewhere
// and is back the next time the field opens for that chat. A few chats' worth, the newest
// kept. A plain script for the bubble page (bubble.html loads it before bubble-renderer.js);
// the tests require it.
function createDrafts(limit = 10) {
  const byHref = new Map();
  return {
    get: (href) => byHref.get(href) || '',
    keep(href, text) {
      byHref.delete(href);
      if (!text || !text.trim()) return;
      byHref.set(href, text);
      if (byHref.size > limit) byHref.delete(byHref.keys().next().value);
    },
    drop: (href) => byHref.delete(href),
  };
}

if (typeof module !== 'undefined') module.exports = { createDrafts };
