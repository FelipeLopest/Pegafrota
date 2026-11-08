import {
  el as criarElemento,
  botao,
  notificacao,
  formatarDataHora as formatarDadosHora,
} from '../componentes/componentes-do-painel.mjs';

import {
  showConflict as mostrarConflito,
  confirmDestructive as confirmarAcaoDestrutiva,
} from '../formularios/confirmacoes-de-bloqueio-e-exclusao.mjs';

import { api as servicos } from '../comunicacao/comunicacao-com-servidor.mjs';

import {
  ROTULO_STATUS_OPERACAO as ROTULO_SITUACAO_OPERACAO,
  ETAPAS_PROVISIONAMENTO,
} from '@peganafrota/contracts';
import { withState as carregarComEstado, secao, detalhe } from '../componentes/listas-resumos-e-detalhes.mjs';

export async function telaDetalhesProvisionamento({
  outlet: conteudoTela,
  setTitle: definirTitulo,
  params: parametros,
}) {
  definirTitulo('Provisionamento');

  const renderizar = async () => {
    await carregarComEstado(
      conteudoTela,
      () => servicos.operations.get(parametros.id),
      (operacao) => {
        const acoes = criarElemento('div', { class: 'modal-actions' }, [
          botao({
            label: 'Retentar',
            variant: 'primary',
            disabled: !operacao.retryable,
            title: operacao.retryable
              ? 'Retoma a operação a partir da etapa que falhou.'
              : 'O backend não marcou esta operação como repetível.',
            onClick: async () => {
              try {
                await servicos.operations.retry(operacao.operationId);
                notificacao('Operação retomada.', { tone: 'success' });
                renderizar();
              } catch (erro) {
                if (erro.isConflict) mostrarConflito({ hint: erro.hint, message: erro.message });
                else notificacao(erro.message, { tone: 'danger' });
              }
            },
          }),
          botao({
            label: 'Compensar',
            variant: 'danger',
            icon: 'warning',
            disabled: ['succeeded', 'compensated'].includes(operacao.status),
            title: 'Arquiva a empresa criada pela metade. Nenhum dado é apagado.',
            onClick: async () => {
              const registro = await confirmarAcaoDestrutiva({
                title: 'Compensar provisionamento',
                description:
                  'A empresa criada pela metade será arquivada e os convites revogados. Nenhum dado é apagado.',
                expectedName: 'COMPENSAR',
                confirmLabel: 'Compensar',
                consequences: [
                  'A empresa é arquivada, não excluída.',
                  'A trilha de auditoria é preservada.',
                  'A operação pode ser retentada depois.',
                ],
              });
              if (!registro.confirmed) return;
              try {
                const resultadoItem = await servicos.operations.compensate(
                  operacao.operationId,
                  'compensação manual',
                );
                notificacao(
                  resultadoItem.status === 'needs_manual'
                    ? 'A empresa já possui dados. Reversão automática recusada.'
                    : 'Provisionamento compensado.',
                  { tone: resultadoItem.status === 'needs_manual' ? 'warning' : 'success' },
                );
                renderizar();
              } catch (erro) {
                notificacao(erro.message, { tone: 'danger' });
              }
            },
          }),
        ]);

        return criarElemento('div', {}, [
          secao('Operação', [
            criarElemento('div', { class: 'detail-grid' }, [
              detalhe('Identificador', operacao.operationId),
              criarElemento('div', { class: 'detail-item' }, [
                criarElemento('p', { class: 'detail-label', text: 'Estado' }),
                criarElemento('status-pill', {
                  status: operacao.status,
                  label: ROTULO_SITUACAO_OPERACAO[operacao.status],
                }),
              ]),
              detalhe('Tentativas', operacao.attemptCount),
              detalhe('Erro', operacao.errorCode),
              detalhe('Detalhe', operacao.errorDetail),
              detalhe('Iniciada em', operacao.startedAt ? formatarDadosHora(operacao.startedAt) : '—'),
              detalhe('Concluída em', operacao.finishedAt ? formatarDadosHora(operacao.finishedAt) : '—'),
            ]),
            acoes,
          ]),

          secao('Sub-operações', [
            criarElemento(
              'div',
              { class: 'progress-steps' },
              (operacao.steps || []).map((textoItem) =>
                criarElemento('div', { class: 'progress-step', dataset: { status: textoItem.status } }, [
                  criarElemento('status-pill', { status: textoItem.status, label: textoItem.status }),
                  criarElemento('div', { class: 'progress-step-body' }, [
                    criarElemento('p', {
                      class: 'progress-step-label',
                      text:
                        ETAPAS_PROVISIONAMENTO.find((parametroItem) => parametroItem.code === textoItem.code)
                          ?.label || textoItem.code,
                    }),
                    criarElemento('p', {
                      class: 'progress-step-detail',
                      text: textoItem.detail || textoItem.errorCode || '',
                    }),
                  ]),
                ]),
              ),
            ),
          ]),
        ]);
      },
    );
  };

  await renderizar();
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { telaDetalhesProvisionamento as screenOperationDetail };
