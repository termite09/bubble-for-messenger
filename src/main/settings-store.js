const fs = require('fs');
const path = require('path');

// The one copy of the settings: loaded once, normalised, saved atomically on every change, and
// pushed to subscribers with what they were before. A file that will not parse is kept aside
// (settings.json.corrupt-<time>) rather than silently replaced. The file is the user's alone
// (0600), like everything else Chromium keeps in the profile.
function createSettingsStore({ file, normalize, log = null, positionDelayMs = 20 }) {
  let raw = {};
  let existed = false;
  let corrupt = false;
  try {
    const text = fs.readFileSync(file, 'utf8');
    existed = true;
    raw = JSON.parse(text);
  } catch (e) {
    if (existed) {
      corrupt = true;
      const aside = `${file}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      try { fs.copyFileSync(file, aside); } catch (e2) {}
      if (log) log.warn('settings file unreadable, kept aside', { aside: path.basename(aside), err: e });
    }
  }
  let settings = normalize(raw);
  const listeners = new Set();

  function save() {
    const tmp = `${file}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), { mode: 0o600 });
      fs.renameSync(tmp, file);
      fs.chmodSync(file, 0o600);
    } catch (e) {
      if (log) log.warn('settings not saved', { err: e });
    }
  }

  function commit(next) {
    const prev = settings;
    settings = normalize(next);
    save();
    for (const fn of listeners) fn(settings, prev);
    return settings;
  }

  // The disc position changes many times a second while dragging: one write after it settles.
  let positionTimer = null;
  function setPosition(pos) {
    settings = { ...settings, bubble: pos };
    clearTimeout(positionTimer);
    positionTimer = setTimeout(() => { settings = normalize(settings); save(); }, positionDelayMs);
  }

  return {
    existed,
    corrupt,
    get: () => settings,
    set: (key, value) => (Object.prototype.hasOwnProperty.call(settings, key) && key !== 'bubble' ? commit({ ...settings, [key]: value }) : settings),
    patch: (changes) => commit({ ...settings, ...changes }),
    setPosition,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

module.exports = { createSettingsStore };
