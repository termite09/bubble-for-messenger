// The log's format and its rotation rule, kept pure; main/log.js does the file I/O.
const MAX_BYTES = 1024 * 1024; // rotate at 1 MB; two old files are kept
const KEEP = 2;

// An Error carries only what a report needs (name, message, stack) — not enumerable props that
// could hold page data.
function plain(value) {
  if (value instanceof Error) return { name: value.name, message: value.message, ...(value.stack ? { stack: value.stack } : {}) };
  return value;
}

function formatLine({ level, msg, data, now = Date.now() }) {
  const base = { t: new Date(now).toISOString(), level, msg };
  let out;
  try {
    const extra = {};
    if (data && typeof data === 'object') for (const [k, v] of Object.entries(data)) extra[k] = plain(v);
    out = JSON.stringify({ ...base, ...extra });
  } catch (e) {
    out = JSON.stringify({ ...base, unserializable: true });
  }
  return out + '\n';
}

const shouldRotate = (bytes) => bytes >= MAX_BYTES;

module.exports = { formatLine, shouldRotate, MAX_BYTES, KEEP };
