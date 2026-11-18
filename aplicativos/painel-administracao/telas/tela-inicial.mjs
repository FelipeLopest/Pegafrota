import {
  el as criarElemento,
  botao,
  estadoVazio,
  formatarDataHora as formatarDadosHora,
  formatarData as formatarDados,
} from '../componentes/componentes-do-painel.mjs';

import { api as servicos } from '../comunicacao/comunicacao-com-servidor.mjs';

import { navegar } from '../navegacao/trocar-tela.mjs';

import { formatarCnpj } from '@peganafrota/validation';

import {
  ROTULO_STATUS_EMPRESA as ROTULO_SITUACAO_EMPRESA,
} from '@peganafrota/contracts';
import {
  cabecalhoPagina,
  ROTULO_SITUACAO_CADASTRO,
  rotuloAcao,
  withState as carregarComEstado,
  contagensResultadoAtividade,
  pulsoAdministrador,
  segmentoCicloVida,
  legendaGrafico,
  colunasAdministrador,
  barrasAdministrador,
  feedTick as marcadorAtividade,
  resultVerb as rotuloResultado,
} from '../componentes/listas-resumos-e-detalhes.mjs';

export async function telaPainel({ outlet: conteudoTela, setTitle: definirTitulo }) {
  definirTitulo('Visão geral');

  await carregarComEstado(
    conteudoTela,
    () => servicos.dashboard({}),
    (dadosRegistro) => {
      const chaveItem = dadosRegistro.kpis || {};
      const falhou = dadosRegistro.failedOperations || [];
      const ativo = Number(chaveItem.companiesActive) || 0;
      const suspenso = Number(chaveItem.companiesSuspended) || 0;
      const arquivado = Number(chaveItem.companiesArchived) || 0;
      const convites = Number(chaveItem.invitesPending) || 0;
      const total = ativo + suspenso + arquivado;
      const percentualAtivos = total ? Math.round((ativo / total) * 100) : 0;
      const contagensAtividade = contagensResultadoAtividade(dadosRegistro.recentActivity || []);
      const negados =
        contagensAtividade.find((itemComparado) => itemComparado.label === 'Negadas')?.value || 0;
      const falhas =
        contagensAtividade.find((itemComparado) => itemComparado.label === 'Falhas')?.value || 0;

      return criarElemento('div', {}, [
        cabecalhoPagina({
          title: 'Visão geral',
          actions: [
            botao({ label: 'Empresas', icon: 'company', onClick: () => navegar('/empresas') }),
            botao({
              label: 'Nova empresa',
              variant: 'primary',
              icon: 'plus',
              onClick: () => navegar('/empresas/nova'),
            }),
          ],
        }),

        criarElemento('div', { class: 'admin-pulse' }, [
          pulsoAdministrador(
            'Empresas',
            String(total),
            `${percentualAtivos}% ativas`,
            'company',
            'neutral',
          ),
          pulsoAdministrador('Ativas', String(ativo), '', 'check', 'success'),
          pulsoAdministrador(
            'Suspensas',
            String(suspenso),
            '',
            'warning',
            suspenso ? 'warning' : 'success',
          ),
          pulsoAdministrador(
            'Convites pendentes',
            String(convites),
            '',
            'invite',
            convites ? 'info' : 'neutral',
          ),
          pulsoAdministrador(
            'Falhas',
            String(falhou.length),
            falhou.length ? 'no cadastro de empresas' : '',
            'warning',
            falhou.length ? 'danger' : 'success',
          ),
        ]),

        falhou.length
          ? criarElemento('section', { class: 'card card-flush card-danger' }, [
              criarElemento('div', { class: 'card-head' }, [
                criarElemento('h2', {
                  class: 'card-title',
                  text: `Cadastros que precisam de atenção · ${falhou.length}`,
                }),
                botao({
                  label: 'Ver todas',
                  size: 'sm',
                  icon: 'right',
                  onClick: () => navegar('/provisionamentos?status=failed'),
                }),
              ]),
              criarElemento('div', { class: 'table-wrap' }, [
                criarElemento('table', {}, [
                  criarElemento('thead', {}, [
                    criarElemento('tr', {}, [
                      criarElemento('th', { text: 'OPERAÇÃO' }),
                      criarElemento('th', { text: 'ESTADO' }),
                      criarElemento('th', { text: 'ERRO' }),
                      criarElemento('th', { text: 'QUANDO' }),
                      criarElemento('th', { text: '' }),
                    ]),
                  ]),
                  criarElemento(
                    'tbody',
                    {},
                    falhou.map((objetoItem) =>
                      criarElemento('tr', {}, [
                        criarElemento('td', {}, [
                          criarElemento('code', {
                            text: String(objetoItem.operationId).slice(0, 8),
                          }),
                        ]),
                        criarElemento('td', {}, [
                          criarElemento('status-pill', {
                            status: objetoItem.status,
                            label: ROTULO_SITUACAO_CADASTRO[objetoItem.status] || objetoItem.status,
                          }),
                        ]),
                        criarElemento('td', {}, [
                          objetoItem.errorCode
                            ? criarElemento('code', { text: objetoItem.errorCode })
                            : '—',
                        ]),
                        criarElemento('td', {
                          class: 'col-meta',
                          text: formatarDadosHora(objetoItem.createdAt),
                        }),
                        criarElemento('td', {}, [
                          botao({
                            label: 'Abrir',
                            size: 'sm',
                            onClick: () => navegar(`/provisionamentos/${objetoItem.operationId}`),
                          }),
                        ]),
                      ]),
                    ),
                  ),
                ]),
              ]),
            ])
          : null,

        criarElemento('div', { class: 'cols-2-1' }, [
          criarElemento('section', { class: 'card card-flush' }, [
            criarElemento('div', { class: 'card-head' }, [
              criarElemento('h2', { class: 'card-title', text: 'Empresas recentes' }),
              (dadosRegistro.recentCompanies || []).length
                ? botao({
                    label: 'Ver todas',
                    size: 'sm',
                    icon: 'right',
                    onClick: () => navegar('/empresas'),
                  })
                : null,
            ]),
            (dadosRegistro.recentCompanies || []).length
              ? criarElemento('div', { class: 'table-wrap' }, [
                  criarElemento('table', {}, [
                    criarElemento('thead', {}, [
                      criarElemento('tr', {}, [
                        criarElemento('th', { text: 'EMPRESA' }),
                        criarElemento('th', { text: 'CNPJ' }),
                        criarElemento('th', { text: 'ESTADO' }),
                        criarElemento('th', { text: 'CRIADA EM' }),
                      ]),
                    ]),
                    criarElemento(
                      'tbody',
                      {},
                      dadosRegistro.recentCompanies.map((registro) =>
                        criarElemento('tr', {}, [
                          criarElemento('td', {}, [
                            criarElemento('button', {
                              class: 'row-link',
                              text: registro.tradeName,
                              onClick: () => navegar(`/empresas/${registro.id}`),
                            }),
                          ]),
                          criarElemento('td', {
                            class: 'mono col-meta',
                            text: formatarCnpj(registro.cnpj),
                          }),
                          criarElemento('td', {}, [
                            criarElemento('status-pill', {
                              status: registro.status,
                              label: ROTULO_SITUACAO_EMPRESA[registro.status] || registro.status,
                            }),
                          ]),
                          criarElemento('td', {
                            class: 'col-meta',
                            text: formatarDados(registro.createdAt),
                          }),
                        ]),
                      ),
                    ),
                  ]),
                ])
              : estadoVazio({
                  icon: 'company',
                  title: 'Nenhuma empresa cadastrada',
                  description: 'Cadastre sua primeira empresa.',
                  action: botao({
                    label: 'Nova empresa',
                    variant: 'primary',
                    icon: 'plus',
                    onClick: () => navegar('/empresas/nova'),
                  }),
                }),
          ]),
          criarElemento('section', { class: 'card card-flush' }, [
            criarElemento('div', { class: 'card-head' }, [
              criarElemento('h2', { class: 'card-title', text: 'Atividade recente' }),
            ]),
            (dadosRegistro.recentActivity || []).length
              ? criarElemento(
                  'div',
                  {},
                  dadosRegistro.recentActivity.map((evento) =>
                    criarElemento('div', { class: 'feed-item' }, [
                      marcadorAtividade(evento.result),
                      criarElemento('div', { class: 'feed-body' }, [
                        criarElemento('p', { class: 'feed-text' }, [
                          criarElemento('strong', { text: rotuloAcao(evento.action) }),
                          criarElemento('span', { text: ` · ${rotuloResultado(evento.result)}` }),
                        ]),
                        criarElemento('p', {
                          class: 'feed-meta',
                          text: formatarDadosHora(evento.occurredAt),
                        }),
                      ]),
                    ]),
                  ),
                )
              : estadoVazio({
                  icon: 'inbox',
                  title: 'Sem atividade',
                  description: 'Nenhuma ação registrada ainda.',
                }),
          ]),
        ]),
        criarElemento('details', { class: 'card admin-detalhes' }, [
          criarElemento('summary', { text: 'Gráficos e totais' }),
          criarElemento('div', { class: 'admin-dashboard-grid' }, [
            criarElemento('section', { class: 'card admin-dashboard-wide' }, [
              criarElemento('h2', { class: 'card-title', text: 'Situação das empresas' }),
              criarElemento('div', { class: 'lifecycle-summary' }, [
                criarElemento('div', { class: 'lifecycle-big' }, [
                  criarElemento('strong', { text: String(total) }),
                  criarElemento('span', { text: 'empresas' }),
                ]),
                criarElemento('div', { class: 'lifecycle-body' }, [
                  total
                    ? criarElemento(
                        'div',
                        { class: 'lifecycle' },
                        [
                          segmentoCicloVida('active', 'Ativas', ativo, total),
                          segmentoCicloVida('suspended', 'Suspensas', suspenso, total),
                          segmentoCicloVida('archived', 'Arquivadas', arquivado, total),
                        ].filter(Boolean),
                      )
                    : criarElemento('p', {
                        class: 'muted',
                        text: 'Nenhuma empresa cadastrada.',
                      }),
                  criarElemento('div', { class: 'lifecycle-legend' }, [
                    legendaGrafico('Ativas', ativo, 'var(--tema-sucesso)'),
                    legendaGrafico('Suspensas', suspenso, 'var(--tema-aviso)'),
                    legendaGrafico('Arquivadas', arquivado, 'var(--tema-neutro)'),
                  ]),
                ]),
              ]),
            ]),

            criarElemento('section', { class: 'card' }, [
              criarElemento('h2', { class: 'card-title', text: 'Empresas por situação' }),
              colunasAdministrador([
                { label: 'Ativas', value: ativo, color: 'var(--tema-sucesso)' },
                { label: 'Suspensas', value: suspenso, color: 'var(--tema-aviso)' },
                { label: 'Arquivadas', value: arquivado, color: 'var(--tema-neutro)' },
              ]),
            ]),

            criarElemento('section', { class: 'card admin-dashboard-wide' }, [
              criarElemento('div', { class: 'card-head' }, [
                criarElemento('div', {}, [
                  criarElemento('h2', { class: 'card-title', text: 'Resultado das últimas ações' }),
                ]),
                negados || falhas
                  ? criarElemento('span', {
                      class: 'chart-badge chart-badge-warning',
                      text: `${negados + falhas} com falha ou bloqueadas`,
                    })
                  : null,
              ]),
              barrasAdministrador(contagensAtividade),
              criarElemento('p', {
                class: 'chart-caption',
                text: 'Os totais são das ações recentes exibidas nesta tela.',
              }),
            ]),
          ]),
        ]),
      ]);
    },
  );
}
