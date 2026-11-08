import {
  el as criarElemento,
  fmt as formatar,
  botao,
  navegar,
  cabecalhoPagina,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

import { PERMISSAO } from '@peganafrota/contracts';
import {
  tela,
  indice,
  exploradorColecao,
  correspondenciaPeriodo,
  tabela,
  contarOnde,
  faixaResumo,
} from '../componentes/listas-resumos-e-detalhes.mjs';

export function telaMovimentacoes({ outlet: conteudoTela, setTitle: definirTitulo }) {
  definirTitulo('Histórico de movimentações');
  return tela(
    conteudoTela,
    PERMISSAO.MOVEMENTS_READ,
    async () => {
      const [movimentacoes, veiculos, locais] = await Promise.all([
        dados.movements.list(),
        dados.vehicles.list(),
        dados.locations.list(),
      ]);
      return { moves: movimentacoes, vehicles: veiculos, locations: locais };
    },
    ({ moves: movimentacoes, vehicles: veiculos, locations: locais }) => {
      const indiceVeiculo = indice(veiculos),
        itemLista = indice(locais);
      const explorador = exploradorColecao(movimentacoes, {
        key: 'movements',
        placeholder: 'Buscar placa, local ou observação',
        getText: (correspondenciaItem) =>
          `${indiceVeiculo.get(correspondenciaItem.vehicle_id)?.plate || ''} ${itemLista.get(correspondenciaItem.location_id)?.name || ''} ${correspondenciaItem.notes || ''}`,
        filters: [
          {
            key: 'type',
            label: 'Movimento',
            options: [
              ['', 'Entradas e saídas'],
              ['entry', 'Entradas'],
              ['exit', 'Saídas'],
            ],
            get: (correspondenciaItem) => correspondenciaItem.movement_type,
          },
          {
            key: 'period',
            label: 'Período',
            options: [
              ['', 'Todo o histórico'],
              ['today', 'Hoje'],
              ['7d', 'Últimos 7 dias'],
              ['30d', 'Últimos 30 dias'],
              ['90d', 'Últimos 90 dias'],
              ['older', 'Mais de 90 dias'],
            ],
            match: (correspondenciaItem, veiculoItem) =>
              correspondenciaPeriodo(correspondenciaItem.occurred_at, veiculoItem),
          },
          {
            key: 'location',
            label: 'Local',
            options: [['', 'Todos'], ...locais.map((linhaItem) => [linhaItem.id, linhaItem.name])],
            get: (correspondenciaItem) => correspondenciaItem.location_id,
          },
          {
            key: 'vehicle',
            label: 'Veículo',
            options: [
              ['', 'Todos'],
              ...veiculos.map((veiculoItem) => [veiculoItem.id, formatar.plate(veiculoItem.plate)]),
            ],
            get: (correspondenciaItem) => correspondenciaItem.vehicle_id,
          },
        ],
        render: (itens) =>
          tabela(
            ['Quando', 'Veículo', 'Movimento', 'Local', 'Observação'],
            itens.map((correspondenciaItem) =>
              criarElemento('tr', {}, [
                criarElemento('td', { text: formatar.dateTime(correspondenciaItem.occurred_at) }),
                criarElemento('td', {
                  class: 'mono',
                  text: formatar.plate(indiceVeiculo.get(correspondenciaItem.vehicle_id)?.plate),
                }),
                criarElemento('td', {
                  text: correspondenciaItem.movement_type === 'entry' ? 'Entrada' : 'Saída',
                }),
                criarElemento('td', { text: itemLista.get(correspondenciaItem.location_id)?.name || '—' }),
                criarElemento('td', { text: correspondenciaItem.notes || '—' }),
              ]),
            ),
          ),
        pageSize: 75,
      });
      const hoje = contarOnde(movimentacoes, (correspondenciaItem) =>
        correspondenciaPeriodo(correspondenciaItem.occurred_at, 'today'),
      );
      const estatisticas = faixaResumo([
        {
          label: 'Entradas',
          value: contarOnde(
            movimentacoes,
            (correspondenciaItem) => correspondenciaItem.movement_type === 'entry',
          ),
          icon: 'down',
          tone: 'success',
        },
        {
          label: 'Saídas',
          value: contarOnde(
            movimentacoes,
            (correspondenciaItem) => correspondenciaItem.movement_type === 'exit',
          ),
          icon: 'up',
          tone: 'info',
        },
        { label: 'Hoje', value: hoje, icon: 'clock', tone: 'warning' },
        {
          label: 'Veículos movimentados',
          value: new Set(movimentacoes.map((correspondenciaItem) => correspondenciaItem.vehicle_id)).size,
          icon: 'truck',
        },
      ]);
      return criarElemento('div', {}, [
        cabecalhoPagina({
          title: 'Histórico de movimentações',
          subtitle:
            'Filtre entradas e saídas por período, veículo e local. Para registrar um movimento, use a tela Pátio.',
          actions: [
            botao({
              label: 'Ir para o Pátio',
              variant: 'primary',
              icon: 'yard',
              onClick: () => navegar('/patio'),
            }),
          ],
        }),
        estatisticas,
        explorador,
      ]);
    },
  );
}
