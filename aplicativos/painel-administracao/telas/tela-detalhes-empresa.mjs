import {
  el as criarElemento,
  botao,
  formatarDataHora as formatarDadosHora,
  formatarData as formatarDados,
} from '../componentes/componentes-do-painel.mjs';

import { runSetCompanyStatus as executarAlteracaoSituacaoEmpresa } from '../formularios/confirmacoes-de-bloqueio-e-exclusao.mjs';

import { api as servicos } from '../comunicacao/comunicacao-com-servidor.mjs';

import { navegar } from '../navegacao/trocar-tela.mjs';

import { formatarCnpj } from '@peganafrota/validation';

import {
  ROTULO_STATUS_EMPRESA as ROTULO_SITUACAO_EMPRESA,
  ROTULO_MOTIVO_SUSPENSAO,
} from '@peganafrota/contracts';
import {
  withState as carregarComEstado,
  cabecalhoPagina,
  resumoAdministrador,
  secao,
  detalhe,
  tabelaMembrosEmpresa,
  barraFiltros,
  barraPaginacao,
} from '../componentes/listas-resumos-e-detalhes.mjs';
import { excluirEmpresaDefinitivamente } from '../formularios/formulario-excluir-empresa.mjs';
import { abrirEditorEmpresaPlataforma } from '../formularios/formulario-empresa.mjs';

export async function telaDetalhesEmpresa({
  outlet: conteudoTela,
  setTitle: definirTitulo,
  params: parametros,
}) {
  definirTitulo('Empresa');
  const membrosNaPagina = 100;
  const equipe = { busca: '', pagina: 1 };

  async function consultarEquipe(busca, pagina) {
    const parametrosEquipe = {
      companyId: parametros.id,
      search: busca || null,
      page: pagina,
      pageSize: membrosNaPagina,
    };
    const resposta = await servicos.members.list(parametrosEquipe);
    const ultimaPagina = Math.max(1, Math.ceil(resposta.total / membrosNaPagina));
    if (pagina <= ultimaPagina) return resposta;
    return servicos.members.list({ ...parametrosEquipe, page: ultimaPagina });
  }

  const renderizar = async () => {
    await carregarComEstado(
      conteudoTela,
      async () => {
        const [empresa, membros, totalSemFiltro] = await Promise.all([
          servicos.companies.get(parametros.id),
          consultarEquipe(equipe.busca, equipe.pagina),
          equipe.busca
            ? servicos.members.list({ companyId: parametros.id, page: 1, pageSize: 1 })
            : null,
        ]);
        return { empresa, membros, totalMembros: totalSemFiltro?.total ?? membros.total ?? 0 };
      },
      ({ empresa: registro, membros, totalMembros }) => {
        definirTitulo(registro.tradeName);

        const listaMembros = criarElemento('div', {});
        const preencherEquipe = (resposta) => {
          equipe.pagina = resposta.page;
          return criarElemento('div', {}, [
            tabelaMembrosEmpresa(registro, resposta.items || [], renderizar),
            barraPaginacao({
              page: resposta.page,
              pageSize: resposta.pageSize || membrosNaPagina,
              total: resposta.total ?? 0,
              onPage: (pagina) => {
                equipe.pagina = pagina;
                carregarEquipe();
              },
            }),
          ]);
        };
        const carregarEquipe = () => {
          const { busca, pagina } = equipe;
          return carregarComEstado(listaMembros, () => consultarEquipe(busca, pagina), preencherEquipe);
        };
        listaMembros.replaceChildren(preencherEquipe(membros));
        const buscaEquipe = (busca) => {
          equipe.busca = busca;
          equipe.pagina = 1;
          carregarEquipe();
        };
        const montarBuscaEquipe = () =>
          barraFiltros({
            searchValue: equipe.busca,
            searchPlaceholder: 'Buscar usuário por nome ou e-mail',
            onSearch: buscaEquipe,
            onClear: () => {
              buscaEquipe('');
              filtroEquipe.replaceChildren(montarBuscaEquipe());
            },
          });
        const filtroEquipe = criarElemento('div', {}, [montarBuscaEquipe()]);

        const cicloVida = criarElemento('div', { class: 'modal-actions lifecycle-actions' }, [
          registro.status === 'active'
            ? botao({
                label: 'Suspender',
                variant: 'danger',
                onClick: () =>
                  executarAlteracaoSituacaoEmpresa(registro, 'suspended', servicos, renderizar),
              })
            : null,
          registro.status === 'suspended'
            ? botao({
                label: 'Reativar',
                variant: 'primary',
                onClick: () =>
                  executarAlteracaoSituacaoEmpresa(registro, 'active', servicos, renderizar),
              })
            : null,
          registro.status !== 'archived'
            ? botao({
                label: 'Arquivar',
                variant: 'danger',
                onClick: () =>
                  executarAlteracaoSituacaoEmpresa(registro, 'archived', servicos, renderizar),
              })
            : botao({
                label: 'Excluir definitivamente',
                variant: 'danger',
                icon: 'trash',
                onClick: () => excluirEmpresaDefinitivamente(registro),
              }),
        ]);

        return criarElemento('div', {}, [
          cabecalhoPagina({
            title: registro.tradeName,
            actions: [
              botao({
                label: 'Editar cadastro',
                variant: 'primary',
                onClick: () => abrirEditorEmpresaPlataforma(registro, renderizar),
              }),
            ],
          }),
          resumoAdministrador([
            {
              label: 'Estado',
              value: ROTULO_SITUACAO_EMPRESA[registro.status] || registro.status,
              icon: registro.status === 'active' ? 'check' : 'warning',
              tone: registro.status === 'active' ? 'success' : 'warning',
            },
            { label: 'Usuários', value: totalMembros, icon: 'users' },
            { label: 'Administradores', value: (registro.admins || []).length, icon: 'admin' },
            {
              label: 'Cidade / UF',
              value:
                [registro.address?.city, registro.address?.state].filter(Boolean).join(' / ') ||
                '—',
              icon: 'company',
            },
            { label: 'Criada em', value: formatarDados(registro.createdAt), icon: 'audit' },
          ]),
          secao('Identificação', [
            criarElemento('div', { class: 'detail-grid' }, [
              detalhe('Razão social', registro.legalName),
              detalhe('Nome fantasia', registro.tradeName),
              detalhe('CNPJ', formatarCnpj(registro.cnpj)),
              detalhe('E-mail', registro.email),
              detalhe('Telefone', registro.phone),
              detalhe('Fuso horário', registro.timezone),
            ]),
          ]),

          secao('Endereço', [
            criarElemento('div', { class: 'detail-grid' }, [
              detalhe('Logradouro', registro.address?.street),
              detalhe('Número', registro.address?.number),
              detalhe('Bairro', registro.address?.district),
              detalhe('Cidade', registro.address?.city),
              detalhe('UF', registro.address?.state),
              detalhe('CEP', registro.address?.postalCode),
            ]),
          ]),

          secao('Situação da empresa', [
            criarElemento('div', { class: 'detail-grid' }, [
              criarElemento('div', { class: 'detail-item' }, [
                criarElemento('p', { class: 'detail-label', text: 'Estado atual' }),
                criarElemento('status-pill', {
                  status: registro.status,
                  label: ROTULO_SITUACAO_EMPRESA[registro.status] || registro.status,
                }),
              ]),
              detalhe('Criada em', formatarDadosHora(registro.createdAt)),
              registro.archivedAt
                ? detalhe('Arquivada em', formatarDadosHora(registro.archivedAt))
                : null,
              registro.suspension
                ? detalhe(
                    'Motivo da suspensão',
                    ROTULO_MOTIVO_SUSPENSAO[registro.suspension.reasonCode] ||
                      registro.suspension.reasonCode,
                  )
                : null,
            ]),
            registro.status === 'archived'
              ? criarElemento('div', { class: 'danger-zone' }, [
                  criarElemento('p', {
                    class: 'danger-description',
                    text: 'A empresa está arquivada. Excluir definitivamente apaga os dados dela de forma irreversível.',
                  }),
                  cicloVida,
                ])
              : cicloVida,
          ]),

          secao('Usuários da empresa', [
            criarElemento('p', {
              class: 'muted',
              text: 'Altere a senha de usuários ativos ou retire o acesso à empresa.',
            }),
            filtroEquipe,
            listaMembros,
          ]),

          secao('Administradores da empresa', [
            (registro.admins || []).length
              ? criarElemento('div', { class: 'table-wrap' }, [
                  criarElemento('table', {}, [
                    criarElemento('thead', {}, [
                      criarElemento('tr', {}, [
                        criarElemento('th', { text: 'Pessoa' }),
                        criarElemento('th', { text: 'Acesso a esta empresa' }),
                        criarElemento('th', { text: 'Conta na plataforma' }),
                        criarElemento('th', { text: 'Vinculado em' }),
                      ]),
                    ]),
                    criarElemento(
                      'tbody',
                      {},
                      registro.admins.map((primeiroItem) =>
                        criarElemento('tr', {}, [
                          criarElemento('td', { text: primeiroItem.fullName || '—' }),
                          criarElemento('td', {}, [
                            criarElemento('status-pill', {
                              status: primeiroItem.companyAccessActive ? 'active' : 'suspended',
                              label: primeiroItem.companyAccessActive
                                ? 'Com acesso'
                                : 'Acesso suspenso',
                            }),
                          ]),
                          criarElemento('td', {}, [
                            criarElemento('status-pill', {
                              status: primeiroItem.globalAccountActive ? 'active' : 'failed',
                              label: primeiroItem.globalAccountActive
                                ? 'Conta ativa'
                                : 'Conta bloqueada',
                            }),
                          ]),
                          criarElemento('td', {
                            class: 'col-meta',
                            text: formatarDados(primeiroItem.linkedAt),
                          }),
                        ]),
                      ),
                    ),
                  ]),
                ])
              : criarElemento('p', { class: 'muted', text: 'Nenhum administrador vinculado.' }),
            botao({
              label: 'Gerenciar administradores',
              onClick: () => navegar(`/administradores?empresa=${registro.id}`),
            }),
          ]),
        ]);
      },
    );
  };

  await renderizar();
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { telaDetalhesEmpresa as screenCompanyDetail };
