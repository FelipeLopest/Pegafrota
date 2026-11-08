const CHAVE_TEMA = 'pnf.admin.theme';

import { icone } from './icones.mjs';

export const tema = {
  get() {
    return localStorage.getItem(CHAVE_TEMA) || 'system';
  },

  set(valor) {
    localStorage.setItem(CHAVE_TEMA, valor);
    this.apply();
  },

  apply() {
    const escolha = this.get();
    const prefereEscuro = matchMedia('(prefers-color-scheme: dark)').matches;
    const efetivo = escolha === 'system' ? (prefereEscuro ? 'dark' : 'light') : escolha;
    document.documentElement.setAttribute('data-theme', efetivo);
    document.documentElement.setAttribute('data-theme-choice', escolha);
  },

  watch() {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.get() === 'system') this.apply();
    });
  },
};

export function prefereMovimentoReduzido() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function criarElemento(etiqueta, propriedades = {}, filhos = []) {
  const no = document.createElement(etiqueta);
  for (const [chaveItem, veiculoItem] of Object.entries(propriedades)) {
    if (veiculoItem == null || veiculoItem === false) continue;
    if (chaveItem === 'class') no.className = veiculoItem;
    else if (chaveItem === 'text') no.textContent = veiculoItem;
    else if (chaveItem === 'html') no.innerHTML = veiculoItem;
    else if (chaveItem.startsWith('on') && typeof veiculoItem === 'function') {
      no.addEventListener(chaveItem.slice(2).toLowerCase(), veiculoItem);
    } else if (chaveItem === 'dataset') {
      Object.assign(no.dataset, veiculoItem);
    } else {
      no.setAttribute(chaveItem, veiculoItem === true ? '' : String(veiculoItem));
    }
  }
  for (const filho of [].concat(filhos)) {
    if (filho == null) continue;
    no.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
  }
  return no;
}

export function formatarDadosHora(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function formatarDados(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(iso));
}

export function formatarDuracao(milissegundos) {
  if (milissegundos == null) return '—';
  if (milissegundos < 1000) return `${milissegundos} ms`;
  const textoItem = milissegundos / 1000;
  if (textoItem < 60) return `${textoItem.toFixed(1)} s`;
  return `${Math.floor(textoItem / 60)} min ${Math.round(textoItem % 60)} s`;
}

export function ateRotulo(iso) {
  if (!iso) return null;
  const diferenca = new Date(iso).getTime() - Date.now();
  if (diferenca <= 0) return null;
  const textoItem = Math.ceil(diferenca / 1000);
  if (textoItem < 60) return `${textoItem} s`;
  const correspondenciaItem = Math.ceil(textoItem / 60);
  if (correspondenciaItem < 60) return `${correspondenciaItem} min`;
  const cabecalhos = Math.ceil(correspondenciaItem / 60);
  if (cabecalhos < 48) return `${cabecalhos} h`;
  return `${Math.ceil(cabecalhos / 24)} dias`;
}

const TONALIDADE_INDICADOR = {
  active: 'success',
  succeeded: 'success',
  accepted: 'success',
  success: 'success',
  suspended: 'warning',
  pending: 'warning',
  running: 'info',
  archived: 'neutral',
  revoked: 'neutral',
  skipped: 'neutral',
  compensated: 'neutral',
  failed: 'danger',
  denied: 'danger',
  expired: 'danger',
  needs_manual: 'violet',
  compensating: 'violet',
  failure: 'danger',
};

export class IndicadorSituacao extends HTMLElement {
  static observedAttributes = ['status', 'label'];

  connectedCallback() {
    this.render();
  }
  attributeChangedCallback() {
    this.render();
  }

  render() {
    const situacao = this.getAttribute('status') || 'neutral';
    const rotulo = this.getAttribute('label') || situacao;
    this.dataset.tone = TONALIDADE_INDICADOR[situacao] || 'neutral';
    this.textContent = rotulo;
    this.setAttribute('role', 'status');
  }
}

/**
 * Campo de formulário.
 *
 * `wrapper` envolve o controle sem perder rótulo, dica e erro — usado no campo
 * de senha, que traz um botão de exibir dentro da borda. Os atributos de
 * acessibilidade ficam no CONTROLE, que é o que recebe o foco.
 */
export function campo({
  id: identificador,
  label: rotulo,
  hint: dica,
  error: erro,
  required: obrigatorio,
  control: controle,
  wrapper: envoltorio,
}) {
  const descritoPor = [];
  if (dica) descritoPor.push(`${identificador}-hint`);
  if (erro) descritoPor.push(`${identificador}-error`);

  controle.id = identificador;
  if (descritoPor.length) controle.setAttribute('aria-describedby', descritoPor.join(' '));
  if (erro) controle.setAttribute('aria-invalid', 'true');
  else controle.removeAttribute('aria-invalid');
  if (obrigatorio) controle.setAttribute('aria-required', 'true');

  return criarElemento('div', { class: 'field', dataset: { invalid: erro ? 'true' : 'false' } }, [
    criarElemento('label', { class: 'field-label', for: identificador }, [
      rotulo,
      obrigatorio
        ? criarElemento('span', { class: 'field-required', 'aria-hidden': 'true', text: ' *' })
        : null,
    ]),
    envoltorio || controle,
    dica ? criarElemento('p', { class: 'field-hint', id: `${identificador}-hint`, text: dica }) : null,
    erro
      ? criarElemento('p', { class: 'field-error', id: `${identificador}-error`, role: 'alert', text: erro })
      : null,
  ]);
}

const ICONES_AUTOMATICOS_BOTOES = new Map([
  ['novo', 'plus'],
  ['criar', 'plus'],
  ['adicionar', 'plus'],
  ['convidar', 'invite'],
  ['salvar', 'check'],
  ['confirmar', 'check'],
  ['aprovar', 'check'],
  ['concluir', 'check'],
  ['iniciar', 'right'],
  ['continuar', 'right'],
  ['abrir', 'right'],
  ['cancelar', 'close'],
  ['fechar', 'close'],
  ['sair', 'logout'],
  ['buscar', 'search'],
  ['filtrar', 'filter'],
  ['recarregar', 'retry'],
  ['tentar novamente', 'retry'],
  ['atualizar', 'retry'],
]);

function inferirIconeBotao(rotulo, explicito) {
  if (explicito) return explicito;
  const normalizado = String(rotulo || '')
    .trim()
    .toLowerCase();
  if (!normalizado) return null;
  for (const [chave, nomeIcone] of ICONES_AUTOMATICOS_BOTOES.entries()) {
    if (normalizado.startsWith(chave)) return nomeIcone;
  }
  return null;
}

export function botao({
  label: rotulo,
  variant: variacao = 'secondary',
  onClick: aoClicar,
  disabled: desabilitado,
  busy: ocupado,
  title: titulo,
  type: tipo = 'button',
  icon: nomeIcone,
  size: tamanho,
}) {
  const botao = criarElemento(
    'button',
    {
      class: `btn btn-${variacao}${tamanho === 'sm' ? ' btn-sm' : ''}${tamanho === 'block' ? ' btn-block' : ''}`,
      type: tipo,
      disabled: desabilitado || ocupado,
      'aria-busy': ocupado ? 'true' : null,
      title: titulo || null,
      onClick: aoClicar,
    },
    [
      ocupado
        ? criarElemento('span', { class: 'btn-spinner', 'aria-hidden': 'true' })
        : inferirIconeBotao(rotulo, nomeIcone)
          ? icone(inferirIconeBotao(rotulo, nomeIcone), { size: 'sm' })
          : null,
      criarElemento('span', { text: rotulo }),
    ],
  );
  return botao;
}

export function tabelaEsqueleto(linhas = 6, colunas = 5) {
  return criarElemento(
    'div',
    { class: 'skeleton-table', 'aria-hidden': 'true' },
    Array.from({ length: linhas }, () =>
      criarElemento(
        'div',
        { class: 'skeleton-row' },
        Array.from({ length: colunas }, () => criarElemento('div', { class: 'skeleton-cell' })),
      ),
    ),
  );
}

function iconeEstado(nome, tom) {
  return criarElemento(
    'div',
    { class: 'state-icon', dataset: tom ? { tone: tom } : {}, 'aria-hidden': 'true' },
    [icone(nome, { size: 'lg' })],
  );
}

export function estadoVazio({
  title: titulo,
  description: descricao,
  action: acao,
  icon: nomeIcone = 'inbox',
}) {
  return criarElemento('div', { class: 'empty-state' }, [
    iconeEstado(nomeIcone),
    criarElemento('h3', { class: 'empty-title', text: titulo }),
    descricao ? criarElemento('p', { class: 'empty-description', text: descricao }) : null,
    acao || null,
  ]);
}

export function estadoErro({
  title: titulo,
  description: descricao,
  hint: dica,
  requestId: requisicaoIdentificador,
  onRetry: aoTentarNovamente,
}) {
  return criarElemento('div', { class: 'error-state', role: 'alert' }, [
    iconeEstado('warning', 'danger'),
    criarElemento('h3', { class: 'error-title', text: titulo || 'Não foi possível carregar' }),
    descricao ? criarElemento('p', { class: 'error-description', text: descricao }) : null,
    aoTentarNovamente
      ? botao({ label: 'Tentar novamente', variant: 'primary', icon: 'retry', onClick: aoTentarNovamente })
      : null,
    requisicaoIdentificador
      ? criarElemento('p', { class: 'error-meta' }, [
          'Código do erro: ',
          criarElemento('code', { text: requisicaoIdentificador }),
        ])
      : null,
    dica
      ? criarElemento('p', { class: 'error-meta' }, ['Motivo: ', criarElemento('code', { text: dica })])
      : null,
  ]);
}

let conteinerNotificacao = null;

export function notificacao(mensagem, { tone: tom = 'info', duration: duracao = 5000, action: acao } = {}) {
  if (!conteinerNotificacao) {
    conteinerNotificacao = criarElemento('div', {
      class: 'toast-host',
      role: 'region',
      'aria-live': 'polite',
      'aria-label': 'Notificações',
    });
    document.body.append(conteinerNotificacao);
  }

  const ICONE_TONALIDADE = { success: 'check', danger: 'warning', warning: 'warning', info: 'info' };
  const no = criarElemento('div', { class: 'toast', dataset: { tone: tom } }, [
    icone(ICONE_TONALIDADE[tom] || 'info', { size: 'sm' }),
    criarElemento('span', { class: 'toast-message', text: mensagem }),
    acao ? criarElemento('button', { class: 'toast-action', text: acao.label, onClick: acao.onClick }) : null,
  ]);

  conteinerNotificacao.append(no);

  if (!prefereMovimentoReduzido()) no.dataset.enter = 'true';

  const remover = () => {
    no.dataset.leave = 'true';
    setTimeout(() => no.remove(), prefereMovimentoReduzido() ? 0 : 180);
  };
  setTimeout(remover, duracao);
  return remover;
}

const ELEMENTOS_FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function modal({
  title: titulo,
  body: corpo,
  footer: rodape,
  onClose: aoClose,
  size: tamanho = 'md',
  dismissible: podeFechar = true,
}) {
  const focoAnterior = document.activeElement;
  const tituloIdentificador = `modal-title-${Math.random().toString(36).slice(2, 8)}`;

  const dialogo = criarElemento(
    'div',
    {
      class: 'modal',
      dataset: { size: tamanho },
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': tituloIdentificador,
    },
    [
      criarElemento('header', { class: 'modal-header' }, [
        criarElemento('h2', { class: 'modal-title', id: tituloIdentificador, text: titulo }),
        podeFechar
          ? criarElemento(
              'button',
              {
                class: 'modal-close',
                type: 'button',
                'aria-label': 'Fechar',
                onClick: () => fechar(),
              },
              [icone('close', { size: 'sm' })],
            )
          : null,
      ]),
      criarElemento('div', { class: 'modal-body' }, [corpo]),
      rodape ? criarElemento('footer', { class: 'modal-footer' }, [rodape]) : null,
    ],
  );

  const fundoModal = criarElemento(
    'div',
    {
      class: 'modal-backdrop',
      onClick: (evento) => {
        if (podeFechar && evento.target === fundoModal) fechar();
      },
    },
    [dialogo],
  );

  function aoPressionarTecla(evento) {
    if (evento.key === 'Escape' && podeFechar) {
      evento.preventDefault();
      fechar();
      return;
    }
    if (evento.key !== 'Tab') return;

    const itens = [...dialogo.querySelectorAll(ELEMENTOS_FOCAVEIS)].filter(
      (quantidadeItem) => quantidadeItem.offsetParent !== null,
    );
    if (itens.length === 0) return;
    const primeiro = itens[0];
    const ultimo = itens[itens.length - 1];

    if (evento.shiftKey && document.activeElement === primeiro) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  }

  function fechar(resultado) {
    document.removeEventListener('keydown', aoPressionarTecla, true);
    fundoModal.remove();
    document.body.style.removeProperty('overflow');
    focoAnterior?.focus?.();
    aoClose?.(resultado);
  }

  document.addEventListener('keydown', aoPressionarTecla, true);
  document.body.style.overflow = 'hidden';
  document.body.append(fundoModal);

  const primeiroFocavel = dialogo.querySelector(ELEMENTOS_FOCAVEIS);
  primeiroFocavel?.focus?.();

  return { close: fechar, dialog: dialogo };
}

export function registrarComponentes() {
  if (!customElements.get('status-pill')) {
    customElements.define('status-pill', IndicadorSituacao);
  }
}

/**
 * Confirmação simples.
 *
 * Distinta de `confirmDestructive`, que exige digitar o nome do alvo e
 * confirmar identidade. Aquela é para arquivar empresa; esta é para ações
 * reversíveis como sair do painel — pedir o nome digitado ali seria atrito sem
 * proteção, e treinaria a pessoa a ignorar a confirmação que importa.
 */
export function confirmarAcao({
  title: titulo,
  description: descricao,
  confirmLabel: confirmarRotulo = 'Confirmar',
  consequences: consequencias = [],
}) {
  return new Promise((resolver) => {
    let resolvido = false;
    const finalizar = (valor) => {
      if (resolvido) return;
      resolvido = true;
      resolver(valor);
    };

    let correspondenciaItem;
    const rodape = criarElemento('div', { class: 'modal-actions' }, [
      botao({
        label: 'Cancelar',
        onClick: () => {
          correspondenciaItem.close();
          finalizar(false);
        },
      }),
      botao({
        label: confirmarRotulo,
        variant: 'primary',
        onClick: () => {
          correspondenciaItem.close();
          finalizar(true);
        },
      }),
    ]);

    correspondenciaItem = modal({
      title: titulo,
      body: criarElemento('div', {}, [
        criarElemento('p', { text: descricao }),
        consequencias.length
          ? criarElemento(
              'ul',
              { class: 'danger-consequences' },
              consequencias.map((registro) => criarElemento('li', { text: registro })),
            )
          : null,
      ]),
      footer: rodape,
      onClose: () => finalizar(false),
    });
  });
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { criarElemento as el };
export { formatarDadosHora as formatarDataHora };
export { formatarDados as formatarData };
export { ateRotulo as untilLabel };
export { IndicadorSituacao as StatusPill };
