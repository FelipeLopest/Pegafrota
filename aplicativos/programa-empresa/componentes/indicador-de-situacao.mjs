export const TONALIDADES = {
  available: 'success',
  completed: 'success',
  active: 'success',
  entry: 'success',
  in_use: 'info',
  in_progress: 'info',
  planned: 'info',
  scheduled: 'info',
  exit: 'info',
  in_maintenance: 'warning',
  pending: 'warning',
  inactive: 'neutral',
  archived: 'neutral',
  cancelled: 'neutral',
  failed: 'danger',
  overdue: 'danger',
};

export class IndicadorSituacao extends HTMLElement {
  static observedAttributes = ['status', 'label'];
  connectedCallback() {
    this.render();
  }
  attributeChangedCallback() {
    this.render();
  }
  render() {
    const textoItem = this.getAttribute('status') || 'neutral';
    this.textContent = this.getAttribute('label') || textoItem;
    this.dataset.tone = TONALIDADES[textoItem] || 'neutral';
    this.setAttribute('role', 'status');
  }
}

export function registrarComponentes() {
  if (!customElements.get('status-pill')) customElements.define('status-pill', IndicadorSituacao);
}

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { TONALIDADES as TONE };
export { IndicadorSituacao as StatusPill };
