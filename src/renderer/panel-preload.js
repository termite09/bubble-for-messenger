// The panel's preload: watches Messenger's chat list and reports its rows to main whenever
// they change, so main need not poll the page. Sandboxed, and deliberately inert toward the
// page: no contextBridge, nothing written to window, nothing evaluated. The reader functions
// are verbatim copies of lib/recent.js spanText, listAtTop and lib/rows.js readRows (a
// sandboxed preload cannot require them); test/panel-preload.test.js holds them to the
// originals. Channel names: lib/ipc.js.
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
    rows = readRows(LIMIT, spanText, listAtTop);
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
