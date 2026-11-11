const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spanText, listAtTop } = require('../src/lib/recent');
const { readRows } = require('../src/lib/rows');

const preload = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'renderer', 'panel-preload.js'),
  'utf8',
);

// The preload runs sandboxed and cannot require the reader, so it carries a copy; the copy
// must be the original, character for character.
test('the panel preload carries the row reader verbatim', () => {
  for (const fn of [spanText, listAtTop, readRows])
    assert.ok(preload.includes(fn.toString()), `${fn.name} differs from lib`);
});

// Instagram was removed in v3.0.0: the preload reads Messenger's list and nothing else.
test('the panel preload has no Instagram reader', () => {
  assert.equal(/instagram/i.test(preload), false);
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

// It reads five rows plus one per pinned chat, so pins among the newest leave five that are
// not pinned; and a change of pins is a reason to read again.
test('the panel preload reads five rows plus one per pin, again when the pins change', () => {
  assert.match(preload, /readRows\(LIMIT \+ pins\.length, spanText, listAtTop\)/);
  const onPins = /ipcRenderer\.on\('panel:pin-state'[\s\S]*?\n\}\);/.exec(preload)[0];
  assert.match(onPins, /schedule\(\)/);
});
