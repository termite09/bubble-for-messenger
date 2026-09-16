// The two platforms the bubble can carry, described once: where each lives, how its pages are
// told apart, and what it looks like on the disc. Pure; the page scripts for each are in
// main/scrape.js and main/scrape-instagram.js.

// Instagram's desktop site collapses its thread list to an avatar rail below ~1000px — no
// names, no previews — so the panel loads its mobile web app instead, which at 420px is a
// single-column inbox with a full-width thread. The user agent is what selects it.
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const MESSENGER = Object.freeze({
  id: 'messenger',
  label: 'Messenger',
  home: 'https://www.messenger.com/',
  domain: 'messenger.com',
  mark: 'icon.png', // in assets/
  userAgent: null,
  // Messenger's page wash (--web-wash) in each theme: the window's own colour.
  wash: (dark) => (dark ? '#1a1a1a' : '#f5f5f5'),
  // What the liveness watch listens to: the chat socket, and the site's own requests.
  socketUrls: Object.freeze([
    'wss://edge-chat.messenger.com/*',
    'wss://edge-chat.facebook.com/*',
    'https://www.messenger.com/*',
    'https://*.facebook.com/*',
  ]),
  panelPath: () => true,
  // Messenger's list keeps updating behind an open thread.
  parkOnHide: false,
});

const INSTAGRAM = Object.freeze({
  id: 'instagram',
  label: 'Instagram',
  home: 'https://www.instagram.com/direct/inbox/',
  domain: 'instagram.com',
  mark: 'instagram.svg',
  userAgent: IPHONE_UA,
  wash: (dark) => (dark ? '#0c1014' : '#ffffff'),
  socketUrls: Object.freeze([
    'wss://gateway.instagram.com/*',
    'https://www.instagram.com/*',
    'https://*.instagram.com/*',
    'https://*.facebook.com/*',
  ]),
  // The panel is a messenger, not a browser: its inbox and threads, and the sign-in pages.
  panelPath: (path) => /^\/(direct|accounts|challenge)(\/|$)/.test(path),
  // Instagram's list only updates while it is the view in front: a put-away panel goes back
  // to the inbox so messages keep landing.
  parkOnHide: true,
});

const SITES = Object.freeze({ messenger: MESSENGER, instagram: INSTAGRAM });
const siteOf = (id) => SITES[id] || null;

// What the disc shows: the focused site's mark and unread count, and — with a second account —
// the other site as a satellite carrying its own count. The badge setting's `off` zeroes both.
function discState({ focused, accounts, badge }) {
  const count = (id) => (badge === 'off' ? 0 : (accounts[id] && accounts[id].unread) || 0);
  const otherId = Object.keys(accounts).find((id) => id !== focused) || null;
  const other = otherId && SITES[otherId];
  return {
    id: focused,
    label: SITES[focused].label,
    mark: SITES[focused].mark,
    badge: count(focused),
    other: other
      ? { id: other.id, label: other.label, mark: other.mark, count: count(other.id) }
      : null,
  };
}

module.exports = { MESSENGER, INSTAGRAM, SITES, siteOf, discState };
