import { el as criarElemento, botao } from '../componentes/componentes-do-painel.mjs';

import { sair } from '../comunicacao/comunicacao-com-servidor.mjs';

import { aplicativo } from '../componentes/conteiner-do-aplicativo.mjs';
import { inicializar } from '../iniciar-aplicativo.mjs';

export function renderizarSemAcesso() {
  aplicativo.replaceChildren(
    criarElemento('div', { class: 'auth-page' }, [
      criarElemento('div', { class: 'auth-card' }, [
        criarElemento('h1', { class: 'auth-title', text: 'Sem acesso ao painel' }),
        criarElemento('p', {
          class: 'auth-subtitle',
          text: 'Esta conta não tem permissão de administrador da plataforma. Se você administra uma empresa, use o aplicativo PegaNaFrota Desktop.',
        }),
        botao({
          label: 'Sair',
          variant: 'primary',
          onClick: async () => {
            await sair();
            inicializar();
          },
        }),
      ]),
    ]),
  );
  aplicativo.removeAttribute('aria-busy');
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { renderizarSemAcesso as renderNoAccess };
