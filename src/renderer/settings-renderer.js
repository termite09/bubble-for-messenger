// The page is a view of main's settings: every control sends its change, and the page
// re-renders from whatever main saved — so it never shows a value main refused.
function render(s) {
  for (const input of document.querySelectorAll('input[type="checkbox"][data-key]')) input.checked = Boolean(s[input.dataset.key]);
  for (const input of document.querySelectorAll('input[name="theme"]')) input.checked = input.value === s.theme;
}

document.addEventListener('change', (e) => {
  const input = e.target;
  if (input.type === 'checkbox' && input.dataset.key) window.settingsApi.set(input.dataset.key, input.checked);
  else if (input.name === 'theme') window.settingsApi.set('theme', input.value);
});
document.getElementById('close').addEventListener('click', () => window.settingsApi.close());
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.settingsApi.close(); });

window.settingsApi.onSettings(render);
window.settingsApi.get().then((s) => { if (s) render(s); });
