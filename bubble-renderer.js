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

// fan = null collapses; otherwise { direction: 'up' | 'down', items: [...] }.
window.bubbleApi.onFan((data) => {
  fan.replaceChildren();
  document.body.classList.toggle('down', Boolean(data && data.direction === 'down'));
  if (!data) return;
  for (const item of data.items) fan.appendChild(itemEl(item));
  fan.appendChild(inboxEl());
});
