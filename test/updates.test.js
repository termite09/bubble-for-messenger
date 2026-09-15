const test = require('node:test');
const assert = require('node:assert');
const { isNewer, nextCheckDue, CHECK_EVERY_MS } = require('../src/lib/updates');
const { createUpdateCheck } = require('../src/main/updates');

test('isNewer compares versions numerically, ignoring a v prefix and pre-release noise', () => {
  assert.equal(isNewer('2.3.0', 'v2.3.1'), true);
  assert.equal(isNewer('2.3.0', '2.10.0'), true);
  assert.equal(isNewer('2.3.0', 'v2.3.0'), false);
  assert.equal(isNewer('2.3.1', '2.3.0'), false);
  assert.equal(isNewer('2.3.0', 'junk'), false);
  assert.equal(isNewer('2.3.0', '3.0.0-beta'), true);
});

test('a check is due a day after the last one, and at once when there was none', () => {
  assert.equal(nextCheckDue(null, 5), true);
  assert.equal(nextCheckDue(0, CHECK_EVERY_MS - 1), false);
  assert.equal(nextCheckDue(0, CHECK_EVERY_MS), true);
});

// The checker asks GitHub for the latest release and reports it when it is newer.
test('createUpdateCheck reports a newer release once, tolerates failures, and respects the setting', async () => {
  const seen = [];
  const release = { tag_name: 'v9.0.0', html_url: 'https://github.com/x/y/releases/tag/v9.0.0' };
  let enabled = true;
  const fetch = async () => ({ ok: true, json: async () => release });
  const check = createUpdateCheck({ fetch, version: '2.3.0', enabled: () => enabled, onUpdate: (u) => seen.push(u) });
  assert.deepEqual(await check.check(), { version: '9.0.0', url: release.html_url });
  assert.deepEqual(check.latest(), { version: '9.0.0', url: release.html_url });
  await check.check();
  assert.equal(seen.length, 1); // told once per version, not on every check
  enabled = false;
  assert.equal(await check.check(), null);
  const failing = createUpdateCheck({ fetch: async () => { throw new Error('offline'); }, version: '2.3.0', enabled: () => true, onUpdate() {} });
  assert.equal(await failing.check(), null);
  const older = createUpdateCheck({ fetch: async () => ({ ok: true, json: async () => ({ tag_name: 'v2.0.0', html_url: 'u' }) }), version: '2.3.0', enabled: () => true, onUpdate: () => seen.push('no') });
  assert.equal(await older.check(), null);
  assert.equal(seen.length, 1);
});
