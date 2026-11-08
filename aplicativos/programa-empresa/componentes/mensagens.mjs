import { icone } from './icones.mjs';
import { el as criarElemento } from './criar-elemento.mjs';

export let conteinerNotificacao = null;

export function notificacao(mensagem, { tone: tom = 'info', duration: duracao = 5000 } = {}) {
  if (!conteinerNotificacao) {
    conteinerNotificacao = criarElemento('div', {
      class: 'toast-host',
      role: 'region',
      'aria-live': 'polite',
      'aria-label': 'Notificações',
    });
    document.body.append(conteinerNotificacao);
  }
  const ICONE_TONALIDADE = { success: 'check', danger: 'warning', warning: 'warning', info: 'info' };
  const no = criarElemento('div', { class: 'toast', dataset: { tone: tom } }, [
    icone(ICONE_TONALIDADE[tom] || 'info', { size: 'sm' }),
    criarElemento('span', { text: mensagem }),
  ]);
  conteinerNotificacao.append(no);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) no.dataset.enter = 'true';
  setTimeout(() => no.remove(), duracao);
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { conteinerNotificacao as hostNotificacao };
