(() => {
  const root = document.documentElement;
  let theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  try {
    const saved = localStorage.getItem('lezioni-theme');
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch { /* La scelta resta utilizzabile se il browser blocca il salvataggio. */ }
  root.dataset.theme = theme;
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-theme-select]').forEach(select => {
      select.value = theme;
      select.addEventListener('change', () => {
        theme = select.value;
        root.dataset.theme = theme;
        try { localStorage.setItem('lezioni-theme', theme); } catch { /* Memoria non disponibile. */ }
      });
    });
  });
})();
