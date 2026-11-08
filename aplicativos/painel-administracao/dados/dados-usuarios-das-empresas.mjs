import { chamar } from '../comunicacao/enviar-requisicao.mjs';

export const dadosUsuariosDasEmpresas = {
  list: (parametros) => chamar('members.list', parametros),
  resetPassword: (empresaIdentificador, usuarioIdentificador, senha) =>
    chamar('member.passwordReset', {
      companyId: empresaIdentificador,
      userId: usuarioIdentificador,
      password: senha,
    }),
  delete: (empresaIdentificador, usuarioIdentificador, identidadeConfirmada) =>
    chamar('member.delete', {
      companyId: empresaIdentificador,
      userId: usuarioIdentificador,
      confirmedIdentity: identidadeConfirmada,
    }),
};
