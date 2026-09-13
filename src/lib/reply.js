const { isThreadHref } = require('./recent');

const MAX_REPLY_CHARS = 2000;
const REPLY_BUDGET_MS = 12 * 1000;
const REPLY_POLL_MS = 250;

// A reply is a thread path (validated like every other href we splice into the page) and a
// trimmed, bounded piece of text.
const validReply = (href, text) => isThreadHref(href) && typeof text === 'string' &&
  text.trim().length > 0 && [...text.trim()].length <= MAX_REPLY_CHARS;

// One step of sending a reply through the Messenger page. The page side polls its DOM into a
// snapshot { onThread, composerReady, composerEmpty, draftMatches, sendAvailable } and does
// whatever action this names; the phases are waiting (for the thread) → inserted (text is in
// the composer) → confirming (Send was clicked; the composer emptying is the proof).
function decideReply(phase, snapshot, expired) {
  if (phase === 'waiting') {
    if (expired) return { action: 'failure', phase };
    if (!snapshot.onThread || !snapshot.composerReady) return { action: 'wait', phase };
    // Never merge a reply into text the user already drafted there.
    if (!snapshot.composerEmpty) return { action: 'failure', phase };
    return { action: 'insert', phase: 'inserted' };
  }
  // Once text is in, any navigation away is a hard stop: never click Send elsewhere.
  if (!snapshot.onThread || !snapshot.composerReady) return { action: 'failure', phase };
  if (phase === 'inserted') {
    if (!snapshot.draftMatches || !snapshot.sendAvailable) return { action: 'failure', phase };
    return { action: 'send', phase: 'confirming' };
  }
  if (snapshot.composerEmpty) return { action: 'success', phase };
  if (expired) return { action: 'failure', phase };
  return { action: 'wait', phase };
}

module.exports = { decideReply, validReply, MAX_REPLY_CHARS, REPLY_BUDGET_MS, REPLY_POLL_MS };
