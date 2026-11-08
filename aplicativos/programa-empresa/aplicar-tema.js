(function () {
  try {
    var escolha = localStorage.getItem('pnf.desktop.theme') || 'system';
    var escuro =
      escolha === 'dark' || (escolha === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', escuro ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme-choice', escolha);
  } catch (erroCapturado) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
