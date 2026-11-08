import { el as criarElemento, botao } from '../componentes/componentes-do-programa.mjs';

import { aplicativo } from '../componentes/conteiner-do-aplicativo.mjs';

export function renderizarSemEmpresa({ onSignOut: aoSair }) {
  aplicativo.replaceChildren(
    criarElemento('div', { class: 'auth-page' }, [
      criarElemento('div', { class: 'auth-card' }, [
        criarElemento('h1', { class: 'auth-title', text: 'Sem empresa vinculada' }),
        criarElemento('p', {
          class: 'auth-subtitle',
          text: 'Sua conta está ativa, mas não há vínculo ativo com nenhuma empresa. Peça ao administrador da sua empresa para liberar o acesso.',
        }),
        botao({ label: 'Sair', variant: 'primary', onClick: aoSair }),
      ]),
    ]),
  );
  aplicativo.removeAttribute('aria-busy');
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { renderizarSemEmpresa as renderNoMembership };
