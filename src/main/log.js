const fs = require('fs');
const path = require('path');
const { formatLine, shouldRotate, KEEP } = require('../lib/logfmt');

// A small JSON-lines log in the profile (logs/main.log, rotated at 1 MB, two old files kept),
// mirrored to stderr in development. Never given names, previews, reply text, cookies or
// avatar URLs — thread hrefs only via `hashHref`.
function createLog({ dir, packaged }) {
  const file = path.join(dir, 'main.log');
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } catch (e) {}

  function rotate() {
    let size = 0;
    try {
      size = fs.statSync(file).size;
    } catch (e) {
      return;
    }
    if (!shouldRotate(size)) return;
    try {
      for (let i = KEEP; i >= 1; i--) {
        const from = i === 1 ? file : `${file}.${i - 1}`;
        if (fs.existsSync(from)) fs.renameSync(from, `${file}.${i}`);
      }
    } catch (e) {}
  }

  function write(level, msg, data) {
    const line = formatLine({ level, msg, data });
    if (!packaged) process.stderr.write(line);
    try {
      rotate();
      fs.appendFileSync(file, line, { mode: 0o600 });
    } catch (e) {}
  }

  return {
    path: file,
    debug: (msg, data) => write('debug', msg, data),
    info: (msg, data) => write('info', msg, data),
    warn: (msg, data) => write('warn', msg, data),
    error: (msg, data) => write('error', msg, data),
  };
}

// A thread path reduced to a short tag: enough to correlate log lines, not to identify a chat.
function hashHref(href) {
  let h = 0;
  for (const c of String(href)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

module.exports = { createLog, hashHref };
