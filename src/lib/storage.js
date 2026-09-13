const fs = require('node:fs');
const path = require('node:path');

function removeStaleLockFiles(rootDir) {
  if (!rootDir || !fs.existsSync(rootDir)) return [];

  const removed = [];
  const stack = [rootDir];
  const visited = new Set();

  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir || visited.has(dir)) continue;
    visited.add(dir);

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (entry.name === 'LOCK' || entry.name === 'LOCKS' || entry.name.endsWith('.lock')) {
        try {
          fs.unlinkSync(fullPath);
          removed.push(fullPath);
        } catch (e) {
          // Ignore transient filesystem errors; stale locks are best-effort cleanup.
        }
      }
    }
  }

  return removed;
}

module.exports = { removeStaleLockFiles };
