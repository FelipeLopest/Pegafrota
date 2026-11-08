import {
  el as criarElemento,
  fmt as formatar,
  campo,
  botao,
  modal,
  notificacao,
  tabelaEsqueleto,
  estadoVazio,
  estadoErro,
  estadoPermissaoNegada,
  noMembershipState as estadoSemEmpresa,
} from './componentes-do-programa.mjs';

import { icone } from './icones.mjs';

import { contexto, protegerRota } from '../acesso/sessao-e-permissoes.mjs';

import { ROTULO_PAPEL_VINCULO } from '@peganafrota/contracts';

export async function tela(conteudoTela, permissao, carregador, funcaoRenderizacao) {
  const tokenCarregamento = Symbol('tela');
  conteudoTela.__pnfLoadToken = tokenCarregamento;
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
  conteudoTela.replaceChildren(tabelaEsqueleto());
  try {
    const resultado = await carregador();
    if (conteudoTela.__pnfLoadToken !== tokenCarregamento) return;
    conteudoTela.replaceChildren(funcaoRenderizacao(resultado));
  } catch (erro) {
    if (conteudoTela.__pnfLoadToken !== tokenCarregamento) return;
    conteudoTela.replaceChildren(
      estadoErro({
        description: erro?.message,
        hint: erro?.hint,
        onRetry: () => tela(conteudoTela, permissao, carregador, funcaoRenderizacao),
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

export function detalhe(rotulo, valor) {
  return criarElemento('div', {}, [
    criarElemento('p', { class: 'detail-label', text: rotulo }),
    criarElemento('p', { class: 'detail-value', text: valor ?? '—' }),
  ]);
}

export function indice(lista) {
  return new Map((lista || []).map((itemComparado) => [itemComparado.id, itemComparado]));
}

export function rotuloPapel(papel) {
  return ROTULO_PAPEL_VINCULO[papel] || papel;
}

export function situacaoMotorista(dadosRegistro) {
  return dadosRegistro.archived_at ? 'archived' : dadosRegistro.active ? 'active' : 'inactive';
}

export function rotuloSituacaoMotorista(dadosRegistro) {
  return { archived: 'Arquivado', active: 'Ativo', inactive: 'Inativo' }[situacaoMotorista(dadosRegistro)];
}

export function veiculosAtivos(lista) {
  return lista.filter(
    (veiculoItem) => !veiculoItem.archived_at && !['archived', 'inactive'].includes(veiculoItem.status),
  );
}

export function somenteMotoristasElegiveis(lista) {
  return lista.filter((dadosRegistro) => dadosRegistro.active && !dadosRegistro.archived_at);
}

export function paginador(itens, renderizarPagina, { pageSize: tamanhoPagina = 100 } = {}) {
  const conteiner = criarElemento('div', {});
  let pagina = 1;
  const desenhar = () => {
    const totalPaginas = Math.max(1, Math.ceil(itens.length / tamanhoPagina));
    pagina = Math.min(pagina, totalPaginas);
    const inicio = (pagina - 1) * tamanhoPagina;
    const itensPagina = itens.slice(inicio, inicio + tamanhoPagina);
    const conteudo = renderizarPagina(itensPagina);
    if (itens.length <= tamanhoPagina) {
      conteiner.replaceChildren(conteudo);
      return;
    }
    conteiner.replaceChildren(
      conteudo,
      criarElemento('div', { class: 'pagination' }, [
        botao({
          label: 'Anterior',
          variant: 'ghost',
          disabled: pagina <= 1,
          onClick: () => {
            pagina -= 1;
            desenhar();
          },
        }),
        criarElemento('span', {
          class: 'pagination-info',
          text: `Página ${pagina} de ${totalPaginas} · ${itens.length} registros`,
        }),
        botao({
          label: 'Próxima',
          variant: 'ghost',
          disabled: pagina >= totalPaginas,
          onClick: () => {
            pagina += 1;
            desenhar();
          },
        }),
      ]),
    );
  };
  desenhar();
  return conteiner;
}

export function normalizarTexto(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function diasAtras(iso) {
  if (!iso) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

export function exploradorColecao(
  itens,
  {
    key: chave,
    placeholder: textoExemplo = 'Buscar…',
    getText: obterTexto,
    filters: filtros = [],
    render: renderizar,
    pageSize: tamanhoPagina = 50,
    defaults: padroes = {},
    emptyTitle: vazioTitulo = 'Nenhum resultado',
    emptyDescription: vazioDescricao = 'Ajuste os filtros para ampliar a busca.',
  },
) {
  const armazenamentoChave = `pnf.filters.${chave}`;
  let restaurado = {};
  try {
    restaurado = JSON.parse(sessionStorage.getItem(armazenamentoChave) || '{}');
  } catch {
    restaurado = {};
  }
  const estado = { q: '', ...padroes, ...restaurado };
  estado.q = '';

  const conteiner = criarElemento('div', { class: 'explorer' });
  const resultadoConteiner = criarElemento('div', {});
  let buscaTemporizador = null;
  const quantidade = criarElemento('span', { class: 'filter-count' });
  const seloAtivo = criarElemento('span', { class: 'filter-active-badge', hidden: true });
  const detalhes = criarElemento('details', { class: 'filter-drawer' });

  const persistir = () => {
    const salvo = { ...estado };
    delete salvo.q;
    try {
      sessionStorage.setItem(armazenamentoChave, JSON.stringify(salvo));
    } catch {
      /* storage opcional */
    }
  };

  const ehPadrao = (formulario) =>
    String(estado[formulario.key] ?? '') === String(padroes[formulario.key] ?? formulario.default ?? '');
  const quantidadeAtivos = () => filtros.filter((formulario) => !ehPadrao(formulario)).length;

  const desenhar = () => {
    persistir();
    const buscaAtual = normalizarTexto(estado.q);
    let filtrados = itens.filter((item) => {
      if (buscaAtual && !normalizarTexto(obterTexto(item)).includes(buscaAtual)) return false;
      return filtros.every((formulario) => {
        const valor = estado[formulario.key] ?? padroes[formulario.key] ?? formulario.default ?? '';
        if (formulario.match) return formulario.match(item, valor);
        if (valor === '' || valor == null) return true;
        const atual = formulario.get ? formulario.get(item) : item?.[formulario.key];
        return String(atual ?? '') === String(valor);
      });
    });
    quantidade.textContent = `${filtrados.length} de ${itens.length} registro${itens.length === 1 ? '' : 's'}`;
    const quantidadeItem = quantidadeAtivos();
    seloAtivo.hidden = quantidadeItem === 0;
    seloAtivo.textContent = quantidadeItem
      ? `${quantidadeItem} filtro${quantidadeItem === 1 ? '' : 's'} ativo${quantidadeItem === 1 ? '' : 's'}`
      : '';
    resultadoConteiner.replaceChildren(
      filtrados.length
        ? paginador(filtrados, renderizar, { pageSize: tamanhoPagina })
        : estadoVazio({ title: vazioTitulo, description: vazioDescricao, icon: 'search' }),
    );
  };

  const busca = criarElemento('input', {
    class: 'input explorer-search',
    type: 'search',
    placeholder: textoExemplo,
    dataset: { listSearch: 'true' },
    onInput: (evento) => {
      estado.q = evento.target.value;
      clearTimeout(buscaTemporizador);
      buscaTemporizador = setTimeout(desenhar, 90);
    },
  });

  const redefinir = () => {
    estado.q = '';
    busca.value = '';
    for (const formulario of filtros)
      estado[formulario.key] = padroes[formulario.key] ?? formulario.default ?? '';
    controles.forEach(({ def: definicao, node: no }) => {
      no.value = estado[definicao.key] ?? '';
    });
    desenhar();
  };

  const controles = filtros.map((formulario, indiceItem) => {
    const no = criarElemento(
      'select',
      {
        class: 'select',
        id: `flt-${chave}-${indiceItem}`,
        onChange: (evento) => {
          estado[formulario.key] = evento.target.value;
          desenhar();
        },
      },
      (formulario.options || []).map(([valor, rotulo]) =>
        criarElemento('option', {
          value: valor,
          text: rotulo,
          selected:
            String(valor) ===
            String(estado[formulario.key] ?? padroes[formulario.key] ?? formulario.default ?? ''),
        }),
      ),
    );
    return { def: formulario, node: no };
  });

  detalhes.append(
    criarElemento('summary', { class: 'filter-summary' }, [
      icone('filter', { size: 'sm' }),
      criarElemento('span', { text: 'Filtros' }),
      seloAtivo,
    ]),
    criarElemento(
      'div',
      { class: 'filter-grid' },
      controles.map(({ def: definicao, node: no }) =>
        campo({
          id: no.id,
          label: definicao.label,
          hint: definicao.hint || '',
          control: no,
        }),
      ),
    ),
  );

  conteiner.append(
    criarElemento('div', { class: 'explorer-toolbar' }, [
      criarElemento('div', { class: 'search-box' }, [icone('search', { size: 'sm' }), busca]),
      detalhes,
      botao({ label: 'Limpar', variant: 'ghost', size: 'sm', icon: 'close', onClick: redefinir }),
      quantidade,
    ]),
    resultadoConteiner,
  );
  desenhar();
  return conteiner;
}

export function correspondenciaPeriodo(iso, valor) {
  if (!valor) return true;
  const idade = diasAtras(iso);
  if (valor === 'today') return chaveDiaLocal(iso) === chaveDiaLocal(new Date().toISOString());
  if (valor === '7d') return idade >= 0 && idade <= 7;
  if (valor === '30d') return idade >= 0 && idade <= 30;
  if (valor === '90d') return idade >= 0 && idade <= 90;
  if (valor === 'older') return idade > 90;
  return true;
}

export function solicitarTexto({
  title: titulo,
  label: rotulo,
  hint: dica = '',
  confirmLabel: confirmarRotulo = 'Confirmar',
  danger: perigoso = false,
  required: obrigatorio = true,
}) {
  return new Promise((resolver) => {
    let valor = '';
    let resolvido = false;
    const finalizar = (resultado) => {
      if (resolvido) return;
      resolvido = true;
      resolver(resultado);
    };
    let correspondenciaItem;
    const entrada = criarElemento('textarea', {
      class: 'textarea',
      rows: '3',
      onInput: (evento) => {
        valor = evento.target.value;
      },
    });
    correspondenciaItem = modal({
      title: titulo,
      body: campo({
        id: `ask-${Math.random().toString(36).slice(2)}`,
        label: rotulo,
        hint: dica,
        required: obrigatorio,
        control: entrada,
      }),
      footer: criarElemento('div', { class: 'modal-actions' }, [
        botao({ label: 'Cancelar', onClick: () => correspondenciaItem.close(null) }),
        botao({
          label: confirmarRotulo,
          variant: perigoso ? 'danger' : 'primary',
          onClick: () => {
            const limpos = valor.trim();
            if (obrigatorio && !limpos) {
              notificacao(`Informe ${rotulo.toLowerCase()}.`, { tone: 'warning' });
              entrada.focus();
              return;
            }
            correspondenciaItem.close(limpos || null);
          },
        }),
      ]),
      onClose: (resultado) => finalizar(typeof resultado === 'string' ? resultado : null),
    });
  });
}

export function chaveDiaLocal(iso, fusoHorario = contexto.data?.company?.timezone || 'America/Sao_Paulo') {
  if (!iso) return '';
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: fusoHorario,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const objetoItem = Object.fromEntries(
    partes.map((parametroItem) => [parametroItem.type, parametroItem.value]),
  );
  return `${objetoItem.year}-${objetoItem.month}-${objetoItem.day}`;
}

export function empresaLocalParaIso(
  valor,
  fusoHorario = contexto.data?.company?.timezone || 'America/Sao_Paulo',
) {
  if (!valor) return '';
  const correspondencia = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(valor);
  if (!correspondencia) return new Date(valor).toISOString();
  const [, outroItemComparado, mesAtual, dadosRegistro, cabecalhos2, indiceManutencao, segundos = '0'] =
    correspondencia;
  const desejado = Date.UTC(
    +outroItemComparado,
    +mesAtual - 1,
    +dadosRegistro,
    +cabecalhos2,
    +indiceManutencao,
    +segundos,
  );
  let palpite = desejado;
  const partesFormatadas = new Intl.DateTimeFormat('en-CA', {
    timeZone: fusoHorario,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let indiceItem = 0; indiceItem < 3; indiceItem += 1) {
    const partes = Object.fromEntries(
      partesFormatadas
        .formatToParts(new Date(palpite))
        .map((parametroItem) => [parametroItem.type, parametroItem.value]),
    );
    const exibido = Date.UTC(
      +partes.year,
      +partes.month - 1,
      +partes.day,
      +partes.hour,
      +partes.minute,
      +partes.second,
    );
    palpite += desejado - exibido;
  }
  return new Date(palpite).toISOString();
}

export function indicadorSimples(rotulo, valor, subparte) {
  return criarElemento('section', { class: 'card kpi-card' }, [
    criarElemento('p', { class: 'detail-label', text: rotulo }),
    criarElemento('p', { class: 'metric', text: String(valor) }),
    criarElemento('p', { class: 'muted', text: subparte }),
  ]);
}

export function faixaResumo(itens) {
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

export function contarOnde(lista, funcao) {
  return (lista || []).reduce((quantidadeItem, item) => quantidadeItem + (funcao(item) ? 1 : 0), 0);
}

/**
 * Linha da tabela "Atividade recente" do detalhe do veículo.
 *
 * Estava sendo chamada como `atividade()` sem existir neste módulo — só havia
 * uma cópia em `v8.mjs`, que não é importado. O resultado era
 * "atividade is not defined" ao abrir qualquer veículo.
 *
 * O `data-ts` guarda o horário para a ordenação por data que vem depois; sem
 * ele, a mistura de viagens, manutenções e abastecimentos sairia agrupada por
 * tipo em vez de cronológica.
 */
export function linhaAtividade(tipo, quando, textoDetalhe) {
  return criarElemento('tr', { dataset: { ts: quando || '' } }, [
    criarElemento('td', { text: tipo }),
    criarElemento('td', { text: formatar.dateTime(quando) }),
    criarElemento('td', { text: textoDetalhe }),
  ]);
}

export function cartaoResumo(rotulo, quantidadeItem, ultimo) {
  return criarElemento('section', { class: 'card mini-card' }, [
    criarElemento('p', { class: 'detail-label', text: rotulo }),
    criarElemento('p', { class: 'metric', text: String(quantidadeItem) }),
    criarElemento('p', {
      class: 'muted',
      text: ultimo ? `Último: ${formatar.dateTime(ultimo)}` : 'Sem registros',
    }),
  ]);
}

export const ROTULOS_ACAO = {
  insert: 'criou',
  update: 'alterou',
  delete: 'removeu',
  archive: 'arquivou',
  unarchive: 'desarquivou',
  execute: 'executou',
};

export const ROTULOS_ENTIDADE = {
  'public.vehicles': 'veículo',
  'public.drivers': 'motorista',
  'public.trips': 'viagem',
  'public.fuelings': 'abastecimento',
  'public.maintenance_records': 'manutenção',
  'public.locations': 'local',
  'public.companies': 'empresa',
  'public.company_memberships': 'acesso de usuário',
};

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { ROTULOS_ACAO as ACTION_LABEL };
export { ROTULOS_ENTIDADE as ENTITY_LABEL };
