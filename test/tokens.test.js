const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const tokens = require('../src/lib/tokens');
const { FRAME_CSS } = require('../src/main/scrape');

const renderer = path.join(__dirname, '..', 'src', 'renderer');
const read = (f) => fs.readFileSync(path.join(renderer, f), 'utf8');

test('the palette is read from tokens.css', () => {
  assert.equal(tokens.card, '#1c1c1e');
  assert.equal(tokens.rule, 'rgba(255, 255, 255, 0.12)');
  assert.match(tokens.lift, /^0 8px 24px/);
  assert.match(tokens.ease, /^cubic-bezier\(/);
});

// The pages link the file and use its names rather than repeating values.
test('every page of the app links tokens.css and declares no colour of its own', () => {
  for (const page of ['bubble.html', 'settings.html', 'dismiss.html']) {
    const html = read(page);
    assert.match(html, /<link rel="stylesheet" href="tokens.css" \/>/, page);
    const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
    assert.doesNotMatch(css, /#[0-9a-f]{3,6}\b/i, `${page} carries a literal colour`);
    assert.doesNotMatch(css, /rgba\(255, 255, 255/, `${page} carries a literal hairline`);
  }
});

// The sandboxed panel preload cannot require lib/tokens; its pin button carries the values as
// literals, which must be the file's.
test('the pin button in the panel preload wears the palette', () => {
  const css = read('panel-preload.js').match(/const PIN_CSS =([\s\S]*?);\n/)[1];
  for (const name of ['card', 'ink', 'dim', 'rule', 'rule-active', 'lift'])
    assert.ok(css.includes(tokens[name]), `PIN_CSS lacks --${name} (${tokens[name]})`);
});

test('the frame the panel wears takes its hairline from the palette', () => {
  assert.ok(FRAME_CSS.includes(tokens.rule));
});
