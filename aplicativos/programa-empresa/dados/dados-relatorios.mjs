import { rpc as executarFuncaoBanco } from '../acesso/sessao-e-permissoes.mjs';

export const consultarRelatorio = (tipo, parametros = {}) =>
  executarFuncaoBanco('fleet_report', {
    p_kind: tipo,
    p_from: parametros.from || null,
    p_to: parametros.to || null,
    p_page: parametros.page || 1,
    p_page_size: parametros.pageSize || 50,
    p_vehicle_id: parametros.vehicleId || null,
    p_location_id: parametros.locationId || null,
  });
export const dadosRelatorios = {
  monthlyCosts: (parametros) => consultarRelatorio('monthlyCosts', parametros),
  vehicleCosts: (parametros) => consultarRelatorio('vehicleCosts', parametros),
  maintenanceDue: (parametros) => consultarRelatorio('maintenanceDue', parametros),
  recentMovements: (parametros) => consultarRelatorio('recentMovements', parametros),
  fuelEfficiency: (parametros) => consultarRelatorio('fuelEfficiency', parametros),
};
