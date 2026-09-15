// Is there a newer release? The pure half of the daily check.
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

const parse = (v) => {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v || '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

// `latest` is newer than `current` when its first differing part is greater.
function isNewer(current, latest) {
  const a = parse(current);
  const b = parse(latest);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return b[i] > a[i];
  return false;
}

const nextCheckDue = (lastCheckedAt, now) => lastCheckedAt === null || now - lastCheckedAt >= CHECK_EVERY_MS;

module.exports = { isNewer, nextCheckDue, CHECK_EVERY_MS, parse };
