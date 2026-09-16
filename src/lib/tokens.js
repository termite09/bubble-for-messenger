// The palette, read from renderer/tokens.css — the one place a value is written — for the CSS
// the app puts into messenger.com's page (scrape.js): the dark palette, the file's first
// block (what the app draws inside the site is graphite whatever the appearance). The panel
// preload is sandboxed and cannot require this, so it carries its values as literals;
// test/tokens.test.js holds them to this file.
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'tokens.css'), 'utf8');
const dark = source.slice(source.indexOf(':root {'), source.indexOf('}'));
const tokens = {};
for (const [, name, value] of dark.matchAll(/--([\w-]+):\s*([^;]+);/g))
  tokens[name] = value.trim().replace(/\s+/g, ' ');

module.exports = tokens;
