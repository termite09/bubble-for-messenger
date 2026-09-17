// The palette, read from renderer/tokens.css — the one place a value is written — for the CSS
// the app puts into messenger.com's page (scrape.js): the dark palette, the file's first
// block (what the app draws inside the site is graphite whatever the appearance), and under
// `light` the values the light block changes (the frame's hairline follows the site's wash).
// The panel preload is sandboxed and cannot require this, so it carries its values as
// literals; test/tokens.test.js holds them to this file.
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'tokens.css'), 'utf8');

// The declarations of the first `:root {` block after `from`.
function block(from) {
  const start = source.indexOf(':root {', from);
  const body = source.slice(start, source.indexOf('}', start));
  const out = {};
  for (const [, name, value] of body.matchAll(/--([\w-]+):\s*([^;]+);/g))
    out[name] = value.trim().replace(/\s+/g, ' ');
  return out;
}

const tokens = block(0);
tokens.light = block(source.indexOf('@media (prefers-color-scheme: light)'));

module.exports = tokens;
