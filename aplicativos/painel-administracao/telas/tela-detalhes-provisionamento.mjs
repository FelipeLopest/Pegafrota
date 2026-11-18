import {
  el as criarElemento,
  botao,
  campo,
  modal,
  notificacao,
  formatarDataHora as formatarDadosHora,
} from '../componentes/componentes-do-painel.mjs';

import {
  showConflict as mostrarConflito,
  confirmDestructive as confirmarAcaoDestrutiva,
} from '../formularios/confirmacoes-de-bloqueio-e-exclusao.mjs';

import { api as servicos } from '../comunicacao/comunicacao-com-servidor.mjs';
import { navegar } from '../navegacao/trocar-tela.mjs';

import {
  ETAPAS_PROVISIONAMENTO,
} from '@peganafrota/contracts';
import { validarSenha } from '@peganafrota/validation';
import {
  cabecalhoPagina,
  withState as carregarComEstado,
  secao,
  detalhe,
  ROTULO_SITUACAO_CADASTRO,
} from '../componentes/listas-resumos-e-detalhes.mjs';

function solicitarSenhaInicial(aoConfirmar) {
  let janela;
  const senha = criarElemento('input', {
    class: 'input',
    type: 'password',
    autocomplete: 'new-password',
    maxlength: '72',
  });
  const erro = criarElemento('p', { class: 'field-error', role: 'alert' });
  const continuar = botao({
    label: 'Tentar novamente',
    variant: 'primary',
    onClick: async () => {
      const validacao = validarSenha(senha.value);
      if (!validacao.ok) {
        erro.textContent = validacao.errors.password;
        return;
      }
      continuar.disabled = true;
      try {
        await aoConfirmar(senha.value);
        senha.value = '';
        janela.close();
      } catch (falha) {
        erro.textContent = falha.message || 'Não foi possível retomar o cadastro.';
      } finally {
        continuar.disabled = false;
      }
    },
  });
  janela = modal({
    title: 'Tentar novamente',
    body: criarElemento('div', {}, [
      campo({
        id: 'senha-retomar-cadastro',
        label: 'Senha inicial do primeiro administrador',
        required: true,
        hint: 'Informe a senha definida na primeira tentativa.',
        control: senha,
      }),
      erro,
    ]),
    footer: criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Cancelar', onClick: () => janela.close() }),
      continuar,
    ]),
  });
}

export async function telaDetalhesProvisionamento({
  outlet: conteudoTela,
  setTitle: definirTitulo,
  params: parametros,
}) {
  definirTitulo('Detalhes do cadastro');

  const renderizar = async () => {
    await carregarComEstado(
      conteudoTela,
      () => servicos.operations.get(parametros.id),
      (operacao) => {
        const usaSenha = operacao.requestPayload?.firstAdmin?.accessMode === 'password';
        const cadastroAnteriorIncompleto = usaSenha && Boolean(operacao.companyId);
        const podeRetentar = operacao.retryable && !cadastroAnteriorIncompleto;
        async function retentar(senha) {
          const resultado = await servicos.operations.retry(operacao.operationId, senha);
          notificacao(
            resultado.status === 'succeeded' ? 'Cadastro concluído.' : 'Cadastro retomado.',
            { tone: 'success' },
          );
          await renderizar();
        }
        const acoes = criarElemento('div', { class: 'modal-actions' }, [
          botao({
            label: 'Tentar novamente',
            variant: 'primary',
            disabled: !podeRetentar,
            title: podeRetentar
              ? 'Retoma o cadastro a partir da etapa que falhou.'
              : cadastroAnteriorIncompleto
                ? 'Cadastro anterior com empresa já gravada. Revise o caso antes de retomar.'
                : 'Este cadastro não pode ser retomado.',
            onClick: async () => {
              if (usaSenha) {
                solicitarSenhaInicial(retentar);
                return;
              }
              try {
                await retentar();
              } catch (erro) {
                if (erro.isConflict) mostrarConflito({ hint: erro.hint, message: erro.message });
                else notificacao(erro.message, { tone: 'danger' });
              }
            },
          }),
          botao({
            label: 'Desfazer cadastro',
            variant: 'danger',
            icon: 'warning',
            disabled: ['succeeded', 'compensated'].includes(operacao.status),
            title: 'Arquiva a empresa criada pela metade. Nenhum dado é apagado.',
            onClick: async () => {
              const registro = await confirmarAcaoDestrutiva({
                title: 'Desfazer cadastro incompleto',
                description:
                  'A empresa será arquivada, os convites serão cancelados e os dados serão preservados.',
                expectedName: 'DESFAZER',
                confirmLabel: 'Desfazer cadastro',
                consequences: [
                  'A empresa é arquivada, não excluída.',
                  'A trilha de auditoria é preservada.',
                  'Você poderá tentar o cadastro novamente.',
                ],
              });
              if (!registro.confirmed) return;
              try {
                const resultadoItem = await servicos.operations.compensate(
                  operacao.operationId,
                  'Cadastro desfeito pelo administrador',
                );
                notificacao(
                  resultadoItem.status === 'needs_manual'
                    ? 'A empresa já tem dados. Revise o cadastro antes de desfazer.'
                    : 'Cadastro desfeito.',
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
          cabecalhoPagina({
            title: operacao.companyTradeName || 'Detalhes do cadastro',
            actions: [
              botao({ label: 'Voltar aos cadastros', onClick: () => navegar('/provisionamentos') }),
            ],
          }),
          secao('Detalhes do cadastro', [
            criarElemento('div', { class: 'detail-grid' }, [
              detalhe('Identificador', operacao.operationId),
              criarElemento('div', { class: 'detail-item' }, [
                criarElemento('p', { class: 'detail-label', text: 'Estado' }),
                criarElemento('status-pill', {
                  status: operacao.status,
                  label: ROTULO_SITUACAO_CADASTRO[operacao.status],
                }),
              ]),
              detalhe('Tentativas', operacao.attemptCount),
              detalhe('Erro', operacao.errorCode),
              detalhe('Detalhe', operacao.errorDetail),
              detalhe(
                'Iniciada em',
                operacao.startedAt ? formatarDadosHora(operacao.startedAt) : '—',
              ),
              detalhe(
                'Concluída em',
                operacao.finishedAt ? formatarDadosHora(operacao.finishedAt) : '—',
              ),
            ]),
            acoes,
          ]),

          secao('Etapas do cadastro', [
            criarElemento(
              'div',
              { class: 'progress-steps' },
              (operacao.steps || []).map((textoItem) =>
                criarElemento(
                  'div',
                  { class: 'progress-step', dataset: { status: textoItem.status } },
                  [
                    criarElemento('status-pill', {
                      status: textoItem.status,
                      label: ROTULO_SITUACAO_CADASTRO[textoItem.status] ||
                        (textoItem.status === 'skipped' ? 'Ignorada' : textoItem.status),
                    }),
                    criarElemento('div', { class: 'progress-step-body' }, [
                      criarElemento('p', {
                        class: 'progress-step-label',
                        text:
                          ETAPAS_PROVISIONAMENTO.find(
                            (parametroItem) => parametroItem.code === textoItem.code,
                          )?.label || textoItem.code,
                      }),
                      criarElemento('p', {
                        class: 'progress-step-detail',
                        text: textoItem.detail || textoItem.errorCode || '',
                      }),
                    ]),
                  ],
                ),
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
