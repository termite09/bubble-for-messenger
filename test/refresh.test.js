const test = require('node:test');
const assert = require('node:assert');
const { shouldRefresh, looksLikeErrorPage, errorRetryDelay, BACKGROUND_REFRESH_MS } = require('../src/lib/refresh');

const MIN = 60 * 1000;

test('a hidden page is reloaded once it has been up for the background interval', () => {
  assert.equal(shouldRefresh({ visible: false, loadedAt: 0, now: BACKGROUND_REFRESH_MS, resumed: false }), true);
  assert.equal(shouldRefresh({ visible: false, loadedAt: 0, now: BACKGROUND_REFRESH_MS - MIN, resumed: false }), false);
});

test('a page the user is looking at is never reloaded from under them', () => {
  assert.equal(shouldRefresh({ visible: true, loadedAt: 0, now: 10 * BACKGROUND_REFRESH_MS, resumed: true }), false);
});

test('waking from sleep reloads a hidden page regardless of age', () => {
  assert.equal(shouldRefresh({ visible: false, loadedAt: 0, now: MIN, resumed: true }), true);
});

test('the background interval is a quarter of an hour', () => {
  assert.equal(BACKGROUND_REFRESH_MS, 15 * MIN);
});

test("Facebook's static error document is small and carries its interstitial skeleton", () => {
  assert.equal(looksLikeErrorPage({ elementCount: 40, interstitial: true }), true);
  // The real app is thousands of elements; the login page a few hundred.
  assert.equal(looksLikeErrorPage({ elementCount: 400, interstitial: true }), false);
  assert.equal(looksLikeErrorPage({ elementCount: 40, interstitial: false }), false);
  assert.equal(looksLikeErrorPage(null), false);
});

test('error-page retries back off and then hold at five minutes', () => {
  assert.deepEqual([0, 1, 2, 3, 9].map(errorRetryDelay), [15 * 1000, MIN, 5 * MIN, 5 * MIN, 5 * MIN]);
});
