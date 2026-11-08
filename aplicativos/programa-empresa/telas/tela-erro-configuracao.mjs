import { el as criarElemento, botao } from '../componentes/componentes-do-programa.mjs';

import { aplicativo } from '../componentes/conteiner-do-aplicativo.mjs';

export function renderizarErroConfiguracao(situacao) {
  aplicativo.replaceChildren(
    criarElemento('div', { class: 'auth-page' }, [
      criarElemento('div', { class: 'auth-card' }, [
        criarElemento('h1', { class: 'auth-title', text: 'Configuração ausente' }),
        criarElemento('p', {
          class: 'auth-subtitle',
          text: 'O aplicativo não encontrou o endereço do servidor e a chave pública.',
        }),
        criarElemento('p', { class: 'field-label', text: 'O que falta' }),
        criarElemento(
          'ul',
          {},
          [
            situacao && !situacao.hasUrl
              ? criarElemento('li', { text: 'Endereço do Supabase (PNF_SUPABASE_URL)' })
              : null,
            situacao && !situacao.hasAnonKey
              ? criarElemento('li', { text: 'Chave pública (PNF_SUPABASE_ANON_KEY)' })
              : null,
            situacao && situacao.hasUrl && !situacao.urlValid
              ? criarElemento('li', { text: 'O endereço configurado não é uma URL válida' })
              : null,
          ].filter(Boolean),
        ),
        criarElemento('p', { class: 'field-label', text: 'Como resolver' }),
        criarElemento('p', {
          class: 'field-hint',
          text: 'Em desenvolvimento: copie .env.example para .env na raiz do repositório e rode npm run build:desktop novamente.',
        }),
        criarElemento('p', {
          class: 'field-hint',
          text: 'Em produção: edite o config.json na pasta de dados do aplicativo.',
        }),
        situacao?.searchedPaths?.length
          ? criarElemento('details', {}, [
              criarElemento('summary', { text: 'Caminhos consultados' }),
              criarElemento(
                'ul',
                {},
                situacao.searchedPaths.map((caminhoArquivo) =>
                  criarElemento('li', {}, [criarElemento('code', { text: caminhoArquivo })]),
                ),
              ),
            ])
          : null,
        botao({ label: 'Tentar novamente', variant: 'primary', onClick: () => location.reload() }),
      ]),
    ]),
  );
  aplicativo.removeAttribute('aria-busy');
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { renderizarErroConfiguracao as renderConfigError };
