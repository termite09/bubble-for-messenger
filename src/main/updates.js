const { isNewer, nextCheckDue, parse } = require('../lib/updates');

const RELEASES_API = 'https://api.github.com/repos/termite09/bubble-for-messenger/releases/latest';
const RELEASES_PAGE = 'https://github.com/termite09/bubble-for-messenger/releases/latest';
const TIMEOUT_MS = 10 * 1000;

// Once a day (a minute after launch, then daily), ask GitHub for the latest release; when it is
// newer than this build, tell `onUpdate` once for that version. Nothing is downloaded or
// installed: the menu item it enables opens the release page. Off by a setting — which the
// user's own request (`checkNow`) is not subject to; that one also answers when there is
// nothing new, or when GitHub could not be asked.
function createUpdateCheck({ fetch, version, enabled, onUpdate, log = null, now = Date.now }) {
  let latest = null;
  let told = null;
  let lastCheckedAt = null;

  // What GitHub says: { status: 'update', latest } | { status: 'current' } | { status: 'error' }.
  async function ask() {
    lastCheckedAt = now();
    try {
      const res = await fetch(RELEASES_API, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `bubble-for-messenger/${version}`,
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return { status: 'error' };
      const body = await res.json();
      const tag = body && body.tag_name;
      if (!parse(tag)) return { status: 'error' };
      if (!isNewer(version, tag)) return { status: 'current' };
      const url =
        typeof body.html_url === 'string' && body.html_url.startsWith('https://github.com/')
          ? body.html_url
          : RELEASES_PAGE;
      latest = { version: parse(tag).join('.'), url };
      if (told !== latest.version) {
        told = latest.version;
        onUpdate(latest);
      }
      return { status: 'update', latest };
    } catch (e) {
      if (log) log.debug('update check failed', { err: e.message });
      return { status: 'error' };
    }
  }

  async function check() {
    if (!enabled()) return null;
    const answer = await ask();
    return answer.status === 'update' ? answer.latest : null;
  }

  return {
    check,
    checkNow: ask,
    latest: () => latest,
    due: () => nextCheckDue(lastCheckedAt, now()),
  };
}

module.exports = { createUpdateCheck, RELEASES_PAGE };
