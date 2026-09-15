const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { removeStaleLockFiles } = require('../src/lib/storage');

test('removeStaleLockFiles deletes Chromium lock files under the app data directory', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bubble-locks-'));
  const lockDirs = [
    path.join(tmp, 'File System', 'Origins'),
    path.join(tmp, 'Local Storage', 'leveldb'),
    path.join(tmp, 'Service Worker', 'ScriptStore'),
  ];

  for (const dir of lockDirs) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'LOCK'), 'lock');
  }

  fs.writeFileSync(path.join(tmp, 'settings.json'), '{}');
  // Not a LevelDB store, or not a LevelDB lock: never touched.
  fs.mkdirSync(path.join(tmp, 'Cache'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'Cache', 'LOCK'), 'lock');
  fs.writeFileSync(path.join(tmp, 'LOCK'), 'lock');
  fs.writeFileSync(path.join(tmp, 'Local Storage', 'leveldb', 'other.lock'), 'lock');

  const removed = removeStaleLockFiles(tmp);

  assert.deepEqual(
    removed.sort(),
    [
      path.join(tmp, 'File System', 'Origins', 'LOCK'),
      path.join(tmp, 'Local Storage', 'leveldb', 'LOCK'),
      path.join(tmp, 'Service Worker', 'ScriptStore', 'LOCK'),
    ].sort(),
  );
  assert.equal(fs.existsSync(path.join(tmp, 'settings.json')), true);
  assert.equal(fs.existsSync(path.join(tmp, 'File System', 'Origins', 'LOCK')), false);
  assert.equal(fs.existsSync(path.join(tmp, 'Local Storage', 'leveldb', 'LOCK')), false);
  assert.equal(fs.existsSync(path.join(tmp, 'Service Worker', 'ScriptStore', 'LOCK')), false);
  assert.equal(fs.existsSync(path.join(tmp, 'Cache', 'LOCK')), true);
  assert.equal(fs.existsSync(path.join(tmp, 'LOCK')), true);
  assert.equal(fs.existsSync(path.join(tmp, 'Local Storage', 'leveldb', 'other.lock')), true);

  fs.rmSync(tmp, { recursive: true, force: true });
});
