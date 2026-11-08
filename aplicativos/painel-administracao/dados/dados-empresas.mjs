import { chamar } from '../comunicacao/enviar-requisicao.mjs';

export const dadosEmpresas = {
  list: (parametros) => chamar('companies.list', parametros),
  get: (empresaIdentificador) => chamar('company.get', { companyId: empresaIdentificador }),
  update: (empresaIdentificador, correcao, atualizadoEmEsperado) =>
    chamar('company.update', {
      companyId: empresaIdentificador,
      patch: correcao,
      expectedUpdatedAt: atualizadoEmEsperado,
    }),
  setStatus: (parametros) => chamar('company.setStatus', parametros),
  deletePermanently: (empresaIdentificador, nomeConfirmado) =>
    chamar('company.delete', { companyId: empresaIdentificador, confirmedName: nomeConfirmado }),
  provision: (parametros) => chamar('company.provision', parametros),
};
