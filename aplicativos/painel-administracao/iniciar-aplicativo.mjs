import { registrarRotas } from './navegacao/enderecos-das-telas.mjs';
import {
  registrarComponentes,
  tema,
  el as criarElemento,
  notificacao,
  confirmarAcao,
} from './componentes/componentes-do-painel.mjs';

import { montarSpriteIcones } from './componentes/icones.mjs';

import { iniciarRoteador, montarEstrutura } from './navegacao/trocar-tela.mjs';

import {
  sair,
  sessao,
  api as servicos,
  usuarioAtual,
  ErroBackend,
} from './comunicacao/comunicacao-com-servidor.mjs';

import {
  renderInviteAccept as renderizarAceiteConviteAdministracao,
  renderizarAceiteConviteEquipe,
} from './telas/exportar-telas-convite.mjs';
import { aplicativo } from './componentes/conteiner-do-aplicativo.mjs';
import { renderizarLogin } from './telas/tela-login.mjs';
import { renderNoAccess as renderizarSemAcesso } from './telas/tela-sem-acesso.mjs';

export let ator = null;

export async function renderizarAplicativo() {
  const estrutura = montarEstrutura({
    actor: ator,
    /**
     * Sair pede confirmação.
     *
     * No painel da plataforma o custo de sair por engano é maior porque uma
     * nova autenticação será necessária. A confirmação evita perder o contexto
     * de formulários e ações administrativas em andamento.
     */
    onSignOut: async () => {
      const confirmado = await confirmarAcao({
        title: 'Sair do painel',
        description: 'Você será desconectado e voltará para a tela de entrada.',
        confirmLabel: 'Sair',
        consequences: [
          'Dados não salvos em formulários abertos serão perdidos.',
          'Será necessário entrar novamente com e-mail e senha.',
        ],
      });
      if (!confirmado) return;
      await sair();
      inicializar();
    },
    onToggleTheme: () => {
      const ordem = ['light', 'dark', 'system'];
      const proximo = ordem[(ordem.indexOf(tema.get()) + 1) % ordem.length];
      tema.set(proximo);
      notificacao(`Tema: ${{ light: 'Claro', dark: 'Escuro', system: 'Sistema' }[proximo]}`, {
        tone: 'info',
      });
    },
  });

  aplicativo.replaceChildren(estrutura.node);
  aplicativo.removeAttribute('aria-busy');
  iniciarRoteador({ outlet: estrutura.outlet, shell: estrutura });
}

export async function verificarAcessoPlataforma() {
  try {
    await servicos.dashboard({});
    return { ok: true };
  } catch (erro) {
    if (erro instanceof ErroBackend && erro.lostAccess) return { ok: false, reason: 'not_admin' };
    if (erro instanceof ErroBackend && erro.status === 401) return { ok: false, reason: 'expired' };
    if (erro instanceof ErroBackend && erro.status === 0) return { ok: true, degraded: true };
    return { ok: false, reason: 'error', error: erro };
  }
}

export async function inicializar() {
  registrarComponentes();
  montarSpriteIcones();
  tema.apply();
  tema.watch();

  if (new URLSearchParams(location.search).get('flow') === 'team-invite') {
    renderizarAceiteConviteEquipe(aplicativo);
    return;
  }

  if (location.hash.startsWith('#/convite') || location.search.includes('token=')) {
    renderizarAceiteConviteAdministracao(aplicativo);
    return;
  }

  if (!sessao.accessToken) {
    renderizarLogin({ onSuccess: inicializar });
    return;
  }

  ator = await usuarioAtual().catch(() => null);
  if (!ator) {
    sessao.clear();
    renderizarLogin({ onSuccess: inicializar });
    return;
  }

  const acesso = await verificarAcessoPlataforma();

  if (!acesso.ok && acesso.reason === 'expired') {
    sessao.clear();
    renderizarLogin({ onSuccess: inicializar });
    return;
  }
  if (!acesso.ok && acesso.reason === 'not_admin') {
    renderizarSemAcesso();
    return;
  }

  await renderizarAplicativo();
}

registrarRotas(() => ator);

inicializar().catch((erro) => {
  aplicativo.replaceChildren(
    criarElemento('div', { class: 'auth-page' }, [
      criarElemento('div', { class: 'auth-card' }, [
        criarElemento('h1', { class: 'auth-title', text: 'Falha ao iniciar' }),
        criarElemento('p', { class: 'auth-subtitle', text: erro?.message || String(erro) }),
      ]),
    ]),
  );
  aplicativo.removeAttribute('aria-busy');
});

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { renderizarAplicativo as renderApp };
export { verificarAcessoPlataforma as verifyPlatformAccess };
