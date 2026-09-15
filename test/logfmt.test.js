const test = require('node:test');
const assert = require('node:assert');
const { formatLine, shouldRotate, MAX_BYTES } = require('../src/lib/logfmt');

test('formatLine: one JSON line with time, level, message and data; errors flattened', () => {
  const line = formatLine({
    level: 'warn',
    msg: 'avatar',
    data: { code: 7 },
    now: 1_700_000_000_000,
  });
  assert.deepEqual(JSON.parse(line), {
    t: '2023-11-14T22:13:20.000Z',
    level: 'warn',
    msg: 'avatar',
    code: 7,
  });
  assert.ok(line.endsWith('\n'));
  const err = JSON.parse(
    formatLine({ level: 'error', msg: 'boom', data: { err: new TypeError('bad') }, now: 0 }),
  ).err;
  assert.equal(err.name, 'TypeError');
  assert.equal(err.message, 'bad');
  // Data that will not serialise never breaks a log line.
  const cyc = {};
  cyc.self = cyc;
  assert.equal(JSON.parse(formatLine({ level: 'info', msg: 'x', data: cyc, now: 0 })).msg, 'x');
});

test('shouldRotate at the size cap', () => {
  assert.equal(shouldRotate(MAX_BYTES - 1), false);
  assert.equal(shouldRotate(MAX_BYTES), true);
});
