// Facebook's static error page, and how often to retry it. (When to reload the hidden page
// for other reasons is lib/liveness.)
const ERROR_RETRY_MS = [15 * 1000, 60 * 1000, 5 * 60 * 1000];

// Facebook's "Sorry, something went wrong" / "We can't process your request" document, served
// in place of Messenger. It is localised, so it is recognised by shape: its interstitial
// skeleton on a near-empty page (the real app is thousands of elements).
function looksLikeErrorPage(doc) {
  return Boolean(doc && doc.interstitial && doc.elementCount < 100);
}

// How long to wait before the n-th retry of an error page: quick at first, then holding at
// five minutes so a Facebook outage does not turn into a reload loop.
const errorRetryDelay = (attempt) => ERROR_RETRY_MS[Math.min(attempt, ERROR_RETRY_MS.length - 1)];

module.exports = { looksLikeErrorPage, errorRetryDelay };
