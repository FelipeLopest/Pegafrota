import {
  el as criarElemento,
  fmt as formatar,
  botao,
  notificacao,
  navegar,
  cabecalhoPagina,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

import { PERMISSAO, ROTULO_STATUS_VIAGEM as ROTULO_SITUACAO_VIAGEM } from '@peganafrota/contracts';
import {
  tela,
  indice,
  veiculosAtivos,
  somenteMotoristasElegiveis,
  exploradorColecao,
  correspondenciaPeriodo,
  tabela,
  solicitarTexto,
  faixaResumo,
  contarOnde,
} from '../componentes/listas-resumos-e-detalhes.mjs';
import { abrirModalViagemV8 as abrirFormularioViagem } from '../formularios/formulario-viagem.mjs';
import { solicitarOdometro } from '../formularios/formulario-informar-odometro.mjs';

export function telaViagens({ outlet: conteudoTela, setTitle: definirTitulo }) {
  definirTitulo('Viagens');
  const recarregar = () => telaViagens({ outlet: conteudoTela, setTitle: definirTitulo });
  return tela(
    conteudoTela,
    PERMISSAO.TRIPS_READ,
    async () => {
      const [viagens, veiculos, motoristas] = await Promise.all([
        dados.trips.list(),
        dados.vehicles.list(),
        dados.drivers.list(),
      ]);
      return { trips: viagens, vehicles: veiculos, drivers: motoristas };
    },
    ({ trips: viagens, vehicles: veiculos, drivers: motoristas }) => {
      const indiceVeiculo = indice(veiculos),
        indiceDestino = indice(motoristas);
      const cabecalho = cabecalhoPagina({
        title: 'Viagens',
        subtitle:
          'Busque por rota, placa ou motorista. Os filtros ajudam a separar o que está em andamento do histórico.',
        actions: [
          botao({
            label: 'Importar planilha',
            variant: 'automation',
            icon: 'upload',
            permission: PERMISSAO.TRIPS_WRITE,
            onClick: () => navegar('/importar?tipo=viagens'),
          }),
          botao({
            label: 'Nova viagem',
            variant: 'primary',
            icon: 'plus',
            permission: PERMISSAO.TRIPS_WRITE,
            onClick: () =>
              abrirFormularioViagem({
                vehicles: veiculosAtivos(veiculos).filter(
                  (veiculoItem) => veiculoItem.status === 'available',
                ),
                drivers: somenteMotoristasElegiveis(motoristas),
                onDone: recarregar,
              }),
          }),
        ],
      });
      const explorador = exploradorColecao(viagens, {
        key: 'trips',
        placeholder: 'Buscar origem, destino, placa ou motorista',
        getText: (itemAtual) =>
          `${itemAtual.origin_label} ${itemAtual.destination_label} ${indiceVeiculo.get(itemAtual.vehicle_id)?.plate || ''} ${indiceDestino.get(itemAtual.driver_id)?.full_name || ''}`,
        filters: [
          {
            key: 'status',
            label: 'Estado',
            options: [
              ['', 'Todos'],
              ...Object.entries(ROTULO_SITUACAO_VIAGEM).map(([veiculoItem, linhaItem]) => [
                veiculoItem,
                linhaItem,
              ]),
            ],
            get: (itemAtual) => itemAtual.status,
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
            match: (itemAtual, veiculoItem) =>
              correspondenciaPeriodo(
                itemAtual.actual_departure_at || itemAtual.planned_departure_at,
                veiculoItem,
              ),
          },
          {
            key: 'vehicle',
            label: 'Veículo',
            options: [
              ['', 'Todos'],
              ...veiculos.map((veiculoItem) => [veiculoItem.id, formatar.plate(veiculoItem.plate)]),
            ],
            get: (itemAtual) => itemAtual.vehicle_id,
          },
          {
            key: 'driver',
            label: 'Motorista',
            options: [
              ['', 'Todos'],
              ...motoristas.map((dadosRegistro) => [dadosRegistro.id, dadosRegistro.full_name]),
            ],
            get: (itemAtual) => itemAtual.driver_id,
          },
        ],
        render: (itens) =>
          tabela(
            ['Veículo', 'Motorista', 'Rota', 'Estado', 'Prevista', 'Ações'],
            itens.map((itemAtual) =>
              criarElemento('tr', {}, [
                criarElemento('td', {
                  class: 'mono',
                  text: formatar.plate(indiceVeiculo.get(itemAtual.vehicle_id)?.plate),
                }),
                criarElemento('td', { text: indiceDestino.get(itemAtual.driver_id)?.full_name || '—' }),
                criarElemento('td', { text: `${itemAtual.origin_label} → ${itemAtual.destination_label}` }),
                criarElemento('td', {}, [
                  criarElemento('status-pill', {
                    status: itemAtual.status,
                    label: ROTULO_SITUACAO_VIAGEM[itemAtual.status],
                  }),
                ]),
                criarElemento('td', { text: formatar.dateTime(itemAtual.planned_departure_at) }),
                criarElemento('td', {}, [
                  itemAtual.status === 'planned'
                    ? botao({
                        label: 'Iniciar',
                        variant: 'secondary',
                        icon: 'right',
                        permission: PERMISSAO.TRIPS_WRITE,
                        onClick: () =>
                          solicitarOdometro('Iniciar viagem', 'Odômetro de saída', async (km) => {
                            await dados.trips.start(itemAtual.id, km);
                            recarregar();
                          }),
                      })
                    : null,
                  itemAtual.status === 'in_progress'
                    ? botao({
                        label: 'Concluir',
                        variant: 'success',
                        icon: 'check',
                        permission: PERMISSAO.TRIPS_WRITE,
                        onClick: () =>
                          solicitarOdometro('Concluir viagem', 'Odômetro de retorno', async (km) => {
                            await dados.trips.complete(itemAtual.id, km);
                            recarregar();
                          }),
                      })
                    : null,
                  ['planned', 'in_progress'].includes(itemAtual.status)
                    ? botao({
                        label: 'Cancelar',
                        variant: 'danger',
                        icon: 'close',
                        permission: PERMISSAO.TRIPS_CANCEL,
                        onClick: async () => {
                          const motivo = await solicitarTexto({
                            title: 'Cancelar viagem',
                            label: 'Motivo do cancelamento',
                            hint: 'A viagem será marcada como cancelada e permanecerá no histórico.',
                            confirmLabel: 'Cancelar viagem',
                            danger: true,
                          });
                          if (!motivo) return;
                          try {
                            await dados.trips.cancel(itemAtual.id, motivo);
                            notificacao('Viagem cancelada.', { tone: 'success' });
                            recarregar();
                          } catch (erroCapturado) {
                            notificacao(erroCapturado.message, { tone: 'danger' });
                          }
                        },
                      })
                    : null,
                ]),
              ]),
            ),
          ),
        pageSize: 50,
      });
      const estatisticas = faixaResumo([
        {
          label: 'Planejadas',
          value: contarOnde(viagens, (itemAtual) => itemAtual.status === 'planned'),
          icon: 'clock',
          tone: 'info',
        },
        {
          label: 'Em andamento',
          value: contarOnde(viagens, (itemAtual) => itemAtual.status === 'in_progress'),
          icon: 'route',
          tone: 'warning',
        },
        {
          label: 'Concluídas',
          value: contarOnde(viagens, (itemAtual) => itemAtual.status === 'completed'),
          icon: 'check',
          tone: 'success',
        },
        {
          label: 'Canceladas',
          value: contarOnde(viagens, (itemAtual) => itemAtual.status === 'cancelled'),
          icon: 'close',
          tone: 'muted',
        },
      ]);
      return criarElemento('div', {}, [cabecalho, estatisticas, explorador]);
    },
  );
}
