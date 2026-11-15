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
export const dadosAbastecimentos = {
  list: (filtros) =>
    comCache(
      `fuelings:${chaveFiltros(filtros)}`,
      () =>
        selecionarTodos('fuelings', {
          columns:
            'id,vehicle_id,driver_id,fuel_type,liters,price_per_liter,total_amount,' +
            'odometer_km,fueled_at,station_name,full_tank,voided_at,void_reason,unit',
          filters: { voided_at: 'is.null', ...filtros },
          order: 'fueled_at.desc',
        }),
      8000,
    ),
  recent: (filtros = {}, limite = 8) =>
    selecionar('fuelings', {
      columns:
        'id,vehicle_id,fuel_type,liters,total_amount,odometer_km,fueled_at,station_name,voided_at,full_tank',
      filters: { voided_at: 'is.null', ...filtros },
      order: 'fueled_at.desc',
      limit: limite,
    }),
  count: (filtros = {}) => contar('fuelings', filtros),
  create: (formulario) =>
    executarMutacao(
      () =>
        executarFuncaoBanco('save_fueling', {
          p_vehicle_id: formulario.vehicleId,
          p_liters: Number(formulario.liters),
          p_price_per_liter: Number(formulario.pricePerLiter),
          p_odometer_km: Number(formulario.odometerKm),
          p_fuel_type: formulario.fuelType,
          p_fueled_at: formulario.fueledAt || null,
          p_driver_id: formulario.driverId || null,
          p_trip_id: formulario.tripId || null,
          p_station_name: formulario.stationName || null,
          p_full_tank: Boolean(formulario.fullTank),
          p_notes: formulario.notes || null,
          p_total_amount:
            formulario.totalAmount !== '' && formulario.totalAmount != null
              ? Number(formulario.totalAmount)
              : null,
          p_command_id: comandoPara(formulario),
        }),
      'fuelings',
      'vehicles',
      'dashboard',
    ),
  replace: (formulario) =>
    executarMutacao(
      () =>
        executarFuncaoBanco('replace_fueling', {
          p_fueling_id: formulario.fuelingId,
          p_reason: formulario.reason,
          p_liters: Number(formulario.liters),
          p_price_per_liter: Number(formulario.pricePerLiter),
          p_odometer_km: Number(formulario.odometerKm),
          p_fuel_type: formulario.fuelType,
          p_fueled_at: formulario.fueledAt || null,
          p_driver_id: formulario.driverId || null,
          p_trip_id: formulario.tripId || null,
          p_station_name: formulario.stationName || null,
          p_full_tank: Boolean(formulario.fullTank),
          p_notes: formulario.notes || null,
          p_total_amount: Number(formulario.totalAmount),
          p_command_id: comandoPara(formulario),
        }),
      'fuelings',
      'vehicles',
      'dashboard',
    ),
  reverse: (formulario) =>
    executarMutacao(
      () =>
        executarFuncaoBanco('reverse_fueling', {
          p_fueling_id: formulario.fuelingId,
          p_reason: formulario.reason,
          p_command_id: comandoPara(formulario),
        }),
      'fuelings',
      'vehicles',
      'dashboard',
    ),
  consumption: (veiculoId = null) =>
    selecionar('v_vehicle_fuel_consumption', {
      filters: veiculoId ? { vehicle_id: `eq.${veiculoId}` } : {},
      limit: 100,
    }),
};
