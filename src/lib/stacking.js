// The level order, for a platform without window levels. macOS keeps an always-on-top window
// at the level it was given ('screen-saver' above 'floating'); Windows has one topmost tier
// where the last window shown is on top. So when a window shows there, every visible window
// of a higher level is raised over it again — lowest first, so the highest ends on top.
const LEVEL_RANK = Object.freeze({
  normal: 0,
  floating: 1,
  'torn-off-menu': 2,
  'modal-panel': 3,
  'main-menu': 4,
  status: 5,
  'pop-up-menu': 6,
  'screen-saver': 7,
});

const rank = (level) => LEVEL_RANK[level] ?? LEVEL_RANK.normal;

// The entries to raise, in order, when a window at `shownLevel` has just been shown.
function raiseOrder(shownLevel, entries) {
  const shown = rank(shownLevel);
  return entries
    .filter((e) => e.visible && rank(e.level) > shown)
    .sort((a, b) => rank(a.level) - rank(b.level));
}

module.exports = { LEVEL_RANK, raiseOrder };
