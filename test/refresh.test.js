const test = require('node:test');
const assert = require('node:assert');
const { looksLikeErrorPage, errorRetryDelay } = require('../src/lib/refresh');

const MIN = 60 * 1000;

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
