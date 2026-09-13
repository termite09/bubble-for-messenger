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

test('an emoji-only preview is a preview; the lone separator is not', () => {
  assert.equal(normalizeRows([row('/t/1/', 'A', { preview: '😢' })])[0].preview, '😢');
  assert.equal(normalizeRows([row('/t/2/', 'B', { preview: '·' })])[0].preview, '');
});

const { spanText } = require('../src/lib/recent');

// A minimal DOM-shaped node: Messenger draws emoji in previews as sprite <img>s (alt = the
// glyph) or as background-image spans (aria-label = the glyph), which textContent drops.
const text = (s) => ({ nodeType: 3, nodeValue: s });
const el = (tag, children = [], attrs = {}) => ({
  nodeType: 1, tagName: tag, childNodes: children, getAttribute: (n) => (n in attrs ? attrs[n] : null),
});

test('spanText restores sprite emoji into the preview', () => {
  const span = el('SPAN', [text('Kim: '), el('IMG', [], { src: 'https://static.xx.fbcdn.net/images/emoji.php/v9/x.png', alt: '😢' })]);
  assert.equal(spanText(span), 'Kim: 😢');
});

test('spanText reads an emoji-only preview', () => {
  const span = el('SPAN', [el('IMG', [], { src: 'https://static.xx.fbcdn.net/images/emoji.php/v9/x.png', alt: '👍' })]);
  assert.equal(spanText(span), '👍');
});

test('spanText restores background-image emoji from aria-label', () => {
  const span = el('SPAN', [text('ok '), el('SPAN', [], { 'aria-label': '🎉' })]);
  assert.equal(spanText(span), 'ok 🎉');
});

test('spanText ignores images that are not emoji sprites', () => {
  const span = el('SPAN', [text('Kim'), el('IMG', [], { src: 'https://cdn/avatar.jpg', alt: 'Kim Lee' })]);
  assert.equal(spanText(span), 'Kim');
  const labelled = el('SPAN', [el('SPAN', [], { 'aria-label': 'Open menu' })]);
  assert.equal(spanText(labelled), '');
});

test('spanText reads nested text like textContent', () => {
  const span = el('SPAN', [el('SPAN', [text('You: ')]), el('SPAN', [text('see you')])]);
  assert.equal(spanText(span), 'You: see you');
  assert.equal(spanText(null), '');
});

const { listAtTop } = require('../src/lib/recent');

// The chat list is virtualised: once the user scrolls it, the rows in the DOM are no longer the
// most recent chats. A box: { scrollHeight, clientHeight, scrollTop, parentElement }.
const box = (h, parent, scrollTop = 0) => ({ scrollHeight: h, clientHeight: 500, scrollTop, parentElement: parent });

test('listAtTop is true when the scrolling ancestor is at its top', () => {
  const root = { parentElement: null };
  const scroller = box(3000, root, 0);
  const row = box(60, box(60, scroller));
  assert.equal(listAtTop(row, root), true);
});

test('listAtTop is false once the list has been scrolled', () => {
  const root = { parentElement: null };
  const scroller = box(3000, root, 120);
  const row = box(60, box(60, scroller));
  assert.equal(listAtTop(row, root), false);
});

test('listAtTop tolerates a few pixels of drift and a list that does not scroll at all', () => {
  const root = { parentElement: null };
  assert.equal(listAtTop(box(60, box(3000, root, 6)), root), true);
  // Nothing between the row and the root overflows: there is no scroll position to distrust.
  assert.equal(listAtTop(box(60, box(505, root, 40)), root), true);
  assert.equal(listAtTop(null, root), true);
});

test('empty or invalid input gives an empty list', () => {
  assert.deepEqual(normalizeRows(undefined), []);
  assert.deepEqual(normalizeRows('x'), []);
});
