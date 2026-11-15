// Apply the saved theme before the page paints, including when reopening a dark archive.
(() => {
  let saved;
  try { saved = localStorage.getItem('history-vault-theme'); } catch {}
  document.documentElement.dataset.theme = ['light', 'dark'].includes(saved) ? saved : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
})();
