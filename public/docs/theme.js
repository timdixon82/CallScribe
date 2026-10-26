(() => {
  const themes = new Set(['light', 'dark', 'muted-light', 'muted-dark']);
  let selected = 'system';
  try { selected = localStorage.getItem('localBrowserTranscriberTheme') || 'system'; } catch { /* System theme remains available. */ }
  if (themes.has(selected)) document.documentElement.dataset.theme = selected;
  window.addEventListener('DOMContentLoaded', () => {
    document.title = document.title.replace('Local Browser Transcriber', 'CallScribe');
    document.querySelectorAll('.brand').forEach((brand) => { brand.textContent = 'CallScribe'; });
    document.querySelectorAll('a[href*="timdixon82/Local-Call-Transcriber"]').forEach((link) => { link.href = 'https://github.com/timdixon82/CallScribe'; });
    const control = document.querySelector('[data-theme-control]');
    if (!control) return;
    control.value = selected;
    control.addEventListener('change', () => {
      selected = control.value;
      if (themes.has(selected)) document.documentElement.dataset.theme = selected;
      else document.documentElement.removeAttribute('data-theme');
      try { localStorage.setItem('localBrowserTranscriberTheme', selected); } catch { /* Applies for this visit. */ }
    });
  });
})();
