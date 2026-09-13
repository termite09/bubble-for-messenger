const test = require('node:test');
const assert = require('node:assert');
const { readRecentChats, RECENT_CHATS_SCRIPT } = require('../src/main/scrape');

// The smallest stand-in for a webContents the reader touches: where it is, and what the page
// script returned.
const wc = (url, result) => ({ getURL: () => url, executeJavaScript: async () => result });

test('a scrolled list is untrusted: null, not an empty list', async () => {
  assert.equal(await readRecentChats(wc('https://www.messenger.com/', null)), null);
});

test('rows from the page are normalised', async () => {
  const rows = [{ href: '/t/1/', name: 'A', avatarUrl: null, unread: false, preview: 'hi', time: '2m' }];
  assert.deepEqual(await readRecentChats(wc('https://www.messenger.com/t/1/', rows)), rows);
});

test('off messenger.com there are no rows', async () => {
  assert.deepEqual(await readRecentChats(wc('https://www.facebook.com/login/', null)), []);
});

test('the page script carries the emoji and scroll helpers', () => {
  assert.match(RECENT_CHATS_SCRIPT, /function spanText\(/);
  assert.match(RECENT_CHATS_SCRIPT, /function listAtTop\(/);
});

