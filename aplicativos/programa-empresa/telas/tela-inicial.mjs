import { chaveDiaLocal } from '../componentes/listas-resumos-e-detalhes.mjs';
import {
  el as criarElemento,
  fmt as formatar,
  botao,
  navegar,
  cabecalhoPagina,
  barraProporcao,
} from '../componentes/componentes-do-programa.mjs';

import { icone } from '../componentes/icones.mjs';

import { contexto } from '../acesso/sessao-e-permissoes.mjs';

import { dados } from '../dados/dados-do-programa.mjs';
import { abrirEditorVeiculo } from '../formularios/formulario-veiculo.mjs';
import { abrirEditorMotorista } from '../formularios/formulario-motorista.mjs';
import { abrirEditorLocal } from '../formularios/formulario-local.mjs';

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
  const voltarAoResumo = () => navegar('/?periodo=' + modo);
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
    voltarAoResumo();
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
            {
              rotulo: 'Cadastrar veículo',
              pronto: configuracao.vehicles > 0,
              abrir: () => abrirEditorVeiculo({ onDone: voltarAoResumo }),
              permissao: PERMISSAO.VEHICLES_WRITE,
              orientacao: 'Adicione o primeiro veículo para registrar viagens, abastecimentos e manutenções.',
            },
            {
              rotulo: 'Cadastrar motorista',
              pronto: configuracao.drivers > 0,
              abrir: () => abrirEditorMotorista({ onDone: voltarAoResumo }),
              permissao: PERMISSAO.DRIVERS_WRITE,
              orientacao: 'Adicione quem vai dirigir. Com veículo e motorista, você já pode planejar uma viagem.',
            },
            {
              rotulo: 'Cadastrar pátio',
              pronto: configuracao.locations > 0,
              abrir: () => abrirEditorLocal({ onDone: voltarAoResumo }),
              permissao: PERMISSAO.LOCATIONS_WRITE,
              orientacao: 'Cadastre um pátio se for registrar entradas e saídas. Você já pode abrir Viagens para planejar.',
            },
            {
              rotulo: 'Informar onde estão os veículos',
              pronto: configuracao.vehicles > 0 && configuracao.unknownPresence === 0,
              abrir: () => navegar('/patio'),
              permissao: PERMISSAO.MOVEMENTS_WRITE,
              orientacao: 'Informe quais veículos já estão no pátio antes de registrar a primeira saída pela portaria.',
            },
            {
              rotulo: 'Lançar abastecimento',
              pronto: configuracao.fuelings > 0,
              abrir: () => navegar('/abastecimentos?novo=1'),
              permissao: PERMISSAO.FUELINGS_WRITE,
              orientacao: 'Quando tiver um comprovante, registre o combustível e o valor para acompanhar os gastos.',
            },
          ].filter(({ permissao }) => contexto.can(permissao))
        : [];
      const proximoPasso = passos.find(({ pronto }) => !pronto);
      const acoesRapidas = [
        botao({
          label: 'Registrar abastecimento',
          icon: 'fuel',
          permission: PERMISSAO.FUELINGS_WRITE,
          onClick: () => navegar('/abastecimentos?novo=1'),
        }),
        botao({
          label: 'Agendar manutenção',
          icon: 'tool',
          permission: PERMISSAO.MAINTENANCE_SCHEDULE,
          onClick: () => navegar('/manutencoes?novo=1'),
        }),
      ].filter(Boolean);
      const seletorPeriodo = criarElemento('div', { class: 'toolbar' }, [
        criarElemento('span', {
          class: 'muted',
          text: periodo.from ? dataBr(periodo.from) + ' a ' + dataBr(periodo.to) : 'Período',
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
            onClick: () => navegar('/?periodo=' + valor + '&indicadores=1'),
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
      ]);
      return criarElemento('div', { dataset: { screen: 'dashboard' } }, [
        cabecalhoPagina({
          title: `Olá, ${(contexto.fullName || '').split(' ')[0] || 'bem-vindo'}`,
          actions: [
            botao({
              label: 'Registrar entrada ou saída',
              icon: 'yard',
              permission: PERMISSAO.MOVEMENTS_WRITE,
              onClick: () => navegar('/patio?novo=1'),
            }),
            botao({
              label: 'Nova viagem',
              variant: 'primary',
              icon: 'plus',
              permission: PERMISSAO.TRIPS_WRITE,
              onClick: () => navegar('/viagens?novo=1'),
            }),
          ],
        }),

        proximoPasso
          ? oculto
            ? botao({
                label: 'Retomar configuração inicial',
                variant: 'ghost',
                onClick: () => trocarInicio(false),
              })
            : criarElemento('section', { class: 'card primeiros-passos' }, [
                criarElemento('div', { class: 'primeiros-passos-cabecalho' }, [
                  criarElemento('div', {}, [
                    criarElemento('h2', { class: 'card-title', text: 'Primeiros passos' }),
                    criarElemento('p', { class: 'muted', text: proximoPasso.orientacao }),
                  ]),
                  botao({
                    label: proximoPasso.rotulo,
                    variant: 'primary',
                    onClick: proximoPasso.abrir,
                  }),
                ]),
                criarElemento('details', { class: 'primeiros-passos-lista' }, [
                  criarElemento('summary', { text: 'Ver todos os passos' }),
                  criarElemento(
                    'ul',
                    {},
                    passos.map(({ rotulo, pronto, abrir }) =>
                      criarElemento('li', {}, [
                        criarElemento('span', {
                          class: 'muted',
                          text: pronto ? 'Feito' : 'A fazer',
                        }),
                        botao({ label: rotulo, variant: 'ghost', onClick: abrir }),
                      ]),
                    ),
                  ),
                  botao({
                    label: 'Pular por enquanto',
                    variant: 'ghost',
                    onClick: () => trocarInicio(true),
                  }),
                ]),
              ])
          : null,
        totalFrota > 0 || !proximoPasso
          ? criarElemento('div', { class: 'dashboard-brief', dataset: { tone: tomResumo } }, [
              criarElemento('div', { class: 'dashboard-brief-icon', 'aria-hidden': 'true' }, [
                icone(vencido ? 'warning' : 'dashboard'),
              ]),
              criarElemento('div', { class: 'dashboard-brief-copy' }, [
                criarElemento('b', {
                  text:
                    totalFrota === 0
                      ? 'Comece sua frota'
                      : vencido
                        ? 'Manutenção vencida'
                        : totalAtencoes
                          ? 'Pendências'
                          : 'Situação da frota',
                }),
                criarElemento('span', { text: textoResumo }),
              ]),
              vencido
                ? botao({
                    label: 'Ver manutenções',
                    size: 'sm',
                    permission: PERMISSAO.MAINTENANCE_READ,
                    onClick: () => navegar('/manutencoes?vencidas=1'),
                  })
                : null,
            ])
          : null,

        acoesRapidas.length ? criarElemento('div', { class: 'form-row dashboard-atalhos' }, acoesRapidas) : null,

        criarElemento('div', { class: 'dashboard-pulse' }, [
          cartaoPulso(
            'Disponíveis',
            String(disponivel),
            `${percentualDisponivel}% da frota`,
            'check',
            'success',
          ),
          cartaoPulso(
            'Viagens em andamento',
            String(operacoes.tripsInProgress ?? 0),
            `${operacoes.tripsCompleted ?? 0} concluída(s)`,
            'route',
            'info',
          ),
          cartaoPulso(
            'No pátio',
            String(dentro),
            totalPresenca ? `de ${totalPresenca} veículos` : 'sem registros',
            'yard',
            'accent',
          ),
          cartaoPulso(
            'Pendências',
            String(totalAtencoes),
            vencido ? `${vencido} vencida(s)` : 'sem vencidas',
            'warning',
            vencido ? 'danger' : totalAtencoes ? 'warning' : 'success',
          ),
        ]),

        criarElemento('details', {
          class: 'collapsible-section dashboard-detalhes',
          open: consulta?.get('indicadores') === '1',
        }, [
          criarElemento('summary', { text: 'Ver indicadores da frota' }),
          seletorPeriodo,
          criarElemento('div', { class: 'dashboard-grid' }, [
            criarElemento('section', { class: 'card dashboard-wide', dataset: { block: 'fleet' } }, [
              criarElemento('div', { class: 'card-head' }, [
                criarElemento('h2', { class: 'card-title', text: 'Veículos por situação' }),
                criarElemento('span', {
                  class: 'chart-badge',
                  text: `${percentualDisponivel}% disponível`,
                }),
              ]),
              criarElemento('div', { class: 'fleet-overview' }, [
                criarElemento('div', { class: 'fleet-big-number' }, [
                  criarElemento('strong', { text: String(totalFrota) }),
                  criarElemento('span', { text: 'veículos ativos' }),
                  criarElemento('span', { text: `${arquivado} arquivados` }),
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
              criarElemento('h2', { class: 'card-title', text: 'Custo no período' }),
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
                      criarElemento('h2', { class: 'card-title', text: 'Pendências da frota' }),
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
                criarElemento('h2', { class: 'card-title', text: 'Viagens e passagens' }),
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
                criarElemento('h2', { class: 'card-title', text: 'Veículos no pátio' }),
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
          ]),
        ]),
      ]);
    },
  );
}
