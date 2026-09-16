// The panel's preload: watches the chat list — Messenger's or Instagram's, by host — and
// reports its rows to main whenever they change, so main need not poll the page. Sandboxed,
// and deliberately inert toward the page: no contextBridge, nothing written to window, nothing
// evaluated. The reader functions are verbatim copies of lib/recent.js spanText, listAtTop and
// lib/rows.js readRows / readRowsInstagram (a sandboxed preload cannot require them);
// test/panel-preload.test.js holds them to the originals. Channel names: lib/ipc.js.
const { ipcRenderer } = require('electron');

const LIMIT = 5;
const DEBOUNCE_MS = 250;

function spanText(node) {
  if (!node) return '';
  if (node.nodeType === 3) return node.nodeValue || '';
  if (node.nodeType !== 1) return '';
  // A glyph is short and starts with a pictograph; anything wordier is a label, not an emoji.
  const glyph = (v) =>
    v && v.length <= 24 && /^\p{Extended_Pictographic}/u.test(v.trim()) ? v.trim() : '';
  if (node.tagName === 'IMG') {
    return /emoji/i.test(node.getAttribute('src') || '') ? glyph(node.getAttribute('alt')) : '';
  }
  let out = '';
  for (const child of Array.from(node.childNodes || [])) out += spanText(child);
  return out || glyph(node.getAttribute('aria-label'));
}

function listAtTop(row, root) {
  for (let el = row && row.parentElement; el && el !== root; el = el.parentElement) {
    if (el.scrollHeight > el.clientHeight + 16) return el.scrollTop <= 8;
  }
  return true;
}

function readRows(limit, spanText, listAtTop) {
  const first = document.querySelector('[role="row"]');
  const list = (first && first.closest('[role="grid"]')) || document;
  const out = [];
  for (const row of list.querySelectorAll('[role="row"]')) {
    const link = row.querySelector('a[role="link"][href*="/t/"]');
    if (!link) continue;
    if (!out.length && !listAtTop(row, document.body)) return null;
    const img = row.querySelector('img');
    const spans = [...row.querySelectorAll('span[dir="auto"]')]
      .map((s) => spanText(s).trim())
      .filter(Boolean);
    // Unread rows are bold; the name span decides, and only it is measured.
    const nameSpan = row.querySelector('span[dir="auto"] span, span[dir="auto"]');
    const unread = !!nameSpan && parseInt(getComputedStyle(nameSpan).fontWeight, 10) >= 600;
    const name = (img && img.alt) || spans[0] || '';
    // After the name come the last-message preview and a short time stamp ("2m", "Yesterday").
    const rest = spans.filter((t) => t !== name);
    const timeIdx = rest.findIndex((t) => /^(\d+\s?[smhdw]|[A-Z][a-z]{2}|Yesterday|Now)$/.test(t));
    const time = timeIdx >= 0 ? rest[timeIdx] : '';
    // Skip the lone "·" Messenger puts between preview and time.
    const preview = rest.find((t, i) => i !== timeIdx && t !== '·') || '';
    out.push({
      // Use the clean pathname (/t/123/) — the DOM href can carry a ?focus_target=1 query.
      href: new URL(link.href).pathname,
      name,
      avatarUrl: img ? img.src : null,
      unread,
      preview,
      time,
    });
    if (out.length === limit) break;
  }
  return out;
}

function readRowsInstagram(limit, spanText, listAtTop) {
  const out = [];
  for (const row of document.querySelectorAll('[role="button"]')) {
    const nameEl = row.querySelector('span[title]');
    const timeEl = row.querySelector('abbr');
    if (!nameEl || !timeEl) continue; // the header's buttons, the notes tray
    if (!out.length && !listAtTop(row, document.body)) return null;
    const name = nameEl.getAttribute('title') || '';
    const time = spanText(timeEl).trim();
    const img = row.querySelector('img');
    // Unread rows are bold; the name span decides, and only it is measured.
    const unread = parseInt(getComputedStyle(nameEl).fontWeight, 10) >= 600;
    // The preview is the first innermost span (emoji <img>s inside are fine) that is not the
    // name, the separator or the time.
    const texts = [...row.querySelectorAll('span')]
      .filter((s) => !s.querySelector('span'))
      .map((s) => spanText(s).trim())
      .filter(Boolean);
    const preview = texts.find((t) => t !== name && t !== '·' && t !== time) || '';
    const handle = encodeURIComponent(name).replace(
      /[!'()*]/g,
      (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
    );
    out.push({
      href: '/direct/n/' + handle + '/',
      name,
      avatarUrl: img ? img.src : null,
      unread,
      preview,
      time,
    });
    if (out.length === limit) break;
  }
  return out;
}

const reader = /(^|\.)instagram\.com$/.test(location.hostname) ? readRowsInstagram : readRows;

let lastKey = '';
let timer = null;
let observed = null;

// Read the rows and send them if they differ from what was last sent. A scrolled list (null)
// is not a reading. The observer narrows to the list itself once there is one.
function report() {
  timer = null;
  let rows;
  try {
    rows = reader(LIMIT, spanText, listAtTop);
  } catch (e) {
    return;
  }
  if (rows === null) return;
  const key = JSON.stringify(rows);
  if (key === lastKey) return;
  lastKey = key;
  ipcRenderer.send('panel:rows', rows);
  narrow();
}

function schedule() {
  if (timer === null) timer = setTimeout(report, DEBOUNCE_MS);
}

const observer = new MutationObserver(schedule);
function observe(target) {
  if (observed === target) return;
  observer.disconnect();
  observer.observe(target, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'aria-label', 'href', 'src'],
  });
  observed = target;
}
// Messenger's list is a [role="grid"]; Instagram's rows have no such container, so its
// document stays under watch (the debounce keeps that cheap).
function narrow() {
  const row = document.querySelector('[role="row"]');
  const list = row && row.closest('[role="grid"]');
  if (list) observe(list);
}

observe(document);
ipcRenderer.on('panel:read', () => {
  lastKey = '';
  report();
});

// ---- The pin button ---------------------------------------------------------------------------
// A small round button drawn by the app (this preload owns the node and hears its clicks; the
// page's scripts never see a bridge): at the foot of an inbox row's picture while the pointer
// is on the row — the left, clear of the row's own controls on the right — so a chat can be
// pinned without opening it. Main says which chats are pinned. Paper when pinned, graphite
// otherwise — the stack's pin badge, at 28px. Same on Messenger and Instagram. The colours
// are renderer/tokens.css's, as literals (sandboxed, see above); test/tokens.test.js holds
// them to the file.
const PIN_ID = 'mb-pin';
const PIN_SVG =
  '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 1l3.5 3.5-1.2 1.2-.6-.3L7 7.6V9l-.7.7L4.5 7.9 1.9 10.5 1.2 9.8l2.6-2.6-1.8-1.8.7-.7h1.4l2.2-2.2-.3-.6z"/></svg>';
const PIN_CSS =
  '#mb-pin{position:fixed;z-index:2147483646;width:28px;height:28px;border-radius:14px;' +
  'border:1px solid rgba(255, 255, 255, 0.12);background:#1c1c1e;color:#98989d;padding:0;margin:0;' +
  'display:none;align-items:center;justify-content:center;cursor:default;box-shadow:0 8px 24px rgba(0, 0, 0, 0.45)}' +
  '#mb-pin.show{display:flex}#mb-pin.pinned{background:#f5f5f7;color:#1c1c1e}' +
  '#mb-pin:hover{border-color:rgba(255, 255, 255, 0.28);color:#f5f5f7}#mb-pin.pinned:hover{color:#1c1c1e}' +
  '#mb-pin svg{width:13px;height:13px;fill:currentColor;display:block}';
let pins = []; // the hrefs of the pinned chats, from main
let hoverRow = null; // the inbox row under the pointer, if any

// The inbox row an element is in, and what the row says about its chat — the same shape the
// list readers above produce, so a row that is not among the recent five can still be pinned.
const instagram = reader === readRowsInstagram;
function rowAt(node) {
  if (!node || !node.closest) return null;
  if (instagram) {
    const row = node.closest('[role="button"]');
    return row && row.querySelector('span[title]') && row.querySelector('abbr') ? row : null;
  }
  const row = node.closest('[role="row"]');
  return row && row.querySelector('a[role="link"][href*="/t/"]') ? row : null;
}
function rowInfo(row) {
  const img = row.querySelector('img');
  if (instagram) {
    const name = row.querySelector('span[title]').getAttribute('title') || '';
    const handle = encodeURIComponent(name).replace(
      /[!'()*]/g,
      (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
    );
    return { href: '/direct/n/' + handle + '/', name, avatarUrl: img ? img.src : null };
  }
  const link = row.querySelector('a[role="link"][href*="/t/"]');
  const span = row.querySelector('span[dir="auto"]');
  return {
    href: new URL(link.href).pathname,
    name: (img && img.alt) || (span ? spanText(span).trim() : ''),
    avatarUrl: img ? img.src : null,
  };
}

// A row counts only while it is in front: the list stays in the DOM behind an open thread.
function inFront(el) {
  const r = el.getBoundingClientRect();
  if (r.height <= 0 || r.bottom < 0 || r.top > innerHeight) return false;
  const hit = document.elementFromPoint(
    Math.round(r.left + r.width / 2),
    Math.round(r.top + r.height / 2),
  );
  return Boolean(hit) && (hit === el || el.contains(hit) || hit.id === PIN_ID);
}

function pinButton() {
  let btn = document.getElementById(PIN_ID);
  if (btn) return btn;
  if (!document.body) return null;
  const style = document.createElement('style');
  style.id = PIN_ID + '-css';
  style.textContent = PIN_CSS;
  document.head.appendChild(style);
  btn = document.createElement('button');
  btn.id = PIN_ID;
  btn.type = 'button';
  btn.innerHTML = PIN_SVG;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (hoverRow) ipcRenderer.send('panel:pin', rowInfo(hoverRow));
  });
  document.body.appendChild(btn);
  return btn;
}
function drawPin() {
  const btn = pinButton();
  if (!btn) return;
  if (hoverRow && (!hoverRow.isConnected || !inFront(hoverRow))) hoverRow = null;
  let pinned = false;
  if (hoverRow) {
    const r = hoverRow.getBoundingClientRect();
    pinned = pins.includes(rowInfo(hoverRow).href);
    btn.style.top = Math.round(r.bottom - 34) + 'px';
    btn.style.left = Math.round(r.left + 4) + 'px';
  }
  btn.classList.toggle('show', Boolean(hoverRow));
  btn.classList.toggle('pinned', pinned);
  btn.title = pinned ? 'Unpin this chat' : 'Pin this chat';
  btn.setAttribute('aria-label', btn.title);
}
ipcRenderer.on('panel:pin-state', (_event, state) => {
  pins = state && Array.isArray(state.pins) ? state.pins : [];
  drawPin();
});
// The pointer over a row brings the button to that row; leaving the row and the button
// takes it away. Scrolling the list takes it away too.
document.addEventListener('mouseover', (e) => {
  const btn = document.getElementById(PIN_ID);
  if (btn && btn.contains(e.target)) return;
  const row = rowAt(e.target);
  if (row === hoverRow) return;
  hoverRow = row;
  drawPin();
});
document.addEventListener('mouseout', (e) => {
  if (!hoverRow) return;
  const to = e.relatedTarget;
  const btn = document.getElementById(PIN_ID);
  if (to && (hoverRow.contains(to) || (btn && btn.contains(to)))) return;
  hoverRow = null;
  drawPin();
});
document.addEventListener(
  'scroll',
  () => {
    if (!hoverRow) return;
    hoverRow = null;
    drawPin();
  },
  true,
);
// One watch on the page's structure, for two things. Messenger can replace the list node
// (switching inboxes, say), leaving the narrowed row observer on a detached tree: a cheap
// check per mutation batch catches that. And the page may re-render the row under the
// pointer, or replace its body: the pin button goes back where it now belongs. Only class and
// hidden count among attributes — the site writes inline styles every frame something
// animates, and none of that moves the button.
let pinTimer = null;
new MutationObserver(() => {
  if (observed && observed !== document && !observed.isConnected) {
    observe(document);
    schedule();
  }
  if (!hoverRow || pinTimer !== null) return;
  pinTimer = setTimeout(() => {
    pinTimer = null;
    drawPin();
  }, DEBOUNCE_MS);
}).observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class', 'hidden'],
});
