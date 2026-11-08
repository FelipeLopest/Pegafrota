import {
  el as criarElemento,
  fmt as formatar,
  botao,
  notificacao,
  estadoVazio,
  navegar,
  cabecalhoPagina,
  cartao,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

import {
  PERMISSAO,
  ROTULO_STATUS_VEICULO as ROTULO_SITUACAO_VEICULO,
  TIPOS_COMBUSTIVEL_VEICULO,
} from '@peganafrota/contracts';
import {
  tela,
  solicitarTexto,
  detalhe,
  tabela,
  cartaoResumo,
  linhaAtividade,
} from '../componentes/listas-resumos-e-detalhes.mjs';
import { abrirEditorVeiculo } from '../formularios/formulario-veiculo.mjs';

export function telaDetalheVeiculo({ outlet: conteudoTela, setTitle: definirTitulo, params: parametros }) {
  definirTitulo('Veículo');
  const recarregar = () =>
    telaDetalheVeiculo({ outlet: conteudoTela, setTitle: definirTitulo, params: parametros });
  return tela(
    conteudoTela,
    PERMISSAO.VEHICLES_READ,
    async () => {
      const veiculoItem = await dados.vehicles.get(parametros.id);
      if (!veiculoItem) throw new Error('Veículo não encontrado.');
      const filtros = { vehicle_id: `eq.${veiculoItem.id}` };
      const [
        viagens,
        totalViagens,
        combustivel,
        totalCombustivel,
        manutencao,
        totalManutencao,
        movimentacoes,
        totalMovimentacoes,
        odometro,
      ] = await Promise.all([
        dados.trips.recent(filtros, 6),
        dados.trips.count(filtros),
        dados.fuelings.recent(filtros, 6),
        dados.fuelings.count(filtros),
        dados.maintenance.recent(filtros, 6),
        dados.maintenance.count(filtros),
        dados.movements.recent(8, filtros),
        dados.movements.count(filtros),
        dados.odometer.history(veiculoItem.id, 1, 20).catch(() => []),
      ]);
      // Locais e presença: sem eles a movimentação mostra um identificador e a
      // pergunta mais imediata do operador — "onde está este veículo agora?" —
      // ficava sem resposta na tela do próprio veículo.
      const [locais, presenca] = await Promise.all([
        dados.locations.list().catch(() => []),
        dados.movements.presence(veiculoItem.id).catch(() => null),
      ]);
      return {
        v: veiculoItem,
        trips: viagens,
        fuel: combustivel,
        maint: manutencao,
        moves: movimentacoes,
        odo: odometro,
        locais,
        presenca,
        counts: {
          trips: totalViagens,
          fuel: totalCombustivel,
          maint: totalManutencao,
          moves: totalMovimentacoes,
        },
      };
    },
    ({
      v: veiculoItem,
      trips: viagens,
      fuel: combustivel,
      maint: manutencao,
      moves: movimentacoes,
      odo: odometro,
      locais,
      presenca,
      counts: contagens,
    }) => {
      const nomeLocal = new Map((locais || []).map((linhaItem) => [linhaItem.id, linhaItem.name]));

      /**
       * Situação atual no pátio.
       *
       * A última movimentação diz se o veículo entrou ou saiu, e de onde. Quando
       * não há histórico, a próxima movimentação será uma Entrada — o servidor
       * calcula por alternância, e antecipar isso evita que o operador escolha
       * errado.
       */
      const ultimaMov = (movimentacoes || [])[0];
      const dentro = ultimaMov?.movement_type === 'entry';
      const localAtual = ultimaMov ? nomeLocal.get(ultimaMov.location_id) || 'Local não identificado' : null;
      const acoes = [
        botao({
          label: 'Editar',
          icon: 'edit',
          permission: PERMISSAO.VEHICLES_WRITE,
          onClick: () => abrirEditorVeiculo({ vehicle: veiculoItem, onDone: recarregar }),
        }),
      ];
      if (!veiculoItem.archived_at && ['available', 'inactive'].includes(veiculoItem.status))
        acoes.push(
          botao({
            label: veiculoItem.status === 'inactive' ? 'Reativar' : 'Desativar',
            variant: 'ghost',
            permission: PERMISSAO.VEHICLES_WRITE,
            onClick: async () => {
              try {
                await dados.vehicles.setStatus(
                  veiculoItem.id,
                  veiculoItem.status === 'inactive' ? 'available' : 'inactive',
                );
                notificacao('Estado atualizado.', { tone: 'success' });
                recarregar();
              } catch (erroCapturado) {
                notificacao(erroCapturado.message, { tone: 'danger' });
              }
            },
          }),
        );
      acoes.push(
        veiculoItem.archived_at
          ? botao({
              label: 'Desarquivar',
              permission: PERMISSAO.VEHICLES_ARCHIVE,
              onClick: async () => {
                await dados.vehicles.unarchive(veiculoItem.id);
                recarregar();
              },
            })
          : botao({
              label: 'Arquivar',
              variant: 'danger',
              permission: PERMISSAO.VEHICLES_ARCHIVE,
              onClick: async () => {
                const motivo = await solicitarTexto({
                  title: 'Arquivar veículo',
                  label: 'Motivo do arquivamento',
                  hint: 'O veículo sairá das seleções operacionais, mas viagens, abastecimentos, manutenções e movimentações continuarão no histórico.',
                  confirmLabel: 'Arquivar veículo',
                  danger: true,
                });
                if (!motivo) return;
                try {
                  await dados.vehicles.archive(veiculoItem.id, motivo);
                  notificacao('Veículo arquivado.', { tone: 'success' });
                  recarregar();
                } catch (erroCapturado) {
                  notificacao(erroCapturado.message, { tone: 'danger' });
                }
              },
            }),
      );

      return criarElemento('div', {}, [
        cabecalhoPagina({
          title: formatar.plate(veiculoItem.plate),
          subtitle: `${veiculoItem.brand} ${veiculoItem.model}`,
          actions: acoes,
        }),
        cartao({
          title: 'Cadastro',
          children: [
            criarElemento('div', { class: 'detail-grid' }, [
              detalhe('Marca', veiculoItem.brand),
              detalhe('Modelo', veiculoItem.model),
              detalhe('Ano', veiculoItem.model_year),
              detalhe(
                'Combustível',
                TIPOS_COMBUSTIVEL_VEICULO.find((formulario) => formulario.value === veiculoItem.fuel_type)
                  ?.label || veiculoItem.fuel_type,
              ),
              detalhe('Cor', veiculoItem.color),
              detalhe('Categoria', veiculoItem.category),
              detalhe('Odômetro atual', formatar.km(veiculoItem.current_odometer_km)),
              detalhe('Estado', ROTULO_SITUACAO_VEICULO[veiculoItem.status]),
            ]),
          ],
        }),

        cartao({
          title: 'Onde está agora',
          children: [
            criarElemento('div', { class: 'detail-grid' }, [
              criarElemento('div', {}, [
                criarElemento('p', { class: 'detail-label', text: 'Situação' }),
                criarElemento('status-pill', {
                  status: ultimaMov ? (dentro ? 'entry' : 'exit') : 'neutral',
                  label: !ultimaMov ? 'Sem movimentação' : dentro ? 'No pátio' : 'Fora',
                }),
              ]),
              detalhe('Local', localAtual || 'Nenhuma movimentação registrada'),
              detalhe('Desde', ultimaMov ? formatar.dateTime(ultimaMov.occurred_at) : '—'),
              detalhe('Próxima movimentação', ultimaMov ? (dentro ? 'Saída' : 'Entrada') : 'Entrada'),
            ]),
            (movimentacoes || []).length
              ? criarElemento('div', {}, [
                  criarElemento('p', { class: 'field-label', text: 'Últimas movimentações' }),
                  tabela(
                    ['Quando', 'Tipo', 'Local', 'Origem'],
                    movimentacoes.slice(0, 6).map((movimentacao) =>
                      criarElemento('tr', {}, [
                        criarElemento('td', { text: formatar.dateTime(movimentacao.occurred_at) }),
                        criarElemento('td', {}, [
                          criarElemento('status-pill', {
                            status: movimentacao.movement_type,
                            label: movimentacao.movement_type === 'entry' ? 'Entrada' : 'Saída',
                          }),
                        ]),
                        criarElemento('td', { text: nomeLocal.get(movimentacao.location_id) || '—' }),
                        criarElemento('td', { text: movimentacao.source === 'ocr' ? 'Câmera' : 'Manual' }),
                      ]),
                    ),
                  ),
                ])
              : null,
          ],
        }),
        criarElemento('div', { class: 'detail-tabs' }, [
          cartaoResumo(
            'Viagens',
            contagens.trips,
            viagens[0]?.actual_departure_at || viagens[0]?.planned_departure_at,
          ),
          cartaoResumo('Abastecimentos', contagens.fuel, combustivel[0]?.fueled_at),
          cartaoResumo('Manutenções', contagens.maint, manutencao[0]?.scheduled_for),
          cartaoResumo('Movimentações', contagens.moves, movimentacoes[0]?.occurred_at),
        ]),
        cartao({
          title: 'Odômetro recente',
          children: [
            (odometro?.items || []).length
              ? tabela(
                  ['Quando', 'Km', 'Origem', 'Motivo'],
                  (odometro.items || [])
                    .slice(0, 10)
                    .map((evento) =>
                      criarElemento('tr', {}, [
                        criarElemento('td', { text: formatar.dateTime(evento.occurred_at) }),
                        criarElemento('td', { class: 'num', text: formatar.km(evento.odometer_km) }),
                        criarElemento('td', { text: evento.source_type || '—' }),
                        criarElemento('td', { text: evento.reason || '—' }),
                      ]),
                    ),
                )
              : estadoVazio({
                  title: 'Sem leituras',
                  description:
                    'As leituras aparecem quando viagens, abastecimentos ou ajustes de odômetro são registrados.',
                }),
            botao({
              label: 'Abrir livro completo',
              variant: 'ghost',
              permission: PERMISSAO.ODOMETER_READ,
              onClick: () => navegar(`/odometro/${veiculoItem.id}`),
            }),
          ],
        }),
        cartao({
          title: 'Atividade recente',
          children: [
            tabela(
              ['Tipo', 'Quando', 'Detalhe'],
              [
                ...viagens
                  .slice(0, 3)
                  .map((itemComparado) =>
                    linhaAtividade(
                      'Viagem',
                      itemComparado.actual_departure_at || itemComparado.planned_departure_at,
                      `${itemComparado.origin_label} → ${itemComparado.destination_label}`,
                    ),
                  ),
                ...manutencao
                  .slice(0, 3)
                  .map((itemComparado) =>
                    linhaAtividade('Manutenção', itemComparado.scheduled_for, itemComparado.description),
                  ),
                ...combustivel
                  .slice(0, 3)
                  .map((itemComparado) =>
                    linhaAtividade(
                      'Abastecimento',
                      itemComparado.fueled_at,
                      formatar.money(itemComparado.total_amount),
                    ),
                  ),
              ]
                .sort((primeiroItem, segundoItem) =>
                  (segundoItem.dataset.ts || '').localeCompare(primeiroItem.dataset.ts || ''),
                )
                .slice(0, 8),
            ),
          ],
        }),
      ]);
    },
  );
}
