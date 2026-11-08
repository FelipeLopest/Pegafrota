import {
  el as criarElemento,
  campo,
  notificacao,
  estadoVazio,
} from '../componentes/componentes-do-painel.mjs';

import {
  linhaAdministrador,
  runSuspendCompanyAccess as executarSuspensaoEmpresa,
  runBlockAccount as executarBloqueioConta,
  showConflict as mostrarConflito,
} from '../formularios/confirmacoes-de-bloqueio-e-exclusao.mjs';

import { api as servicos } from '../comunicacao/comunicacao-com-servidor.mjs';

import {
  cabecalhoPagina,
  barraFiltros,
  withState as carregarComEstado,
  resumoAdministrador,
  barraPaginacao,
} from '../componentes/listas-resumos-e-detalhes.mjs';

export async function telaAdministradores({
  outlet: conteudoTela,
  setTitle: definirTitulo,
  query: consulta,
}) {
  definirTitulo('Admins das empresas');
  const estado = { companyId: consulta.get('empresa') || null, search: '', access: '', account: '', page: 1 };
  const conteiner = criarElemento('div', {});
  conteudoTela.replaceChildren(conteiner);
  const cabecalho = cabecalhoPagina({
    title: 'Administradores das empresas',
    subtitle: 'Pesquise pessoas sem confundir acesso a uma empresa com o estado global da conta.',
  });
  const carregar = async () => {
    const areaLista = criarElemento('div', {});
    conteiner.replaceChildren(
      cabecalho,
      barraFiltros({
        searchValue: estado.search,
        searchPlaceholder: 'Nome ou e-mail',
        onSearch: (veiculoItem) => {
          estado.search = veiculoItem;
          estado.page = 1;
          carregar();
        },
        fields: [
          campo({
            id: 'adm-access',
            label: 'Acesso à empresa',
            hint: 'Aplicado aos resultados desta página.',
            control: criarElemento(
              'select',
              {
                class: 'select',
                onChange: (evento) => {
                  estado.access = evento.target.value;
                  carregar();
                },
              },
              [
                ['', 'Todos'],
                ['active', 'Ativo'],
                ['inactive', 'Suspenso'],
              ].map(([veiculoItem, linhaItem]) =>
                criarElemento('option', {
                  value: veiculoItem,
                  text: linhaItem,
                  selected: veiculoItem === estado.access,
                }),
              ),
            ),
          }),
          campo({
            id: 'adm-account',
            label: 'Conta global',
            hint: 'Aplicado aos resultados desta página.',
            control: criarElemento(
              'select',
              {
                class: 'select',
                onChange: (evento) => {
                  estado.account = evento.target.value;
                  carregar();
                },
              },
              [
                ['', 'Todas'],
                ['active', 'Ativa'],
                ['blocked', 'Bloqueada'],
              ].map(([veiculoItem, linhaItem]) =>
                criarElemento('option', {
                  value: veiculoItem,
                  text: linhaItem,
                  selected: veiculoItem === estado.account,
                }),
              ),
            ),
          }),
        ],
        onClear: () => {
          Object.assign(estado, { search: '', access: '', account: '', page: 1 });
          carregar();
        },
      }),
      criarElemento('p', {
        class: 'muted',
        text: 'Acesso à empresa e conta na plataforma são escopos independentes. Suspender o acesso afeta apenas uma empresa; bloquear a conta afeta todas.',
      }),
      areaLista,
    );
    await carregarComEstado(
      areaLista,
      () =>
        servicos.admins.list({
          companyId: estado.companyId,
          search: estado.search || null,
          page: estado.page,
          pageSize: 25,
        }),
      (resposta) => {
        const filtrados = resposta.items.filter(
          (primeiroItem) =>
            (!estado.access ||
              (estado.access === 'active'
                ? primeiroItem.companyAccessActive === true
                : primeiroItem.companyAccessActive === false)) &&
            (!estado.account ||
              (estado.account === 'blocked'
                ? primeiroItem.globalAccountActive === false
                : primeiroItem.globalAccountActive === true)),
        );
        if (resposta.total === 0)
          return estadoVazio({
            title: 'Nenhum administrador encontrado',
            description: 'Provisione uma empresa para criar o primeiro administrador.',
          });
        const manipuladores = {
          onSuspendCompany: (evento) => executarSuspensaoEmpresa(evento, servicos, carregar),
          onRestoreCompany: async (evento) => {
            try {
              await servicos.admins.restoreCompanyAccess(evento.companyId, evento.userId);
              notificacao(`Acesso de ${evento.fullName} restaurado.`, { tone: 'success' });
              carregar();
            } catch (erro) {
              if (erro.isConflict)
                mostrarConflito({ hint: erro.hint, message: erro.message, detail: erro.detail });
              else notificacao(erro.message, { tone: 'danger' });
            }
          },
          onBlockAccount: (evento) => executarBloqueioConta(evento, servicos, carregar),
          onUnblockAccount: async (evento) => {
            try {
              await servicos.admins.unblockAccount(evento.userId);
              notificacao(`Conta de ${evento.fullName} desbloqueada.`, { tone: 'success' });
              carregar();
            } catch (erro) {
              notificacao(erro.message, { tone: 'danger' });
            }
          },
          onResendInvite: async (evento) => {
            try {
              await servicos.admins.resendInvite(evento.companyId, evento.userId, evento.email || '');
              notificacao('Novo convite enviado. O link anterior foi invalidado.', { tone: 'success' });
              carregar();
            } catch (erro) {
              if (erro.status === 429)
                notificacao(`Aguarde ${erro.retryAfterSeconds || 'alguns'} segundos para reenviar.`, {
                  tone: 'warning',
                });
              else notificacao(erro.message, { tone: 'danger' });
            }
          },
        };
        return criarElemento('div', {}, [
          resumoAdministrador([
            { label: 'Exibidos', value: filtrados.length, icon: 'admin' },
            {
              label: 'Acesso ativo',
              value: filtrados.filter((primeiroItem) => primeiroItem.companyAccessActive === true).length,
              icon: 'check',
              tone: 'success',
            },
            {
              label: 'Acesso suspenso',
              value: filtrados.filter((primeiroItem) => primeiroItem.companyAccessActive === false).length,
              icon: 'warning',
              tone: 'warning',
            },
            {
              label: 'Conta bloqueada',
              value: filtrados.filter((primeiroItem) => primeiroItem.globalAccountActive === false).length,
              icon: 'warning',
              tone: 'danger',
            },
          ]),
          criarElemento('p', {
            class: 'filter-result-line',
            text: `${filtrados.length} exibido(s) nesta página · ${resposta.total} no total`,
          }),
          filtrados.length
            ? criarElemento('div', { class: 'table-wrap' }, [
                criarElemento('table', {}, [
                  criarElemento('thead', {}, [
                    criarElemento('tr', {}, [
                      criarElemento('th', { text: 'Pessoa' }),
                      criarElemento('th', { text: 'Acesso à empresa' }),
                      criarElemento('th', { text: 'Conta na plataforma' }),
                      criarElemento('th', { text: 'Convite' }),
                      criarElemento('th', { text: 'Último acesso' }),
                    ]),
                  ]),
                  criarElemento(
                    'tbody',
                    {},
                    filtrados.map((primeiroItem) => linhaAdministrador(primeiroItem, manipuladores)),
                  ),
                ]),
              ])
            : estadoVazio({
                title: 'Nenhum administrador com estes estados',
                description: 'Limpe os filtros de acesso/conta.',
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
export { telaAdministradores as screenAdmins };
