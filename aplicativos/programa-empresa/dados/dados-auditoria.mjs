import { selecionar } from '../comunicacao/consultar-e-guardar-dados.mjs';

export const dadosAuditoria = {
  list: ({ page: pagina = 1, pageSize: tamanhoPagina = 100, filters: filtros = {} } = {}) =>
    selecionar('audit_events', {
      columns: '*',
      filters: filtros,
      order: 'occurred_at.desc',
      limit: Math.min(Math.max(Number(tamanhoPagina) || 100, 20), 250),
      offset:
        (Math.max(Number(pagina) || 1, 1) - 1) * Math.min(Math.max(Number(tamanhoPagina) || 100, 20), 250),
    }),
};
