import {
  el as criarElemento,
  campo,
  estadoVazio,
  formatarDataHora as formatarDadosHora,
} from '../componentes/componentes-do-painel.mjs';

import { api as servicos } from '../comunicacao/comunicacao-com-servidor.mjs';

import { navegar } from '../navegacao/trocar-tela.mjs';
import { ETAPAS_PROVISIONAMENTO } from '@peganafrota/contracts';

import {
  cabecalhoPagina,
  barraFiltros,
  withState as carregarComEstado,
  normalizarTexto,
  resumoAdministrador,
  barraPaginacao,
  ROTULO_SITUACAO_CADASTRO,
} from '../componentes/listas-resumos-e-detalhes.mjs';

export async function telaProvisionamentos({
  outlet: conteudoTela,
  setTitle: definirTitulo,
  query: consulta,
}) {
  definirTitulo('Acompanhar cadastros');
  const estado = { status: consulta.get('status') || '', search: '', page: 1 };
  const conteiner = criarElemento('div', {});
  conteudoTela.replaceChildren(conteiner);
  const cabecalho = cabecalhoPagina({
    title: 'Acompanhar cadastros',
    subtitle:
      'Confira quais cadastros terminaram e quais precisam de atenção.',
  });
  const carregar = async () => {
    const filtrosAbertos = conteiner.querySelector('.filter-drawer')?.open;
    const areaLista = criarElemento('div', {});
    conteiner.replaceChildren(
      cabecalho,
      barraFiltros({
        searchValue: estado.search,
        searchPlaceholder: 'Buscar nesta página por empresa, ID ou erro',
        filtersOpen: filtrosAbertos,
        onSearch: (veiculoItem) => {
          estado.search = veiculoItem;
          carregar();
        },
        fields: [
          campo({
            id: 'st',
            label: 'Situação',
            control: criarElemento(
              'select',
              {
                class: 'select',
                onChange: (evento) => {
                  estado.status = evento.target.value;
                  estado.page = 1;
                  carregar();
                },
              },
              [
                criarElemento('option', { value: '', text: 'Todos' }),
                ...Object.entries(ROTULO_SITUACAO_CADASTRO).map(([veiculoItem, linhaItem]) =>
                  criarElemento('option', {
                    value: veiculoItem,
                    text: linhaItem,
                    selected: estado.status === veiculoItem,
                  }),
                ),
              ],
            ),
          }),
        ],
        onClear: () => {
          estado.search = '';
          estado.status = '';
          estado.page = 1;
          carregar();
        },
      }),
      areaLista,
    );
    await carregarComEstado(
      areaLista,
      () =>
        servicos.operations.list({
          status: estado.status || null,
          page: estado.page,
          pageSize: 25,
        }),
      (resposta) => {
        const buscaAtual = normalizarTexto(estado.search);
        const itens = buscaAtual
          ? resposta.items.filter((objetoItem) =>
              normalizarTexto(
                `${objetoItem.operationId} ${objetoItem.companyTradeName || ''} ${objetoItem.errorCode || ''} ${objetoItem.currentStep || ''}`,
              ).includes(buscaAtual),
            )
          : resposta.items;
        if (resposta.total === 0)
          return estadoVazio({
            title: 'Nenhum cadastro nesta lista',
            description: 'Os cadastros de empresas aparecem aqui, inclusive as tentativas com erro.',
          });
        return criarElemento('div', {}, [
          resumoAdministrador([
            { label: 'Exibidas', value: itens.length, icon: 'operation' },
            {
              label: 'Concluídas',
              value: itens.filter((objetoItem) => objetoItem.status === 'succeeded').length,
              icon: 'check',
              tone: 'success',
            },
            {
              label: 'Em andamento',
              value: itens.filter((objetoItem) =>
                ['running', 'pending'].includes(objetoItem.status),
              ).length,
              icon: 'operation',
            },
            {
              label: 'Com falha',
              value: itens.filter((objetoItem) => objetoItem.status === 'failed').length,
              icon: 'warning',
              tone: 'danger',
            },
          ]),
          criarElemento('p', {
            class: 'filter-result-line',
            text: `${itens.length} exibido(s) nesta página · ${resposta.total} no total`,
          }),
          itens.length
            ? criarElemento('div', { class: 'table-wrap' }, [
                criarElemento('table', {}, [
                  criarElemento('thead', {}, [
                    criarElemento('tr', {}, [
                      criarElemento('th', { text: 'Empresa' }),
                      criarElemento('th', { text: 'Situação' }),
                      criarElemento('th', { text: 'Etapa' }),
                      criarElemento('th', { text: 'Erro' }),
                      criarElemento('th', { text: 'Data' }),
                      criarElemento('th', { text: 'Código' }),
                    ]),
                  ]),
                  criarElemento(
                    'tbody',
                    {},
                    itens.map((objetoItem) =>
                      criarElemento('tr', {}, [
                        criarElemento('td', {}, [
                          criarElemento('button', {
                            class: 'row-link',
                            text: objetoItem.companyTradeName || 'Cadastro sem nome',
                            onClick: () => navegar(`/provisionamentos/${objetoItem.operationId}`),
                          }),
                        ]),
                        criarElemento('td', {}, [
                          criarElemento('status-pill', {
                            status: objetoItem.status,
                            label: ROTULO_SITUACAO_CADASTRO[objetoItem.status] || objetoItem.status,
                          }),
                        ]),
                        criarElemento('td', {
                          text: ETAPAS_PROVISIONAMENTO.find((etapa) => etapa.code === objetoItem.currentStep)
                            ?.label || objetoItem.currentStep || '—',
                        }),
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
                          criarElemento('code', {
                            title: objetoItem.operationId,
                            text: String(objetoItem.operationId).slice(0, 8),
                          }),
                        ]),
                      ]),
                    ),
                  ),
                ]),
              ])
            : estadoVazio({
                title: 'Nada nesta página corresponde à busca',
                description: 'Limpe a busca ou navegue para outra página.',
              }),
          barraPaginacao({
            page: resposta.page,
            pageSize: resposta.pageSize,
            total: resposta.total,
            onPage: (postgres) => {
              estado.page = postgres;
              carregar();
            },
          }),
        ]);
      },
    );
  };
  await carregar();
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { telaProvisionamentos as screenOperations };
