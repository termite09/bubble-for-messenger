const test = require('node:test');
const assert = require('node:assert');
const { FRAME_CSS } = require('../src/main/scrape');

// The panel's rounded silhouette is a clip-path on <html>, whose clip box is html's own border
// box. On the messenger.com login page html and body are 0px tall (everything is positioned),
// so an unpinned clip box clipped the whole page away and the panel showed nothing. The frame
// must pin html to the viewport and hand scrolling to body, so the clip is always the viewport.
const rulesFor = (selector) => FRAME_CSS.split('}').map((rule) => rule.split('{'))
  .filter(([sel]) => sel.trim() === selector).map(([, decls]) => decls).join(';');

test('html carries the rounded clip and is pinned to the viewport', () => {
  const html = rulesFor('html');
  assert.match(html, /clip-path:inset\(0 round \d+px\)/);
  assert.match(html, /height:100%/);
  assert.match(html, /overflow:hidden/);
});

test('body fills the viewport, scrolls, and contains positioned content', () => {
  const body = rulesFor('body');
  assert.match(body, /height:100%/);
  assert.match(body, /overflow:auto/);
  assert.match(body, /position:relative/);
});
