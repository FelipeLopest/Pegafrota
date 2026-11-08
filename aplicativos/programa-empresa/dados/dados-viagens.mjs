import {
  selecionar,
  contar,
  selecionarTodos,
  chaveFiltros,
  comCache,
  executarMutacao,
} from '../comunicacao/consultar-e-guardar-dados.mjs';
import { rpc as executarFuncaoBanco } from '../acesso/sessao-e-permissoes.mjs';
export const dadosViagens = {
  list: (filtros) =>
    comCache(
      `trips:${chaveFiltros(filtros)}`,
      () =>
        selecionarTodos('trips', {
          columns:
            'id,vehicle_id,driver_id,status,origin_label,destination_label,' +
            'planned_departure_at,planned_return_at,actual_departure_at,actual_return_at,' +
            'start_odometer_km,end_odometer_km',
          filters: filtros,
          order: 'created_at.desc',
        }),
      8000,
    ),
  recent: (filtros = {}, limite = 12) =>
    selecionar('trips', {
      columns:
        'id,vehicle_id,driver_id,status,origin_label,destination_label,planned_departure_at,actual_departure_at,actual_return_at,start_odometer_km,end_odometer_km',
      filters: filtros,
      order: 'created_at.desc',
      limit: limite,
    }),
  count: (filtros = {}) => contar('trips', filtros),
  create: (itemAtual) =>
    executarMutacao(
      () =>
        executarFuncaoBanco('create_trip', {
          p_vehicle_id: itemAtual.vehicleId,
          p_driver_id: itemAtual.driverId,
          p_origin_label: itemAtual.originLabel,
          p_destination_label: itemAtual.destinationLabel,
          p_planned_departure_at: itemAtual.plannedDepartureAt || null,
          p_planned_return_at: itemAtual.plannedReturnAt || null,
        }),
      'trips',
      'vehicles',
      'drivers',
      'dashboard',
    ),
  start: (identificador, odometroKm) =>
    executarMutacao(
      () =>
        executarFuncaoBanco('start_trip', {
          p_trip_id: identificador,
          p_start_odometer_km: odometroKm,
        }),
      'trips',
      'vehicles',
      'dashboard',
      'yard',
    ),
  complete: (identificador, odometroKm) =>
    executarMutacao(
      () =>
        executarFuncaoBanco('complete_trip', {
          p_trip_id: identificador,
          p_end_odometer_km: odometroKm,
        }),
      'trips',
      'vehicles',
      'dashboard',
      'yard',
    ),
  cancel: (identificador, motivo) =>
    executarMutacao(
      () => executarFuncaoBanco('cancel_trip', { p_trip_id: identificador, p_reason: motivo }),
      'trips',
      'vehicles',
      'dashboard',
    ),
};
