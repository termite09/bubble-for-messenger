/* global document, getComputedStyle, CSS */
// Messenger's thread at the panel's width is a rounded card inset 16px from the left and
// capped 32px short of the viewport; compact mode wants it flush and full-height. Its only
// handle is a bag of atomic classes, so it is found by shape — the largest opaque box in
// [role=main] that holds the composer (a tall message block can out-area the card, and never
// holds the composer) — and a rule is written for that exact class combination, provided it
// names that one element and no other. Self-contained: it is serialised into the page.
function threadCardCss() {
  const main = document.querySelector('[role="main"]');
  const composer = main && main.querySelector('[contenteditable="true"][role="textbox"]');
  if (!main || !composer) return '';
  let card = null;
  let best = 0;
  for (const el of main.querySelectorAll('div')) {
    if (!el.contains(composer)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 300 || r.height < 300 || r.width * r.height <= best) continue;
    if (getComputedStyle(el).backgroundColor === 'rgba(0, 0, 0, 0)') continue;
    card = el;
    best = r.width * r.height;
  }
  if (!card || !card.classList.length) return '';
  const selector = '.' + [...card.classList].map((c) => CSS.escape(c)).join('.');
  if (document.querySelectorAll(selector).length !== 1) return '';
  return (
    selector +
    '{margin:0!important;border-radius:0!important;height:100vh!important;max-height:100vh!important}'
  );
}

const THREAD_CARD_SOURCE = `(${threadCardCss.toString()})()`;

module.exports = { threadCardCss, THREAD_CARD_SOURCE };
