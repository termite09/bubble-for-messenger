const { isMetaHost } = require('./links');

// Facebook's pure logging sinks, as anchored path prefixes (the same set EasyPrivacy blocks).
// Nothing here carries messages. NEVER widen this list: /api/graphql (every messaging op),
// /ajax/bootloader-endpoint (lazy JS chunks — blocking it white-screens), /ajax/mercury/*,
// /ajax/dtsg*, the edge-chat websockets and rupload.facebook.com must all stay reachable.
const TELEMETRY_PATH = new RegExp([
  '^/ajax/bz(/|$)',                     // Banzai batch logging — the main telemetry firehose
  '^/a/bz(/|$)',                        // newer short Banzai alias
  '^/ajax/bnzai(/|$)',                  // legacy Banzai path
  '^/ajax/qm(\\.php)?(/|$)',            // Quick Metrics performance beacons
  '^/common/scribe_endpoint(\\.php)?$', // legacy Scribe logging sink
  '^/security/hsts-pixel\\.gif$',       // HSTS beacon
  '^/tr(/|$)',                          // Meta Pixel
  '^/ajax/error/',                      // browser JS-error reporting
].join('|'));

// True for a request that only reports on the user. Fails open: what can't be parsed isn't blocked.
function isTelemetryUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch (e) {
    return false;
  }
  if (!isMetaHost(u.hostname)) return false;
  if (u.hostname.toLowerCase() === 'pixel.facebook.com') return true;
  return TELEMETRY_PATH.test(u.pathname);
}

module.exports = { isTelemetryUrl };
