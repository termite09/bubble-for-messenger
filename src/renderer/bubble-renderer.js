const body = document.body;
const content = document.getElementById('content');
const disc = document.getElementById('disc');
const count = document.getElementById('count');
const fan = document.getElementById('fan');
const landed = document.getElementById('landed');
const landedAv = document.getElementById('landed-av');
const landedName = document.getElementById('landed-name');
const landedSub = document.getElementById('landed-sub');

const FAN_PITCH = 52; // head 44 + gap 8; must match lib/layout FAN_ITEM

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

window.bubbleApi.onBadge((n) => {
  count.textContent = n > 9 ? '9+' : String(n);
  count.classList.toggle('visible', n > 0);
});

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
function headEl(item) {
  const el = document.createElement('div');
  el.className = 'head card' + (item.unread ? ' unread' : '');
  el.dataset.href = item.href;
  el.title = item.name;
  if (item.avatar) {
    const img = document.createElement('img');
    img.src = item.avatar;
    img.alt = '';
    el.appendChild(img);
  } else {
    const initial = document.createElement('div');
    initial.className = 'initial';
    initial.textContent = item.name.slice(0, 1).toUpperCase();
    el.appendChild(initial);
  }
  const dot = document.createElement('div');
  dot.className = 'dot';
  el.appendChild(dot);
  el.addEventListener('click', () => window.bubbleApi.openChat(item.href));
  return el;
}

function inboxEl() {
  const el = document.createElement('div');
  el.className = 'head inbox card';
  el.title = 'Open Messenger';
  const img = document.createElement('img');
  img.src = '../../assets/icon.png';
  img.alt = '';
  el.appendChild(img);
  el.addEventListener('click', () => window.bubbleApi.openInbox());
  return el;
}

// ---- Layout from the main process ------------------------------------------------------------
// { contentX, contentY, edge: 'left' | 'right', direction: 'up' | 'down' } — where the disc sits
// inside the padded window and which way the stack and banners extend.
let direction = 'up';
window.bubbleApi.onLayout((l) => {
  direction = l.direction;
  body.classList.toggle('edge-left', l.edge === 'left');
  body.classList.toggle('edge-right', l.edge === 'right');
  body.classList.toggle('up', l.direction === 'up');
  body.classList.toggle('down', l.direction === 'down');
  const w = 250;
  content.style.left = (l.edge === 'right' ? l.contentX + 44 - w : l.contentX) + 'px';
  content.style.width = w + 'px';
  // The column is anchored at the disc: bottom-aligned when growing up, top-aligned when down.
  if (l.direction === 'up') { content.style.top = ''; content.style.bottom = (innerHeight - l.contentY - 44) + 'px'; }
  else { content.style.bottom = ''; content.style.top = l.contentY + 'px'; }
  setDistances();
});

// Each row's distance to the disc drives its fold offset: with the stack above the disc the
// bottom row is nearest; below the disc the top row is.
function setDistances() {
  const rows = [...fan.children];
  rows.forEach((el, i) => {
    const fromDisc = direction === 'up' ? rows.length - i : i + 1;
    el.style.setProperty('--d', `${fromDisc * FAN_PITCH}px`);
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
  fan.replaceChildren();
  // items arrive newest-first and read top-down; Open Messenger closes the list.
  const els = data.items.map(headEl);
  els.push(inboxEl());
  for (const el of els) fan.appendChild(el);
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

window.bubbleApi.onActive((href) => { activeHref = href; markActive(); });

// ---- "A message landed" ----------------------------------------------------------------------
const landedInput = document.getElementById('landed-input');
const landedReply = document.getElementById('landed-reply');
let landedTimer;
let landedHref = null;
let sending = false; // one reply in flight at a time; ↩ is inert meanwhile
const replying = () => body.classList.contains('replying');

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
});
landedInput.addEventListener('blur', () => { if (replying()) { closeReply(); fold(300); } });
window.bubbleApi.onReplyResult((ok) => {
  sending = false;
  body.classList.remove('sending');
  landedSub.textContent = ok ? 'Sent' : 'Couldn’t send — opened the chat';
  fold(ok ? 1200 : 300);
});

// Settings that change what the banner offers and how the count shows.
window.bubbleApi.onSettings((s) => {
  body.classList.toggle('no-reply', !s.quickReply);
  body.classList.toggle('pulse', s.badge === 'pulse');
});
