// The page is a view of main's settings: every control sends its change, and the page
// re-renders from whatever main saved — so it never shows a value main refused.
function render(s) {
  // The glass material, on this card too (its window paints the frosted ground beneath).
  document.documentElement.toggleAttribute('data-glass', Boolean(s.glass));
  document.documentElement.toggleAttribute('data-frosted', Boolean(s.glass));
  for (const input of document.querySelectorAll('input[type="checkbox"][data-key]'))
    input.checked = Boolean(s[input.dataset.key]);
  // A segmented control is a radio group named after its setting.
  for (const input of document.querySelectorAll('input[type="radio"]:not([name="tab"])'))
    input.checked = input.value === String(s[input.name]);
}

document.addEventListener('change', (e) => {
  const input = e.target;
  if (input.type === 'checkbox' && input.dataset.key)
    window.settingsApi.set(input.dataset.key, input.checked);
  else if (input.name === 'tab') showTab(input.value);
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
// Esc and Cmd+W both put the card away (there is no Window > Close: it would destroy the panel).
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || (e.metaKey && e.key.toLowerCase() === 'w')) {
    e.preventDefault();
    window.settingsApi.close();
  }
});

// One pane in the flow at a time; the window is made as tall as that pane needs. (The card
// fills the window, so its own height says nothing: the parts are measured instead.)
// The rows fade out, the window takes its new height (macOS animates it), the new rows fade
// in — so a switch reads as one motion rather than a jump.
let first = true;
function showTab(name) {
  const main = document.querySelector('main');
  const swap = () => {
    let shown;
    for (const section of document.querySelectorAll('main > section')) {
      section.hidden = section.dataset.tab !== name;
      if (!section.hidden) shown = section;
    }
    for (const tab of document.querySelectorAll('input[name="tab"]'))
      tab.setAttribute('aria-selected', String(tab.value === name));
    const chrome =
      document.querySelector('header').offsetHeight + document.querySelector('nav').offsetHeight;
    window.settingsApi.resize(chrome + shown.offsetHeight + 8 + 2); // main's padding-bottom, the card's hairlines
    main.classList.remove('switching');
  };
  if (first) {
    first = false;
    swap();
    return;
  }
  main.classList.add('switching');
  setTimeout(swap, 100);
}

// A row for something the platform has no equivalent of (Spaces, vibrancy) is not shown. The
// rows are settled before the first pane is measured, so the card opens at the right height.
function hideUnsupported(caps) {
  for (const row of document.querySelectorAll('[data-needs]'))
    row.hidden = !(caps && caps[row.dataset.needs]);
}

window.settingsApi.onSettings(render);
Promise.all([window.settingsApi.get(), window.settingsApi.capabilities()]).then(([s, caps]) => {
  hideUnsupported(caps);
  if (s) render(s);
  showTab('bubble');
});
