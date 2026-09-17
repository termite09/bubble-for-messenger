const body = document.body;
const content = document.getElementById('content');
const disc = document.getElementById('disc');
const face = document.getElementById('disc-face');
const mark = document.getElementById('mark');
const count = document.getElementById('count');
const other = document.getElementById('other');
const statusEl = document.getElementById('status');
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
disc.addEventListener('mousedown', (e) => {
  if (e.button === 0) window.bubbleApi.dragStart();
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) window.bubbleApi.dragEnd();
});
disc.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.bubbleApi.contextMenu();
});

// The window is mostly transparent padding. Tell the main process whether the cursor is over
// something real so it can let clicks fall through everywhere else. The hit test is a layout
// query, so it runs once per frame for the last position, not once per mouse event.
let overContent = false;
let hitFrame = null;
let hitAt = null;
window.addEventListener('mousemove', (e) => {
  hitAt = { x: e.clientX, y: e.clientY };
  if (hitFrame !== null) return;
  hitFrame = requestAnimationFrame(() => {
    hitFrame = null;
    const el = document.elementFromPoint(hitAt.x, hitAt.y);
    const hit = Boolean(el && el.closest('.card'));
    if (hit !== overContent) {
      overContent = hit;
      window.bubbleApi.hit(hit);
    }
  });
});
window.addEventListener('mouseleave', () => {
  if (overContent) {
    overContent = false;
    window.bubbleApi.hit(false);
  }
});

const countText = (n) => (n > 9 ? '9+' : String(n));
let platformLabel = 'Messenger';
let badge = 0;
let lastStatus = { connection: 'online', signedOut: false };
// The pill and the status chip are hidden from readers; the face's own name says what they say.
function describeFace() {
  const parts = [platformLabel];
  if (badge > 0) parts.push(countText(badge) + ' unread');
  if (lastStatus.signedOut) parts.push('signed out');
  else if (lastStatus.connection === 'offline') parts.push('offline');
  else if (lastStatus.connection === 'reconnecting') parts.push('reconnecting');
  face.setAttribute('aria-label', parts.join(', '));
}
function setBadge(n) {
  badge = n;
  const text = countText(n);
  if (count.textContent !== text) count.textContent = text; // a repaint only when it changed
  count.classList.toggle('visible', n > 0);
  describeFace();
  pulse();
}

// ---- Platforms --------------------------------------------------------------------------------
// { id, mark, badge, other } (lib/sites discState): the disc wears the focused platform's mark
// and count; the other platform, if any, is the satellite at the disc's foot, and clicking it
// brings it into focus.
const markSrc = (file) => '../../assets/' + file;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let otherPlatform = null;
const marks = {}; // platform id -> mark file, from the platform push
let swapTimer = null;
function setMark(file) {
  const src = markSrc(file);
  if (mark.getAttribute('src') === src) return;
  if (reduceMotion.matches || !mark.getAttribute('src')) {
    mark.src = src;
    return;
  }
  // Fade out, swap, fade in: the mark's own opacity transition (120ms, the crossfade clock),
  // both ways.
  clearTimeout(swapTimer);
  body.classList.add('swapping');
  swapTimer = setTimeout(() => {
    mark.src = src;
    body.classList.remove('swapping');
  }, 120);
}
function setPlatform(state) {
  if (!state) return;
  marks[state.id] = state.mark;
  if (state.other) marks[state.other.id] = state.other.mark;
  setMark(state.mark);
  platformLabel = state.label || platformLabel;
  setBadge(state.badge || 0);
  otherPlatform = state.other || null;
  body.classList.toggle('has-other', Boolean(otherPlatform));
  body.classList.toggle('other-unread', Boolean(otherPlatform && otherPlatform.count > 0));
  if (otherPlatform) {
    other.querySelector('img').src = markSrc(otherPlatform.mark);
    other.querySelector('.n').textContent = countText(otherPlatform.count);
    other.title = 'Switch to ' + otherPlatform.label;
    // The count is drawn in the satellite; a reader hears it in the name.
    other.setAttribute(
      'aria-label',
      other.title +
        (otherPlatform.count > 0 ? ', ' + countText(otherPlatform.count) + ' unread' : ''),
    );
  }
}
window.bubbleApi.onPlatform(setPlatform);
// The satellite lives inside the disc: its press must not start a drag, and its release must
// not count as a disc click. Hovering it says what it does in the status chip.
other.addEventListener('mousedown', (e) => e.stopPropagation());
other.addEventListener('click', (e) => {
  e.stopPropagation();
  if (otherPlatform) window.bubbleApi.switchPlatform(otherPlatform.id);
});
other.addEventListener('mouseenter', () => {
  if (!otherPlatform) return;
  statusEl.textContent = 'Switch to ' + otherPlatform.label;
  body.classList.add('switching');
});
other.addEventListener('mouseleave', () => {
  body.classList.remove('switching');
  setStatus(lastStatus);
});

// The pulsing count (a setting): the pill dims and brightens every 1.2 s while it shows.
let pulseTimer = null;
function pulse() {
  const on = body.classList.contains('pulse') && count.classList.contains('visible');
  if (on && pulseTimer === null)
    pulseTimer = setInterval(() => count.classList.toggle('dim'), 1200);
  if (!on && pulseTimer !== null) {
    clearInterval(pulseTimer);
    pulseTimer = null;
    count.classList.remove('dim');
  }
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
const PIN_SVG =
  '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 1l3.5 3.5-1.2 1.2-.6-.3L7 7.6V9l-.7.7L4.5 7.9 1.9 10.5 1.2 9.8l2.6-2.6-1.8-1.8.7-.7h1.4l2.2-2.2-.3-.6z"/></svg>';
function headEl(item) {
  const el = document.createElement('div');
  el.className = 'head card';
  el.setAttribute('role', 'button');
  el.dataset.href = item.href;
  el.appendChild(document.createElement('div')); // the picture or initial
  const dot = document.createElement('div');
  dot.className = 'dot';
  el.appendChild(dot);
  // The pin badge and the caption chip are for the pointer (a button holds no controls of
  // its own for a reader): the head's name carries the pinned state, the menu is the disc's.
  const pin = document.createElement('div');
  pin.className = 'pin';
  pin.innerHTML = PIN_SVG;
  pin.title = 'Pin';
  pin.setAttribute('aria-hidden', 'true');
  el.appendChild(pin);
  const caption = document.createElement('div');
  caption.className = 'caption';
  caption.setAttribute('aria-hidden', 'true');
  el.appendChild(caption);
  // The badge pins or unpins; while the cursor is on it the chip says which.
  pin.addEventListener('click', (e) => {
    e.stopPropagation();
    window.bubbleApi.pinToggle(item.href);
  });
  pin.addEventListener('mouseenter', () => {
    caption.textContent = el.classList.contains('pinned') ? 'Unpin' : 'Pin';
  });
  pin.addEventListener('mouseleave', () => {
    caption.textContent = el.title;
  });
  // The ring goes on and the head dims at once; the panel takes a moment to show.
  el.addEventListener('click', () => {
    setActive(item.href);
    el.classList.add('busy');
    window.bubbleApi.openChat(item.href);
  });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.bubbleApi.headMenu(item.href);
  });
  return updateHead(el, item);
}

function updateHead(el, item) {
  el.classList.toggle('unread', Boolean(item.unread));
  el.classList.toggle('pinned', Boolean(item.pinned));
  if (el.title !== item.name) {
    el.title = item.name;
    el.querySelector('.caption').textContent = item.name;
  }
  el.querySelector('.pin').title = item.pinned ? 'Unpin' : 'Pin';
  el.setAttribute(
    'aria-label',
    item.name + (item.unread ? ', unread' : '') + (item.pinned ? ', pinned' : ''),
  );
  const face = el.firstChild;
  if (item.avatar) {
    if (face.tagName !== 'IMG') {
      const img = document.createElement('img');
      img.alt = '';
      face.replaceWith(img);
    }
    if (el.firstChild.src !== item.avatar) el.firstChild.src = item.avatar;
  } else {
    if (face.tagName !== 'DIV') {
      const d = document.createElement('div');
      face.replaceWith(d);
    }
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
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', 'Inbox');
  el.innerHTML =
    '<svg viewBox="0 0 22 22" aria-hidden="true"><path d="M3 12l2.2-6.5A1 1 0 0 1 6.2 5h9.6a1 1 0 0 1 1 .5L19 12v4.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 12h4.5l1 2h5l1-2H19"/></svg>';
  const caption = document.createElement('div');
  caption.className = 'caption';
  caption.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = 'Inbox';
  const hiddenCount = document.createElement('span');
  hiddenCount.className = 'hidden-count';
  caption.append(label, hiddenCount);
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
  body.style.setProperty('--banner', l.banner + 'px'); // the chips end where the column does
  // The column is anchored at the disc: bottom-aligned when growing up, top-aligned when down.
  if (l.direction === 'up') {
    content.style.top = '';
    content.style.bottom = innerHeight - l.contentY - l.base + 'px';
  } else {
    content.style.bottom = '';
    content.style.top = l.contentY + 'px';
  }
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
  for (const el of fan.children)
    el.classList.toggle('active', el.dataset.href !== undefined && el.dataset.href === activeHref);
}

window.bubbleApi.onFan((data) => {
  if (!data || data.animate === 'clear') {
    fan.replaceChildren();
    body.classList.remove('open');
    return;
  }
  if (data.animate === 'out') {
    body.classList.remove('open');
    return;
  }
  const wasOpen = body.classList.contains('open');
  // items arrive pinned-first, then the recent ones newest-first, and read top-down; the inbox
  // closes the list.
  // Existing heads are reused by href and reordered; only what changed is touched.
  const existing = new Map(
    [...fan.querySelectorAll('.head[data-href]')].map((el) => [el.dataset.href, el]),
  );
  const inbox = fan.querySelector('.head.inbox') || inboxEl();
  const els = data.items.map((item) =>
    existing.has(item.href) ? updateHead(existing.get(item.href), item) : headEl(item),
  );
  // Pinned heads come first; a hairline parts them from the recent ones that follow.
  for (const el of els) el.classList.remove('first-recent');
  const firstRecent = els.find((el) => !el.classList.contains('pinned'));
  if (firstRecent && firstRecent !== els[0]) firstRecent.classList.add('first-recent');
  // Rows the screen had no room for: the inbox chip says how many.
  inbox.querySelector('.hidden-count').textContent = data.hidden ? ` · +${data.hidden} more` : '';
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

function setActive(href) {
  activeHref = href;
  markActive();
}
window.bubbleApi.onActive(setActive);
const clearBusy = () => {
  for (const el of fan.querySelectorAll('.head.busy')) el.classList.remove('busy');
};
window.bubbleApi.onOpened(clearBusy);

// ---- "A message landed" ----------------------------------------------------------------------
const landedInput = document.getElementById('landed-input');
const landedReply = document.getElementById('landed-reply');
const landedMark = document.getElementById('landed-mark');
let landedTimer;
let landedHref = null;
let sending = false; // one reply in flight at a time; ↩ is inert meanwhile
const replying = () => body.classList.contains('replying');

// Whatever changes the banner — it landing or folding, its text, the reply row — the page
// measures what it needs beyond the disc row and tells main, which makes the room.
let reportedExtra = -1;
function reportBanner() {
  const extra = body.classList.contains('landed')
    ? Math.max(0, landed.offsetHeight - disc.offsetHeight)
    : 0;
  if (extra === reportedExtra) return;
  reportedExtra = extra;
  window.bubbleApi.bannerExtra(extra);
}
new MutationObserver(reportBanner).observe(body, { attributes: true, attributeFilter: ['class'] });
new MutationObserver(reportBanner).observe(landed, {
  childList: true,
  characterData: true,
  subtree: true,
});

const fold = (after) => {
  clearTimeout(landedTimer);
  landedTimer = setTimeout(() => body.classList.remove('landed'), after);
};

// A banner with no chat behind it (the first-run welcome) has nothing to open or reply to;
// a click folds it.
window.bubbleApi.onLanded((item) => {
  if (replying() || sending) return; // don't yank a reply out from under the user
  landedHref = item.href || null;
  fillAvatar(landedAv, item);
  // Which platform the message is from, on the avatar (shown only with two platforms on).
  if (otherPlatform && marks[item.platform]) landedMark.src = markSrc(marks[item.platform]);
  else landedMark.removeAttribute('src');
  landedAv.appendChild(landedMark);
  landedName.textContent = item.name;
  landedSub.textContent = item.preview || 'New message';
  body.classList.remove('sent', 'failed');
  body.classList.toggle('notice', !landedHref);
  landedInput.placeholder = 'Reply to ' + item.name;
  landedInput.setAttribute('aria-label', 'Reply to ' + item.name);
  body.classList.add('landed');
  fold(item.hold || 4000);
});
// Clicking the banner opens that conversation. It lives inside the disc, so stop the press
// from starting a drag and the release from counting as a disc click.
landed.addEventListener('mousedown', (e) => e.stopPropagation());
// Hovering holds the banner open; it folds shortly after the cursor leaves (unless replying).
landed.addEventListener('mouseenter', () => clearTimeout(landedTimer));
landed.addEventListener('mouseleave', () => {
  if (!replying() && !sending) fold(1500);
});
landed.addEventListener('click', (e) => {
  e.stopPropagation();
  if (replying() || sending) return;
  body.classList.remove('landed');
  clearTimeout(landedTimer);
  if (landedHref) window.bubbleApi.openChat(landedHref);
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
// The message itself is the reply affordance too: clicking it opens the field (the name row
// still opens the chat). Off with the reply setting, when it opens the chat like the rest.
landedSub.addEventListener('click', (e) => {
  if (body.classList.contains('no-reply') || !landedHref || sending) return;
  e.stopPropagation();
  openReply();
});
landedReply.addEventListener('click', (e) => {
  e.stopPropagation();
  openReply();
});
landedInput.addEventListener('click', (e) => e.stopPropagation());
landedInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeReply();
    fold(300);
  }
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const text = landedInput.value.trim();
  if (!text) return;
  sending = true;
  closeReply();
  body.classList.add('sending');
  body.classList.remove('sent', 'failed');
  landedSub.textContent = 'Sending…';
  window.bubbleApi.sendReply(landedHref, text);
  // Main answers within its 12 s budget; should the answer never come (a crashed page, say),
  // the banner must not stay mute forever.
  clearTimeout(sendTimer);
  sendTimer = setTimeout(() => replyResult(false), 30000);
});
landedInput.addEventListener('blur', () => {
  if (replying()) {
    closeReply();
    fold(300);
  }
});
let sendTimer;
function replyResult(ok) {
  if (!sending) return;
  clearTimeout(sendTimer);
  sending = false;
  body.classList.remove('sending');
  body.classList.add(ok ? 'sent' : 'failed');
  // A tick for a moment; a failure stays long enough to read, and says where the text went.
  landedSub.textContent = ok ? 'Sent' : 'Couldn’t send — your text is in the chat';
  fold(ok ? 1200 : 4000);
}
window.bubbleApi.onReplyResult(replyResult);

// Settings that change what the banner offers and how the count shows.
function setSettings(s) {
  body.classList.toggle('no-reply', !s.quickReply);
  body.classList.toggle('pulse', s.badge === 'pulse');
  document.documentElement.toggleAttribute('data-glass', Boolean(s.glass));
  pulse();
}
window.bubbleApi.onSettings(setSettings);

// Whether Messenger is reachable and whether anyone is signed in: the mark dims and a chip
// beside the disc says which (on hover — or, signed out, until you sign in); the face's name
// says it to a reader.
function setStatus(st) {
  lastStatus = st;
  const words = { offline: 'Offline', reconnecting: 'Reconnecting…' };
  body.classList.toggle('offline', st.connection === 'offline');
  body.classList.toggle('reconnecting', st.connection === 'reconnecting');
  body.classList.toggle('signed-out', Boolean(st.signedOut));
  statusEl.textContent = st.signedOut ? 'Sign in' : words[st.connection] || '';
  describeFace();
}
window.bubbleApi.onStatus(setStatus);

// A fresh document (startup, or a reload) asks main for the state it missed rather than
// relying on main to notice and resend it.
window.bubbleApi.state().then((st) => {
  if (!st) return;
  if (st.settings) setSettings(st.settings);
  if (st.layout) setLayout(st.layout);
  if (st.platform) setPlatform(st.platform);
  setActive(st.active || null);
  if (st.status) setStatus(st.status);
});
