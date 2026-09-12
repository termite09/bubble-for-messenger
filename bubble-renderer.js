const bubble = document.getElementById('bubble');
const badge = document.getElementById('badge');

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
