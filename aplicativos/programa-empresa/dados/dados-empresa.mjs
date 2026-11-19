import { comCache, executarMutacao } from '../comunicacao/consultar-e-guardar-dados.mjs';
import { rpc as executarFuncaoBanco } from '../acesso/sessao-e-permissoes.mjs';
export const dadosEmpresa = {
  workflow: () => comCache('company:workflow', () => executarFuncaoBanco('fleet_workflow_settings'), 15000),
  setWorkflow: (habilitado) => executarMutacao(
    () => executarFuncaoBanco('fleet_workflow_settings', { p_yard_control_enabled: habilitado }),
    'company', 'dashboard',
  ),
  get: () => comCache('company', () => executarFuncaoBanco('my_company'), 60000),
  update: (correcao) =>
    executarMutacao(
      () => executarFuncaoBanco('update_company', { p_patch: correcao }),
      'company',
      'dashboard',
    ),
  members: () => comCache('company:members', () => executarFuncaoBanco('company_members'), 15000),
};
