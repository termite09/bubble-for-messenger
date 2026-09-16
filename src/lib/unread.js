// messenger.com sets the tab title to "(N) Messenger" / "(N) Name | Messenger" when there are
// unread chats. While something is unread it also flashes the title with "Name messaged you":
// that carries no count but is not "nothing unread", so it reads as null (keep what we knew)
// rather than 0 — else the badge would blink in time with the flash.
function unreadFromTitle(title) {
  const t = String(title || '').trim();
  const m = /^\((\d+)\+?\)/.exec(t);
  if (m) return parseInt(m[1], 10);
  return /messaged you$/i.test(t) ? null : 0;
}

// The open thread's name, from "(N) Name | Messenger". The inbox ("Messenger", "Chats |
// Messenger") and the "messaged you" flash carry none.
function nameFromTitle(title) {
  const t = String(title || '')
    .trim()
    .replace(/^\(\d+\+?\)\s*/, '');
  const m = /^(.*\S)\s*\|\s*Messenger$/.exec(t);
  return m && m[1] !== 'Chats' ? m[1] : null;
}

module.exports = { unreadFromTitle, nameFromTitle };
