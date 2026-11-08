import {
  el as criarElemento,
  campo,
  estadoVazio,
  formatarDataHora as formatarDadosHora,
} from '../componentes/componentes-do-painel.mjs';

import { api as servicos } from '../comunicacao/comunicacao-com-servidor.mjs';

import { navegar } from '../navegacao/trocar-tela.mjs';

import { ROTULO_STATUS_OPERACAO as ROTULO_SITUACAO_OPERACAO } from '@peganafrota/contracts';
import {
  cabecalhoPagina,
  barraFiltros,
  withState as carregarComEstado,
  normalizarTexto,
  resumoAdministrador,
  barraPaginacao,
} from '../componentes/listas-resumos-e-detalhes.mjs';

export async function telaProvisionamentos({
  outlet: conteudoTela,
  setTitle: definirTitulo,
  query: consulta,
}) {
  definirTitulo('Provisionamentos');
  const estado = { status: consulta.get('status') || '', search: '', page: 1 };
  const conteiner = criarElemento('div', {});
  conteudoTela.replaceChildren(conteiner);
  const cabecalho = cabecalhoPagina({
    title: 'Provisionamentos',
    subtitle:
      'Filtre por estado e use a busca rápida para localizar empresa, erro ou identificador na página atual.',
  });
  const carregar = async () => {
    const areaLista = criarElemento('div', {});
    conteiner.replaceChildren(
      cabecalho,
      barraFiltros({
        searchValue: estado.search,
        searchPlaceholder: 'Buscar nesta página por empresa, ID ou erro',
        onSearch: (veiculoItem) => {
          estado.search = veiculoItem;
          carregar();
        },
        fields: [
          campo({
            id: 'st',
            label: 'Estado',
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
                ...Object.entries(ROTULO_SITUACAO_OPERACAO).map(([veiculoItem, linhaItem]) =>
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
      () => servicos.operations.list({ status: estado.status || null, page: estado.page, pageSize: 25 }),
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
            title: 'Nenhum provisionamento registrado',
            description: 'As operações aparecem aqui assim que uma empresa é criada.',
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
              label: 'Em execução',
              value: itens.filter((objetoItem) => ['running', 'pending'].includes(objetoItem.status)).length,
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
                      criarElemento('th', { text: 'Operação' }),
                      criarElemento('th', { text: 'Empresa' }),
                      criarElemento('th', { text: 'Estado' }),
                      criarElemento('th', { text: 'Etapa' }),
                      criarElemento('th', { text: 'Erro' }),
                      criarElemento('th', { text: 'Criada em' }),
                    ]),
                  ]),
                  criarElemento(
                    'tbody',
                    {},
                    itens.map((objetoItem) =>
                      criarElemento('tr', {}, [
                        criarElemento('td', {}, [
                          criarElemento(
                            'button',
                            {
                              class: 'row-link',
                              onClick: () => navegar(`/provisionamentos/${objetoItem.operationId}`),
                            },
                            [criarElemento('code', { text: String(objetoItem.operationId).slice(0, 8) })],
                          ),
                        ]),
                        criarElemento('td', { text: objetoItem.companyTradeName || '—' }),
                        criarElemento('td', {}, [
                          criarElemento('status-pill', {
                            status: objetoItem.status,
                            label: ROTULO_SITUACAO_OPERACAO[objetoItem.status] || objetoItem.status,
                          }),
                        ]),
                        criarElemento('td', { text: objetoItem.currentStep || '—' }),
                        criarElemento('td', {}, [
                          objetoItem.errorCode ? criarElemento('code', { text: objetoItem.errorCode }) : '—',
                        ]),
                        criarElemento('td', {
                          class: 'col-meta',
                          text: formatarDadosHora(objetoItem.createdAt),
                        }),
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
