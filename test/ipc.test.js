const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { CHANNELS } = require('../src/lib/ipc');

const known = new Set(Object.values(CHANNELS));
const literals = (file) => [...fs.readFileSync(file, 'utf8').matchAll(/'([a-z]+:[a-z-]+)'/g)].map((m) => m[1]);

// The preloads cannot import lib/ipc (they run sandboxed), so they spell the channel names;
// every name they spell must be one main knows, and vice versa.
test('every channel a preload or main module uses is listed, and every listed one is used', () => {
  const dir = path.join(__dirname, '..', 'src');
  const files = [...fs.readdirSync(path.join(dir, 'renderer')).filter((f) => f.endsWith('-preload.js')).map((f) => path.join(dir, 'renderer', f)),
    ...fs.readdirSync(path.join(dir, 'main')).map((f) => path.join(dir, 'main', f))];
  const used = new Set();
  for (const f of files) for (const name of literals(f)) { assert.ok(known.has(name), `${path.basename(f)} uses unknown channel ${name}`); used.add(name); }
  for (const name of known) assert.ok(used.has(name), `${name} is listed but never used`);
});
