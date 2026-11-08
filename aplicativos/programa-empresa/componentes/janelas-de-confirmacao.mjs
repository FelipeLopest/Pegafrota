import { icone } from './icones.mjs';
import { el as criarElemento } from './criar-elemento.mjs';
import { botao } from './botoes.mjs';

export const ELEMENTOS_FOCAVEIS =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function modal({
  title: titulo,
  body: corpo,
  footer: rodape,
  size: tamanho = 'md',
  dismissible: podeFechar = true,
  onClose: aoClose,
}) {
  const anterior = document.activeElement;
  const tituloIdentificador = `m-${Math.random().toString(36).slice(2, 8)}`;

  const dialogo = criarElemento(
    'div',
    {
      class: 'modal',
      dataset: { size: tamanho },
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': tituloIdentificador,
    },
    [
      criarElemento('header', { class: 'modal-header' }, [
        criarElemento('h2', { class: 'modal-title', id: tituloIdentificador, text: titulo }),
        podeFechar
          ? criarElemento(
              'button',
              { class: 'modal-close', type: 'button', 'aria-label': 'Fechar', onClick: () => fechar() },
              [icone('close', { size: 'sm' })],
            )
          : null,
      ]),
      criarElemento('div', { class: 'modal-body' }, [corpo]),
      rodape ? criarElemento('footer', { class: 'modal-footer' }, [rodape]) : null,
    ],
  );

  const fundoModal = criarElemento(
    'div',
    {
      class: 'modal-backdrop',
      onClick: (evento) => {
        if (podeFechar && evento.target === fundoModal) fechar();
      },
    },
    [dialogo],
  );

  function aoTeclar(evento) {
    if (evento.key === 'Escape' && podeFechar) {
      evento.preventDefault();
      fechar();
      return;
    }
    if (evento.key !== 'Tab') return;
    const itens = [...dialogo.querySelectorAll(ELEMENTOS_FOCAVEIS)].filter(
      (quantidadeItem) => quantidadeItem.offsetParent !== null,
    );
    if (!itens.length) return;
    const primeiro = itens[0];
    const ultimo = itens[itens.length - 1];
    if (evento.shiftKey && document.activeElement === primeiro) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  }

  function fechar(resultado) {
    document.removeEventListener('keydown', aoTeclar, true);
    fundoModal.remove();
    document.body.style.removeProperty('overflow');
    anterior?.focus?.();
    aoClose?.(resultado);
  }

  document.addEventListener('keydown', aoTeclar, true);
  document.body.style.overflow = 'hidden';
  document.body.append(fundoModal);
  dialogo.querySelector(ELEMENTOS_FOCAVEIS)?.focus?.();
  return { close: fechar, dialog: dialogo };
}

export function confirmarAcao({
  title: titulo,
  description: descricao,
  confirmLabel: confirmarRotulo,
  consequences: consequencias = [],
}) {
  return new Promise((resolver) => {
    let resolvido = false;
    const finalizar = (valor) => {
      if (resolvido) return;
      resolvido = true;
      resolver(valor);
    };
    let correspondenciaItem;
    const rodape = criarElemento('div', { class: 'modal-actions' }, [
      botao({ label: 'Cancelar', onClick: () => correspondenciaItem.close(false) }),
      botao({ label: confirmarRotulo, variant: 'danger', onClick: () => correspondenciaItem.close(true) }),
    ]);
    correspondenciaItem = modal({
      title: titulo,
      body: criarElemento('div', {}, [
        criarElemento('p', { text: descricao }),
        consequencias.length
          ? criarElemento(
              'ul',
              {},
              consequencias.map((registro) => criarElemento('li', { text: registro })),
            )
          : null,
      ]),
      footer: rodape,
      onClose: (resultado) => finalizar(resultado === true),
    });
  });
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { ELEMENTOS_FOCAVEIS as FOCUSABLE };
export { confirmarAcao as confirmAction };
