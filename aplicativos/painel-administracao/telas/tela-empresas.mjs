import {
  el as criarElemento,
  botao,
  campo,
  estadoVazio,
  formatarData as formatarDados,
} from '../componentes/componentes-do-painel.mjs';

import { api as servicos } from '../comunicacao/comunicacao-com-servidor.mjs';

import { navegar } from '../navegacao/trocar-tela.mjs';

import { formatarCnpj } from '@peganafrota/validation';

import { ROTULO_STATUS_EMPRESA as ROTULO_SITUACAO_EMPRESA } from '@peganafrota/contracts';
import {
  cabecalhoPagina,
  barraFiltros,
  withState as carregarComEstado,
  resumoAdministrador,
  barraPaginacao,
} from '../componentes/listas-resumos-e-detalhes.mjs';

export async function telaEmpresas({ outlet: conteudoTela, setTitle: definirTitulo, query: consulta }) {
  definirTitulo('Empresas');
  const estado = {
    search: consulta.get('q') || '',
    status: consulta.get('status') || '',
    state: consulta.get('uf') || '',
    page: Number(consulta.get('page') || 1),
  };
  const conteiner = criarElemento('div', {});
  conteudoTela.replaceChildren(conteiner);
  const cabecalho = cabecalhoPagina({
    title: 'Empresas',
    subtitle:
      'Busque por nome, CNPJ ou e-mail. Filtros de estado e UF ficam recolhidos para manter a tela limpa.',
    actions: [
      botao({
        label: 'Nova empresa',
        variant: 'primary',
        icon: 'plus',
        onClick: () => navegar('/empresas/nova'),
      }),
    ],
  });
  const carregar = async () => {
    const areaLista = criarElemento('div', {});
    conteiner.replaceChildren(
      cabecalho,
      barraFiltros({
        searchValue: estado.search,
        searchPlaceholder: 'Nome, CNPJ ou e-mail',
        onSearch: (veiculoItem) => {
          estado.search = veiculoItem;
          estado.page = 1;
          carregar();
        },
        fields: [
          campo({
            id: 'estado',
            label: 'Estado da conta',
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
                ...Object.entries(ROTULO_SITUACAO_EMPRESA).map(([veiculoItem, linhaItem]) =>
                  criarElemento('option', {
                    value: veiculoItem,
                    text: linhaItem,
                    selected: estado.status === veiculoItem,
                  }),
                ),
              ],
            ),
          }),
          campo({
            id: 'uf',
            label: 'UF',
            hint: 'Sigla com 2 letras.',
            control: criarElemento('input', {
              class: 'input',
              maxlength: '2',
              value: estado.state,
              placeholder: 'SP',
              onChange: (evento) => {
                estado.state = evento.target.value.trim().toUpperCase();
                estado.page = 1;
                carregar();
              },
            }),
          }),
        ],
        onClear: () => {
          Object.assign(estado, { search: '', status: '', state: '', page: 1 });
          carregar();
        },
      }),
      areaLista,
    );
    await carregarComEstado(
      areaLista,
      () =>
        servicos.companies.list({
          search: estado.search || null,
          status: estado.status || null,
          state: estado.state || null,
          page: estado.page,
          pageSize: 25,
        }),
      (resposta) => {
        if (resposta.total === 0)
          return estadoVazio({
            title:
              estado.search || estado.status || estado.state
                ? 'Nenhuma empresa encontrada'
                : 'Nenhuma empresa cadastrada',
            description:
              estado.search || estado.status || estado.state
                ? 'Ajuste ou limpe os filtros.'
                : 'Provisione a primeira empresa da plataforma.',
            action: botao({
              label: 'Nova empresa',
              variant: 'primary',
              onClick: () => navegar('/empresas/nova'),
            }),
          });
        return criarElemento('div', {}, [
          resumoAdministrador([
            { label: 'Nesta página', value: resposta.items.length, icon: 'company' },
            {
              label: 'Ativas',
              value: resposta.items.filter((registro) => registro.status === 'active').length,
              icon: 'check',
              tone: 'success',
            },
            {
              label: 'Suspensas',
              value: resposta.items.filter((registro) => registro.status === 'suspended').length,
              icon: 'warning',
              tone: 'warning',
            },
            {
              label: 'Arquivadas',
              value: resposta.items.filter((registro) => registro.status === 'archived').length,
              icon: 'audit',
              tone: 'muted',
            },
          ]),
          criarElemento('p', {
            class: 'filter-result-line',
            text: `${resposta.total} empresa(s) encontrada(s)`,
          }),
          criarElemento('div', { class: 'table-wrap' }, [
            criarElemento('table', {}, [
              criarElemento('thead', {}, [
                criarElemento('tr', {}, [
                  criarElemento('th', { text: 'Empresa' }),
                  criarElemento('th', { text: 'CNPJ' }),
                  criarElemento('th', { text: 'Cidade/UF' }),
                  criarElemento('th', { text: 'Estado' }),
                  criarElemento('th', { text: 'Primeiro admin' }),
                  criarElemento('th', { text: 'Criada em' }),
                ]),
              ]),
              criarElemento(
                'tbody',
                {},
                resposta.items.map((registro) =>
                  criarElemento('tr', {}, [
                    criarElemento('td', {}, [
                      criarElemento('button', {
                        class: 'row-link',
                        text: registro.tradeName,
                        onClick: () => navegar(`/empresas/${registro.id}`),
                      }),
                    ]),
                    criarElemento('td', { text: formatarCnpj(registro.cnpj) }),
                    criarElemento('td', {
                      text: [registro.city, registro.state].filter(Boolean).join('/') || '—',
                    }),
                    criarElemento('td', {}, [
                      criarElemento('status-pill', {
                        status: registro.status,
                        label: ROTULO_SITUACAO_EMPRESA[registro.status] || registro.status,
                      }),
                    ]),
                    criarElemento('td', { text: registro.firstAdmin?.fullName || '—' }),
                    criarElemento('td', { class: 'col-meta', text: formatarDados(registro.createdAt) }),
                  ]),
                ),
              ),
            ]),
          ]),
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
export { telaEmpresas as screenCompanies };
