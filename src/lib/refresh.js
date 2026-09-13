// Messenger is kept loaded, hidden, for days at a time. Its live connection does not survive
// that indefinitely — a laptop sleeping, a network change, or Facebook serving its static
// error page all leave a page that looks fine but never receives another message. The cure is
// a reload, taken only when nobody is looking.
const BACKGROUND_REFRESH_MS = 15 * 60 * 1000;
const ERROR_RETRY_MS = [15 * 1000, 60 * 1000, 5 * 60 * 1000];

// Reload now? Never while the panel is showing; otherwise after waking from sleep, or once the
// page has been up for the background interval.
function shouldRefresh({ visible, loadedAt, now, resumed }) {
  if (visible) return false;
  return resumed || now - loadedAt >= BACKGROUND_REFRESH_MS;
}

// Facebook's "Sorry, something went wrong" / "We can't process your request" document, served
// in place of Messenger. It is localised, so it is recognised by shape: its interstitial
// skeleton on a near-empty page (the real app is thousands of elements).
function looksLikeErrorPage(doc) {
  return Boolean(doc && doc.interstitial && doc.elementCount < 100);
}

// How long to wait before the n-th retry of an error page: quick at first, then holding at
// five minutes so a Facebook outage does not turn into a reload loop.
const errorRetryDelay = (attempt) => ERROR_RETRY_MS[Math.min(attempt, ERROR_RETRY_MS.length - 1)];

module.exports = { shouldRefresh, looksLikeErrorPage, errorRetryDelay, BACKGROUND_REFRESH_MS };
