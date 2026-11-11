const test = require('node:test');
const assert = require('node:assert');
const { createDrafts } = require('../src/renderer/drafts');

// A reply half-typed into the banner used to vanish when the field lost focus (a click on
// another app): it is kept for that chat and comes back when the field next opens for it.
test('a draft is kept per chat until it is sent or thrown away', () => {
  const drafts = createDrafts();
  assert.equal(drafts.get('/t/1/'), '');
  drafts.keep('/t/1/', 'see you at');
  drafts.keep('/t/2/', 'ok');
  assert.equal(drafts.get('/t/1/'), 'see you at');
  assert.equal(drafts.get('/t/2/'), 'ok');
  drafts.drop('/t/1/');
  assert.equal(drafts.get('/t/1/'), '');
  assert.equal(drafts.get('/t/2/'), 'ok');
});

test('blank text is no draft, and only the newest few chats keep theirs', () => {
  const drafts = createDrafts(2);
  drafts.keep('/t/1/', 'a');
  drafts.keep('/t/1/', '   ');
  assert.equal(drafts.get('/t/1/'), '');
  drafts.keep('/t/1/', 'a');
  drafts.keep('/t/2/', 'b');
  drafts.keep('/t/1/', 'a2'); // touching a chat makes it the newest
  drafts.keep('/t/3/', 'c');
  assert.equal(drafts.get('/t/2/'), '');
  assert.equal(drafts.get('/t/1/'), 'a2');
  assert.equal(drafts.get('/t/3/'), 'c');
});

// The page has no modules: the drafts script must be loaded, and before the page script.
test('the bubble page loads the drafts before its own script', () => {
  const html = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'src', 'renderer', 'bubble.html'),
    'utf8',
  );
  const drafts = html.indexOf('<script src="drafts.js">');
  assert.ok(drafts > 0 && drafts < html.indexOf('<script src="bubble-renderer.js">'));
});
