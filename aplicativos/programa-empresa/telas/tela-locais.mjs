import {
  el as criarElemento,
  botao,
  notificacao,
  navegar,
  cabecalhoPagina,
} from '../componentes/componentes-do-programa.mjs';

import { dados } from '../dados/dados-do-programa.mjs';

import { PERMISSAO } from '@peganafrota/contracts';
import {
  tela,
  exploradorColecao,
  tabela,
  solicitarTexto,
  faixaResumo,
  contarOnde,
} from '../componentes/listas-resumos-e-detalhes.mjs';
import { abrirEditorLocal } from '../formularios/formulario-local.mjs';

export function telaLocais({ outlet: conteudoTela, setTitle: definirTitulo }) {
  definirTitulo('Locais');
  const recarregar = () => telaLocais({ outlet: conteudoTela, setTitle: definirTitulo });
  return tela(
    conteudoTela,
    PERMISSAO.LOCATIONS_READ,
    () => dados.locations.list(),
    (locais) => {
      const cabecalho = cabecalhoPagina({
        title: 'Locais',
        subtitle:
          'Encontre pátios e pontos de acesso por nome, cidade ou UF. Arquivados ficam ocultos por padrão.',
        actions: [
          botao({
            label: 'Importar planilha',
            variant: 'automation',
            icon: 'upload',
            permission: PERMISSAO.LOCATIONS_WRITE,
            onClick: () => navegar('/importar?tipo=locais'),
          }),
          botao({
            label: 'Novo local',
            variant: 'primary',
            icon: 'plus',
            permission: PERMISSAO.LOCATIONS_WRITE,
            onClick: () => abrirEditorLocal({ onDone: recarregar }),
          }),
        ],
      });
      const estados = [...new Set(locais.map((linhaItem) => linhaItem.address_state).filter(Boolean))].sort();
      const explorador = exploradorColecao(locais, {
        key: 'locations',
        placeholder: 'Buscar local, cidade, UF ou observação',
        getText: (linhaItem) =>
          `${linhaItem.name} ${linhaItem.address_city || ''} ${linhaItem.address_state || ''} ${linhaItem.notes || ''}`,
        defaults: { state: 'current' },
        filters: [
          {
            key: 'state',
            label: 'Situação',
            options: [
              ['current', 'Ativos e inativos'],
              ['active', 'Somente ativos'],
              ['inactive', 'Somente inativos'],
              ['archived', 'Somente arquivados'],
              ['', 'Todos'],
            ],
            match: (linhaItem, veiculoItem) =>
              veiculoItem === 'current'
                ? !linhaItem.archived_at
                : veiculoItem === 'active'
                  ? linhaItem.active && !linhaItem.archived_at
                  : veiculoItem === 'inactive'
                    ? !linhaItem.active && !linhaItem.archived_at
                    : veiculoItem === 'archived'
                      ? !!linhaItem.archived_at
                      : true,
          },
          {
            key: 'uf',
            label: 'UF',
            options: [['', 'Todas'], ...estados.map((estadoAtual) => [estadoAtual, estadoAtual])],
            get: (linhaItem) => linhaItem.address_state,
          },
        ],
        render: (itens) =>
          tabela(
            ['Local', 'Endereço', 'Estado', 'Ações'],
            itens.map((linhaItem) =>
              criarElemento('tr', {}, [
                criarElemento('td', {}, [
                  criarElemento('b', { text: linhaItem.name }),
                  criarElemento('p', { class: 'muted', text: linhaItem.notes || '' }),
                ]),
                criarElemento('td', {
                  text: [linhaItem.address_city, linhaItem.address_state].filter(Boolean).join(' / ') || '—',
                }),
                criarElemento('td', {}, [
                  criarElemento('status-pill', {
                    status: linhaItem.archived_at ? 'archived' : linhaItem.active ? 'active' : 'inactive',
                    label: linhaItem.archived_at ? 'Arquivado' : linhaItem.active ? 'Ativo' : 'Inativo',
                  }),
                ]),
                criarElemento('td', {}, [
                  botao({
                    label: 'Editar',
                    variant: 'ghost',
                    permission: PERMISSAO.LOCATIONS_WRITE,
                    onClick: () => abrirEditorLocal({ location: linhaItem, onDone: recarregar }),
                  }),
                  linhaItem.archived_at
                    ? botao({
                        label: 'Desarquivar',
                        variant: 'ghost',
                        permission: PERMISSAO.LOCATIONS_WRITE,
                        onClick: async () => {
                          try {
                            await dados.locations.unarchive(linhaItem.id);
                            notificacao('Local desarquivado.', { tone: 'success' });
                            recarregar();
                          } catch (erroCapturado) {
                            notificacao(erroCapturado.message, { tone: 'danger' });
                          }
                        },
                      })
                    : botao({
                        label: linhaItem.active ? 'Desativar' : 'Ativar',
                        variant: 'ghost',
                        permission: PERMISSAO.LOCATIONS_WRITE,
                        onClick: async () => {
                          try {
                            await dados.locations.setActive(linhaItem.id, !linhaItem.active);
                            notificacao(linhaItem.active ? 'Local desativado.' : 'Local ativado.', {
                              tone: 'success',
                            });
                            recarregar();
                          } catch (erroCapturado) {
                            notificacao(erroCapturado.message, { tone: 'danger' });
                          }
                        },
                      }),
                  !linhaItem.archived_at
                    ? botao({
                        label: 'Arquivar',
                        variant: 'ghost',
                        permission: PERMISSAO.LOCATIONS_WRITE,
                        onClick: async () => {
                          const motivo = await solicitarTexto({
                            title: 'Arquivar local',
                            label: 'Motivo do arquivamento',
                            hint: 'O local deixará de ser oferecido em novas movimentações, mas o histórico continuará íntegro.',
                            confirmLabel: 'Arquivar local',
                            danger: true,
                          });
                          if (!motivo) return;
                          try {
                            await dados.locations.archive(linhaItem.id, motivo);
                            notificacao('Local arquivado.', { tone: 'success' });
                            recarregar();
                          } catch (erroCapturado) {
                            notificacao(erroCapturado.message, { tone: 'danger' });
                          }
                        },
                      })
                    : null,
                ]),
              ]),
            ),
          ),
        pageSize: 50,
      });
      const estatisticas = faixaResumo([
        {
          label: 'Ativos',
          value: contarOnde(locais, (linhaItem) => linhaItem.active && !linhaItem.archived_at),
          icon: 'pin',
          tone: 'success',
        },
        {
          label: 'Inativos',
          value: contarOnde(locais, (linhaItem) => !linhaItem.active && !linhaItem.archived_at),
          icon: 'ban',
          tone: 'muted',
        },
        {
          label: 'Arquivados',
          value: contarOnde(locais, (linhaItem) => !!linhaItem.archived_at),
          icon: 'archive',
          tone: 'muted',
        },
        {
          label: 'UFs cobertas',
          value: new Set(
            locais
              .filter((linhaItem) => !linhaItem.archived_at && linhaItem.address_state)
              .map((linhaItem) => linhaItem.address_state),
          ).size,
          icon: 'building',
          tone: 'info',
        },
      ]);
      return criarElemento('div', {}, [cabecalho, estatisticas, explorador]);
    },
  );
}
