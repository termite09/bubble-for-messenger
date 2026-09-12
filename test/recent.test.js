const test = require('node:test');
const assert = require('node:assert');
const { normalizeRows } = require('../lib/recent');

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
  assert.deepEqual(out, [{ href: '/t/1/', name: 'A', avatarUrl: null, unread: true }]);
});

test('empty or invalid input gives an empty list', () => {
  assert.deepEqual(normalizeRows(undefined), []);
  assert.deepEqual(normalizeRows('x'), []);
});
