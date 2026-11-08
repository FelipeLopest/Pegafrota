import {
  el as criarElemento,
  notificacao,
  registrarComponentes,
  confirmAction as confirmarAcao,
  iniciarRoteador,
} from './componentes/componentes-do-programa.mjs';

import { montarSpriteIcones } from './componentes/icones.mjs';

import {
  contexto,
  sessao,
  sair,
  tema,
  carregarConfiguracao,
  configStatus as estadoConfiguracao,
} from './acesso/sessao-e-permissoes.mjs';

import { renderConfigError as renderizarErroConfiguracao } from './telas/tela-erro-configuracao.mjs';
import { renderizarLogin } from './telas/tela-login.mjs';
import { renderNoMembership as renderizarSemEmpresa } from './telas/tela-sem-empresa.mjs';
import { montarEstrutura } from './navegacao/estrutura-da-janela.mjs';
import { aplicativo } from './componentes/conteiner-do-aplicativo.mjs';
import { registrarRotas } from './navegacao/enderecos-das-telas.mjs';

let estruturaAtual = null;
let revalidarAcesso = null;

export async function inicializar() {
  estruturaAtual?.desmontar();
  estruturaAtual = null;
  if (revalidarAcesso) removeEventListener('focus', revalidarAcesso);
  registrarComponentes();
  montarSpriteIcones();
  await tema.apply().catch(() => {});

  try {
    await carregarConfiguracao();
  } catch (erro) {
    if (erro?.hint === 'ELECTRON_PRELOAD_UNAVAILABLE') throw erro;
    renderizarErroConfiguracao(erro.configStatus ?? (await estadoConfiguracao().catch(() => null)));
    return;
  }

  await sessao.restore();

  if (!sessao.accessToken) {
    renderizarLogin({ onSuccess: inicializar });
    return;
  }

  try {
    await contexto.load();
  } catch (erro) {
    await sessao.clear();
    renderizarLogin({ onSuccess: inicializar });
    return;
  }

  /**
   * Sair pede confirmação.
   *
   * O botão fica na barra superior, ao lado do alternador de tema, e um clique
   * errado descarta a sessão e o que estiver preenchido na tela. Confirmar
   * custa um segundo; refazer o login no meio do expediente custa mais.
   */
  const executarSaida = async () => {
    const confirmado = await confirmarAcao({
      title: 'Sair do sistema',
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
  };

  if (!contexto.hasActiveMembership) {
    renderizarSemEmpresa({ onSignOut: executarSaida });
    return;
  }

  const estrutura = montarEstrutura({ onSignOut: executarSaida });
  estruturaAtual = estrutura;
  aplicativo.replaceChildren(estrutura.node);
  aplicativo.removeAttribute('aria-busy');
  iniciarRoteador({ outlet: estrutura.outlet, shell: estrutura });

  if (sessao.isEphemeral) {
    notificacao(
      'Sessão não persistida: o chaveiro do sistema não está disponível. ' +
        'Será necessário entrar novamente ao reabrir.',
      { tone: 'warning', duration: 9000 },
    );
  }

  revalidarAcesso = async () => {
    const antes = JSON.stringify(contexto.permissions);
    try {
      await contexto.load();
    } catch {
      return;
    }
    if (JSON.stringify(contexto.permissions) !== antes) {
      notificacao('Suas permissões foram atualizadas.', { tone: 'info' });
      inicializar();
    }
  };
  addEventListener('focus', revalidarAcesso);
}

registrarRotas();

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
