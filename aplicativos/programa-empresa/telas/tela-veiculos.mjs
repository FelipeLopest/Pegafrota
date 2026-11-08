import {
  el as criarElemento,
  fmt as formatar,
  botao,
  navegar,
  cabecalhoPagina,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

import {
  PERMISSAO,
  ROTULO_STATUS_VEICULO as ROTULO_SITUACAO_VEICULO,
  TIPOS_COMBUSTIVEL_VEICULO,
} from '@peganafrota/contracts';
import {
  tela,
  exploradorColecao,
  tabela,
  faixaResumo,
  contarOnde,
} from '../componentes/listas-resumos-e-detalhes.mjs';
import { abrirEditorVeiculo } from '../formularios/formulario-veiculo.mjs';

export function telaVeiculos({ outlet: conteudoTela, setTitle: definirTitulo }) {
  definirTitulo('Veículos');
  const recarregar = () => telaVeiculos({ outlet: conteudoTela, setTitle: definirTitulo });
  return tela(
    conteudoTela,
    PERMISSAO.VEHICLES_READ,
    () => dados.vehicles.list(),
    (veiculos) => {
      const cabecalho = cabecalhoPagina({
        title: 'Veículos',
        subtitle:
          'Pesquise a frota por qualquer dado e use os filtros para esconder arquivados, separar estados e combustíveis.',
        actions: [
          botao({
            label: 'Importar planilha',
            variant: 'automation',
            icon: 'upload',
            permission: PERMISSAO.VEHICLES_WRITE,
            onClick: () => navegar('/importar?tipo=veiculos'),
          }),
          botao({
            label: 'Novo veículo',
            variant: 'primary',
            icon: 'plus',
            permission: PERMISSAO.VEHICLES_WRITE,
            onClick: () => abrirEditorVeiculo({ onDone: recarregar }),
          }),
        ],
      });
      const marcas = [...new Set(veiculos.map((veiculoItem) => veiculoItem.brand).filter(Boolean))].sort(
        (primeiroItem, segundoItem) => primeiroItem.localeCompare(segundoItem),
      );
      const explorador = exploradorColecao(veiculos, {
        key: 'vehicles',
        placeholder: 'Buscar placa, marca, modelo, cor ou categoria',
        getText: (veiculoItem) =>
          `${veiculoItem.plate} ${veiculoItem.brand} ${veiculoItem.model} ${veiculoItem.color || ''} ${veiculoItem.category || ''}`,
        defaults: { visibility: 'current' },
        filters: [
          {
            key: 'visibility',
            label: 'Visibilidade',
            options: [
              ['current', 'Em cadastro atual'],
              ['archived', 'Somente arquivados'],
              ['', 'Todos'],
            ],
            match: (veiculoItem, valor) =>
              valor === 'current'
                ? !veiculoItem.archived_at
                : valor === 'archived'
                  ? !!veiculoItem.archived_at
                  : true,
          },
          {
            key: 'status',
            label: 'Estado operacional',
            options: [
              ['', 'Todos'],
              ...Object.entries(ROTULO_SITUACAO_VEICULO)
                .filter(([veiculoItem]) => veiculoItem !== 'archived')
                .map(([veiculoItem, linhaItem]) => [veiculoItem, linhaItem]),
            ],
            get: (veiculoItem) => veiculoItem.status,
          },
          {
            key: 'fuel',
            label: 'Combustível',
            options: [
              ['', 'Todos'],
              ...TIPOS_COMBUSTIVEL_VEICULO.map((formulario) => [formulario.value, formulario.label]),
            ],
            get: (veiculoItem) => veiculoItem.fuel_type,
          },
          {
            key: 'brand',
            label: 'Marca',
            options: [['', 'Todas'], ...marcas.map((segundoItem) => [segundoItem, segundoItem])],
            get: (veiculoItem) => veiculoItem.brand,
          },
        ],
        render: (lista) =>
          tabela(
            ['Placa', 'Veículo', 'Odômetro', 'Estado', 'Ações'],
            lista.map((veiculoItem) =>
              criarElemento('tr', {}, [
                criarElemento('td', {}, [
                  criarElemento('button', {
                    class: 'row-link mono',
                    text: formatar.plate(veiculoItem.plate),
                    onClick: () => navegar(`/veiculos/${veiculoItem.id}`),
                  }),
                ]),
                criarElemento('td', {}, [
                  criarElemento('b', { text: `${veiculoItem.brand} ${veiculoItem.model}` }),
                  criarElemento('p', {
                    class: 'muted',
                    text: [veiculoItem.category, veiculoItem.color].filter(Boolean).join(' · '),
                  }),
                ]),
                criarElemento('td', { text: formatar.km(veiculoItem.current_odometer_km) }),
                criarElemento('td', {}, [
                  criarElemento('status-pill', {
                    status: veiculoItem.archived_at ? 'archived' : veiculoItem.status,
                    label: veiculoItem.archived_at
                      ? 'Arquivado'
                      : ROTULO_SITUACAO_VEICULO[veiculoItem.status],
                  }),
                ]),
                criarElemento('td', {}, [
                  botao({
                    label: 'Abrir',
                    variant: 'ghost',
                    onClick: () => navegar(`/veiculos/${veiculoItem.id}`),
                  }),
                ]),
              ]),
            ),
          ),
        pageSize: 50,
      });
      const estatisticas = faixaResumo([
        {
          label: 'Em cadastro',
          value: contarOnde(veiculos, (veiculoItem) => !veiculoItem.archived_at),
          icon: 'truck',
          hint: 'veículos atuais',
        },
        {
          label: 'Disponíveis',
          value: contarOnde(
            veiculos,
            (veiculoItem) => !veiculoItem.archived_at && veiculoItem.status === 'available',
          ),
          icon: 'check',
          tone: 'success',
        },
        {
          label: 'Em operação',
          value: contarOnde(
            veiculos,
            (veiculoItem) => !veiculoItem.archived_at && veiculoItem.status === 'in_use',
          ),
          icon: 'route',
          tone: 'info',
        },
        {
          label: 'Manutenção',
          value: contarOnde(
            veiculos,
            (veiculoItem) => !veiculoItem.archived_at && veiculoItem.status === 'in_maintenance',
          ),
          icon: 'tool',
          tone: 'warning',
        },
        {
          label: 'Arquivados',
          value: contarOnde(veiculos, (veiculoItem) => !!veiculoItem.archived_at),
          icon: 'archive',
          tone: 'muted',
        },
      ]);
      return criarElemento('div', {}, [cabecalho, estatisticas, explorador]);
    },
  );
}
