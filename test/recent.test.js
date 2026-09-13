const test = require('node:test');
const assert = require('node:assert');
const { normalizeRows, isThreadHref } = require('../src/lib/recent');

test('isThreadHref accepts only clean thread paths', () => {
  assert.equal(isThreadHref('/t/123/'), true);
  assert.equal(isThreadHref('/e2ee/t/1'), true);
  assert.equal(isThreadHref("/t/1/'"), false);
  assert.equal(isThreadHref('/t/1/?focus_target=1'), false);
  assert.equal(isThreadHref('https://www.messenger.com/t/1/'), false);
  assert.equal(isThreadHref(42), false);
  assert.equal(isThreadHref(undefined), false);
});

const row = (href, name = 'Name', extra = {}) => ({ href, name, avatarUrl: 'https://cdn/x.jpg', unread: false, ...extra });

test('keeps well-formed rows in order, capped at 5', () => {
  const rows = [1, 2, 3, 4, 5, 6, 7].map((i) => row(`/t/${i}/`));
  assert.deepEqual(normalizeRows(rows).map((r) => r.href), ['/t/1/', '/t/2/', '/t/3/', '/t/4/', '/t/5/']);
});

test('accepts e2ee thread links', () => {
  assert.equal(normalizeRows([row('/e2ee/t/42/')]).length, 1);
});

test('drops rows without a thread link or name, and non-objects', () => {
  const out = normalizeRows([row('/marketplace/'), row('/t/1/', ''), null, 'junk', row('/t/2/')]);
  assert.deepEqual(out.map((r) => r.href), ['/t/2/']);
});

test('dedupes by href and coerces fields', () => {
  const out = normalizeRows([row('/t/1/', 'A', { unread: 1, avatarUrl: null }), row('/t/1/', 'A')]);
  assert.deepEqual(out, [{ href: '/t/1/', name: 'A', avatarUrl: null, unread: true, preview: '', time: '' }]);
});

test('carries a trimmed preview and a short time stamp, dropping junk', () => {
  const out = normalizeRows([
    row('/t/1/', 'A', { preview: '  You: see you there  ', time: '2m' }),
    row('/t/2/', 'B', { preview: 42, time: 'a long string that is not a time' }),
  ]);
  assert.equal(out[0].preview, 'You: see you there');
  assert.equal(out[0].time, '2m');
  assert.equal(out[1].preview, '');
  assert.equal(out[1].time, '');
  assert.equal(normalizeRows([row('/t/3/', 'C', { preview: '·' })])[0].preview, '');
});

test('empty or invalid input gives an empty list', () => {
  assert.deepEqual(normalizeRows(undefined), []);
  assert.deepEqual(normalizeRows('x'), []);
});
