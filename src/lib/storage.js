const fs = require('node:fs');
const path = require('node:path');

// Where Chromium keeps LevelDB stores inside a profile. A LOCK file left behind by a crash stops
// the store from opening again; these are the only places one can be, so only these are walked
// (the Cache alone holds thousands of files that could never be one).
const LEVELDB_DIRS = [
  'Local Storage',
  'Session Storage',
  'IndexedDB',
  'Service Worker',
  'File System',
  'Shared Dictionary',
  'WebStorage',
  'GPUCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
];

// Remove LevelDB LOCK files under the profile's store directories. Meant for a start after a
// crash; the caller must hold the single-instance lock, or this would unlock a running copy.
function removeStaleLockFiles(rootDir, dirs = LEVELDB_DIRS) {
  if (!rootDir || !fs.existsSync(rootDir)) return [];

  const removed = [];
  const stack = dirs.map((d) => path.join(rootDir, d));
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
      if (entry.name !== 'LOCK') continue;
      try {
        fs.unlinkSync(fullPath);
        removed.push(fullPath);
      } catch (e) {
        // Ignore transient filesystem errors; stale locks are best-effort cleanup.
      }
    }
  }

  return removed;
}

module.exports = { removeStaleLockFiles, LEVELDB_DIRS };
