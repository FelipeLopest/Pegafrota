import {
  el as criarElemento,
  fmt as formatar,
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
  situacaoMotorista,
  rotuloSituacaoMotorista,
  solicitarTexto,
  contarOnde,
  faixaResumo,
} from '../componentes/listas-resumos-e-detalhes.mjs';
import { abrirEditorMotorista } from '../formularios/formulario-motorista.mjs';

export function telaMotoristas({ outlet: conteudoTela, setTitle: definirTitulo }) {
  definirTitulo('Motoristas');
  const recarregar = () => telaMotoristas({ outlet: conteudoTela, setTitle: definirTitulo });
  return tela(
    conteudoTela,
    PERMISSAO.DRIVERS_READ,
    () => dados.drivers.list(),
    (motoristas) => {
      const cabecalho = cabecalhoPagina({
        title: 'Motoristas',
        subtitle:
          'Encontre motoristas por nome, documento ou CNH e filtre rapidamente quem está apto para operar.',
        actions: [
          botao({
            label: 'Importar planilha',
            variant: 'automation',
            icon: 'upload',
            permission: PERMISSAO.DRIVERS_WRITE,
            onClick: () => navegar('/importar?tipo=motoristas'),
          }),
          botao({
            label: 'Novo motorista',
            variant: 'primary',
            icon: 'plus',
            permission: PERMISSAO.DRIVERS_WRITE,
            onClick: () => abrirEditorMotorista({ onDone: recarregar }),
          }),
        ],
      });
      const categorias = [
        ...new Set(motoristas.map((dadosRegistro) => dadosRegistro.license_category).filter(Boolean)),
      ].sort();
      const explorador = exploradorColecao(motoristas, {
        key: 'drivers',
        placeholder: 'Buscar nome, documento, telefone ou categoria da CNH',
        getText: (dadosRegistro) =>
          `${dadosRegistro.full_name} ${dadosRegistro.internal_document || ''} ${dadosRegistro.phone || ''} ${dadosRegistro.license_category || ''}`,
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
            match: (dadosRegistro, veiculoItem) =>
              veiculoItem === 'current'
                ? !dadosRegistro.archived_at
                : veiculoItem === 'active'
                  ? dadosRegistro.active && !dadosRegistro.archived_at
                  : veiculoItem === 'inactive'
                    ? !dadosRegistro.active && !dadosRegistro.archived_at
                    : veiculoItem === 'archived'
                      ? !!dadosRegistro.archived_at
                      : true,
          },
          {
            key: 'license',
            label: 'Validade da CNH',
            options: [
              ['', 'Qualquer validade'],
              ['expired', 'Vencida'],
              ['30d', 'Vence em até 30 dias'],
              ['valid', 'Válida por mais de 30 dias'],
              ['unknown', 'Sem validade informada'],
            ],
            match: (dadosRegistro, veiculoItem) => {
              if (!veiculoItem) return true;
              if (!dadosRegistro.license_expires_on) return veiculoItem === 'unknown';
              const delta =
                (new Date(`${dadosRegistro.license_expires_on}T23:59:59`).getTime() - Date.now()) / 86400000;
              return veiculoItem === 'expired'
                ? delta < 0
                : veiculoItem === '30d'
                  ? delta >= 0 && delta <= 30
                  : veiculoItem === 'valid'
                    ? delta > 30
                    : false;
            },
          },
          {
            key: 'category',
            label: 'Categoria CNH',
            options: [['', 'Todas'], ...categorias.map((registro) => [registro, registro])],
            get: (dadosRegistro) => dadosRegistro.license_category,
          },
        ],
        render: (lista) =>
          tabela(
            ['Motorista', 'Contato', 'CNH', 'Estado', 'Ações'],
            lista.map((dadosRegistro) =>
              criarElemento('tr', {}, [
                criarElemento('td', {}, [
                  criarElemento('button', {
                    class: 'row-link',
                    text: dadosRegistro.full_name,
                    onClick: () => navegar(`/motoristas/${dadosRegistro.id}`),
                  }),
                  criarElemento('p', {
                    class: 'muted',
                    text: dadosRegistro.internal_document || 'Sem documento interno',
                  }),
                ]),
                criarElemento('td', { text: dadosRegistro.phone || '—' }),
                criarElemento('td', {
                  text: `${dadosRegistro.license_category || '—'} · ${formatar.date(dadosRegistro.license_expires_on)}`,
                }),
                criarElemento('td', {}, [
                  criarElemento('status-pill', {
                    status: situacaoMotorista(dadosRegistro),
                    label: rotuloSituacaoMotorista(dadosRegistro),
                  }),
                ]),
                criarElemento('td', {}, [
                  botao({
                    label: 'Editar',
                    variant: 'ghost',
                    permission: PERMISSAO.DRIVERS_WRITE,
                    onClick: () => abrirEditorMotorista({ driver: dadosRegistro, onDone: recarregar }),
                  }),
                  dadosRegistro.archived_at
                    ? botao({
                        label: 'Desarquivar',
                        variant: 'ghost',
                        permission: PERMISSAO.DRIVERS_ARCHIVE,
                        onClick: async () => {
                          await dados.drivers.unarchive(dadosRegistro.id);
                          recarregar();
                        },
                      })
                    : botao({
                        label: dadosRegistro.active ? 'Desativar' : 'Ativar',
                        variant: 'ghost',
                        permission: PERMISSAO.DRIVERS_WRITE,
                        onClick: async () => {
                          try {
                            await dados.drivers.setActive(dadosRegistro.id, !dadosRegistro.active);
                            recarregar();
                          } catch (erroCapturado) {
                            notificacao(erroCapturado.message, { tone: 'danger' });
                          }
                        },
                      }),
                  !dadosRegistro.archived_at
                    ? botao({
                        label: 'Arquivar',
                        variant: 'ghost',
                        permission: PERMISSAO.DRIVERS_ARCHIVE,
                        onClick: async () => {
                          const motivo = await solicitarTexto({
                            title: 'Arquivar motorista',
                            label: 'Motivo do arquivamento',
                            hint: 'O motorista deixará de aparecer em novas viagens. O histórico já registrado será preservado.',
                            confirmLabel: 'Arquivar motorista',
                            danger: true,
                          });
                          if (!motivo) return;
                          try {
                            await dados.drivers.archive(dadosRegistro.id, motivo);
                            notificacao('Motorista arquivado.', { tone: 'success' });
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
      const expiraEmBreve = contarOnde(motoristas, (dadosRegistro) => {
        if (!dadosRegistro.license_expires_on || dadosRegistro.archived_at) return false;
        const dias =
          (new Date(`${dadosRegistro.license_expires_on}T23:59:59`).getTime() - Date.now()) / 86400000;
        return dias >= 0 && dias <= 30;
      });
      const estatisticas = faixaResumo([
        {
          label: 'Ativos',
          value: contarOnde(
            motoristas,
            (dadosRegistro) => dadosRegistro.active && !dadosRegistro.archived_at,
          ),
          icon: 'check',
          tone: 'success',
        },
        {
          label: 'Inativos',
          value: contarOnde(
            motoristas,
            (dadosRegistro) => !dadosRegistro.active && !dadosRegistro.archived_at,
          ),
          icon: 'ban',
          tone: 'muted',
        },
        {
          label: 'CNH até 30 dias',
          value: expiraEmBreve,
          icon: 'warning',
          tone: expiraEmBreve ? 'warning' : 'success',
        },
        {
          label: 'Arquivados',
          value: contarOnde(motoristas, (dadosRegistro) => !!dadosRegistro.archived_at),
          icon: 'archive',
          tone: 'muted',
        },
      ]);
      return criarElemento('div', {}, [cabecalho, estatisticas, explorador]);
    },
  );
}
