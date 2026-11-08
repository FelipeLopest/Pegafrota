import { chamar } from '../comunicacao/enviar-requisicao.mjs';

export const dadosAdministradores = {
  list: (parametros) => chamar('admins.list', parametros),
  suspendCompanyAccess: (empresaIdentificador, usuarioIdentificador) =>
    chamar('companyAccess.suspend', { companyId: empresaIdentificador, userId: usuarioIdentificador }),
  restoreCompanyAccess: (empresaIdentificador, usuarioIdentificador) =>
    chamar('companyAccess.restore', { companyId: empresaIdentificador, userId: usuarioIdentificador }),
  blockAccount: (usuarioIdentificador, motivo) =>
    chamar('admin.blockAccount', { userId: usuarioIdentificador, reason: motivo }),
  unblockAccount: (usuarioIdentificador) => chamar('admin.unblockAccount', { userId: usuarioIdentificador }),
  replacePlatformAdmin: (email, motivo) => chamar('admin.replace', { email, reason: motivo }),
  resendInvite: (empresaIdentificador, usuarioIdentificador, email) =>
    chamar('invite.resend', { companyId: empresaIdentificador, userId: usuarioIdentificador, email }),
};
