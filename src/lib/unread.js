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

module.exports = { unreadFromTitle };
