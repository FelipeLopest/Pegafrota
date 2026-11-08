(() => {
  const obterAplicativo = () => document.getElementById('app');

  function exibirFalha(mensagem) {
    const aplicativoElectron = obterAplicativo();
    if (!aplicativoElectron || aplicativoElectron.getAttribute('aria-busy') !== 'true') return;
    const texto = String(mensagem || 'Falha ao carregar o painel.').replace(/^Uncaught\s+/i, '');
    aplicativoElectron.replaceChildren();
    const pagina = document.createElement('div');
    pagina.className = 'auth-page';
    const cartao = document.createElement('div');
    cartao.className = 'auth-card';
    const titulo = document.createElement('h1');
    titulo.className = 'auth-title';
    titulo.textContent = 'Falha ao carregar o painel';
    const descricao = document.createElement('p');
    descricao.className = 'auth-subtitle';
    descricao.textContent = texto;
    cartao.append(titulo, descricao);
    pagina.append(cartao);
    aplicativoElectron.append(pagina);
    aplicativoElectron.removeAttribute('aria-busy');
  }

  addEventListener(
    'error',
    (evento) => {
      const alvo = evento.target;
      if (alvo instanceof HTMLScriptElement && alvo.type === 'module') {
        exibirFalha(
          'O módulo principal do painel não pôde ser carregado. Rode npm run build:admin e tente novamente.',
        );
        return;
      }
      if (evento.error || evento.message) exibirFalha(evento.error?.message || evento.message);
    },
    true,
  );

  addEventListener('unhandledrejection', (evento) => {
    exibirFalha(evento.reason?.message || evento.reason || 'Falha inesperada ao iniciar o painel.');
  });
})();
