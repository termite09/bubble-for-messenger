const bubble = document.getElementById('bubble');
const badge = document.getElementById('badge');
const fan = document.getElementById('fan');

// Drag/click are resolved in the main process (it polls the cursor while the button is down);
// CSS drag regions can't be used because they swallow click events on macOS.
bubble.addEventListener('mousedown', (e) => { if (e.button === 0) window.bubbleApi.dragStart(); });
window.addEventListener('mouseup', (e) => { if (e.button === 0) window.bubbleApi.dragEnd(); });
window.addEventListener('blur', () => window.bubbleApi.dragEnd());
bubble.addEventListener('contextmenu', (e) => { e.preventDefault(); window.bubbleApi.contextMenu(); });

window.bubbleApi.onBadge((n) => {
  badge.textContent = n > 9 ? '9+' : String(n);
  badge.classList.toggle('visible', n > 0);
});

function itemEl({ href, name, avatar, unread }) {
  const el = document.createElement('div');
  el.className = 'item' + (unread ? ' unread' : '');
  el.title = name;
  if (avatar) {
    const img = document.createElement('img');
    img.src = avatar;
    img.alt = '';
    el.appendChild(img);
  } else {
    const initial = document.createElement('div');
    initial.className = 'initial';
    initial.textContent = name.slice(0, 1).toUpperCase();
    el.appendChild(initial);
  }
  const dot = document.createElement('div');
  dot.className = 'dot';
  el.appendChild(dot);
  el.addEventListener('click', () => window.bubbleApi.openChat(href));
  return el;
}

function inboxEl() {
  const el = document.createElement('div');
  el.className = 'item inbox';
  el.title = 'Open Messenger';
  const img = document.createElement('img');
  img.src = 'icon.png';
  img.alt = '';
  el.appendChild(img);
  el.addEventListener('click', () => window.bubbleApi.openInbox());
  return el;
}

const STAGGER_MS = 30;

// Turn the metaball filter on while anything is moving, off once it settles.
let oozeTimer;
function ooze(durationMs) {
  document.body.classList.add('oozing');
  clearTimeout(oozeTimer);
  oozeTimer = setTimeout(() => document.body.classList.remove('oozing'), durationMs);
}

// Each fan message is { animate: 'in', direction, items } to open or { animate: 'out' } to close.
// On 'in' we build the items in the tucked `enter` state, then release them next frame so they
// spring outward, staggered from the main bubble. On 'out' we tuck them back; the main process
// shrinks the window after the matching delay.
window.bubbleApi.onFan((data) => {
  if (data && data.animate === 'clear') {
    // Remove the tucked-away items so they stop taking layout height, which would otherwise
    // push the main bubble out of the shrunken window and leave it looking empty.
    fan.replaceChildren();
    return;
  }
  if (!data || data.animate === 'out') {
    ooze(320);
    for (const el of fan.children) el.classList.add('enter');
    return;
  }

  fan.replaceChildren();
  document.body.classList.toggle('down', data.direction === 'down');
  // items arrive newest-first; render oldest nearest the main bubble so the newest chat
  // ends up farthest out, with the Open Messenger item beyond it.
  const els = [...data.items].reverse().map(itemEl);
  els.push(inboxEl());
  const animate = data.animate === 'in';
  els.forEach((el, i) => {
    if (animate) {
      el.classList.add('enter');
      el.style.transitionDelay = i * STAGGER_MS + 'ms';
    }
    fan.appendChild(el);
  });
  if (!animate) return; // 'update': show the new contents without replaying the entrance
  ooze(els.length * STAGGER_MS + 320);
  // Force layout so the browser registers the `enter` start state before we remove it.
  void fan.offsetHeight;
  requestAnimationFrame(() => els.forEach((el) => el.classList.remove('enter')));
});
