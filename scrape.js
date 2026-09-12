const { normalizeRows, LIMIT } = require('./lib/recent');

// Runs inside messenger.com. Reads the first rows of the chat list. Messenger renders each
// conversation as [role="row"] containing a link to /t/<id>/ (or /e2ee/t/<id>/), the avatar
// <img> and name/preview spans; unread rows are drawn in bold.
const RECENT_CHATS_SCRIPT = `(() => {
  const out = [];
  for (const row of document.querySelectorAll('[role="row"]')) {
    const link = row.querySelector('a[role="link"][href*="/t/"]');
    if (!link) continue;
    const img = row.querySelector('img');
    const spans = [...row.querySelectorAll('span[dir="auto"]')].map((s) => s.textContent.trim()).filter(Boolean);
    const unread = [...row.querySelectorAll('span')].some((s) => parseInt(getComputedStyle(s).fontWeight, 10) >= 600);
    out.push({
      href: link.getAttribute('href'),
      name: (img && img.alt) || spans[0] || '',
      avatarUrl: img ? img.src : null,
      unread,
    });
    if (out.length === ${LIMIT}) break;
  }
  return out;
})()`;

const onMessenger = (wc) => /^https:\/\/(www\.)?messenger\.com\//.test(wc.getURL());

async function readRecentChats(wc) {
  if (!onMessenger(wc)) return [];
  try {
    return normalizeRows(await wc.executeJavaScript(RECENT_CHATS_SCRIPT, true));
  } catch (e) {
    return [];
  }
}

// Open a thread with an in-page click (keeps Messenger's SPA state); fall back to a full load.
async function openThread(wc, href) {
  const clicked = await wc.executeJavaScript(`(() => {
    const a = document.querySelector('a[role="link"][href=${JSON.stringify(href)}]');
    if (!a) return false;
    a.click();
    return true;
  })()`, true).catch(() => false);
  if (!clicked) wc.loadURL('https://www.messenger.com' + href);
}

// Compact mode hides Messenger's left icon rail so the panel shows only the open thread.
// A <style> tag is toggled rather than removed so it survives SPA re-renders while on.
const COMPACT_CSS = '[role="navigation"][aria-label="Inbox switcher"]{display:none!important}';

function setCompact(wc, on) {
  return wc.executeJavaScript(`(() => {
    let s = document.getElementById('mb-compact');
    if (!s) { s = document.createElement('style'); s.id = 'mb-compact'; document.head.appendChild(s); }
    s.textContent = ${on ? JSON.stringify(COMPACT_CSS) : "''"};
  })()`, true).catch(() => {});
}

// Back to the chat list. In the narrow layout an open thread shows a Back button.
function openInbox(wc) {
  if (!onMessenger(wc)) return wc.loadURL('https://www.messenger.com/');
  return wc.executeJavaScript(`(() => {
    const back = document.querySelector('[aria-label="Back"]');
    if (back) back.click();
  })()`, true).catch(() => {});
}

module.exports = { readRecentChats, openThread, openInbox, setCompact, RECENT_CHATS_SCRIPT };
