// Where Messenger lives, how its pages are told apart, and what it looks like on the disc.
// Pure; the page scripts are in main/scrape.js.
//
// This was once a two-platform registry (Instagram rode alongside Messenger). Instagram was
// removed in v3.0.0: reaching its mobile web app needed a phone user agent sent from a
// desktop, and its inbox could only be driven with synthetic clicks — between them a session
// that Instagram flags as automated. See docs/COMPLIANCE-PLAN.md. The shape is kept because
// the panel, the account and the disc all read a site's description from one place.

const MESSENGER = Object.freeze({
  id: 'messenger',
  label: 'Messenger',
  home: 'https://www.messenger.com/',
  domain: 'messenger.com',
  mark: 'icon.png', // in assets/
  // No override: the panel is honestly an Electron desktop client, and says so. Substituting
  // a browser's user agent would hide what this app is rather than make it compliant.
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
});

const SITES = Object.freeze({ messenger: MESSENGER });
const siteOf = (id) => SITES[id] || null;

// What the disc shows: Messenger's mark and its unread count. The badge setting's `off`
// zeroes the count.
function discState({ accounts, badge }) {
  const unread = (accounts.messenger && accounts.messenger.unread) || 0;
  return {
    id: MESSENGER.id,
    label: MESSENGER.label,
    mark: MESSENGER.mark,
    badge: badge === 'off' ? 0 : unread,
  };
}

module.exports = { MESSENGER, SITES, siteOf, discState };
