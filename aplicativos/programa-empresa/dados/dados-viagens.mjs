import {
  selecionar,
  contar,
  selecionarTodos,
  chaveFiltros,
  comCache,
  executarMutacao,
} from '../comunicacao/consultar-e-guardar-dados.mjs';
import { rpc as executarFuncaoBanco } from '../acesso/sessao-e-permissoes.mjs';
import { comandoPara } from './identificar-comando.mjs';
export const dadosViagens = {
  createAndStart: (planejamento, operacao) => executarMutacao(
    () => executarFuncaoBanco('create_and_start_trip', {
      p_trip: planejamento,
      p_odometer_km: Number(operacao.odometerKm),
      p_occurred_at: operacao.occurredAt,
      p_location_id: operacao.locationId || null,
      p_command_id: comandoPara(operacao),
    }),
    'trips', 'vehicles', 'drivers', 'dashboard', 'yard', 'movements', 'odometer', 'company:workflow',
  ),
  list: (filtros) =>
    comCache(
      `trips:${chaveFiltros(filtros)}`,
      () =>
        selecionarTodos('trips', {
          columns:
            'id,vehicle_id,driver_id,status,origin_label,destination_label,' +
            'planned_departure_at,planned_return_at,actual_departure_at,actual_return_at,' +
            'start_odometer_km,end_odometer_km,purpose,notes',
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
        executarFuncaoBanco('save_trip', {
          p_trip_id: itemAtual.id || null,
          p_vehicle_id: itemAtual.vehicleId,
          p_driver_id: itemAtual.driverId,
          p_origin_label: itemAtual.originLabel,
          p_destination_label: itemAtual.destinationLabel,
          p_planned_departure_at: itemAtual.plannedDepartureAt || null,
          p_planned_return_at: itemAtual.plannedReturnAt || null,
          p_purpose: itemAtual.purpose || null,
          p_notes: itemAtual.notes || null,
          p_command_id: comandoPara(itemAtual),
        }),
      'trips',
      'vehicles',
      'drivers',
      'dashboard',
      'company:workflow',
    ),
  operate: (formulario) =>
    executarMutacao(
      () =>
        executarFuncaoBanco('trip_operation', {
          p_trip_id: formulario.tripId,
          p_action: formulario.action,
          p_odometer_km: Number(formulario.odometerKm),
          p_occurred_at: formulario.occurredAt || null,
          p_location_id: formulario.locationId || null,
          p_reason: formulario.reason || null,
          p_command_id: comandoPara(formulario),
        }),
      'trips',
      'vehicles',
      'drivers',
      'dashboard',
      'yard',
      'movements',
      'odometer',
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
      () =>
        executarFuncaoBanco('cancel_trip', {
          p_trip_id: identificador,
          p_reason: motivo,
        }),
      'trips',
      'vehicles',
      'dashboard',
    ),
};
