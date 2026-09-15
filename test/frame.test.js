const test = require('node:test');
const assert = require('node:assert');
const { FRAME_CSS } = require('../src/main/scrape');

// On the messenger.com login page html and body are 0px tall (everything is positioned), so
// the frame must pin html to the viewport and hand scrolling to body, or the panel shows
// nothing. The window itself is opaque with rounded corners; the page only adds a hairline.
const rulesFor = (selector) =>
  FRAME_CSS.split('}')
    .map((rule) => rule.split('{'))
    .filter(([sel]) => sel.trim() === selector)
    .map(([, decls]) => decls)
    .join(';');

test('html is pinned to the viewport and left opaque', () => {
  const html = rulesFor('html');
  assert.match(html, /height:100%/);
  assert.match(html, /overflow:hidden/);
  assert.doesNotMatch(html, /clip-path|transparent/);
});

test("the hairline sits inside the window's rounded edge", () => {
  assert.match(rulesFor('#mb-frame'), /border-radius:\d+px/);
  assert.match(rulesFor('#mb-frame'), /border:1px solid/);
});

test('body fills the viewport, scrolls, and contains positioned content', () => {
  const body = rulesFor('body');
  assert.match(body, /height:100%/);
  assert.match(body, /overflow:auto/);
  assert.match(body, /position:relative/);
});
