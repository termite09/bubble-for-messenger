const test = require('node:test');
const assert = require('node:assert');
const { isTelemetryUrl } = require('../src/lib/telemetry');

test('blocks Facebook logging sinks', () => {
  for (const url of [
    'https://www.facebook.com/ajax/bz?__a=1',
    'https://www.facebook.com/ajax/bz/',
    'https://www.messenger.com/a/bz?x=1',
    'https://www.facebook.com/ajax/bnzai',
    'https://www.facebook.com/ajax/qm.php',
    'https://www.facebook.com/ajax/qm/',
    'https://www.facebook.com/common/scribe_endpoint.php',
    'https://www.facebook.com/security/hsts-pixel.gif',
    'https://www.facebook.com/tr/?id=1',
    'https://www.facebook.com/ajax/error/report',
    'https://pixel.facebook.com/anything',
  ])
    assert.equal(isTelemetryUrl(url), true, url);
});

test('never blocks what messaging needs', () => {
  for (const url of [
    'https://www.messenger.com/api/graphql/',
    'https://www.messenger.com/ajax/bootloader-endpoint/?x=1',
    'https://www.messenger.com/ajax/bulk-route-definitions/',
    'https://www.messenger.com/ajax/mercury/thread_info.php',
    'https://www.messenger.com/ajax/dtsg/?__a=1',
    'https://edge-chat.messenger.com/chat?sid=1',
    'https://rupload.facebook.com/messenger_image/1',
    'https://www.messenger.com/t/123/',
    'https://www.messenger.com/bzar', // a path merely starting with "bz"
    'https://www.facebook.com/tracking', // not /tr
  ])
    assert.equal(isTelemetryUrl(url), false, url);
});

test('only Meta hosts are classified; anything unparseable falls open', () => {
  assert.equal(isTelemetryUrl('https://example.com/ajax/bz'), false);
  assert.equal(isTelemetryUrl('https://notfacebook.com/tr/'), false);
  assert.equal(isTelemetryUrl('garbage'), false);
  assert.equal(isTelemetryUrl(undefined), false);
});
