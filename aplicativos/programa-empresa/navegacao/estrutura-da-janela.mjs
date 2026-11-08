import {
  el as criarElemento,
  campo,
  modal,
  notificacao,
  navegar,
} from '../componentes/componentes-do-programa.mjs';

import { icone } from '../componentes/icones.mjs';

import {
  contexto,
  tema,
  EVENTO_CONECTIVIDADE_SERVIDOR,
  estadoConectividadeServidor,
  verificarConectividadeServidor,
} from '../acesso/sessao-e-permissoes.mjs';

import { ROTULO_PAPEL_VINCULO } from '@peganafrota/contracts';

import { NAV as MENU } from './menu-lateral.mjs';

export function iniciais(nome) {
  const partes = String(nome || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!partes.length) return '—';
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

export const ROTULOS_TEMA = { light: 'Claro', dark: 'Escuro', system: 'Sistema' };

export const ICONES_TEMA = { light: 'moon', dark: 'moon', system: 'moon' };

export function montarEstrutura({ onSignOut: aoSair }) {
  const botoes = new Map();

  const secoes = [];
  let atual = { label: null, items: [] };
  const guardarSecaoAtual = () => {
    if (atual.items.length) secoes.push(atual);
    atual = { label: null, items: [] };
  };
  for (const entrada of MENU) {
    if (entrada.group) {
      guardarSecaoAtual();
      atual.label = entrada.group;
      continue;
    }
    if (entrada.roles && !entrada.roles.includes(contexto.role)) continue;
    if (entrada.permission && !contexto.can(entrada.permission)) continue;
    atual.items.push(entrada);
  }
  guardarSecaoAtual();

  let preferenciasGrupos = {};
  try {
    preferenciasGrupos = JSON.parse(localStorage.getItem('pnf.desktop.nav-groups') || '{}');
  } catch {
    preferenciasGrupos = {};
  }
  const secaoPorPattern = new Map();
  const itensVisiveisNavegacao = secoes.flatMap((secao) => secao.items);

  const navegacao = criarElemento(
    'nav',
    { class: 'nav', 'aria-label': 'Seções' },
    secoes.map((secao) => {
      const nos = secao.items.map((item) => {
        const segundoItem = criarElemento(
          'button',
          { class: 'nav-item', type: 'button', title: item.label, onClick: () => navegar(item.path) },
          [icone(item.icon), criarElemento('span', { text: item.label })],
        );
        botoes.set(item.pattern, segundoItem);
        return segundoItem;
      });
      if (!secao.label) return criarElemento('div', { class: 'nav-section nav-section-fixed' }, nos);
      const detalhes = criarElemento(
        'details',
        {
          class: 'nav-section',
          open: preferenciasGrupos[secao.label] !== false,
          onToggle: (evento2) => {
            preferenciasGrupos[secao.label] = evento2.currentTarget.open;
            localStorage.setItem('pnf.desktop.nav-groups', JSON.stringify(preferenciasGrupos));
          },
        },
        [
          criarElemento('summary', { class: 'nav-group' }, [
            criarElemento('span', { text: secao.label }),
            icone('down', { size: 'sm' }),
          ]),
          criarElemento('div', { class: 'nav-section-items' }, nos),
        ],
      );
      for (const item of secao.items) secaoPorPattern.set(item.pattern, detalhes);
      return detalhes;
    }),
  );

  const titulo = criarElemento('h1', { class: 'topbar-title', text: 'Visão geral' });

  const desconectado = criarElemento('div', { class: 'offline-banner', role: 'status', hidden: true }, [
    icone('warning', { size: 'sm' }),
    criarElemento('span', {
      text: 'Conexão com o servidor indisponível. O aplicativo tentará reconectar automaticamente.',
    }),
  ]);

  const conteudoTela = criarElemento('div', { class: 'content', id: 'conteudo', tabindex: '-1' });

  function abrirBuscaNavegacao() {
    let buscaAtual = '';
    const resultados = criarElemento('div', { class: 'command-results' });
    let correspondenciaItem;
    const desenhar = () => {
      const termoBusca = buscaAtual
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
      const correspondencias = itensVisiveisNavegacao.filter(
        (item) =>
          !termoBusca ||
          item.label
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .includes(termoBusca),
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
      placeholder: 'Digite: veículo, viagem, equipe…',
      onInput: (evento2) => {
        buscaAtual = evento2.target.value;
        desenhar();
      },
      onKeydown: (evento2) => {
        if (evento2.key === 'Enter') resultados.querySelector('.command-item')?.click();
      },
    });
    correspondenciaItem = modal({
      title: 'Ir para uma área',
      size: 'sm',
      body: criarElemento('div', {}, [
        campo({ id: 'nav-search', label: 'Buscar no menu', control: entrada }),
        resultados,
      ]),
    });
    desenhar();
    entrada.focus();
  }

  const botaoBusca = criarElemento(
    'button',
    {
      class: 'top-search-btn',
      type: 'button',
      onClick: abrirBuscaNavegacao,
      title: 'Buscar no menu (Ctrl+K)',
      'aria-label': 'Buscar no menu',
    },
    [
      icone('search', { size: 'sm' }),
      criarElemento('span', { text: 'Buscar' }),
      criarElemento('kbd', { text: 'Ctrl K' }),
    ],
  );

  const temaBotao = criarElemento(
    'button',
    {
      class: 'top-btn',
      type: 'button',
      'aria-label': 'Alternar tema',
      title: `Tema: ${ROTULOS_TEMA[document.documentElement.getAttribute('data-theme-choice') || 'system']}`,
      onClick: async () => {
        const ordem = ['light', 'dark', 'system'];
        const atual2 = document.documentElement.getAttribute('data-theme-choice') || 'system';
        const proximo = ordem[(ordem.indexOf(atual2) + 1) % ordem.length];
        await tema.set(proximo);
        localStorage.setItem('pnf.desktop.theme', proximo);
        temaBotao.title = `Tema: ${ROTULOS_TEMA[proximo]}`;
        notificacao(`Tema: ${ROTULOS_TEMA[proximo]}`, { tone: 'info' });
      },
    },
    [icone(ICONES_TEMA.system)],
  );

  let menuLateralRecolhido = localStorage.getItem('pnf.desktop.sidebar-collapsed') === 'true';
  let no;
  const menuLateralAlternar = criarElemento(
    'button',
    {
      class: 'sidebar-toggle',
      type: 'button',
      title: 'Recolher menu (Ctrl+B)',
      'aria-label': 'Recolher ou expandir menu lateral',
      onClick: () => definirMenuRecolhido(!menuLateralRecolhido),
    },
    [icone('panel', { size: 'sm' })],
  );

  function definirMenuRecolhido(valor) {
    menuLateralRecolhido = Boolean(valor);
    localStorage.setItem('pnf.desktop.sidebar-collapsed', String(menuLateralRecolhido));
    if (!no) return;
    no.dataset.sidebar = menuLateralRecolhido ? 'collapsed' : 'expanded';
    menuLateralAlternar.title = menuLateralRecolhido ? 'Expandir menu (Ctrl+B)' : 'Recolher menu (Ctrl+B)';
    menuLateralAlternar.setAttribute(
      'aria-label',
      menuLateralRecolhido ? 'Expandir menu lateral' : 'Recolher menu lateral',
    );
  }

  no = criarElemento(
    'div',
    { class: 'shell', dataset: { sidebar: menuLateralRecolhido ? 'collapsed' : 'expanded' } },
    [
      criarElemento('aside', { class: 'sidebar' }, [
        criarElemento('div', { class: 'sidebar-brand' }, [
          criarElemento('span', { class: 'brand-mark', text: 'PF' }),
          criarElemento('span', { class: 'sidebar-brand-name', text: 'PegaNaFrota' }),
          menuLateralAlternar,
        ]),
        criarElemento('div', { class: 'sidebar-org' }, [
          criarElemento('p', { class: 'sidebar-org-kicker', text: 'EMPRESA' }),
          criarElemento('p', {
            class: 'sidebar-company',
            title: contexto.companyName || '',
            text: contexto.companyName || '—',
          }),
        ]),
        navegacao,
        criarElemento('div', { class: 'sidebar-footer' }, [
          criarElemento('span', {
            class: 'side-avatar',
            'aria-hidden': 'true',
            text: iniciais(contexto.fullName),
          }),
          criarElemento('span', { class: 'side-identity' }, [
            criarElemento('p', { class: 'side-name', text: contexto.fullName || '—' }),
            criarElemento('p', {
              class: 'side-role',
              text: ROTULO_PAPEL_VINCULO[contexto.role] || 'Conectado',
            }),
          ]),
          criarElemento(
            'button',
            { class: 'icon-btn', type: 'button', 'aria-label': 'Sair', title: 'Sair', onClick: aoSair },
            [icone('logout', { size: 'sm' })],
          ),
        ]),
      ]),
      criarElemento('div', { class: 'main' }, [
        desconectado,
        criarElemento('header', { class: 'topbar' }, [
          titulo,
          criarElemento('div', { class: 'topbar-actions' }, [botaoBusca, temaBotao]),
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
  // Nunca confie em navigator.onLine: no Windows/Electron ele pode retornar
  // offline mesmo com o Supabase acessível. Só falhas reais de fetch alteram o banner.
  desconectado.hidden = estadoConectividadeServidor() !== false;
  // Revalida ao montar a interface para limpar imediatamente qualquer estado antigo.
  void verificarConectividadeServidor();

  if (window.__pnfDesktopShortcutHandler) removeEventListener('keydown', window.__pnfDesktopShortcutHandler);
  window.__pnfDesktopShortcutHandler = (evento2) => {
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
      definirMenuRecolhido(!menuLateralRecolhido);
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
  addEventListener('keydown', window.__pnfDesktopShortcutHandler);

  return {
    desmontar: () => {
      removeEventListener(EVENTO_CONECTIVIDADE_SERVIDOR, atualizarConectividade);
      removeEventListener('keydown', window.__pnfDesktopShortcutHandler);
    },
    node: no,
    outlet: conteudoTela,
    setTitle: (itemAtual) => {
      titulo.textContent = itemAtual;
    },
    setActive: (padrao) => {
      for (const [parametroItem, segundoItem] of botoes) {
        const ativo = parametroItem === padrao || (parametroItem !== '/' && padrao.startsWith(parametroItem));
        if (ativo) {
          segundoItem.setAttribute('aria-current', 'page');
          const secao = secaoPorPattern.get(parametroItem);
          if (secao) secao.open = true;
        } else segundoItem.removeAttribute('aria-current');
      }
    },
  };
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { ROTULOS_TEMA as THEME_LABEL };
export { ICONES_TEMA as THEME_ICON };
