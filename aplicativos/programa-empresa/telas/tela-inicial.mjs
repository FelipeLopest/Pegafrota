import { chaveDiaLocal } from '../componentes/listas-resumos-e-detalhes.mjs';
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

export function telaPainel({ outlet: conteudoTela, setTitle: definirTitulo, query: consulta }) {
  definirTitulo('Visão geral');
  const modo = consulta?.get('periodo') || '30dias';
  const hoje = chaveDiaLocal(new Date().toISOString());
  const de = modo === 'hoje' ? hoje : modo === 'mes' ? hoje.slice(0, 7) + '-01' : null;
  const chaveInicio = 'pnf.primeiro-uso.' + (contexto.data?.companyId || '');
  let oculto = false;
  try {
    oculto = localStorage.getItem(chaveInicio) === '1';
  } catch {
    /* opcional */
  }
  const trocarInicio = (valor) => {
    try {
      localStorage.setItem(chaveInicio, valor ? '1' : '0');
    } catch {
      /* opcional */
    }
    navegar('/?periodo=' + modo);
  };

  return tela(
    conteudoTela,
    PERMISSAO.DASHBOARD_READ,
    () => dados.dashboard({ de, ate: hoje }),
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
      const totalAtencoes =
        vencido + proximos30 + habilitacao + placaDesconhecida + placaBaixaConfianca;
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
      const textoResumo =
        totalFrota === 0
          ? 'Cadastre ou importe o primeiro veículo para começar.'
          : vencido
            ? `${vencido} manutenção(ões) vencida(s) exigem atenção. ${disponivel} de ${totalFrota} veículos estão disponíveis.`
            : totalAtencoes
              ? `${totalAtencoes} ponto(s) pedem acompanhamento. ${percentualDisponivel}% da frota está disponível agora.`
              : `Operação estável: ${percentualDisponivel}% da frota disponível e nenhuma pendência crítica no momento.`;

      const periodo = dadosRegistro?.period || {};
      const dataBr = (data) =>
        String(data || '')
          .split('-')
          .reverse()
          .join('/');
      const configuracao = dadosRegistro?.onboarding;
      const passos = configuracao
        ? [
            [
              'Cadastrar ou importar veículos',
              configuracao.vehicles > 0,
              '/veiculos?novo=1',
              PERMISSAO.VEHICLES_WRITE,
            ],
            [
              'Cadastrar motoristas',
              configuracao.drivers > 0,
              '/motoristas',
              PERMISSAO.DRIVERS_WRITE,
            ],
            [
              'Cadastrar uma base',
              configuracao.locations > 0,
              '/locais',
              PERMISSAO.LOCATIONS_WRITE,
            ],
            [
              'Conferir presença inicial',
              configuracao.vehicles > 0 && configuracao.unknownPresence === 0,
              '/patio',
              PERMISSAO.MOVEMENTS_WRITE,
            ],
            [
              'Registrar o primeiro abastecimento',
              configuracao.fuelings > 0,
              '/abastecimentos?novo=1',
              PERMISSAO.FUELINGS_WRITE,
            ],
          ].filter(([, , , permissao]) => contexto.can(permissao))
        : [];
      const incompleto = passos.some(([, pronto]) => !pronto);
      return criarElemento('div', { dataset: { screen: 'dashboard' } }, [
        cabecalhoPagina({
          title: `Olá, ${(contexto.fullName || '').split(' ')[0] || 'bem-vindo'}`,
          subtitle:
            'Resumo operacional da frota, custos, pátio e pendências — tudo em uma única leitura.',
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
              onClick: () => navegar('/patio?novo=1'),
            }),
          ],
        }),

        criarElemento('div', { class: 'toolbar' }, [
          criarElemento('span', {
            class: 'muted',
            text: periodo.from
              ? dataBr(periodo.from) + ' a ' + dataBr(periodo.to) + ' · ' + periodo.timezone
              : 'Período da empresa',
          }),
          ...[
            ['hoje', 'Hoje'],
            ['mes', 'Mês atual'],
            ['30dias', 'Últimos 30 dias'],
          ].map(([valor, rotulo]) =>
            botao({
              label: rotulo,
              variant: modo === valor ? 'primary' : 'secondary',
              size: 'sm',
              onClick: () => navegar('/?periodo=' + valor),
            }),
          ),
          botao({
            label: 'Relatório do período',
            size: 'sm',
            permission: PERMISSAO.REPORTS_READ,
            onClick: () =>
              navegar(
                '/relatorios?tipo=monthlyCosts&de=' +
                  (periodo.from || '') +
                  '&ate=' +
                  (periodo.to || ''),
              ),
          }),
        ]),
        incompleto
          ? oculto
            ? botao({
                label: 'Retomar configuração inicial',
                variant: 'ghost',
                onClick: () => trocarInicio(false),
              })
            : criarElemento('section', { class: 'card' }, [
                rotuloCartao('COMEÇAR MINHA FROTA', 'truck'),
                criarElemento('p', {
                  class: 'muted',
                  text: 'Use os passos que fazem sentido para sua operação. Você pode voltar a esta lista depois.',
                }),
                criarElemento(
                  'div',
                  { class: 'action-grid' },
                  passos.map(([rotulo, pronto, destino]) =>
                    botao({
                      label: rotulo,
                      icon: pronto ? 'check' : 'right',
                      variant: pronto ? 'ghost' : 'secondary',
                      onClick: () => navegar(destino),
                    }),
                  ),
                ),
                botao({
                  label: 'Pular por enquanto',
                  variant: 'ghost',
                  onClick: () => trocarInicio(true),
                }),
              ])
          : null,
        criarElemento('div', { class: 'dashboard-brief', dataset: { tone: tomResumo } }, [
          criarElemento('div', { class: 'dashboard-brief-icon', 'aria-hidden': 'true' }, [
            icone(vencido ? 'warning' : 'dashboard'),
          ]),
          criarElemento('div', { class: 'dashboard-brief-copy' }, [
            criarElemento('b', {
              text:
                totalFrota === 0
                  ? 'Comece sua frota'
                  : vencido
                    ? 'Prioridade operacional'
                    : totalAtencoes
                      ? 'Acompanhe estes pontos'
                      : 'Tudo sob controle',
            }),
            criarElemento('span', { text: textoResumo }),
          ]),
        ]),

        criarElemento('div', { class: 'dashboard-pulse' }, [
          cartaoPulso(
            'Frota ativa',
            String(totalFrota),
            `${arquivado} arquivado(s)`,
            'truck',
            'neutral',
          ),
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
                criarElemento('h2', {
                  class: 'card-title',
                  text: 'Disponibilidade operacional',
                }),
              ]),
              criarElemento('span', {
                class: 'chart-badge',
                text: `${percentualDisponivel}% disponível`,
              }),
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
                    inativo
                      ? rotuloSegmento('Inativos', inativo, 'var(--pnf-neutro)', totalFrota)
                      : null,
                  ].filter(Boolean),
                ),
              ]),
            ]),
          ]),

          criarElemento('section', { class: 'card', dataset: { block: 'costs' } }, [
            rotuloCartao('CUSTO NO PERÍODO', 'chart'),
            criarElemento('p', {
              class: 'muted',
              text: dadosRegistro?.coverage || 'Combustível e manutenção registrados.',
            }),
            criarElemento('div', { class: 'metric-row metric-row-tight' }, [
              criarElemento('span', {
                class: 'metric metric-money',
                text: formatar.money(custoTotal),
              }),
            ]),
            colunasCusto([
              {
                label: 'Combustível',
                value: custoCombustivel,
                color: 'var(--pnf-grafico-1)',
              },
              {
                label: 'Manutenção',
                value: custoManutencao,
                color: 'var(--pnf-aviso)',
              },
            ]),
          ]),

          temAlertas
            ? criarElemento(
                'section',
                {
                  class: 'card dashboard-attention',
                  dataset: { block: 'alerts' },
                },
                [
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
                      onClick: () => navegar('/manutencoes?vencidas=1'),
                    }),
                  ]),
                  ...(dadosRegistro?.attention || []).slice(0, 6).map((item) =>
                    criarElemento('div', { class: 'toolbar' }, [
                      criarElemento('span', {
                        text: item.label + ' — ' + item.detail,
                      }),
                      botao({
                        label: 'Ver pendência',
                        size: 'sm',
                        permission: PERMISSAO.MAINTENANCE_READ,
                        onClick: () => navegar('/manutencoes?vencidas=1&veiculo=' + item.vehicleId),
                      }),
                    ]),
                  ),
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
                        'CNH vencida ou a vencer',
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
                ],
              )
            : criarElemento('section', { class: 'card dashboard-attention dashboard-ok' }, [
                rotuloCartao('REQUER ATENÇÃO', 'check'),
                criarElemento('div', { class: 'all-clear' }, [
                  criarElemento('div', { class: 'all-clear-icon' }, [
                    icone('check', { size: 'lg' }),
                  ]),
                  criarElemento('div', {}, [
                    criarElemento('h2', {
                      class: 'card-title',
                      text: 'Nenhuma pendência crítica',
                    }),
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
                criarElemento('h2', {
                  class: 'card-title',
                  text: 'Ritmo operacional',
                }),
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
              estatistica(
                String(operacoes.tripsCompleted ?? 0),
                'Concluídas',
                'ops-trips-completed',
              ),
              estatistica(
                String(operacoes.tripsInProgress ?? 0),
                'Em andamento',
                'ops-trips-in-progress',
              ),
            ]),
          ]),

          criarElemento('section', { class: 'card', dataset: { block: 'presence' } }, [
            criarElemento('div', { class: 'card-head' }, [
              criarElemento('div', {}, [
                rotuloCartao('PÁTIO AGORA', 'yard'),
                criarElemento('h2', {
                  class: 'card-title',
                  text: 'Presença dos veículos',
                }),
              ]),
              botao({
                label: 'Abrir',
                size: 'sm',
                icon: 'right',
                permission: PERMISSAO.VEHICLES_READ,
                onClick: () => navegar('/patio'),
              }),
            ]),
            medidorOcupacao({
              inside: dentro,
              outside: fora,
              neverMoved: nuncaMovidos,
            }),
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
                onClick: () => navegar('/abastecimentos?novo=1'),
              }),
              botao({
                label: 'Nova viagem',
                icon: 'route',
                permission: PERMISSAO.TRIPS_WRITE,
                onClick: () => navegar('/viagens?novo=1'),
              }),
              botao({
                label: 'Agendar manutenção',
                icon: 'tool',
                permission: PERMISSAO.MAINTENANCE_SCHEDULE,
                onClick: () => navegar('/manutencoes?novo=1'),
              }),
            ]),
          ]),
        ]),
      ]);
    },
  );
}
