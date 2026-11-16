import { chamar } from '../comunicacao/enviar-requisicao.mjs';

export const dadosProvisionamentos = {
  list: (parametros) => chamar('operations.list', parametros),
  get: (operacaoIdentificador) => chamar('operation.get', { operationId: operacaoIdentificador }),
  retry: (operacaoIdentificador, senha) =>
    chamar('operation.retry', { operationId: operacaoIdentificador, password: senha }),
  compensate: (operacaoIdentificador, motivo) =>
    chamar('operation.compensate', { operationId: operacaoIdentificador, reason: motivo }),
};
