const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spanText, listAtTop } = require('../src/lib/recent');
const { readRows, readRowsInstagram } = require('../src/lib/rows');

const preload = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'renderer', 'panel-preload.js'),
  'utf8',
);

// The preload runs sandboxed and cannot require the reader, so it carries a copy; the copy
// must be the original, character for character.
test('the panel preload carries both row readers verbatim and picks by host', () => {
  for (const fn of [spanText, listAtTop, readRows, readRowsInstagram])
    assert.ok(preload.includes(fn.toString()), `${fn.name} differs from lib`);
  assert.match(preload, /location\.hostname/);
  assert.match(preload, /\? readRowsInstagram : readRows/);
});

// Inert toward the page: it must never expose anything to messenger.com or evaluate strings.
test('the panel preload exposes nothing to the page', () => {
  const code = preload.replace(/^\s*\/\/.*$/gm, ''); // comments may name what is forbidden
  assert.equal(
    /contextBridge|exposeInMainWorld|window\.\w+\s*=|\beval\(|new Function|executeJavaScript/.test(
      code,
    ),
    false,
  );
  assert.match(preload, /require\('electron'\)/);
});
