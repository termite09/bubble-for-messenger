// The panel's preload: watches Messenger's chat list and reports its rows to main whenever
// they change, so main need not poll the page. Sandboxed, and deliberately inert toward the
// page: no contextBridge, nothing written to window, nothing evaluated. The reader functions
// are verbatim copies of lib/recent.js spanText, listAtTop and lib/rows.js readRows (a
// sandboxed preload cannot require them);
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

let lastKey = '';
let timer = null;
let observed = null;

// Read the rows and send them if they differ from what was last sent. A scrolled list (null)
// is not a reading. The observer narrows to the list itself once there is one.
function report() {
  timer = null;
  let rows;
  try {
    // Five rows plus one per pinned chat: the stack's recent five are the newest not pinned.
    rows = readRows(LIMIT + pins.length, spanText, listAtTop);
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
// Messenger's list is a [role="grid"]: narrow to it once there is one.
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
// otherwise — the stack's pin badge, at 28px. The colours
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
function rowAt(node) {
  if (!node || !node.closest) return null;
  const row = node.closest('[role="row"]');
  return row && row.querySelector('a[role="link"][href*="/t/"]') ? row : null;
}
function rowInfo(row) {
  const img = row.querySelector('img');
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
  pins = state && Array.isArray(state.pins) ? state.pins.slice(0, 5) : [];
  drawPin();
  schedule(); // a row more or fewer to read
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
  // Hidden, there is nothing to draw: the page's constant class changes cost nothing then.
  if (pinTimer !== null || document.hidden) return;
  pinTimer = setTimeout(() => {
    pinTimer = null;
    if (hoverRow) drawPin();
    drawControls(); // the chat header comes and goes as the page moves between views
  }, DEBOUNCE_MS);
}).observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class', 'hidden'],
});

// ---- The panel's own controls -----------------------------------------------------------------
// On a chat, while the pointer is over the panel: ↗ the chat on messenger.com in the browser,
// the pin that keeps the panel up when you click elsewhere, and ✕ to put it away (Esc too,
// unless one of Messenger's own menus or dialogs is open — Esc is theirs then). Drawn by the app
// like the row pin button above, in its colours; hung just under Messenger's chat header, found
// by its information button, so it never covers the header's own controls.
const CTRL_ID = 'mb-controls';
const CTRL_CSS =
  '#mb-controls{position:fixed;z-index:2147483646;right:10px;display:none;gap:2px;padding:2px;' +
  'border-radius:16px;border:1px solid rgba(255, 255, 255, 0.12);background:#1c1c1e;' +
  'box-shadow:0 8px 24px rgba(0, 0, 0, 0.45);opacity:0;transition:opacity 120ms linear}' +
  '#mb-controls.show{display:flex}html:hover #mb-controls{opacity:1}' +
  '#mb-controls button{width:26px;height:26px;border:0;border-radius:13px;padding:0;margin:0;' +
  'background:transparent;color:#98989d;display:flex;align-items:center;justify-content:center;cursor:default}' +
  '#mb-controls button:hover{background:#2c2c2e;color:#f5f5f7}' +
  '#mb-controls button.on{background:#f5f5f7;color:#1c1c1e}' +
  '#mb-controls svg{width:12px;height:12px;display:block}' +
  '@media (prefers-reduced-motion: reduce){#mb-controls{transition:none}}';
const STROKE =
  'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
const CTRL_BUTTONS = [
  [
    'browser',
    'Open in browser',
    `<svg viewBox="0 0 12 12" aria-hidden="true"><path ${STROKE} d="M5 2.5H2.5v7h7V7M7 2.5h2.5V5M9.5 2.5 5.5 6.5"/></svg>`,
  ],
  [
    'keep',
    'Keep open when you click elsewhere',
    PIN_SVG.replace('<svg', '<svg fill="currentColor"'),
  ],
  [
    'close',
    'Close (Esc)',
    `<svg viewBox="0 0 12 12" aria-hidden="true"><path ${STROKE} d="M3 3l6 6M9 3l-6 6"/></svg>`,
  ],
];
let kept = false;

function controls() {
  let box = document.getElementById(CTRL_ID);
  if (box) return box;
  if (!document.body) return null;
  const style = document.createElement('style');
  style.id = CTRL_ID + '-css';
  style.textContent = CTRL_CSS;
  document.head.appendChild(style);
  box = document.createElement('div');
  box.id = CTRL_ID;
  for (const [name, label, svg] of CTRL_BUTTONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.control = name;
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.innerHTML = svg;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      ipcRenderer.send(
        { browser: 'panel:browser', keep: 'panel:keep', close: 'panel:close' }[name],
      );
    });
    box.appendChild(btn);
  }
  document.body.appendChild(box);
  return box;
}
// Shown on a chat (its information button is there to hang from), just under that button's row.
function drawControls() {
  const box = controls();
  if (!box) return;
  const info = document.querySelector('[role="main"] [aria-label="Conversation information"]');
  const r = info && info.getBoundingClientRect();
  const on = Boolean(r && r.height > 0 && r.bottom > 0);
  box.classList.toggle('show', on);
  if (on) box.style.top = Math.round(r.bottom + 10) + 'px';
  const keepBtn = box.querySelector('[data-control="keep"]');
  keepBtn.classList.toggle('on', kept);
  keepBtn.setAttribute('aria-pressed', String(kept));
}
ipcRenderer.on('panel:keep-state', (_event, state) => {
  kept = Boolean(state && state.keep);
  drawControls();
});
document.addEventListener('mouseover', () => drawControls(), true);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) drawControls();
});

// Typing, pasting or dropping something into the chat makes it one you are in: main keeps the
// panel up on a click elsewhere until it is put away. Said at most every two seconds.
let engagedAt = 0;
function engaged() {
  const now = Date.now();
  if (now - engagedAt < 2000) return;
  engagedAt = now;
  ipcRenderer.send('panel:engaged');
}
document.addEventListener(
  'keydown',
  (e) => {
    if (e.target && e.target.isContentEditable) engaged();
  },
  true,
);
document.addEventListener('paste', engaged, true);
document.addEventListener('drop', engaged, true);
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return;
  ipcRenderer.send('panel:close');
});
