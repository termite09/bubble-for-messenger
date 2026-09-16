const test = require('node:test');
const assert = require('node:assert');
const { el, withDocument } = require('./helpers/fake-dom');
const { readRowsInstagram, ROW_READER_INSTAGRAM_SOURCE } = require('../src/lib/rows');
const { spanText, listAtTop, nameHandle, LIMIT } = require('../src/lib/recent');

// A thread row as Instagram's mobile inbox draws it (spike, Sept 2026): a role=button holding
// the avatar, the name in a span[title], the preview, a " · " and the time inside an <abbr>.
const row = (name, preview, time, { unread = false, avatar = 'https://cdn/a.jpg' } = {}) =>
  el('div', { role: 'button', tabindex: '0' }, [
    el('img', { alt: 'user-profile-picture', src: avatar }),
    el('span', { dir: 'auto' }, [
      el('span', { title: name }, [name], { style: { fontWeight: unread ? '600' : '400' } }),
    ]),
    el('span', { dir: 'auto' }, [
      el('span', {}, [preview], { style: { fontWeight: unread ? '600' : '400' } }),
      el('span', {}, [' ']),
      el('span', { 'aria-hidden': 'true' }, [' · ']),
      el('span', { dir: 'auto' }, [
        el('abbr', { 'aria-label': 'about a minute ago' }, [el('span', {}, [time])]),
      ]),
    ]),
  ]);

// The rest of the inbox around the rows: a header with buttons, the notes tray, the Requests link.
const inbox = (rows, scroll = null) =>
  el('body', {}, [
    el('div', { role: 'button' }, [el('svg', { 'aria-label': 'Back' })]),
    el('div', { role: 'button' }, [
      el('img', { alt: 'user-profile-picture', src: 'https://cdn/me.jpg' }),
      el('span', {}, ['Your note']),
    ]),
    el('a', { href: '/direct/requests/' }, ['Requests']),
    el('div', {}, rows, { scroll }),
  ]);

const read = (body) => withDocument(body, () => readRowsInstagram(LIMIT, spanText, listAtTop));

test('reads the name, preview, time, avatar and unread state of each thread row', () => {
  const rows = read(
    inbox([
      row('Spyros Lontos', 'Liked your message', '1m', { unread: true }),
      row('primeweb', 'demetris: Exasen ton telia o kosmos', '7m'),
    ]),
  );
  assert.deepEqual(rows, [
    {
      href: nameHandle('Spyros Lontos'),
      name: 'Spyros Lontos',
      avatarUrl: 'https://cdn/a.jpg',
      unread: true,
      preview: 'Liked your message',
      time: '1m',
    },
    {
      href: nameHandle('primeweb'),
      name: 'primeweb',
      avatarUrl: 'https://cdn/a.jpg',
      unread: false,
      preview: 'demetris: Exasen ton telia o kosmos',
      time: '7m',
    },
  ]);
});

test('skips the header, notes and requests controls, and stops at the limit', () => {
  const many = Array.from({ length: 8 }, (_, i) => row(`N${i}`, 'p', '1h'));
  const rows = read(inbox(many));
  assert.equal(rows.length, LIMIT);
  assert.equal(rows[0].name, 'N0');
});

test('a scrolled list is not a reading', () => {
  const scrolled = inbox([row('A', 'p', '1m')], { height: 2000, client: 600, top: 300 });
  assert.equal(read(scrolled), null);
  const atTop = inbox([row('A', 'p', '1m')], { height: 2000, client: 600, top: 0 });
  assert.equal(read(atTop).length, 1);
});

test('emoji in a preview survive, and a row without a time is not a thread', () => {
  const emojiRow = row('A', '', '2m');
  const previewSpan = emojiRow.querySelectorAll('span[dir="auto"]')[1].children[0];
  previewSpan.childNodes = [];
  const img = el('img', { src: 'https://static/emoji/1f622.png', alt: '😢' });
  img.parentElement = previewSpan;
  previewSpan.childNodes.push(img);
  const noTime = el('div', { role: 'button' }, [el('span', { title: 'Nobody' }, ['Nobody'])]);
  const rows = read(inbox([emojiRow, noTime]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].preview, '😢');
});

test('the serialised reader is self-contained and carries the same encoding as nameHandle', () => {
  assert.match(ROW_READER_INSTAGRAM_SOURCE, /^\(function readRowsInstagram\(/);
  assert.doesNotMatch(readRowsInstagram.toString(), /require\(|nameHandle/);
});
