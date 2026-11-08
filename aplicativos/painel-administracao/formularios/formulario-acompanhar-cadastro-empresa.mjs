import { el as criarElemento, modal } from '../componentes/componentes-do-painel.mjs';

import { ETAPAS_PROVISIONAMENTO } from '@peganafrota/contracts';

export function mostrarProgressoCadastroEmpresa() {
  const linhas = new Map();
  const lista = criarElemento(
    'div',
    { class: 'progress-steps' },
    ETAPAS_PROVISIONAMENTO.map((textoItem) => {
      const noDetalhe = criarElemento('p', { class: 'progress-step-detail', text: 'Aguardando' });
      const etiquetaSituacao = criarElemento('status-pill', { status: 'pending', label: 'Aguardando' });
      const linha = criarElemento('div', { class: 'progress-step', dataset: { status: 'pending' } }, [
        etiquetaSituacao,
        criarElemento('div', { class: 'progress-step-body' }, [
          criarElemento('p', { class: 'progress-step-label', text: textoItem.label }),
          noDetalhe,
        ]),
      ]);
      linhas.set(textoItem.code, { row: linha, pill: etiquetaSituacao, detailNode: noDetalhe });
      return linha;
    }),
  );

  const correspondenciaItem = modal({
    title: 'Provisionando empresa',
    body: lista,
    dismissible: false,
  });

  return {
    update(operacao) {
      for (const textoItem of operacao.steps || []) {
        const resultadoItem = linhas.get(textoItem.code);
        if (!resultadoItem) continue;
        resultadoItem.row.dataset.status = textoItem.status;
        resultadoItem.pill.setAttribute('status', textoItem.status);
        resultadoItem.pill.setAttribute(
          'label',
          {
            pending: 'Aguardando',
            running: 'Em andamento',
            succeeded: 'Concluída',
            failed: 'Falhou',
            skipped: 'Ignorada',
            compensated: 'Revertida',
          }[textoItem.status] || textoItem.status,
        );
        resultadoItem.detailNode.textContent = textoItem.detail || textoItem.errorCode || '';
      }
    },
    close: () => correspondenciaItem.close(),
  };
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { mostrarProgressoCadastroEmpresa as showProvisioningProgress };
