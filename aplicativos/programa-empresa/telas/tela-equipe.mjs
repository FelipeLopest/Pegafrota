import {
  el as criarElemento,
  fmt as formatar,
  botao,
  notificacao,
  confirmAction as confirmarAcao,
  navegar,
  cabecalhoPagina,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

import { contexto } from '../acesso/sessao-e-permissoes.mjs';

import { PERMISSAO } from '@peganafrota/contracts';
import {
  tela,
  exploradorColecao,
  tabela,
  rotuloPapel,
  faixaResumo,
  contarOnde,
} from '../componentes/listas-resumos-e-detalhes.mjs';
import { abrirConviteUsuario } from '../formularios/formulario-integrante-equipe.mjs';
import { abrirAlteracaoPapel } from '../formularios/formulario-permissao-integrante.mjs';

export function telaUsuarios({ outlet: conteudoTela, setTitle: definirTitulo }) {
  definirTitulo('Equipe');
  const recarregar = () => telaUsuarios({ outlet: conteudoTela, setTitle: definirTitulo });
  return tela(
    conteudoTela,
    PERMISSAO.USERS_READ,
    () => dados.users.list(),
    (resposta) => {
      const itens = resposta?.members ?? resposta?.items ?? (Array.isArray(resposta) ? resposta : []);
      const cabecalho = cabecalhoPagina({
        title: 'Equipe',
        subtitle: 'Busque pessoas por nome ou e-mail e filtre por cargo ou situação de acesso.',
        actions: [
          botao({
            label: 'Importar planilha',
            variant: 'automation',
            icon: 'upload',
            permission: PERMISSAO.USERS_MANAGE,
            onClick: () => navegar('/importar?tipo=equipe'),
          }),
          botao({
            label: 'Convidar pessoa',
            variant: 'primary',
            icon: 'plus',
            permission: PERMISSAO.USERS_MANAGE,
            onClick: () => abrirConviteUsuario(recarregar),
          }),
        ],
      });
      const explorador = exploradorColecao(itens, {
        key: 'users',
        placeholder: 'Buscar nome ou e-mail',
        getText: (usuarioItem) => `${usuarioItem.full_name || ''} ${usuarioItem.email || ''}`,
        filters: [
          {
            key: 'role',
            label: 'Cargo',
            options: [
              ['', 'Todos os cargos'],
              ['company_admin', 'Administrador'],
              ['fleet_manager', 'Gestor de frota'],
              ['operator', 'Operador'],
              ['viewer', 'Visualizador'],
            ],
            get: (usuarioItem) => usuarioItem.role,
          },
          {
            key: 'access',
            label: 'Acesso',
            options: [
              ['', 'Todos'],
              ['active', 'Ativo'],
              ['inactive', 'Sem acesso'],
            ],
            match: (usuarioItem, veiculoItem) =>
              !veiculoItem ||
              (veiculoItem === 'active' ? !!usuarioItem.effective_active : !usuarioItem.effective_active),
          },
        ],
        render: (itensPagina) =>
          tabela(
            ['Pessoa', 'Cargo', 'Acesso', 'Último acesso', 'Ações'],
            itensPagina.map((usuarioItem) => {
              const ehProprio = usuarioItem.user_id === contexto.userId;
              return criarElemento('tr', {}, [
                criarElemento('td', {}, [
                  criarElemento('b', {
                    text: `${usuarioItem.full_name || usuarioItem.email || '—'}${ehProprio ? ' · você' : ''}`,
                  }),
                  criarElemento('p', { class: 'muted', text: usuarioItem.email || '' }),
                ]),
                criarElemento('td', { text: rotuloPapel(usuarioItem.role) }),
                criarElemento('td', {}, [
                  criarElemento('status-pill', {
                    status: usuarioItem.effective_active ? 'active' : 'inactive',
                    label: usuarioItem.effective_active ? 'Ativo' : 'Sem acesso',
                  }),
                ]),
                criarElemento('td', { text: formatar.dateTime(usuarioItem.last_seen_at) }),
                criarElemento(
                  'td',
                  {},
                  ehProprio
                    ? [criarElemento('span', { class: 'muted', text: 'Seu próprio acesso é protegido.' })]
                    : [
                        botao({
                          label: 'Alterar cargo',
                          variant: 'ghost',
                          permission: PERMISSAO.USERS_MANAGE,
                          onClick: () => abrirAlteracaoPapel(usuarioItem, recarregar),
                        }),
                        usuarioItem.membership_active
                          ? botao({
                              label: 'Suspender acesso',
                              variant: 'ghost',
                              permission: PERMISSAO.USERS_MANAGE,
                              onClick: async () => {
                                if (
                                  await confirmarAcao({
                                    title: 'Suspender acesso',
                                    description: `${usuarioItem.full_name || 'Esta pessoa'} deixará de entrar nesta empresa. A conta global continua existindo.`,
                                    confirmLabel: 'Suspender',
                                  })
                                ) {
                                  try {
                                    await dados.users.deactivate(usuarioItem.user_id);
                                    notificacao('Acesso suspenso.', { tone: 'success' });
                                    recarregar();
                                  } catch (erroCapturado) {
                                    notificacao(erroCapturado.message, { tone: 'danger' });
                                  }
                                }
                              },
                            })
                          : botao({
                              label: 'Restaurar acesso',
                              variant: 'ghost',
                              permission: PERMISSAO.USERS_MANAGE,
                              onClick: async () => {
                                try {
                                  await dados.users.reactivate(usuarioItem.user_id);
                                  notificacao('Acesso restaurado.', { tone: 'success' });
                                  recarregar();
                                } catch (erroCapturado) {
                                  notificacao(erroCapturado.message, { tone: 'danger' });
                                }
                              },
                            }),
                      ],
                ),
              ]);
            }),
          ),
        pageSize: 40,
      });
      const estatisticas = faixaResumo([
        {
          label: 'Com acesso',
          value: contarOnde(itens, (usuarioItem) => !!usuarioItem.effective_active),
          icon: 'check',
          tone: 'success',
        },
        {
          label: 'Administradores',
          value: contarOnde(
            itens,
            (usuarioItem) => usuarioItem.role === 'company_admin' && usuarioItem.effective_active,
          ),
          icon: 'shield',
          tone: 'info',
        },
        {
          label: 'Gestores',
          value: contarOnde(
            itens,
            (usuarioItem) => usuarioItem.role === 'fleet_manager' && usuarioItem.effective_active,
          ),
          icon: 'users',
        },
        {
          label: 'Sem acesso',
          value: contarOnde(itens, (usuarioItem) => !usuarioItem.effective_active),
          icon: 'ban',
          tone: 'muted',
        },
      ]);
      return criarElemento('div', {}, [cabecalho, estatisticas, explorador]);
    },
  );
}
