import {
  el as criarElemento,
  fmt as formatar,
  botao,
  navegar,
  cabecalhoPagina,
  rotuloCartao,
  barraProporcao,
} from '../componentes/componentes-do-programa.mjs';

import { icone } from '../componentes/icones.mjs';

import { contexto } from '../acesso/sessao-e-permissoes.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

import { PERMISSAO } from '@peganafrota/contracts';
import {
  tela,
  cartaoPulso,
  rotuloSegmento,
  colunasCusto,
  linhaAtencao,
  barrasHorizontais,
  estatistica,
  medidorOcupacao,
  miniEstatistica,
} from '../componentes/indicadores-e-relatorios.mjs';

export function telaPainel({ outlet: conteudoTela, setTitle: definirTitulo }) {
  definirTitulo('Visão geral');

  return tela(
    conteudoTela,
    PERMISSAO.DASHBOARD_READ,
    () => dados.dashboard(),
    (dadosRegistro) => {
      const frota = dadosRegistro?.fleet ?? {};
      const operacoes = dadosRegistro?.operations ?? {};
      const custos = dadosRegistro?.costs ?? {};
      const alertas = dadosRegistro?.alerts ?? {};
      const presenca = dadosRegistro?.presence ?? {};

      const vencido = Number(alertas.maintenanceOverdue) || 0;
      const proximos30 = Number(alertas.maintenanceNext30Days) || 0;
      const habilitacao = Number(alertas.licenseExpiring) || 0;
      const placaDesconhecida = Number(alertas.unknownPlateReads) || 0;
      const placaBaixaConfianca = Number(alertas.lowConfidenceReads) || 0;
      const totalAtencoes = vencido + proximos30 + habilitacao + placaDesconhecida + placaBaixaConfianca;
      const temAlertas = totalAtencoes > 0;

      const totalFrota = Number(frota.total) || 0;
      const disponivel = Number(frota.available) || 0;
      const emUso = Number(frota.inUse) || 0;
      const emManutencao = Number(frota.inMaintenance) || 0;
      const inativo = Number(frota.inactive) || 0;
      const arquivado = Number(frota.archived) || 0;
      const custoCombustivel = Number(custos.fuelCost) || 0;
      const custoManutencao = Number(custos.maintenanceCost) || 0;
      const custoTotal = Number(custos.totalCost) || 0;
      const dentro = Number(presenca.inside) || 0;
      const fora = Number(presenca.outside) || 0;
      const nuncaMovidos = Number(presenca.neverMoved) || 0;
      const totalPresenca = dentro + fora + nuncaMovidos;
      const percentualDisponivel = totalFrota ? Math.round((disponivel / totalFrota) * 100) : 0;

      const tomResumo = vencido ? 'danger' : totalAtencoes ? 'warning' : 'success';
      const textoResumo = vencido
        ? `${vencido} manutenção(ões) vencida(s) exigem atenção. ${disponivel} de ${totalFrota} veículos estão disponíveis.`
        : totalAtencoes
          ? `${totalAtencoes} ponto(s) pedem acompanhamento. ${percentualDisponivel}% da frota está disponível agora.`
          : `Operação estável: ${percentualDisponivel}% da frota disponível e nenhuma pendência crítica no momento.`;

      return criarElemento('div', { dataset: { screen: 'dashboard' } }, [
        cabecalhoPagina({
          title: `Olá, ${(contexto.fullName || '').split(' ')[0] || 'bem-vindo'}`,
          subtitle: 'Resumo operacional da frota, custos, pátio e pendências — tudo em uma única leitura.',
          actions: [
            botao({
              label: 'Abrir pátio',
              icon: 'yard',
              permission: PERMISSAO.VEHICLES_READ,
              onClick: () => navegar('/patio'),
            }),
            botao({
              label: 'Registrar movimentação',
              variant: 'primary',
              icon: 'plus',
              permission: PERMISSAO.MOVEMENTS_WRITE,
              onClick: () => navegar('/movimentacoes'),
            }),
          ],
        }),

        criarElemento('div', { class: 'dashboard-brief', dataset: { tone: tomResumo } }, [
          criarElemento('div', { class: 'dashboard-brief-icon', 'aria-hidden': 'true' }, [
            icone(vencido ? 'warning' : 'dashboard'),
          ]),
          criarElemento('div', { class: 'dashboard-brief-copy' }, [
            criarElemento('b', {
              text: vencido
                ? 'Prioridade operacional'
                : totalAtencoes
                  ? 'Acompanhe estes pontos'
                  : 'Tudo sob controle',
            }),
            criarElemento('span', { text: textoResumo }),
          ]),
        ]),

        criarElemento('div', { class: 'dashboard-pulse' }, [
          cartaoPulso('Frota ativa', String(totalFrota), `${arquivado} arquivado(s)`, 'truck', 'neutral'),
          cartaoPulso(
            'Disponíveis',
            String(disponivel),
            `${percentualDisponivel}% da frota`,
            'check',
            'success',
          ),
          cartaoPulso(
            'Viagens agora',
            String(operacoes.tripsInProgress ?? 0),
            `${operacoes.tripsCompleted ?? 0} concluída(s)`,
            'route',
            'info',
          ),
          cartaoPulso(
            'Dentro do pátio',
            String(dentro),
            totalPresenca ? `de ${totalPresenca} monitorados` : 'sem leitura',
            'yard',
            'accent',
          ),
          cartaoPulso(
            'Custo no período',
            formatar.money(custoTotal),
            formatar.km(operacoes.distanceKm),
            'chart',
            'accent',
          ),
          cartaoPulso(
            'Atenções',
            String(totalAtencoes),
            vencido ? `${vencido} vencida(s)` : 'sem vencidas',
            'warning',
            vencido ? 'danger' : totalAtencoes ? 'warning' : 'success',
          ),
        ]),

        criarElemento('div', { class: 'dashboard-grid' }, [
          criarElemento('section', { class: 'card dashboard-wide', dataset: { block: 'fleet' } }, [
            criarElemento('div', { class: 'card-head' }, [
              criarElemento('div', {}, [
                rotuloCartao('COMPOSIÇÃO DA FROTA', 'truck'),
                criarElemento('h2', { class: 'card-title', text: 'Disponibilidade operacional' }),
              ]),
              criarElemento('span', { class: 'chart-badge', text: `${percentualDisponivel}% disponível` }),
            ]),
            criarElemento('div', { class: 'fleet-overview' }, [
              criarElemento('div', { class: 'fleet-big-number' }, [
                criarElemento('strong', { text: String(totalFrota) }),
                criarElemento('span', { text: 'veículos ativos' }),
              ]),
              criarElemento('div', { class: 'fleet-band-wrap' }, [
                barraProporcao([
                  { value: disponivel, color: 'var(--pnf-sucesso)' },
                  { value: emUso, color: 'var(--pnf-informacao)' },
                  { value: emManutencao, color: 'var(--pnf-aviso)' },
                  { value: inativo, color: 'var(--pnf-neutro)' },
                ]),
                criarElemento(
                  'div',
                  { class: 'fleet-segment-labels' },
                  [
                    rotuloSegmento('Disponíveis', disponivel, 'var(--pnf-sucesso)', totalFrota),
                    rotuloSegmento('Em uso', emUso, 'var(--pnf-informacao)', totalFrota),
                    rotuloSegmento('Manutenção', emManutencao, 'var(--pnf-aviso)', totalFrota),
                    inativo ? rotuloSegmento('Inativos', inativo, 'var(--pnf-neutro)', totalFrota) : null,
                  ].filter(Boolean),
                ),
              ]),
            ]),
          ]),

          criarElemento('section', { class: 'card', dataset: { block: 'costs' } }, [
            rotuloCartao('CUSTO NO PERÍODO', 'chart'),
            criarElemento('div', { class: 'metric-row metric-row-tight' }, [
              criarElemento('span', { class: 'metric metric-money', text: formatar.money(custoTotal) }),
            ]),
            colunasCusto([
              { label: 'Combustível', value: custoCombustivel, color: 'var(--pnf-grafico-1)' },
              { label: 'Manutenção', value: custoManutencao, color: 'var(--pnf-aviso)' },
            ]),
          ]),

          temAlertas
            ? criarElemento('section', { class: 'card dashboard-attention', dataset: { block: 'alerts' } }, [
                criarElemento('div', { class: 'card-head' }, [
                  criarElemento('div', {}, [
                    rotuloCartao('REQUER ATENÇÃO', 'warning'),
                    criarElemento('h2', {
                      class: 'card-title',
                      text: `${totalAtencoes} ponto(s) para acompanhar`,
                    }),
                  ]),
                  botao({
                    label: 'Abrir manutenção',
                    size: 'sm',
                    icon: 'right',
                    permission: PERMISSAO.MAINTENANCE_READ,
                    onClick: () => navegar('/manutencoes'),
                  }),
                ]),
                vencido
                  ? linhaAtencao(
                      vencido,
                      'Manutenção vencida',
                      'var(--pnf-perigo-texto)',
                      'prioridade imediata',
                      'alerts-overdue',
                    )
                  : null,
                proximos30
                  ? linhaAtencao(
                      proximos30,
                      'Vencem em 30 dias',
                      'var(--pnf-aviso-texto)',
                      'revisões programadas',
                      'alerts-next30',
                    )
                  : null,
                habilitacao
                  ? linhaAtencao(
                      habilitacao,
                      'CNH a vencer',
                      'var(--pnf-aviso-texto)',
                      'habilitações próximas do fim',
                      'alerts-license',
                    )
                  : null,
                placaDesconhecida
                  ? linhaAtencao(
                      placaDesconhecida,
                      'Leituras de placa desconhecidas',
                      'var(--pnf-informacao-texto)',
                      'verifique os eventos recentes',
                    )
                  : null,
                placaBaixaConfianca
                  ? linhaAtencao(
                      placaBaixaConfianca,
                      'Leituras com baixa confiança',
                      'var(--pnf-informacao-texto)',
                      'podem precisar de revisão',
                    )
                  : null,
              ])
            : criarElemento('section', { class: 'card dashboard-attention dashboard-ok' }, [
                rotuloCartao('REQUER ATENÇÃO', 'check'),
                criarElemento('div', { class: 'all-clear' }, [
                  criarElemento('div', { class: 'all-clear-icon' }, [icone('check', { size: 'lg' })]),
                  criarElemento('div', {}, [
                    criarElemento('h2', { class: 'card-title', text: 'Nenhuma pendência crítica' }),
                    criarElemento('p', {
                      class: 'muted',
                      text: 'Manutenções, CNHs e alertas monitorados estão dentro do esperado.',
                    }),
                  ]),
                ]),
              ]),

          criarElemento('section', { class: 'card dashboard-wide', dataset: { block: 'ops' } }, [
            criarElemento('div', { class: 'card-head' }, [
              criarElemento('div', {}, [
                rotuloCartao('OPERAÇÃO NO PERÍODO', 'route'),
                criarElemento('h2', { class: 'card-title', text: 'Ritmo operacional' }),
              ]),
              criarElemento('strong', {
                class: 'operation-distance',
                text: formatar.km(operacoes.distanceKm),
              }),
            ]),
            barrasHorizontais([
              {
                label: 'Movimentações de pátio',
                value: operacoes.movements ?? 0,
                color: 'var(--pnf-destaque)',
              },
              {
                label: 'Viagens concluídas',
                value: operacoes.tripsCompleted ?? 0,
                color: 'var(--pnf-sucesso)',
              },
              {
                label: 'Viagens em andamento',
                value: operacoes.tripsInProgress ?? 0,
                color: 'var(--pnf-informacao)',
              },
            ]),
            criarElemento('div', { class: 'operation-foot' }, [
              estatistica(String(operacoes.movements ?? 0), 'Movimentações', 'ops-movements'),
              estatistica(String(operacoes.tripsCompleted ?? 0), 'Concluídas', 'ops-trips-completed'),
              estatistica(String(operacoes.tripsInProgress ?? 0), 'Em andamento', 'ops-trips-in-progress'),
            ]),
          ]),

          criarElemento('section', { class: 'card', dataset: { block: 'presence' } }, [
            criarElemento('div', { class: 'card-head' }, [
              criarElemento('div', {}, [
                rotuloCartao('PÁTIO AGORA', 'yard'),
                criarElemento('h2', { class: 'card-title', text: 'Presença dos veículos' }),
              ]),
              botao({
                label: 'Abrir',
                size: 'sm',
                icon: 'right',
                permission: PERMISSAO.VEHICLES_READ,
                onClick: () => navegar('/patio'),
              }),
            ]),
            medidorOcupacao({ inside: dentro, outside: fora, neverMoved: nuncaMovidos }),
            criarElemento('div', { class: 'presence-mini-grid' }, [
              miniEstatistica('Dentro', dentro, 'success'),
              miniEstatistica('Fora', fora, 'accent'),
              miniEstatistica('Sem movimento', nuncaMovidos, 'neutral'),
            ]),
          ]),

          criarElemento('section', { class: 'card', dataset: { block: 'quick-actions' } }, [
            rotuloCartao('ATALHOS OPERACIONAIS', 'plus'),
            criarElemento('p', {
              class: 'muted dashboard-action-note',
              text: 'Ações mais frequentes, sem precisar percorrer o menu.',
            }),
            criarElemento('div', { class: 'action-grid action-grid-dashboard' }, [
              botao({
                label: 'Movimentação',
                variant: 'primary',
                icon: 'movements',
                permission: PERMISSAO.MOVEMENTS_WRITE,
                onClick: () => navegar('/movimentacoes'),
              }),
              botao({
                label: 'Abastecimento',
                icon: 'fuel',
                permission: PERMISSAO.FUELINGS_WRITE,
                onClick: () => navegar('/abastecimentos'),
              }),
              botao({
                label: 'Nova viagem',
                icon: 'route',
                permission: PERMISSAO.TRIPS_WRITE,
                onClick: () => navegar('/viagens'),
              }),
              botao({
                label: 'Manutenção',
                icon: 'tool',
                permission: PERMISSAO.MAINTENANCE_WRITE,
                onClick: () => navegar('/manutencoes'),
              }),
            ]),
          ]),
        ]),
      ]);
    },
  );
}
