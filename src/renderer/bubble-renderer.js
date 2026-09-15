const body = document.body;
const content = document.getElementById('content');
const disc = document.getElementById('disc');
const count = document.getElementById('count');
const fan = document.getElementById('fan');
const landed = document.getElementById('landed');
const landedAv = document.getElementById('landed-av');
const landedName = document.getElementById('landed-name');
const landedSub = document.getElementById('landed-sub');

// The page's own lengths (the disc, the banner, a fan row's pitch) arrive with each layout,
// so they are defined once, in lib/bubble-layout.
let pitch = 52;

// Drag/click are resolved in the main process (it polls the cursor while the button is down);
// CSS drag regions can't be used because they swallow click events on macOS.
disc.addEventListener('mousedown', (e) => { if (e.button === 0) window.bubbleApi.dragStart(); });
window.addEventListener('mouseup', (e) => { if (e.button === 0) window.bubbleApi.dragEnd(); });
disc.addEventListener('contextmenu', (e) => { e.preventDefault(); window.bubbleApi.contextMenu(); });

// The window is mostly transparent padding. Tell the main process whether the cursor is over
// something real so it can let clicks fall through everywhere else.
let overContent = false;
window.addEventListener('mousemove', (e) => {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const hit = Boolean(el && el.closest('.card'));
  if (hit !== overContent) { overContent = hit; window.bubbleApi.hit(hit); }
});
window.addEventListener('mouseleave', () => { if (overContent) { overContent = false; window.bubbleApi.hit(false); } });

function setBadge(n) {
  const text = n > 9 ? '9+' : String(n);
  if (count.textContent !== text) count.textContent = text; // a repaint only when it changed
  count.classList.toggle('visible', n > 0);
  pulse();
}
window.bubbleApi.onBadge(setBadge);

// The pulsing count (a setting): the pill dims and brightens every 1.2 s while it shows.
let pulseTimer = null;
function pulse() {
  const on = body.classList.contains('pulse') && count.classList.contains('visible');
  if (on && pulseTimer === null) pulseTimer = setInterval(() => count.classList.toggle('dim'), 1200);
  if (!on && pulseTimer !== null) { clearInterval(pulseTimer); pulseTimer = null; count.classList.remove('dim'); }
}

function fillAvatar(target, item) {
  target.replaceChildren();
  if (item.avatar) {
    const img = document.createElement('img');
    img.src = item.avatar;
    img.alt = '';
    target.appendChild(img);
  } else {
    target.textContent = item.name.slice(0, 1).toUpperCase();
  }
}

// A head: the contact's photo filling a 44px disc, name as the tooltip, blue dot when unread.
// Right-click pins or unpins it (main shows the menu). Heads are kept between refreshes and
// brought up to date in place, so a refresh never re-decodes pictures or restarts a hover.
const PIN_SVG = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 1l3.5 3.5-1.2 1.2-.6-.3L7 7.6V9l-.7.7L4.5 7.9 1.9 10.5 1.2 9.8l2.6-2.6-1.8-1.8.7-.7h1.4l2.2-2.2-.3-.6z"/></svg>';
function headEl(item) {
  const el = document.createElement('div');
  el.className = 'head card';
  el.dataset.href = item.href;
  el.appendChild(document.createElement('div')); // the picture or initial
  const dot = document.createElement('div');
  dot.className = 'dot';
  el.appendChild(dot);
  const pin = document.createElement('div');
  pin.className = 'pin';
  pin.innerHTML = PIN_SVG;
  el.appendChild(pin);
  el.addEventListener('click', () => window.bubbleApi.openChat(item.href));
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); window.bubbleApi.headMenu(item.href); });
  return updateHead(el, item);
}

function updateHead(el, item) {
  el.classList.toggle('unread', Boolean(item.unread));
  el.classList.toggle('pinned', Boolean(item.pinned));
  if (el.title !== item.name) el.title = item.name;
  const face = el.firstChild;
  if (item.avatar) {
    if (face.tagName !== 'IMG') { const img = document.createElement('img'); img.alt = ''; face.replaceWith(img); }
    if (el.firstChild.src !== item.avatar) el.firstChild.src = item.avatar;
  } else {
    if (face.tagName !== 'DIV') { const d = document.createElement('div'); face.replaceWith(d); }
    el.firstChild.className = 'initial';
    el.firstChild.textContent = item.name.slice(0, 1).toUpperCase();
  }
  return el;
}

// The inbox head: a tray glyph on paper, captioned "Inbox" beside it.
function inboxEl() {
  const el = document.createElement('div');
  el.className = 'head inbox card';
  el.title = 'Inbox';
  el.innerHTML = '<svg viewBox="0 0 22 22" aria-hidden="true"><path d="M3 12l2.2-6.5A1 1 0 0 1 6.2 5h9.6a1 1 0 0 1 1 .5L19 12v4.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 12h4.5l1 2h5l1-2H19"/></svg>';
  const caption = document.createElement('div');
  caption.className = 'caption';
  caption.textContent = 'Inbox';
  el.appendChild(caption);
  el.addEventListener('click', () => window.bubbleApi.openInbox());
  return el;
}

// ---- Layout from the main process ------------------------------------------------------------
// { contentX, contentY, edge: 'left' | 'right', direction: 'up' | 'down' } — where the disc sits
// inside the padded window and which way the stack and banners extend.
let direction = 'up';
function setLayout(l) {
  direction = l.direction;
  body.classList.toggle('edge-left', l.edge === 'left');
  body.classList.toggle('edge-right', l.edge === 'right');
  body.classList.toggle('up', l.direction === 'up');
  body.classList.toggle('down', l.direction === 'down');
  pitch = l.pitch;
  content.style.left = (l.edge === 'right' ? l.contentX + l.base - l.banner : l.contentX) + 'px';
  content.style.width = l.banner + 'px';
  // The column is anchored at the disc: bottom-aligned when growing up, top-aligned when down.
  if (l.direction === 'up') { content.style.top = ''; content.style.bottom = (innerHeight - l.contentY - l.base) + 'px'; }
  else { content.style.bottom = ''; content.style.top = l.contentY + 'px'; }
  setDistances();
}
window.bubbleApi.onLayout(setLayout);

// Each row's distance to the disc drives its fold offset: with the stack above the disc the
// bottom row is nearest; below the disc the top row is.
function setDistances() {
  const rows = [...fan.children];
  rows.forEach((el, i) => {
    const fromDisc = direction === 'up' ? rows.length - i : i + 1;
    el.style.setProperty('--d', `${fromDisc * pitch}px`);
  });
}

// ---- Fan -------------------------------------------------------------------------------------
// { animate: 'in' | 'update', items } opens or refreshes; { animate: 'out' } folds the stack back
// into the disc (the main process shrinks the window once the fold has played); 'clear' empties it.
let activeHref;
function markActive() {
  for (const el of fan.children) el.classList.toggle('active', el.dataset.href !== undefined && el.dataset.href === activeHref);
}

window.bubbleApi.onFan((data) => {
  if (!data || data.animate === 'clear') { fan.replaceChildren(); body.classList.remove('open'); return; }
  if (data.animate === 'out') { body.classList.remove('open'); return; }
  const wasOpen = body.classList.contains('open');
  // items arrive newest-first and read top-down, pinned ones last; the inbox closes the list.
  // Existing heads are reused by href and reordered; only what changed is touched.
  const existing = new Map([...fan.querySelectorAll('.head[data-href]')].map((el) => [el.dataset.href, el]));
  const inbox = fan.querySelector('.head.inbox') || inboxEl();
  const els = data.items.map((item) => (existing.has(item.href) ? updateHead(existing.get(item.href), item) : headEl(item)));
  for (const el of els) el.classList.remove('first-pinned');
  const firstPinned = els.find((el) => el.classList.contains('pinned'));
  if (firstPinned && firstPinned !== els[0]) firstPinned.classList.add('first-pinned');
  els.push(inbox);
  fan.replaceChildren(...els); // moves the kept nodes; nothing is re-created
  setDistances();
  markActive();
  if (data.animate === 'in' && !wasOpen) {
    // Register the folded start state before releasing the deploy.
    void fan.offsetHeight;
    requestAnimationFrame(() => body.classList.add('open'));
  } else {
    body.classList.add('open');
  }
});

function setActive(href) { activeHref = href; markActive(); }
window.bubbleApi.onActive(setActive);

// ---- "A message landed" ----------------------------------------------------------------------
const landedInput = document.getElementById('landed-input');
const landedReply = document.getElementById('landed-reply');
let landedTimer;
let landedHref = null;
let sending = false; // one reply in flight at a time; ↩ is inert meanwhile
const replying = () => body.classList.contains('replying');

// Whatever changes the banner — it landing or folding, its text, the reply row — the page
// measures what it needs beyond the disc row and tells main, which makes the room.
let reportedExtra = -1;
function reportBanner() {
  const extra = body.classList.contains('landed') ? Math.max(0, landed.offsetHeight - disc.offsetHeight) : 0;
  if (extra === reportedExtra) return;
  reportedExtra = extra;
  window.bubbleApi.bannerExtra(extra);
}
new MutationObserver(reportBanner).observe(body, { attributes: true, attributeFilter: ['class'] });
new MutationObserver(reportBanner).observe(landed, { childList: true, characterData: true, subtree: true });

const fold = (after) => {
  clearTimeout(landedTimer);
  landedTimer = setTimeout(() => body.classList.remove('landed'), after);
};

window.bubbleApi.onLanded((item) => {
  if (replying() || sending) return; // don't yank a reply out from under the user
  landedHref = item.href;
  fillAvatar(landedAv, item);
  landedName.textContent = item.name;
  landedSub.textContent = item.preview || 'New message';
  landedInput.placeholder = 'Reply to ' + item.name;
  body.classList.add('landed');
  fold(4000);
});
// Clicking the banner opens that conversation. It lives inside the disc, so stop the press
// from starting a drag and the release from counting as a disc click.
landed.addEventListener('mousedown', (e) => e.stopPropagation());
// Hovering holds the banner open; it folds shortly after the cursor leaves (unless replying).
landed.addEventListener('mouseenter', () => clearTimeout(landedTimer));
landed.addEventListener('mouseleave', () => { if (!replying() && !sending) fold(1500); });
landed.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!landedHref || replying() || sending) return;
  body.classList.remove('landed');
  clearTimeout(landedTimer);
  window.bubbleApi.openChat(landedHref);
});

// ---- Reply from the banner --------------------------------------------------------------------
// ↩ swaps the first line for a field and borrows keyboard focus for exactly as long as it is
// open. Enter sends, Esc or a click anywhere else cancels; either way the focus goes back.
function openReply() {
  if (!landedHref || sending) return;
  clearTimeout(landedTimer);
  body.classList.add('replying');
  landedInput.value = '';
  window.bubbleApi.replyFocus(true);
  landedInput.focus();
}
function closeReply() {
  body.classList.remove('replying');
  window.bubbleApi.replyFocus(false);
}
landedReply.addEventListener('click', (e) => { e.stopPropagation(); openReply(); });
landedInput.addEventListener('click', (e) => e.stopPropagation());
landedInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeReply(); fold(300); }
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const text = landedInput.value.trim();
  if (!text) return;
  sending = true;
  closeReply();
  body.classList.add('sending');
  landedSub.textContent = 'Sending…';
  window.bubbleApi.sendReply(landedHref, text);
  // Main answers within its 12 s budget; should the answer never come (a crashed page, say),
  // the banner must not stay mute forever.
  clearTimeout(sendTimer);
  sendTimer = setTimeout(() => replyResult(false), 30000);
});
landedInput.addEventListener('blur', () => { if (replying()) { closeReply(); fold(300); } });
let sendTimer;
function replyResult(ok) {
  if (!sending) return;
  clearTimeout(sendTimer);
  sending = false;
  body.classList.remove('sending');
  landedSub.textContent = ok ? 'Sent' : 'Couldn’t send — opened the chat';
  fold(ok ? 1200 : 300);
}
window.bubbleApi.onReplyResult(replyResult);

// Settings that change what the banner offers and how the count shows.
function setSettings(s) {
  body.classList.toggle('no-reply', !s.quickReply);
  body.classList.toggle('pulse', s.badge === 'pulse');
  pulse();
}
window.bubbleApi.onSettings(setSettings);

// A fresh document (startup, or a reload) asks main for the state it missed rather than
// relying on main to notice and resend it.
window.bubbleApi.state().then((st) => {
  if (!st) return;
  if (st.settings) setSettings(st.settings);
  if (st.layout) setLayout(st.layout);
  setBadge(st.badge || 0);
  setActive(st.active || null);
});
