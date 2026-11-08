(function () {
  try {
    var escolha = localStorage.getItem('pnf.admin.theme') || 'system';
    var escuro =
      escolha === 'dark' || (escolha === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    var raiz = document.documentElement;
    raiz.setAttribute('data-theme', escuro ? 'dark' : 'light');
    raiz.setAttribute('data-theme-choice', escolha);
  } catch (erroCapturado) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
