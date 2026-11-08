import { chamar } from '../comunicacao/enviar-requisicao.mjs';

export const dadosAuditoria = {
  list: (parametros) => chamar('audit.list', parametros),
  get: (eventoIdentificador) => chamar('audit.get', { eventId: eventoIdentificador }),
};
