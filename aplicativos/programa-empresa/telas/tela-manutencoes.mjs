import { contexto } from '../acesso/sessao-e-permissoes.mjs';
import { consumirAtalho } from '../formularios/apoio-operacoes.mjs';
import {
  el as criarElemento,
  fmt as formatar,
  botao,
  notificacao,
  navegar,
  cabecalhoPagina,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

import {
  PERMISSAO,
  ROTULO_STATUS_MANUTENCAO as ROTULO_SITUACAO_MANUTENCAO,
} from '@peganafrota/contracts';
import {
  tela,
  indice,
  veiculosAtivos,
  exploradorColecao,
  correspondenciaPeriodo,
  tabela,
  solicitarTexto,
  contarOnde,
  faixaResumo,
} from '../componentes/listas-resumos-e-detalhes.mjs';
import { abrirAgendamentoManutencaoV8 as abrirAgendamentoManutencao } from '../formularios/formulario-agendar-manutencao.mjs';
import { abrirConclusaoManutencaoV8 as abrirConclusaoManutencao } from '../formularios/formulario-concluir-manutencao.mjs';

export function telaManutencao({ outlet: conteudoTela, setTitle: definirTitulo, query: consulta }) {
  definirTitulo('Manutenções');
  const recarregar = () =>
    telaManutencao({
      outlet: conteudoTela,
      setTitle: definirTitulo,
      query: consulta,
    });
  return tela(
    conteudoTela,
    PERMISSAO.MAINTENANCE_READ,
    async () => {
      const [registros, veiculos] = await Promise.all([
        dados.maintenance.page({
          ...(consulta?.get('veiculo') && !consulta?.has('novo')
            ? { vehicle: consulta.get('veiculo') }
            : {}),
          ...(consulta?.get('vencidas') === '1' ? { due: 'overdue' } : {}),
        }),
        dados.vehicles.list(),
      ]);
      return { records: registros, vehicles: veiculos };
    },
    ({ records: registros, vehicles: veiculos }) => {
      const indiceVeiculo = indice(veiculos);
      const agendar = (vehicleId = '') =>
        abrirAgendamentoManutencao({
          vehicles: veiculosAtivos(veiculos),
          vehicleId,
          historico: registros,
          onDone: recarregar,
        });
      if (contexto.can(PERMISSAO.MAINTENANCE_SCHEDULE)) consumirAtalho(agendar);
      const cabecalho = cabecalhoPagina({
        title: 'Manutenções',
        actions: [
          botao({
            label: 'Importar planilha',
            variant: 'automation',
            icon: 'upload',
            permission: PERMISSAO.MAINTENANCE_SCHEDULE,
            onClick: () => navegar('/importar?tipo=manutencoes'),
          }),
          botao({
            label: 'Agendar manutenção',
            variant: 'primary',
            icon: 'plus',
            permission: PERMISSAO.MAINTENANCE_SCHEDULE,
            onClick: () => agendar(),
          }),
        ],
      });
      const explorador = exploradorColecao(registros, {
        key: 'maintenance',
        placeholder: 'Buscar serviço, fornecedor, nota ou placa',
        getText: (resultadoItem) =>
          `${resultadoItem.description} ${resultadoItem.supplier_name || ''} ${resultadoItem.invoice_number || ''} ${indiceVeiculo.get(resultadoItem.vehicle_id)?.plate || ''}`,
        filters: [
          {
            key: 'due',
            label: 'Pendência',
            options: [
              ['', 'Todas'],
              ['overdue', 'Vencidas'],
            ],
          },
          {
            key: 'status',
            label: 'Estado',
            options: [
              ['', 'Todos'],
              ...Object.entries(ROTULO_SITUACAO_MANUTENCAO).map(([veiculoItem, linhaItem]) => [
                veiculoItem,
                linhaItem,
              ]),
            ],
            get: (resultadoItem) => resultadoItem.status,
          },
          {
            key: 'type',
            label: 'Tipo',
            options: [
              ['', 'Todos'],
              ['preventive', 'Preventiva'],
              ['corrective', 'Corretiva'],
            ],
            get: (resultadoItem) => resultadoItem.maintenance_type,
          },
          {
            key: 'period',
            label: 'Agendada no período',
            options: [
              ['', 'Qualquer data'],
              ['today', 'Hoje'],
              ['7d', 'Últimos 7 dias'],
              ['30d', 'Últimos 30 dias'],
              ['90d', 'Últimos 90 dias'],
              ['older', 'Mais de 90 dias'],
            ],
            match: (resultadoItem, veiculoItem) =>
              correspondenciaPeriodo(resultadoItem.scheduled_for, veiculoItem),
          },
          {
            key: 'vehicle',
            label: 'Veículo',
            options: [
              ['', 'Todos'],
              ...veiculos.map((veiculoItem) => [veiculoItem.id, formatar.plate(veiculoItem.plate)]),
            ],
            get: (resultadoItem) => resultadoItem.vehicle_id,
          },
        ],
        render: (itens) =>
          tabela(
            ['Veículo', 'Serviço', 'Agendada', 'Estado', 'Custo', 'Ações'],
            itens.map((resultadoItem) =>
              criarElemento('tr', {}, [
                criarElemento('td', {
                  class: 'mono',
                  text: formatar.plate(indiceVeiculo.get(resultadoItem.vehicle_id)?.plate),
                }),
                criarElemento('td', {}, [
                  criarElemento('b', { text: resultadoItem.description }),
                  criarElemento('p', {
                    class: 'muted',
                    text:
                      resultadoItem.maintenance_type === 'preventive' ? 'Preventiva' : 'Corretiva',
                  }),
                ]),
                criarElemento('td', {}, [
                  criarElemento('span', {
                    text: formatar.date(resultadoItem.scheduled_for),
                  }),
                  resultadoItem.scheduled_odometer_km != null
                    ? criarElemento('p', {
                        class: 'muted',
                        text: formatar.km(resultadoItem.scheduled_odometer_km),
                      })
                    : null,
                  resultadoItem.is_overdue
                    ? criarElemento('p', {
                        class: 'field-error',
                        text: 'Vencida',
                      })
                    : null,
                ]),
                criarElemento('td', {}, [
                  criarElemento('status-pill', {
                    status: resultadoItem.status,
                    label: ROTULO_SITUACAO_MANUTENCAO[resultadoItem.status],
                  }),
                ]),
                criarElemento('td', {
                  text: formatar.money(resultadoItem.total_cost),
                }),
                criarElemento('td', {}, [
                  resultadoItem.status === 'scheduled'
                    ? botao({
                        label: 'Iniciar',
                        variant: 'secondary',
                        icon: 'right',
                        permission: PERMISSAO.MAINTENANCE_WRITE,
                        onClick: async () => {
                          try {
                            await dados.maintenance.start(resultadoItem.id);
                            notificacao('Manutenção iniciada.', {
                              tone: 'success',
                            });
                            recarregar();
                          } catch (erroCapturado) {
                            notificacao(erroCapturado.message, {
                              tone: 'danger',
                            });
                          }
                        },
                      })
                    : null,
                  ['scheduled', 'in_progress'].includes(resultadoItem.status)
                    ? botao({
                        label: 'Concluir',
                        variant: 'success',
                        icon: 'check',
                        permission: PERMISSAO.MAINTENANCE_WRITE,
                        onClick: () => abrirConclusaoManutencao(resultadoItem, recarregar),
                      })
                    : null,
                  ['scheduled', 'in_progress'].includes(resultadoItem.status)
                    ? botao({
                        label: 'Cancelar',
                        variant: 'danger',
                        icon: 'close',
                        permission: PERMISSAO.MAINTENANCE_WRITE,
                        onClick: async () => {
                          const motivo = await solicitarTexto({
                            title: 'Cancelar manutenção',
                            label: 'Motivo do cancelamento',
                            hint: 'O registro será preservado como cancelado para manter o histórico da frota.',
                            confirmLabel: 'Cancelar manutenção',
                            danger: true,
                          });
                          if (!motivo) return;
                          try {
                            await dados.maintenance.cancel(resultadoItem.id, motivo);
                            notificacao('Manutenção cancelada.', {
                              tone: 'success',
                            });
                            recarregar();
                          } catch (erroCapturado) {
                            notificacao(erroCapturado.message, {
                              tone: 'danger',
                            });
                          }
                        },
                      })
                    : null,
                  resultadoItem.plan_active &&
                  ['scheduled', 'in_progress'].includes(resultadoItem.status)
                    ? botao({
                        label: 'Pausar recorrência',
                        permission: PERMISSAO.MAINTENANCE_SCHEDULE,
                        onClick: async () => {
                          const motivo = await solicitarTexto({
                            title: 'Pausar recorrência',
                            label: 'Motivo',
                            hint: 'O serviço atual permanece. Ao concluí-lo, uma nova revisão não será agendada.',
                            confirmLabel: 'Pausar',
                          });
                          if (!motivo) return;
                          try {
                            await dados.maintenance.pausePlan(resultadoItem.plan_id, motivo);
                            notificacao('Recorrência pausada.', {
                              tone: 'success',
                            });
                            recarregar();
                          } catch (erro) {
                            notificacao(erro.message, { tone: 'danger' });
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
      const vencido = registros.paginaRemota?.resumo?.overdue || 0;
      const estatisticas = faixaResumo(
        [
          {
            label: 'Agendadas',
            value: contarOnde(registros, (resultadoItem) => resultadoItem.status === 'scheduled'),
            icon: 'clock',
            tone: 'info',
          },
          {
            label: 'Em execução',
            value: contarOnde(registros, (resultadoItem) => resultadoItem.status === 'in_progress'),
            icon: 'tool',
            tone: 'warning',
          },
          {
            label: 'Vencidas',
            value: vencido,
            icon: 'warning',
            tone: vencido ? 'danger' : 'success',
          },
          {
            label: 'Concluídas',
            value: contarOnde(registros, (resultadoItem) => resultadoItem.status === 'completed'),
            icon: 'check',
            tone: 'success',
          },
        ],
        { colecao: registros },
      );
      return criarElemento('div', {}, [cabecalho, estatisticas, explorador]);
    },
  );
}
