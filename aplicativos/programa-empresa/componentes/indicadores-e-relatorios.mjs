import {
  el as criarElemento,
  fmt as formatar,
  tabelaEsqueleto,
  estadoErro,
  estadoPermissaoNegada,
  noMembershipState as estadoSemEmpresa,
  barraProporcao,
} from './componentes-do-programa.mjs';

import { icone } from './icones.mjs';

import { protegerRota } from '../acesso/sessao-e-permissoes.mjs';

export async function tela(conteudoTela, permissao, carregador, funcaoRenderizacao, opcoes = {}) {
  const protecao = protegerRota(permissao);
  if (!protecao.allowed) {
    conteudoTela.replaceChildren(
      protecao.reason === 'no_membership'
        ? estadoSemEmpresa()
        : protecao.reason === 'loading'
          ? tabelaEsqueleto()
          : estadoPermissaoNegada(protecao.label),
    );
    return;
  }

  conteudoTela.replaceChildren(opcoes.skeleton || tabelaEsqueleto());
  try {
    const resultado = await carregador();
    conteudoTela.replaceChildren(funcaoRenderizacao(resultado));
  } catch (erro) {
    conteudoTela.replaceChildren(
      estadoErro({
        description: erro?.message,
        hint: erro?.hint,
        onRetry: () => tela(conteudoTela, permissao, carregador, funcaoRenderizacao, opcoes),
      }),
    );
  }
}

export function tabela(cabecalhos, linhas) {
  return criarElemento('div', { class: 'table-wrap' }, [
    criarElemento('table', {}, [
      criarElemento('thead', {}, [
        criarElemento(
          'tr',
          {},
          cabecalhos.map((cabecalhos2) => criarElemento('th', { text: cabecalhos2 })),
        ),
      ]),
      criarElemento('tbody', {}, linhas),
    ]),
  ]);
}

export function cartaoPulso(rotulo, valor, dica, nomeIcone, tom = 'neutral') {
  return criarElemento('section', { class: 'pulse-card', dataset: { tone: tom } }, [
    criarElemento('div', { class: 'pulse-icon', 'aria-hidden': 'true' }, [icone(nomeIcone, { size: 'sm' })]),
    criarElemento('div', { class: 'pulse-copy' }, [
      criarElemento('span', { class: 'pulse-label', text: rotulo }),
      criarElemento('strong', { class: 'pulse-value', text: valor }),
      criarElemento('span', { class: 'pulse-hint', text: dica || '—' }),
    ]),
  ]);
}

export function rotuloSegmento(rotulo, valor, cor, total) {
  const percentual = total ? Math.round((Number(valor) / total) * 100) : 0;
  const ponto = criarElemento('i', { class: 'legend-dot' });
  ponto.style.background = cor;
  return criarElemento('div', { class: 'segment-label' }, [
    criarElemento('span', {}, [ponto, criarElemento('span', { text: rotulo })]),
    criarElemento('b', { text: `${valor} · ${percentual}%` }),
  ]);
}

export function colunasCusto(itens) {
  const maximo = Math.max(1, ...itens.map((item) => Number(item.value) || 0));
  return criarElemento(
    'div',
    {
      class: 'vbars',
      role: 'img',
      'aria-label': itens.map((item) => `${item.label}: ${formatar.money(item.value)}`).join(', '),
    },
    itens.map((item) => {
      const percentual = Math.max(
        item.value ? 12 : 0,
        Math.round(((Number(item.value) || 0) / maximo) * 100),
      );
      const preencher = criarElemento('i', { class: 'vbar-fill' });
      preencher.style.height = `${percentual}%`;
      preencher.style.background = item.color;
      return criarElemento('div', { class: 'vbar-col' }, [
        criarElemento('div', { class: 'vbar-value', text: formatar.money(item.value) }),
        criarElemento('div', { class: 'vbar-track' }, [preencher]),
        criarElemento('div', { class: 'vbar-label', text: item.label }),
      ]);
    }),
  );
}

export function medidorOcupacao({ inside: dentro, outside: fora, neverMoved: nuncaMovidos }) {
  const total = dentro + fora + nuncaMovidos;
  const percentualDentro = total ? Math.round((dentro / total) * 100) : 0;
  return criarElemento('div', { class: 'occupancy' }, [
    criarElemento('div', { class: 'occupancy-head' }, [
      criarElemento('div', {}, [
        criarElemento('strong', { text: `${percentualDentro}%` }),
        criarElemento('span', { text: ' no pátio' }),
      ]),
      criarElemento('span', { class: 'muted', text: `${total} veículo(s) monitorados` }),
    ]),
    barraProporcao([
      { value: dentro, color: 'var(--pnf-sucesso)' },
      { value: fora, color: 'var(--pnf-destaque)' },
      { value: nuncaMovidos, color: 'var(--pnf-neutro)' },
    ]),
  ]);
}

export function miniEstatistica(rotulo, valor, tom) {
  return criarElemento('div', { class: 'presence-mini', dataset: { tone: tom } }, [
    criarElemento('strong', { text: String(valor) }),
    criarElemento('span', { text: rotulo }),
  ]);
}

export function barrasHorizontais(itens) {
  const maximo = Math.max(1, ...itens.map((item) => Number(item.value) || 0));
  return criarElemento(
    'div',
    { class: 'hbars', 'aria-label': 'Comparativo da operação' },
    itens.map((item) => {
      const percentual = Math.max(item.value ? 8 : 0, Math.round(((Number(item.value) || 0) / maximo) * 100));
      const preencher = criarElemento('i', { class: 'hbar-fill' });
      preencher.style.width = `${percentual}%`;
      preencher.style.background = item.color;
      return criarElemento('div', { class: 'hbar-row' }, [
        criarElemento('div', { class: 'hbar-meta' }, [
          criarElemento('span', { text: item.label }),
          criarElemento('b', { text: String(item.value ?? 0) }),
        ]),
        criarElemento('div', { class: 'hbar-track' }, [preencher]),
      ]);
    }),
  );
}

export function linhaAtencao(quantidade, rotulo, cor, metadados, identificador) {
  const quantidadeItem = criarElemento('span', {
    class: 'attn-count',
    dataset: identificador ? { kpi: identificador } : {},
    text: String(quantidade),
  });
  quantidadeItem.style.color = cor;
  return criarElemento('div', { class: 'attn-row' }, [
    quantidadeItem,
    criarElemento('div', {}, [
      criarElemento('p', { class: 'attn-text', text: rotulo }),
      metadados ? criarElemento('p', { class: 'attn-meta', text: metadados }) : null,
    ]),
  ]);
}

export function estatistica(valor, rotulo, identificador) {
  return criarElemento('div', { dataset: identificador ? { kpi: identificador } : {} }, [
    criarElemento('div', { class: 'stat-value', text: valor }),
    criarElemento('p', { class: 'stat-label', text: rotulo }),
  ]);
}

export function estatisticaRapida(rotulo, valor, nomeIcone = 'info') {
  return criarElemento('section', { class: 'summary-stat' }, [
    criarElemento('div', { class: 'summary-stat-icon', 'aria-hidden': 'true' }, [
      icone(nomeIcone, { size: 'sm' }),
    ]),
    criarElemento('div', { class: 'summary-stat-copy' }, [
      criarElemento('span', { class: 'summary-stat-label', text: rotulo }),
      criarElemento('strong', { class: 'summary-stat-value', text: String(valor ?? '—') }),
    ]),
  ]);
}

export const ORIGENS_ODOMETRO = {
  vehicle_registration: 'Cadastro',
  trip_completion: 'Viagem',
  fueling: 'Abastecimento',
  maintenance_completion: 'Manutenção',
  manual_adjustment: 'Ajuste manual',
};

/**
 * Rótulos das colunas dos relatórios.
 *
 * A lista anterior cobria menos da metade das colunas que o banco devolve — o
 * resto caía no fallback e aparecia como "Fuel cost" ou "Current odometer km",
 * meio em inglês, meio traduzido. Aqui estão todas as colunas dos quatro
 * relatórios, conferidas contra as funções do banco.
 */
export const ROTULO_COLUNA = {
  // Identificação
  vehicle_id: 'Veículo',
  plate: 'Placa',
  brand: 'Marca',
  model: 'Modelo',
  status: 'Estado',
  driver_id: 'Motorista',
  driver_name: 'Motorista',
  location_id: 'Local',
  location_name: 'Local',

  // Período
  month: 'Mês',
  occurred_at: 'Data e hora',
  scheduled_for: 'Agendada para',
  completed_at: 'Concluída em',
  fueled_at: 'Data do abastecimento',
  days_remaining: 'Dias restantes',
  days_overdue: 'Dias em atraso',

  // Custos
  total_cost: 'Custo total',
  fuel_cost: 'Combustível',
  maintenance_cost: 'Manutenção',
  cost_per_km: 'Custo por km',
  total_amount: 'Valor total',
  price_per_liter: 'Valor por litro',

  // Operação
  liters: 'Litros',
  distance_km: 'Distância',
  current_odometer_km: 'Odômetro atual',
  odometer_km: 'Odômetro',
  movement_type: 'Tipo',
  maintenance_type: 'Tipo de manutenção',
  description: 'Descrição',
  supplier_name: 'Fornecedor',
  invoice_number: 'Nota fiscal',
  source: 'Origem',
  notes: 'Observação',
  trips: 'Viagens',
  fuelings: 'Abastecimentos',
  maintenances: 'Manutenções',
  movements: 'Movimentações',
};

/** Valores de coluna que são código e precisam de rótulo em português. */
export const ROTULO_VALOR = {
  // movement_type
  entry: 'Entrada',
  exit: 'Saída',
  // status de veículo
  available: 'Disponível',
  in_use: 'Em uso',
  in_maintenance: 'Em manutenção',
  inactive: 'Inativo',
  archived: 'Arquivado',
  // maintenance_type e status
  preventive: 'Preventiva',
  corrective: 'Corretiva',
  scheduled: 'Agendada',
  in_progress: 'Em execução',
  completed: 'Concluída',
  cancelled: 'Cancelada',
  // origem
  manual: 'Manual',
  ocr: 'Câmera',
  // combustível
  diesel_s10: 'Diesel S10',
  diesel_s500: 'Diesel S500',
  gasoline: 'Gasolina',
  ethanol: 'Etanol',
  cng: 'GNV',
  flex: 'Flex',
  electric: 'Elétrico',
};

export function humanizarColuna(nome) {
  if (ROTULO_COLUNA[nome]) return ROTULO_COLUNA[nome];
  // Fallback legível: troca sublinhado por espaço e sobe a primeira letra.
  // Colunas novas aparecem aceitáveis até alguém as rotular aqui.
  return String(nome)
    .replace(/_/g, ' ')
    .replace(/^./, (registro) => registro.toUpperCase());
}

/**
 * Formata o valor de uma célula conforme o significado da coluna.
 *
 * Sem isso, custo saía como `1234.5` em vez de `R$ 1.234,50`, data como
 * `2026-08-06T13:22:00Z`, e código interno como `in_maintenance`. O relatório
 * ficava tecnicamente certo e impossível de entregar para alguém.
 */
export function formatarCelula(veiculoItem, coluna) {
  if (veiculoItem == null || veiculoItem === '') return '—';
  if (typeof veiculoItem === 'object') return JSON.stringify(veiculoItem);

  const nome = String(coluna || '');

  // Dinheiro
  if (/(cost|amount|price|valor)/.test(nome) && !/per_km/.test(nome)) {
    const quantidadeItem = Number(veiculoItem);
    if (Number.isFinite(quantidadeItem)) return formatar.money(quantidadeItem);
  }
  // Custo por km tem mais casas: arredondar para centavo esconderia a diferença
  // entre veículos parecidos.
  if (nome === 'cost_per_km') {
    const quantidadeItem = Number(veiculoItem);
    if (Number.isFinite(quantidadeItem)) {
      return `R$ ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(quantidadeItem)}`;
    }
  }
  // Distância e odômetro
  if (/(distance|odometer)/.test(nome)) {
    const quantidadeItem = Number(veiculoItem);
    if (Number.isFinite(quantidadeItem)) return formatar.km(quantidadeItem);
  }
  // Litros
  if (nome === 'liters') {
    const quantidadeItem = Number(veiculoItem);
    if (Number.isFinite(quantidadeItem)) return formatar.liters(quantidadeItem);
  }
  // Mês no formato aaaa-mm
  if (nome === 'month' && /^\d{4}-\d{2}$/.test(String(veiculoItem))) {
    const [ano, mes] = String(veiculoItem).split('-');
    const MESES = [
      'janeiro',
      'fevereiro',
      'março',
      'abril',
      'maio',
      'junho',
      'julho',
      'agosto',
      'setembro',
      'outubro',
      'novembro',
      'dezembro',
    ];
    return `${MESES[Number(mes) - 1] || mes} de ${ano}`;
  }
  // Datas
  if (typeof veiculoItem === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(veiculoItem))
    return formatar.dateTime(veiculoItem);
  if (typeof veiculoItem === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(veiculoItem))
    return formatar.date(veiculoItem);

  // Código interno com rótulo conhecido
  if (typeof veiculoItem === 'string' && ROTULO_VALOR[veiculoItem]) return ROTULO_VALOR[veiculoItem];

  return String(veiculoItem);
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { ORIGENS_ODOMETRO as ODOMETER_SOURCE };
