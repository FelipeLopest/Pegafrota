import {
  el as criarElemento,
  campo,
  estadoVazio,
  formatarDataHora as formatarDadosHora,
} from '../componentes/componentes-do-painel.mjs';

import { api as servicos } from '../comunicacao/comunicacao-com-servidor.mjs';

import {
  cabecalhoPagina,
  barraFiltros,
  withState as carregarComEstado,
  normalizarTexto,
  resumoAdministrador,
  barraPaginacao,
} from '../componentes/listas-resumos-e-detalhes.mjs';
import { abrirDetalheAuditoria } from '../formularios/formulario-detalhes-auditoria.mjs';

export async function telaAuditoria({ outlet: conteudoTela, setTitle: definirTitulo }) {
  definirTitulo('Auditoria global');
  const estado = { search: '', action: '', result: '', from: '', to: '', page: 1 };
  const conteiner = criarElemento('div', {});
  conteudoTela.replaceChildren(conteiner);
  const cabecalho = cabecalhoPagina({
    title: 'Auditoria global',
    subtitle:
      'Use filtros por resultado, ação e período; detalhes técnicos só abrem quando você clicar no evento.',
  });
  const carregar = async () => {
    const areaLista = criarElemento('div', {});
    conteiner.replaceChildren(
      cabecalho,
      barraFiltros({
        searchValue: estado.search,
        searchPlaceholder: 'Buscar nesta página por ator, empresa ou ação',
        onSearch: (veiculoItem) => {
          estado.search = veiculoItem;
          carregar();
        },
        fields: [
          campo({
            id: 'aud-action',
            label: 'Ação contém',
            control: criarElemento('input', {
              class: 'input',
              value: estado.action,
              placeholder: 'company.update',
              onChange: (evento) => {
                estado.action = evento.target.value.trim();
                estado.page = 1;
                carregar();
              },
            }),
          }),
          campo({
            id: 'res',
            label: 'Resultado',
            control: criarElemento(
              'select',
              {
                class: 'select',
                onChange: (evento) => {
                  estado.result = evento.target.value;
                  estado.page = 1;
                  carregar();
                },
              },
              [
                ['', 'Todos'],
                ['success', 'Sucesso'],
                ['failure', 'Falha'],
                ['denied', 'Negado'],
                ['compensated', 'Compensado'],
              ].map(([veiculoItem, linhaItem]) =>
                criarElemento('option', {
                  value: veiculoItem,
                  text: linhaItem,
                  selected: estado.result === veiculoItem,
                }),
              ),
            ),
          }),
          campo({
            id: 'aud-from',
            label: 'De',
            control: criarElemento('input', {
              class: 'input',
              type: 'date',
              value: estado.from,
              onChange: (evento) => {
                estado.from = evento.target.value;
                estado.page = 1;
                carregar();
              },
            }),
          }),
          campo({
            id: 'aud-to',
            label: 'Até',
            control: criarElemento('input', {
              class: 'input',
              type: 'date',
              value: estado.to,
              onChange: (evento) => {
                estado.to = evento.target.value;
                estado.page = 1;
                carregar();
              },
            }),
          }),
        ],
        onClear: () => {
          Object.assign(estado, { search: '', action: '', result: '', from: '', to: '', page: 1 });
          carregar();
        },
      }),
      criarElemento('p', {
        class: 'muted',
        text: 'Registro das ações da plataforma. Não inclui a operação de frota dos clientes.',
      }),
      areaLista,
    );
    await carregarComEstado(
      areaLista,
      () =>
        servicos.audit.list({
          action: estado.action || null,
          result: estado.result || null,
          from: estado.from || null,
          to: estado.to || null,
          page: estado.page,
          pageSize: 50,
        }),
      (resposta) => {
        const buscaAtual = normalizarTexto(estado.search);
        const itens = buscaAtual
          ? resposta.items.filter((evento) =>
              normalizarTexto(
                `${evento.actorName || ''} ${evento.companyTradeName || ''} ${evento.action || ''} ${evento.result || ''}`,
              ).includes(buscaAtual),
            )
          : resposta.items;
        if (resposta.total === 0)
          return estadoVazio({ title: 'Sem eventos no período', description: 'Ajuste ou limpe os filtros.' });
        return criarElemento('div', {}, [
          resumoAdministrador([
            { label: 'Exibidos', value: itens.length, icon: 'audit' },
            {
              label: 'Sucesso',
              value: itens.filter((evento) => evento.result === 'success').length,
              icon: 'check',
              tone: 'success',
            },
            {
              label: 'Negados',
              value: itens.filter((evento) => evento.result === 'denied').length,
              icon: 'warning',
              tone: 'warning',
            },
            {
              label: 'Falhas',
              value: itens.filter((evento) => evento.result === 'failure').length,
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
                      criarElemento('th', { text: 'Quando' }),
                      criarElemento('th', { text: 'Ator' }),
                      criarElemento('th', { text: 'Ação' }),
                      criarElemento('th', { text: 'Resultado' }),
                      criarElemento('th', { text: 'Empresa' }),
                    ]),
                  ]),
                  criarElemento(
                    'tbody',
                    {},
                    itens.map((evento) =>
                      criarElemento('tr', { onClick: () => abrirDetalheAuditoria(evento.id) }, [
                        criarElemento('td', {
                          class: 'col-meta',
                          text: formatarDadosHora(evento.occurredAt),
                        }),
                        criarElemento('td', { text: evento.actorName || '—' }),
                        criarElemento('td', {}, [criarElemento('code', { text: evento.action })]),
                        criarElemento('td', {}, [
                          criarElemento('status-pill', { status: evento.result, label: evento.result }),
                        ]),
                        criarElemento('td', { text: evento.companyTradeName || '—' }),
                      ]),
                    ),
                  ),
                ]),
              ])
            : estadoVazio({
                title: 'Nada nesta página corresponde à busca',
                description: 'Limpe a busca ou avance para outra página.',
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
