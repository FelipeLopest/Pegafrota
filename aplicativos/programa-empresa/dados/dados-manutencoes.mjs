import { comandoPara } from './identificar-comando.mjs';
import {
  selecionar,
  contar,
  selecionarTodos,
  chaveFiltros,
  comCache,
  executarMutacao,
} from '../comunicacao/consultar-e-guardar-dados.mjs';
import { rpc as executarFuncaoBanco } from '../acesso/sessao-e-permissoes.mjs';
export const dadosManutencoes = {
  list: (filtros) =>
    comCache(
      `maintenance:${chaveFiltros(filtros)}`,
      () =>
        selecionarTodos('maintenance_records', {
          columns:
            'id,vehicle_id,maintenance_type,status,description,scheduled_for,' +
            'scheduled_odometer_km,started_at,completed_at,completion_odometer_km,' +
            'total_cost,supplier_name,invoice_number',
          filters: filtros,
          order: 'scheduled_for.desc',
        }),
      8000,
    ),
  recent: (filtros = {}, limite = 8) =>
    selecionar('maintenance_records', {
      columns:
        'id,vehicle_id,maintenance_type,status,description,scheduled_for,total_cost,supplier_name,invoice_number',
      filters: filtros,
      order: 'scheduled_for.desc',
      limit: limite,
    }),
  count: (filtros = {}) => contar('maintenance_records', filtros),
  schedule: (correspondenciaItem) =>
    executarMutacao(
      () =>
        executarFuncaoBanco('schedule_maintenance_work', {
          p_vehicle_id: correspondenciaItem.vehicleId,
          p_maintenance_type: correspondenciaItem.maintenanceType,
          p_description: correspondenciaItem.description,
          p_scheduled_for: correspondenciaItem.scheduledFor || null,
          p_scheduled_odometer_km: correspondenciaItem.scheduledOdometerKm || null,
          p_supplier_name: correspondenciaItem.supplierName || null,
          p_notes: correspondenciaItem.notes || null,
          p_interval_days: correspondenciaItem.intervalDays || null,
          p_interval_km: correspondenciaItem.intervalKm || null,
          p_command_id: comandoPara(correspondenciaItem),
        }),
      'maintenance',
      'vehicles',
      'dashboard',
    ),
  start: (identificador) =>
    executarMutacao(
      () =>
        executarFuncaoBanco('start_maintenance', {
          p_maintenance_id: identificador,
        }),
      'maintenance',
      'vehicles',
      'dashboard',
    ),
  complete: (identificador, dadosEnvio) =>
    executarMutacao(
      () =>
        executarFuncaoBanco('complete_maintenance_v2', {
          p_maintenance_id: identificador,
          p_total_cost: Number(dadosEnvio.totalCost),
          p_completed_at: dadosEnvio.completedAt || null,
          p_no_charge_reason: dadosEnvio.noChargeReason || null,
          p_command_id: comandoPara(dadosEnvio),
          p_completion_odometer_km: dadosEnvio.completionOdometerKm
            ? Number(dadosEnvio.completionOdometerKm)
            : null,
          p_supplier_name: dadosEnvio.supplierName || null,
          p_invoice_number: dadosEnvio.invoiceNumber || null,
        }),
      'maintenance',
      'vehicles',
      'dashboard',
    ),
  pausePlan: (id, motivo) =>
    executarMutacao(
      () =>
        executarFuncaoBanco('set_maintenance_plan_active', {
          p_plan_id: id,
          p_active: false,
          p_reason: motivo,
        }),
      'maintenance',
      'dashboard',
    ),
  cancel: (identificador, motivo) =>
    executarMutacao(
      () =>
        executarFuncaoBanco('cancel_maintenance', {
          p_maintenance_id: identificador,
          p_reason: motivo,
        }),
      'maintenance',
      'vehicles',
      'dashboard',
    ),
};
