// The page is a view of main's settings: every control sends its change, and the page
// re-renders from whatever main saved — so it never shows a value main refused.
function render(s) {
  // The glass material, on this card too (its window paints the frosted ground beneath).
  document.documentElement.toggleAttribute('data-glass', Boolean(s.glass));
  document.documentElement.toggleAttribute('data-frosted', Boolean(s.glass));
  for (const input of document.querySelectorAll('input[type="checkbox"][data-key]'))
    input.checked = Boolean(s[input.dataset.key]);
  // A segmented control is a radio group named after its setting.
  for (const input of document.querySelectorAll('input[type="radio"]'))
    input.checked = input.value === String(s[input.name]);
}

document.addEventListener('change', (e) => {
  const input = e.target;
  if (input.type === 'checkbox' && input.dataset.key)
    window.settingsApi.set(input.dataset.key, input.checked);
  // A radio's value is text; a numeric choice (seconds) goes back as the number it is.
  else if (input.type === 'radio')
    window.settingsApi.set(
      input.name,
      /^\d+$/.test(input.value) ? Number(input.value) : input.value,
    );
});
document.getElementById('close').addEventListener('click', () => window.settingsApi.close());
document
  .getElementById('open-sounds')
  .addEventListener('click', () => window.settingsApi.openMessengerPreferences());
// Esc and Cmd+W (Ctrl+W elsewhere) put the card away (there is no Window > Close: it would
// destroy the panel).
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'w')) {
    e.preventDefault();
    window.settingsApi.close();
  }
});

// A row names its control by its label and describes it by the ash line under it, so a reader
// hears "Show over full-screen apps, switch, off — Off keeps it off full-screen video…" rather
// than the two run together as one name. The ids are the setting's own.
function describeRows() {
  for (const row of document.querySelectorAll('.row')) {
    const control =
      row.querySelector('input[data-key]') ||
      row.querySelector('[role="radiogroup"]') ||
      row.querySelector('button');
    const name = row.querySelector('.name');
    const sub = row.querySelector('.sub');
    if (!control || !name) continue;
    const key = control.dataset.key || control.id || control.querySelector('input').name;
    // A group already carries a fuller name of its own ("Bubble size", not "Size").
    if (!control.hasAttribute('aria-label')) {
      name.id = key + '-name';
      control.setAttribute('aria-labelledby', name.id);
    }
    if (sub) {
      sub.id = key + '-sub';
      control.setAttribute('aria-describedby', sub.id);
    }
  }
}

// One pane in the flow at a time; the window is made as tall as that pane needs. (The card
// fills the window, so its own height says nothing: the parts are measured instead.)
// The rows fade out, the window takes its new height (macOS animates it), the new rows fade
// in — so a switch reads as one motion rather than a jump.
const tabs = [...document.querySelectorAll('[role="tab"]')];
let first = true;
function showTab(name) {
  const main = document.querySelector('main');
  const swap = () => {
    let shown;
    for (const section of document.querySelectorAll('main > section')) {
      section.hidden = section.dataset.tab !== name;
      if (!section.hidden) shown = section;
    }
    const chrome =
      document.querySelector('header').offsetHeight + document.querySelector('nav').offsetHeight;
    window.settingsApi.resize(chrome + shown.offsetHeight + 8 + 2); // main's padding-bottom, the card's hairlines
    main.classList.remove('switching');
  };
  // The chosen tab is the one in the Tab order; the arrows reach the others.
  for (const tab of tabs) {
    const on = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  }
  if (first) {
    first = false;
    swap();
    return;
  }
  main.classList.add('switching');
  setTimeout(swap, 120); // the crossfade's length
}
for (const tab of tabs) {
  tab.addEventListener('click', () => showTab(tab.dataset.tab));
  // Left/Right (and Home/End) move focus along the tabs and choose the one they land on.
  tab.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(tab);
    let to;
    if (e.key === 'ArrowRight') to = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') to = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = tabs.length - 1;
    else return;
    e.preventDefault();
    tabs[to].focus();
    showTab(tabs[to].dataset.tab);
  });
}

// A row for something the platform has no equivalent of (Spaces, vibrancy) is not shown. The
// rows are settled before the first pane is measured, so the card opens at the right height.
// No answer at all keeps them: a row too many beats a row missing.
function hideUnsupported(caps) {
  for (const row of document.querySelectorAll('[data-needs]'))
    row.hidden = caps ? !caps[row.dataset.needs] : false;
}

describeRows();
window.settingsApi.onSettings(render);
Promise.all([window.settingsApi.get(), window.settingsApi.capabilities()]).then(([s, caps]) => {
  hideUnsupported(caps);
  if (s) render(s);
  showTab('bubble');
});
