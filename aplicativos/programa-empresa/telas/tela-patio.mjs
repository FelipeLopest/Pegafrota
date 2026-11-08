import {
  el as criarElemento,
  fmt as formatar,
  botao,
  estadoVazio,
  cabecalhoPagina,
  cartao,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

import { icone } from '../componentes/icones.mjs';

import { PERMISSAO } from '@peganafrota/contracts';
import {
  tela,
  indice,
  indicadorSimples,
  exploradorColecao,
  tabela,
} from '../componentes/listas-resumos-e-detalhes.mjs';
import { abrirModalMovimentacaoV8 as abrirFormularioMovimentacao } from '../formularios/formulario-movimentacao.mjs';

export function telaPatio({ outlet: conteudoTela, setTitle: definirTitulo }) {
  definirTitulo('Pátio');
  const recarregar = () => telaPatio({ outlet: conteudoTela, setTitle: definirTitulo });
  return tela(
    conteudoTela,
    PERMISSAO.MOVEMENTS_READ,
    async () => {
      const [captura, movimentacoes, locais] = await Promise.all([
        dados.yard(),
        dados.movements.recent(60),
        dados.locations.eligible(),
      ]);
      return { snap: captura, moves: movimentacoes, locations: locais };
    },
    ({ snap: captura, moves: movimentacoes, locations: locais }) => {
      const linhaItem = indice(locais);
      const listaVeiculos = captura?.vehicles || [];
      const cabecalho = cabecalhoPagina({
        title: 'Pátio',
        subtitle:
          'Localize rapidamente um veículo, filtre por presença e registre a próxima entrada ou saída.',
        actions: [
          botao({
            label: 'Registrar entrada/saída',
            variant: 'primary',
            icon: 'plus',
            permission: PERMISSAO.MOVEMENTS_WRITE,
            onClick: () =>
              abrirFormularioMovimentacao({ vehicles: listaVeiculos, locations: locais, onDone: recarregar }),
          }),
        ],
      });
      const indicadores = criarElemento('div', { class: 'kpi-grid' }, [
        indicadorSimples('No pátio', captura?.inside ?? 0, 'veículos dentro'),
        indicadorSimples('Fora do pátio', captura?.outside ?? 0, 'veículos fora'),
        indicadorSimples(
          'Entradas hoje',
          captura?.entriesToday ?? 0,
          `dia local · ${captura?.timezone || ''}`,
        ),
        indicadorSimples('Saídas hoje', captura?.exitsToday ?? 0, 'movimentos registrados'),
      ]);
      const presenca = exploradorColecao(listaVeiculos, {
        key: 'yard',
        placeholder: 'Buscar placa, marca ou modelo',
        getText: (veiculoItem) =>
          `${veiculoItem.plate} ${veiculoItem.brand || ''} ${veiculoItem.model || ''}`,
        filters: [
          {
            key: 'presence',
            label: 'Presença',
            default: '',
            options: [
              ['', 'Todos'],
              ['inside', 'No pátio'],
              ['outside', 'Fora do pátio'],
              ['unknown', 'Sem histórico'],
            ],
            get: (veiculoItem) => veiculoItem.presence || 'unknown',
          },
        ],
        render: (itens) =>
          tabela(
            ['Veículo', 'Modelo', 'Situação', 'Última mudança', 'Ação'],
            itens.map((veiculoItem) =>
              criarElemento('tr', {}, [
                criarElemento('td', { class: 'mono', text: formatar.plate(veiculoItem.plate) }),
                criarElemento('td', { text: `${veiculoItem.brand || ''} ${veiculoItem.model || ''}`.trim() }),
                criarElemento('td', {}, [
                  criarElemento('status-pill', {
                    status:
                      veiculoItem.presence === 'inside'
                        ? 'active'
                        : veiculoItem.presence === 'outside'
                          ? 'inactive'
                          : 'planned',
                    label:
                      veiculoItem.presence === 'inside'
                        ? 'No pátio'
                        : veiculoItem.presence === 'outside'
                          ? 'Fora do pátio'
                          : 'Sem histórico',
                  }),
                ]),
                criarElemento('td', {
                  text: veiculoItem.occurredAt ? formatar.dateTime(veiculoItem.occurredAt) : '—',
                }),
                criarElemento('td', {}, [
                  botao({
                    label: veiculoItem.presence === 'inside' ? 'Registrar saída' : 'Registrar entrada',
                    variant: 'ghost',
                    permission: PERMISSAO.MOVEMENTS_WRITE,
                    onClick: () =>
                      abrirFormularioMovimentacao({
                        vehicle: veiculoItem,
                        vehicles: listaVeiculos,
                        locations: locais,
                        onDone: recarregar,
                      }),
                  }),
                ]),
              ]),
            ),
          ),
        pageSize: 40,
      });
      const recentes = movimentacoes.slice(0, 60).map((correspondenciaItem) =>
        criarElemento('tr', {}, [
          criarElemento('td', { text: formatar.dateTime(correspondenciaItem.occurred_at) }),
          criarElemento('td', {
            class: 'mono',
            text: formatar.plate(
              listaVeiculos.find((veiculoItem) => veiculoItem.id === correspondenciaItem.vehicle_id)?.plate,
            ),
          }),
          criarElemento('td', {
            text: correspondenciaItem.movement_type === 'entry' ? 'Entrada' : 'Saída',
          }),
          criarElemento('td', { text: linhaItem.get(correspondenciaItem.location_id)?.name || '—' }),
          criarElemento('td', { text: correspondenciaItem.notes || '—' }),
        ]),
      );
      return criarElemento('div', {}, [
        cabecalho,
        indicadores,
        cartao({ title: 'Presença atual', children: [presenca] }),
        criarElemento('details', { class: 'collapsible-section' }, [
          criarElemento('summary', {}, [
            icone('clock', { size: 'sm' }),
            criarElemento('span', { text: `Movimentações recentes · ${Math.min(movimentacoes.length, 60)}` }),
          ]),
          recentes.length
            ? tabela(['Quando', 'Veículo', 'Tipo', 'Local', 'Observação'], recentes)
            : estadoVazio({ title: 'Sem movimentações', description: 'Registre a primeira entrada.' }),
        ]),
      ]);
    },
  );
}
