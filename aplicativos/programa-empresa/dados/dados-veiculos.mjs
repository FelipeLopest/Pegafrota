import {
  selecionar,
  selecionarTodos,
  chaveFiltros,
  comCache,
  executarMutacao,
} from '../comunicacao/consultar-e-guardar-dados.mjs';
import { rpc as executarFuncaoBanco } from '../acesso/sessao-e-permissoes.mjs';
export const dadosVeiculos = {
  list: (opcoes = {}) =>
    comCache(
      `vehicles:${chaveFiltros(opcoes.filters)}`,
      () =>
        selecionarTodos('vehicles', {
          columns:
            'id,plate,brand,model,model_year,manufacture_year,fuel_type,color,category,tank_capacity_l,notes,status,current_odometer_km,archived_at,created_at,updated_at',
          filters: opcoes.filters,
          order: 'plate.asc',
        }),
      opcoes.filters ? 12000 : 30000,
    ),
  create: (veiculoItem) =>
    executarMutacao(
      () =>
        executarFuncaoBanco('create_vehicle', {
          p_plate: veiculoItem.plate,
          p_brand: veiculoItem.brand,
          p_model: veiculoItem.model,
          p_fuel_type: veiculoItem.fuelType,
          p_model_year: veiculoItem.modelYear ? Number(veiculoItem.modelYear) : null,
          p_initial_odometer_km: veiculoItem.initialOdometerKm ? Number(veiculoItem.initialOdometerKm) : 0,
          p_color: veiculoItem.color || null,
          p_category: veiculoItem.category || null,
          p_tank_capacity_l: veiculoItem.tankCapacityL ? Number(veiculoItem.tankCapacityL) : null,
          p_notes: veiculoItem.notes || null,
        }),
      'vehicles',
      'dashboard',
      'yard',
    ),
  get: async (identificador) =>
    (await selecionar('vehicles', { columns: '*', filters: { id: `eq.${identificador}` }, limit: 1 }))[0] ??
    null,
  update: (identificador, correcao) =>
    executarMutacao(
      () => executarFuncaoBanco('update_vehicle', { p_vehicle_id: identificador, p_patch: correcao }),
      'vehicles',
      'dashboard',
      'yard',
    ),
  setStatus: (identificador, situacao) =>
    executarMutacao(
      () => executarFuncaoBanco('set_vehicle_status', { p_vehicle_id: identificador, p_status: situacao }),
      'vehicles',
      'dashboard',
      'yard',
    ),
  archive: (identificador, motivo) =>
    executarMutacao(
      () => executarFuncaoBanco('archive_vehicle', { p_vehicle_id: identificador, p_reason: motivo ?? null }),
      'vehicles',
      'dashboard',
      'yard',
    ),
  unarchive: (identificador) =>
    executarMutacao(
      () => executarFuncaoBanco('unarchive_vehicle', { p_vehicle_id: identificador }),
      'vehicles',
      'dashboard',
      'yard',
    ),
};
