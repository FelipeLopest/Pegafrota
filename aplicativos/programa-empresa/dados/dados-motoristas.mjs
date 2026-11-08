import {
  selecionar,
  selecionarTodos,
  comCache,
  executarMutacao,
} from '../comunicacao/consultar-e-guardar-dados.mjs';
import { rpc as executarFuncaoBanco } from '../acesso/sessao-e-permissoes.mjs';
export const dadosMotoristas = {
  list: () =>
    comCache(
      'drivers',
      () =>
        selecionarTodos('drivers', {
          columns:
            'id,full_name,internal_document,phone,license_category,license_expires_on,active,notes,archived_at,created_at,updated_at',
          order: 'full_name.asc',
        }),
      30000,
    ),
  get: async (identificador) =>
    (await selecionar('drivers', { columns: '*', filters: { id: `eq.${identificador}` }, limit: 1 }))[0] ??
    null,
  create: (dadosRegistro) =>
    executarMutacao(
      () =>
        executarFuncaoBanco('create_driver', {
          p_full_name: dadosRegistro.fullName,
          p_internal_document: dadosRegistro.internalDocument || null,
          p_phone: dadosRegistro.phone || null,
          p_license_category: dadosRegistro.licenseCategory || null,
          p_license_expires_on: dadosRegistro.licenseExpiresOn || null,
          p_notes: dadosRegistro.notes || null,
        }),
      'drivers',
      'dashboard',
    ),
  update: (identificador, correcao) =>
    executarMutacao(
      () => executarFuncaoBanco('update_driver', { p_driver_id: identificador, p_patch: correcao }),
      'drivers',
      'dashboard',
    ),
  eligible: () =>
    comCache(
      'drivers:eligible',
      () =>
        selecionarTodos('drivers', {
          columns: 'id,full_name,phone,license_category,license_expires_on,active,archived_at',
          filters: { active: 'eq.true', archived_at: 'is.null' },
          order: 'full_name.asc',
        }),
      30000,
    ),
  setActive: (identificador, ativo) =>
    executarMutacao(
      () => executarFuncaoBanco('set_driver_active', { p_driver_id: identificador, p_active: ativo }),
      'drivers',
      'dashboard',
    ),
  archive: (identificador, motivo) =>
    executarMutacao(
      () => executarFuncaoBanco('archive_driver', { p_driver_id: identificador, p_reason: motivo ?? null }),
      'drivers',
      'dashboard',
    ),
  unarchive: (identificador) =>
    executarMutacao(
      () => executarFuncaoBanco('unarchive_driver', { p_driver_id: identificador }),
      'drivers',
      'dashboard',
    ),
};
