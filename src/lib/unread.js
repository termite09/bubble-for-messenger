// messenger.com sets the tab title to "(N) Messenger" / "(N) Name | Messenger" when there are unread chats.
function unreadFromTitle(title) {
  const m = /^\((\d+)\+?\)/.exec(String(title || '').trim());
  return m ? parseInt(m[1], 10) : 0;
}

module.exports = { unreadFromTitle };
