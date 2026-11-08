import { el as criarElemento, modal } from '../componentes/componentes-do-painel.mjs';

import { icone } from '../componentes/icones.mjs';

import {
  EVENTO_CONECTIVIDADE_SERVIDOR,
  estadoConectividadeServidor,
  verificarConectividadeServidor,
} from '../comunicacao/comunicacao-com-servidor.mjs';
import { NAV as MENU } from './menu-lateral.mjs';
import { navegar } from './trocar-tela.mjs';

export function montarEstrutura({ actor: ator, onSignOut: aoSair, onToggleTheme: aoAlternarTema }) {
  const botoesNavegacao = new Map();
  let recolhido = localStorage.getItem('pnf.admin.sidebar-collapsed') === 'true';
  let estrutura;

  const navegacao = criarElemento(
    'nav',
    { class: 'nav admin-side-nav', 'aria-label': 'Seções' },
    MENU.map((item) => {
      const botao = criarElemento(
        'button',
        {
          class: 'nav-item',
          type: 'button',
          title: item.label,
          onClick: () => navegar(item.path),
        },
        [icone(item.icon, { size: 'sm' }), criarElemento('span', { class: 'nav-label', text: item.label })],
      );
      botoesNavegacao.set(item.pattern, botao);
      return botao;
    }),
  );

  function definirRecolhido(valor) {
    recolhido = Boolean(valor);
    localStorage.setItem('pnf.admin.sidebar-collapsed', String(recolhido));
    if (estrutura) estrutura.dataset.sidebar = recolhido ? 'collapsed' : 'expanded';
  }

  function abrirBuscaNavegacao() {
    let consulta = '';
    const resultados = criarElemento('div', { class: 'command-results' });
    let correspondenciaItem;
    const desenhar = () => {
      const buscaAtual = consulta
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
      const correspondencias = MENU.filter(
        (item) =>
          !buscaAtual ||
          item.label
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .includes(buscaAtual),
      );
      resultados.replaceChildren(
        ...correspondencias.map((item) =>
          criarElemento(
            'button',
            {
              class: 'command-item',
              type: 'button',
              onClick: () => {
                correspondenciaItem.close();
                navegar(item.path);
              },
            },
            [icone(item.icon, { size: 'sm' }), criarElemento('span', { text: item.label })],
          ),
        ),
        correspondencias.length
          ? null
          : criarElemento('p', { class: 'muted', text: 'Nenhuma seção encontrada.' }),
      );
    };
    const entrada = criarElemento('input', {
      class: 'input',
      type: 'search',
      placeholder: 'Empresas, administradores, auditoria…',
      onInput: (evento2) => {
        consulta = evento2.target.value;
        desenhar();
      },
      onKeydown: (evento2) => {
        if (evento2.key === 'Enter') resultados.querySelector('.command-item')?.click();
      },
    });
    correspondenciaItem = modal({
      title: 'Ir para uma área',
      size: 'sm',
      body: criarElemento('div', {}, [entrada, resultados]),
    });
    desenhar();
    entrada.focus();
  }

  const titulo = criarElemento('h1', { class: 'topbar-title', text: 'Visão geral' });
  const desconectado = criarElemento('div', { class: 'offline-banner', role: 'status', hidden: true }, [
    icone('warning', { size: 'sm' }),
    criarElemento('span', {
      text: 'Conexão com o servidor indisponível. O painel tentará reconectar automaticamente.',
    }),
  ]);
  const conteudoTela = criarElemento('div', { class: 'content', id: 'conteudo', tabindex: '-1' });

  const alternar = criarElemento(
    'button',
    {
      class: 'sidebar-toggle',
      type: 'button',
      title: 'Recolher menu (Ctrl+B)',
      'aria-label': 'Recolher ou expandir menu lateral',
      onClick: () => definirRecolhido(!recolhido),
    },
    [icone('panel', { size: 'sm' })],
  );
  const botaoBusca = criarElemento(
    'button',
    {
      class: 'top-search-btn',
      type: 'button',
      title: 'Buscar no painel (Ctrl+K)',
      'aria-label': 'Buscar no painel',
      onClick: abrirBuscaNavegacao,
    },
    [
      icone('search', { size: 'sm' }),
      criarElemento('span', { text: 'Buscar' }),
      criarElemento('kbd', { text: 'Ctrl K' }),
    ],
  );

  estrutura = criarElemento(
    'div',
    { class: 'shell admin-shell', dataset: { sidebar: recolhido ? 'collapsed' : 'expanded' } },
    [
      criarElemento('aside', { class: 'sidebar admin-sidebar' }, [
        criarElemento('div', { class: 'sidebar-brand' }, [
          criarElemento('span', { class: 'brand-mark', text: 'PF' }),
          criarElemento('span', { class: 'sidebar-brand-copy' }, [
            criarElemento('b', { text: 'PegaNaFrota' }),
            criarElemento('small', { text: 'PLATAFORMA' }),
          ]),
          alternar,
        ]),
        criarElemento('div', { class: 'sidebar-env' }, [
          criarElemento('span', { class: 'env-dot', 'aria-hidden': 'true' }),
          criarElemento('span', { class: 'sidebar-env-label', text: `Ambiente ${rotuloAmbiente()}` }),
        ]),
        navegacao,
        criarElemento('div', { class: 'sidebar-footer' }, [
          criarElemento('span', { class: 'side-avatar' }, [icone('user', { size: 'sm' })]),
          criarElemento('span', { class: 'side-identity' }, [
            criarElemento('p', {
              class: 'side-name',
              title: ator?.email || '',
              text: ator?.email || 'Administrador',
            }),
            criarElemento('p', { class: 'side-role', text: 'Administrador da plataforma' }),
          ]),
          criarElemento(
            'button',
            { class: 'icon-btn', type: 'button', title: 'Sair', 'aria-label': 'Sair', onClick: aoSair },
            [icone('logout', { size: 'sm' })],
          ),
        ]),
      ]),
      criarElemento('div', { class: 'main' }, [
        desconectado,
        criarElemento('header', { class: 'topbar' }, [
          titulo,
          criarElemento('div', { class: 'topbar-actions' }, [
            botaoBusca,
            criarElemento('span', {
              class: 'env-badge',
              dataset: { env: rotuloAmbiente() },
              text: rotuloAmbiente(),
            }),
            criarElemento(
              'button',
              {
                class: 'top-btn',
                type: 'button',
                title: 'Alternar tema',
                'aria-label': 'Alternar tema',
                onClick: aoAlternarTema,
              },
              [icone('theme')],
            ),
          ]),
        ]),
        conteudoTela,
      ]),
    ],
  );

  const atualizarConectividade = (evento) => {
    const disponivel = evento?.detail?.disponivel;
    if (typeof disponivel === 'boolean') desconectado.hidden = disponivel;
  };
  addEventListener(EVENTO_CONECTIVIDADE_SERVIDOR, atualizarConectividade);
  // `false` só é definido após uma falha de rede real. `null` significa que
  // nenhuma requisição falhou e, por isso, não há motivo para exibir alerta.
  desconectado.hidden = estadoConectividadeServidor() !== false;
  void verificarConectividadeServidor();

  if (window.__pnfAdminShortcutHandler) removeEventListener('keydown', window.__pnfAdminShortcutHandler);
  window.__pnfAdminShortcutHandler = (evento2) => {
    const etiqueta = document.activeElement?.tagName?.toLowerCase();
    const digitando =
      ['input', 'textarea', 'select'].includes(etiqueta) || document.activeElement?.isContentEditable;
    if ((evento2.ctrlKey || evento2.metaKey) && evento2.key.toLowerCase() === 'k') {
      evento2.preventDefault();
      abrirBuscaNavegacao();
      return;
    }
    if ((evento2.ctrlKey || evento2.metaKey) && evento2.key.toLowerCase() === 'b') {
      evento2.preventDefault();
      definirRecolhido(!recolhido);
      return;
    }
    if (!digitando && evento2.key === '/') {
      const entrada = conteudoTela.querySelector('[data-list-search="true"]');
      if (entrada) {
        evento2.preventDefault();
        entrada.focus();
      }
    }
  };
  addEventListener('keydown', window.__pnfAdminShortcutHandler);

  return {
    node: estrutura,
    outlet: conteudoTela,
    setTitle(itemAtual) {
      titulo.textContent = itemAtual;
      document.title = `${itemAtual} · PegaNaFrota Admin`;
    },
    setActive(padrao) {
      for (const [parametroItem, botao] of botoesNavegacao) {
        const ativo = parametroItem === padrao || (parametroItem !== '/' && padrao.startsWith(parametroItem));
        if (ativo) botao.setAttribute('aria-current', 'page');
        else botao.removeAttribute('aria-current');
      }
    },
  };
}

export function rotuloAmbiente() {
  const cabecalhos = location.hostname;
  if (cabecalhos === 'localhost' || cabecalhos === '127.0.0.1' || cabecalhos.endsWith('.local'))
    return 'LOCAL';
  if (/(^|[.-])(staging|homolog|hml|dev)([.-]|$)/.test(cabecalhos)) return 'HOMOLOGAÇÃO';
  return 'PRODUÇÃO';
}
