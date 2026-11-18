// Banners that could not be shown when their message landed — the stack up, a reply being typed
// or sent — wait here, the newest message per chat, a few chats at most, oldest first, until the
// bubble is free. Opening a chat drops its wait; opening the inbox drops them all. A plain script
// for the bubble page (bubble.html loads it before bubble-renderer.js); the tests require it.
function createBannerQueue(limit = 3) {
  let waiting = [];
  return {
    add(item) {
      waiting = waiting.filter((w) => w.href !== item.href);
      waiting.push(item);
      if (waiting.length > limit) waiting.shift();
    },
    drop(href) {
      waiting = waiting.filter((w) => w.href !== href);
    },
    clear() {
      waiting = [];
    },
    next: () => waiting.shift() || null,
    size: () => waiting.length,
  };
}

if (typeof module !== 'undefined') module.exports = { createBannerQueue };
