import { selecionarTodos, comCache, executarMutacao } from '../comunicacao/consultar-e-guardar-dados.mjs';
import { rpc as executarFuncaoBanco } from '../acesso/sessao-e-permissoes.mjs';
export const dadosLocais = {
  list: () =>
    comCache(
      'locations',
      () =>
        selecionarTodos('locations', {
          columns:
            'id,name,address_street,address_number,address_district,address_city,address_state,address_postal_code,timezone,active,notes,archived_at,created_at,updated_at',
          order: 'name.asc',
        }),
      30000,
    ),
  eligible: () =>
    comCache(
      'locations:eligible',
      () =>
        selecionarTodos('locations', {
          columns: 'id,name,address_city,address_state,active,archived_at',
          filters: { active: 'eq.true', archived_at: 'is.null' },
          order: 'name.asc',
        }),
      30000,
    ),
  create: (linhaItem) =>
    executarMutacao(
      () =>
        executarFuncaoBanco('create_location', {
          p_name: linhaItem.name,
          p_address_street: linhaItem.addressStreet || null,
          p_address_number: linhaItem.addressNumber || null,
          p_address_district: linhaItem.addressDistrict || null,
          p_address_city: linhaItem.addressCity || null,
          p_address_state: linhaItem.addressState || null,
          p_address_postal_code: linhaItem.addressPostalCode || null,
          p_timezone: linhaItem.timezone || null,
          p_notes: linhaItem.notes || null,
        }),
      'locations',
      'yard',
      'dashboard',
    ),
  update: (identificador, correcao) =>
    executarMutacao(
      () => executarFuncaoBanco('update_location', { p_location_id: identificador, p_patch: correcao }),
      'locations',
      'yard',
    ),
  setActive: (identificador, ativo) =>
    executarMutacao(
      () => executarFuncaoBanco('set_location_active', { p_location_id: identificador, p_active: ativo }),
      'locations',
      'yard',
    ),
  archive: (identificador, motivo) =>
    executarMutacao(
      () =>
        executarFuncaoBanco('archive_location', { p_location_id: identificador, p_reason: motivo || null }),
      'locations',
      'yard',
    ),
  unarchive: (identificador) =>
    executarMutacao(
      () => executarFuncaoBanco('unarchive_location', { p_location_id: identificador }),
      'locations',
      'yard',
    ),
};
