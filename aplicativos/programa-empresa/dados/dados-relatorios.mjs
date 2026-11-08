import { rpc as executarFuncaoBanco } from '../acesso/sessao-e-permissoes.mjs';
export const dadosRelatorios = {
  monthlyCosts: (parametroItem = {}) =>
    executarFuncaoBanco('report_monthly_costs', {
      p_from: parametroItem.from ?? null,
      p_to: parametroItem.to ?? null,
    }),
  vehicleCosts: (parametroItem = {}) =>
    executarFuncaoBanco('report_vehicle_costs', {
      p_from: parametroItem.from ?? null,
      p_to: parametroItem.to ?? null,
      p_page: parametroItem.page ?? 1,
      p_page_size: parametroItem.pageSize ?? 50,
    }),
  maintenanceDue: (parametroItem = {}) =>
    executarFuncaoBanco('report_maintenance_due', { p_horizon_days: parametroItem.horizonDays ?? 30 }),
  recentMovements: (parametroItem = {}) =>
    executarFuncaoBanco('report_recent_movements', {
      p_from: parametroItem.from ?? null,
      p_to: parametroItem.to ?? null,
      p_vehicle_id: parametroItem.vehicleId ?? null,
      p_location_id: parametroItem.locationId ?? null,
      p_page: parametroItem.page ?? 1,
      p_page_size: parametroItem.pageSize ?? 50,
    }),
};
