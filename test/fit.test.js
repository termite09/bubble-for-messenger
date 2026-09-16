const test = require('node:test');
const assert = require('node:assert');
const { el, withDocument } = require('./helpers/fake-dom');
const { threadCardCss, THREAD_CARD_SOURCE } = require('../src/lib/fit');

// Messenger's thread at the panel's width: [role=main] wraps a rounded, inset, opaque card
// holding the header, the message scroller (whose blocks can be far taller than the card)
// and the composer. The fit rule must target the card and nothing else.
const opaque = { backgroundColor: 'rgb(36, 37, 38)' };
const size = (w, h, top = 0) => ({ width: w, height: h, top, bottom: top + h, left: 0, right: w });
function thread({ tallBlock = true, twinCard = false } = {}) {
  const composer = el('div', { contenteditable: 'true', role: 'textbox' }, [], {
    rect: size(200, 20, 520),
  });
  const blocks = [
    el('div', { class: 'blk a' }, ['hi'], { rect: size(400, 560, -18000), style: opaque }),
    el('div', { class: 'blk a' }, ['photo'], {
      rect: size(400, tallBlock ? 2240 : 120, -9000),
      style: opaque,
    }),
  ];
  const scroller = el('div', { class: 'scroll' }, blocks, { rect: size(416, 436, 64) });
  const card = el(
    'div',
    { class: 'card x1 x2' },
    [el('div', { class: 'hdr' }, ['Name']), scroller, composer],
    {
      rect: size(420, 560),
      style: opaque,
    },
  );
  const twin = twinCard ? el('div', { class: 'card x1 x2' }, [], { rect: size(420, 560) }) : null;
  const main = el(
    'div',
    { role: 'main' },
    [el('div', { class: 'wrap' }, [card, ...(twin ? [twin] : [])], { rect: size(420, 560) })],
    {
      rect: size(420, 560),
    },
  );
  return el('body', {}, [main]);
}

test('the card is the largest opaque box that holds the composer, never a taller message block', () => {
  const css = withDocument(thread(), () => threadCardCss());
  assert.match(css, /^\.card\.x1\.x2\{/);
  assert.match(css, /height:100vh!important/);
});

test('nothing is written when the card’s classes are not unique, or there is no composer', () => {
  assert.equal(
    withDocument(thread({ twinCard: true }), () => threadCardCss()),
    '',
  );
  const body = thread();
  const composer = body.querySelector('[role="textbox"]');
  composer.parentElement.childNodes = composer.parentElement.childNodes.filter(
    (c) => c !== composer,
  );
  assert.equal(
    withDocument(body, () => threadCardCss()),
    '',
  );
  assert.equal(
    withDocument(el('body', {}, []), () => threadCardCss()),
    '',
  );
});

test('the serialised picker is self-contained', () => {
  assert.match(THREAD_CARD_SOURCE, /^\(function threadCardCss\(/);
  assert.doesNotMatch(threadCardCss.toString(), /require\(/);
});
