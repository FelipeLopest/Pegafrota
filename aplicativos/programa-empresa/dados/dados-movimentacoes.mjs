import {
  selecionar,
  contar,
  selecionarTodos,
  chaveFiltros,
  comCache,
  executarMutacao,
} from '../comunicacao/consultar-e-guardar-dados.mjs';
import { rpc as executarFuncaoBanco } from '../acesso/sessao-e-permissoes.mjs';
export const dadosMovimentacoes = {
  list: (filtros) =>
    comCache(
      `movements:${chaveFiltros(filtros)}`,
      () =>
        selecionarTodos('vehicle_movements', {
          columns: 'id,vehicle_id,location_id,movement_type,occurred_at,source,notes',
          filters: filtros,
          order: 'occurred_at.desc',
        }),
      8000,
    ),
  recent: (limite = 60, filtros = {}) =>
    comCache(
      `movements:recent:${limite}:${chaveFiltros(filtros)}`,
      () =>
        selecionar('vehicle_movements', {
          columns: 'id,vehicle_id,location_id,movement_type,occurred_at,source,notes',
          filters: filtros,
          order: 'occurred_at.desc',
          limit: limite,
        }),
      5000,
    ),
  count: (filtros = {}) => contar('vehicle_movements', filtros),
  register: (correspondenciaItem) =>
    executarMutacao(
      () =>
        executarFuncaoBanco('register_vehicle_movement', {
          p_vehicle_id: correspondenciaItem.vehicleId,
          p_location_id: correspondenciaItem.locationId,
          p_notes: correspondenciaItem.notes || null,
        }),
      'movements',
      'yard',
      'vehicles',
      'dashboard',
    ),
  presence: (veiculoIdentificador) =>
    executarFuncaoBanco('vehicle_presence', { p_vehicle_id: veiculoIdentificador }),
};
