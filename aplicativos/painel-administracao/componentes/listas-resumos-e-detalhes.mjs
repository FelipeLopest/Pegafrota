import {
  el as criarElemento,
  botao,
  tabelaEsqueleto,
  estadoVazio,
  estadoErro,
  formatarDataHora as formatarDadosHora,
} from './componentes-do-painel.mjs';

import { icone } from './icones.mjs';

import { abrirAlteracaoSenhaMembro } from '../formularios/formulario-alterar-senha.mjs';
import { excluirMembroEmpresa } from '../formularios/formulario-excluir-integrante.mjs';

export const ROTULO_PAPEL_MEMBRO = {
  company_admin: 'Administrador',
  fleet_manager: 'Gestor de frota',
  operator: 'Operador',
  viewer: 'Visualizador',
};

export function secao(titulo, filhos) {
  return criarElemento('section', { class: 'card' }, [
    criarElemento('h2', { class: 'card-title', text: titulo }),
    ...[].concat(filhos),
  ]);
}

export const METADADOS_PAGINAS_ADMINISTRACAO = {
  'Visão geral': ['overview', 'PLATAFORMA'],
  Empresas: ['company', 'GESTÃO'],
  Empresa: ['company', 'GESTÃO'],
  'Nova empresa': ['plus', 'GESTÃO'],
  'Administradores das empresas': ['admin', 'GESTÃO'],
  'Admins das empresas': ['admin', 'GESTÃO'],
  Provisionamentos: ['operation', 'SISTEMA'],
  Provisionamento: ['operation', 'SISTEMA'],
  'Auditoria global': ['audit', 'SISTEMA'],
  'Meu perfil': ['user', 'CONTA'],
};

export function cabecalhoPagina({
  title: titulo,
  subtitle: subtitulo,
  actions: acoes = [],
  iconName: nomeIcone,
  eyebrow: sobreTitulo,
}) {
  const metadados = METADADOS_PAGINAS_ADMINISTRACAO[titulo] || ['info', 'PLATAFORMA'];
  return criarElemento('div', { class: 'page-head' }, [
    criarElemento('div', { class: 'page-head-main' }, [
      criarElemento('div', { class: 'page-head-mark', 'aria-hidden': 'true' }, [
        icone(nomeIcone || metadados[0]),
      ]),
      criarElemento('div', { class: 'page-head-copy' }, [
        criarElemento('p', { class: 'page-eyebrow', text: sobreTitulo || metadados[1] }),
        criarElemento('h2', { class: 'page-title', text: titulo }),
        subtitulo ? criarElemento('p', { class: 'page-subtitle', text: subtitulo }) : null,
      ]),
    ]),
    acoes.filter(Boolean).length
      ? criarElemento('div', { class: 'page-actions' }, acoes.filter(Boolean))
      : null,
  ]);
}

export function resumoAdministrador(itens) {
  return criarElemento(
    'div',
    { class: 'summary-rail' },
    itens
      .filter(Boolean)
      .map((item) =>
        criarElemento('section', { class: `summary-stat${item.tone ? ` tone-${item.tone}` : ''}` }, [
          criarElemento('div', { class: 'summary-stat-icon', 'aria-hidden': 'true' }, [
            icone(item.icon || 'info', { size: 'sm' }),
          ]),
          criarElemento('div', { class: 'summary-stat-copy' }, [
            criarElemento('span', { class: 'summary-stat-label', text: item.label }),
            criarElemento('strong', { class: 'summary-stat-value', text: String(item.value ?? 0) }),
            item.hint ? criarElemento('span', { class: 'summary-stat-hint', text: item.hint }) : null,
          ]),
        ]),
      ),
  );
}

export function detalhe(rotulo, valor) {
  return criarElemento('div', { class: 'detail-item' }, [
    criarElemento('p', { class: 'detail-label', text: rotulo }),
    criarElemento('p', { class: 'detail-value', text: valor ?? '—' }),
  ]);
}

export function tabelaMembrosEmpresa(empresa, membros, aoConcluir) {
  if (!membros.length) {
    return estadoVazio({
      title: 'Nenhum usuário vinculado',
      description: 'Esta empresa não possui usuários vinculados.',
    });
  }

  return criarElemento('div', { class: 'table-wrap' }, [
    criarElemento('table', {}, [
      criarElemento('thead', {}, [
        criarElemento('tr', {}, [
          criarElemento('th', { text: 'Pessoa' }),
          criarElemento('th', { text: 'Papel' }),
          criarElemento('th', { text: 'Acesso' }),
          criarElemento('th', { text: 'Último acesso' }),
          criarElemento('th', { text: 'Ações' }),
        ]),
      ]),
      criarElemento(
        'tbody',
        {},
        membros.map((membro) =>
          criarElemento('tr', {}, [
            criarElemento('td', {}, [
              criarElemento('div', { class: 'admin-identity' }, [
                criarElemento('span', { class: 'admin-name', text: membro.fullName || '—' }),
                criarElemento('span', { class: 'admin-meta', text: membro.email || 'Sem e-mail' }),
              ]),
            ]),
            criarElemento('td', { text: ROTULO_PAPEL_MEMBRO[membro.role] || membro.role }),
            criarElemento('td', {}, [
              criarElemento('status-pill', {
                status: membro.companyAccessActive && membro.globalAccountActive ? 'active' : 'suspended',
                label: membro.companyAccessActive && membro.globalAccountActive ? 'Ativo' : 'Inativo',
              }),
            ]),
            criarElemento('td', {
              class: 'col-meta',
              text: membro.lastSeenAt ? formatarDadosHora(membro.lastSeenAt) : 'Nunca acessou',
            }),
            criarElemento('td', {}, [
              criarElemento('div', { class: 'member-actions' }, [
                botao({
                  label: 'Alterar senha',
                  size: 'sm',
                  icon: 'key',
                  disabled: !(membro.companyAccessActive && membro.globalAccountActive),
                  title:
                    membro.companyAccessActive && membro.globalAccountActive
                      ? 'Define uma nova senha diretamente no Supabase Auth.'
                      : 'A senha só pode ser alterada quando o usuário está ativo.',
                  onClick: () => abrirAlteracaoSenhaMembro(empresa, membro, aoConcluir),
                }),
                botao({
                  label: 'Excluir',
                  size: 'sm',
                  variant: 'danger',
                  icon: 'trash',
                  onClick: () => excluirMembroEmpresa(empresa, membro, aoConcluir),
                }),
              ]),
            ]),
          ]),
        ),
      ),
    ]),
  ]);
}

export async function carregarComEstado(
  conteudoTela,
  carregador,
  funcaoRenderizacao,
  { skeleton: esqueleto } = {},
) {
  const tokenCarregamento = Symbol('admin-tela');
  conteudoTela.__pnfLoadToken = tokenCarregamento;
  conteudoTela.replaceChildren(esqueleto || tabelaEsqueleto());
  try {
    const dados = await carregador();
    if (conteudoTela.__pnfLoadToken !== tokenCarregamento) return;
    conteudoTela.replaceChildren(funcaoRenderizacao(dados));
  } catch (erro) {
    if (conteudoTela.__pnfLoadToken !== tokenCarregamento) return;
    conteudoTela.replaceChildren(
      estadoErro({
        title: 'Não foi possível carregar',
        description: erro?.message,
        hint: erro?.hint,
        onRetry: () =>
          carregarComEstado(conteudoTela, carregador, funcaoRenderizacao, { skeleton: esqueleto }),
      }),
    );
  }
}

export function barraPaginacao({ page: pagina, pageSize: tamanhoPagina, total, onPage: aoMudarPagina }) {
  const ultimo = Math.max(1, Math.ceil(total / tamanhoPagina));
  return criarElemento('div', { class: 'pagination' }, [
    criarElemento('span', {
      class: 'pagination-info',
      text: total === 0 ? 'Nenhum resultado' : `${total} resultado(s) — página ${pagina} de ${ultimo}`,
    }),
    criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Anterior', disabled: pagina <= 1, onClick: () => aoMudarPagina(pagina - 1) }),
      botao({ label: 'Próxima', disabled: pagina >= ultimo, onClick: () => aoMudarPagina(pagina + 1) }),
    ]),
  ]);
}

export function normalizarTexto(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function barraFiltros({
  searchValue: valorBusca = '',
  searchPlaceholder: textoBusca = 'Buscar…',
  onSearch: aoBuscar,
  fields: campos = [],
  onClear: aoLimpar,
  countText: textoContagem = '',
}) {
  const busca = criarElemento('input', {
    class: 'input',
    type: 'search',
    value: valorBusca,
    placeholder: textoBusca,
    dataset: { listSearch: 'true' },
    onChange: (evento) => aoBuscar?.(evento.target.value),
    onKeydown: (evento) => {
      if (evento.key === 'Enter') aoBuscar?.(evento.target.value);
    },
  });
  const avancado = campos.length
    ? criarElemento('details', { class: 'filter-drawer' }, [
        criarElemento('summary', { class: 'filter-summary' }, [
          icone('filter', { size: 'sm' }),
          criarElemento('span', { text: 'Filtros' }),
        ]),
        criarElemento('div', { class: 'filter-grid' }, campos),
      ])
    : null;
  return criarElemento('div', { class: 'explorer-toolbar' }, [
    criarElemento('div', { class: 'search-box' }, [icone('search', { size: 'sm' }), busca]),
    avancado,
    aoLimpar ? botao({ label: 'Limpar', size: 'sm', onClick: aoLimpar }) : null,
    textoContagem ? criarElemento('span', { class: 'filter-count', text: textoContagem }) : null,
  ]);
}

export function pulsoAdministrador(rotulo, valor, dica, nomeIcone, tom = 'neutral') {
  return criarElemento('section', { class: 'admin-pulse-card', dataset: { tone: tom } }, [
    criarElemento('div', { class: 'admin-pulse-icon' }, [icone(nomeIcone, { size: 'sm' })]),
    criarElemento('div', { class: 'admin-pulse-copy' }, [
      criarElemento('span', { class: 'admin-pulse-label', text: rotulo }),
      criarElemento('strong', { class: 'admin-pulse-value', text: valor }),
      criarElemento('span', { class: 'admin-pulse-hint', text: dica }),
    ]),
  ]);
}

export function legendaGrafico(rotulo, valor, cor) {
  const ponto = criarElemento('i', { class: 'chart-dot' });
  ponto.style.background = cor;
  return criarElemento('div', { class: 'chart-legend-row' }, [
    criarElemento('span', {}, [ponto, rotulo]),
    criarElemento('b', { text: String(valor) }),
  ]);
}

export function contagensResultadoAtividade(itens) {
  const contagens = { success: 0, denied: 0, failure: 0 };
  for (const item of itens) contagens[item.result] = (contagens[item.result] || 0) + 1;
  return [
    { label: 'Concluídas', value: contagens.success || 0, color: 'var(--tema-sucesso)' },
    { label: 'Negadas', value: contagens.denied || 0, color: 'var(--tema-aviso)' },
    { label: 'Falhas', value: contagens.failure || 0, color: 'var(--tema-perigo)' },
  ];
}

export function barrasAdministrador(itens) {
  const maximo = Math.max(1, ...itens.map((itemComparado) => Number(itemComparado.value) || 0));
  return criarElemento(
    'div',
    { class: 'hbars' },
    itens.map((item) => {
      const preencher = criarElemento('i', { class: 'hbar-fill' });
      preencher.style.width = `${Math.max(item.value ? 8 : 0, Math.round(((Number(item.value) || 0) / maximo) * 100))}%`;
      preencher.style.background = item.color;
      return criarElemento('div', { class: 'hbar-row' }, [
        criarElemento('div', { class: 'hbar-meta' }, [
          criarElemento('span', { text: item.label }),
          criarElemento('b', { text: String(item.value) }),
        ]),
        criarElemento('div', { class: 'hbar-track' }, [preencher]),
      ]);
    }),
  );
}

export function colunasAdministrador(itens) {
  const maximo = Math.max(1, ...itens.map((item) => Number(item.value) || 0));
  return criarElemento(
    'div',
    {
      class: 'admin-columns',
      role: 'img',
      'aria-label': itens.map((item) => `${item.label}: ${item.value}`).join(', '),
    },
    itens.map((item) => {
      const preencher = criarElemento('i', { class: 'admin-column-fill' });
      preencher.style.height = `${Math.max(item.value ? 12 : 0, Math.round(((Number(item.value) || 0) / maximo) * 100))}%`;
      preencher.style.background = item.color;
      return criarElemento('div', { class: 'admin-column' }, [
        criarElemento('b', { text: String(item.value) }),
        criarElemento('div', { class: 'admin-column-track' }, [preencher]),
        criarElemento('span', { text: item.label }),
      ]);
    }),
  );
}

export function segmentoCicloVida(estado, rotulo, valor, total) {
  if (!valor) return null;
  const no = criarElemento('span', { class: 'lifecycle-seg', dataset: { state: estado } }, [
    criarElemento('b', { text: String(valor) }),
    criarElemento('span', { text: rotulo }),
  ]);
  no.style.width = `${Math.max(8, (valor / total) * 100)}%`;
  return no;
}

export function marcadorAtividade(resultado) {
  const TONALIDADES = {
    success: 'var(--tema-sucesso)',
    failure: 'var(--tema-perigo)',
    denied: 'var(--tema-aviso)',
  };
  const avancarRelogio = criarElemento('span', { class: 'feed-tick', 'aria-hidden': 'true' });
  avancarRelogio.style.background = TONALIDADES[resultado] || 'var(--tema-violeta)';
  return avancarRelogio;
}

export function rotuloResultado(resultado) {
  const VEICULO = { success: 'concluída', failure: 'falhou', denied: 'negada' };
  return VEICULO[resultado] || String(resultado || '');
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { METADADOS_PAGINAS_ADMINISTRACAO as ADMIN_PAGE_META };
export { carregarComEstado as withState };
export { marcadorAtividade as feedTick };
export { rotuloResultado as resultVerb };
