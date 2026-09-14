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

const { reopenOpen } = require('../src/lib/recent');

// A chat closed by clicking away is one disc click from reopening for `seconds`.
test('reopenOpen: within the window, and only then', () => {
  const last = { href: '/t/1/', closedAt: 1000 };
  assert.equal(reopenOpen(last, 1000 + 29_000, 30), true);
  assert.equal(reopenOpen(last, 1000 + 30_000, 30), true);
  assert.equal(reopenOpen(last, 1000 + 30_001, 30), false);
  assert.equal(reopenOpen(last, 5000, 0), false);        // off
  assert.equal(reopenOpen(null, 5000, 30), false);       // nothing to reopen
  assert.equal(reopenOpen({ href: 'junk', closedAt: 1000 }, 2000, 30), false);
});

const { mergeHeads } = require('../src/lib/recent');

// The stack: up to five recent chats, then the pinned ones next to the inbox head (nearest
// the disc when the stack grows up). A pinned chat that is also recent shows once, as pinned,
// with what the recent row knows (unread, preview, fresh name and avatar).
test('mergeHeads: recent minus pinned, then pins in pin order, refreshed from recent', () => {
  const pins = [{ href: '/t/9/', name: 'Old Name', avatarUrl: 'old' }, { href: '/t/2/', name: 'B', avatarUrl: null }];
  const recent = [
    { href: '/t/1/', name: 'A', avatarUrl: 'a', unread: true, preview: 'hi' },
    { href: '/t/2/', name: 'B2', avatarUrl: 'b', unread: true, preview: 'yo' },
    { href: '/t/3/', name: 'C', avatarUrl: 'c', unread: false, preview: '' },
  ];
  const out = mergeHeads(pins, recent);
  assert.deepEqual(out.map((i) => [i.href, i.pinned]), [['/t/1/', false], ['/t/3/', false], ['/t/9/', true], ['/t/2/', true]]);
  assert.deepEqual(out[3], { href: '/t/2/', name: 'B2', avatarUrl: 'b', unread: true, preview: 'yo', pinned: true });
  assert.deepEqual(out[2], { href: '/t/9/', name: 'Old Name', avatarUrl: 'old', unread: false, preview: '', pinned: true });
});

test('mergeHeads caps recent at the limit after removing pins', () => {
  const recent = Array.from({ length: 7 }, (_, i) => ({ href: `/t/${i}/`, name: `N${i}`, avatarUrl: null, unread: false, preview: '' }));
  const out = mergeHeads([{ href: '/t/0/', name: 'N0', avatarUrl: null }], recent, 5);
  assert.deepEqual(out.map((i) => i.href), ['/t/1/', '/t/2/', '/t/3/', '/t/4/', '/t/5/', '/t/0/']);
  assert.deepEqual(mergeHeads([], []), []);
});

// Strings from the page reach the settings file and the screen: bounded, whatever the page says.
test('normalizeRows caps the length of what it keeps', () => {
  const long = (n) => 'x'.repeat(n);
  const [row] = normalizeRows([{ href: '/t/1/', name: long(500), preview: long(5000), avatarUrl: 'https://a/' + long(5000), unread: 1 }]);
  assert.equal(row.name.length, 200);
  assert.equal(row.preview.length, 1000);
  assert.equal(row.avatarUrl.length, 2048);
});
