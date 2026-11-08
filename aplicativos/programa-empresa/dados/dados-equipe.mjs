import {
  comCache,
  executarMutacao,
  chamarFuncaoDoServidor,
} from '../comunicacao/consultar-e-guardar-dados.mjs';

export const dadosEquipe = {
  list: () => comCache('users', () => chamarFuncaoDoServidor('admin-users', { action: 'list' }), 10000),
  invite: (dadosEnvio) =>
    executarMutacao(
      () => chamarFuncaoDoServidor('admin-users', { action: 'invite', ...dadosEnvio }),
      'users',
      'company:members',
    ),
  create: (dadosEnvio) =>
    executarMutacao(
      () => chamarFuncaoDoServidor('admin-users', { action: 'create', ...dadosEnvio }),
      'users',
      'company:members',
    ),
  deactivate: (usuarioIdentificador) =>
    executarMutacao(
      () => chamarFuncaoDoServidor('admin-users', { action: 'deactivate', userId: usuarioIdentificador }),
      'users',
      'company:members',
    ),
  reactivate: (usuarioIdentificador) =>
    executarMutacao(
      () => chamarFuncaoDoServidor('admin-users', { action: 'reactivate', userId: usuarioIdentificador }),
      'users',
      'company:members',
    ),
  changeRole: (usuarioIdentificador, papel) =>
    executarMutacao(
      () =>
        chamarFuncaoDoServidor('admin-users', {
          action: 'change_role',
          userId: usuarioIdentificador,
          role: papel,
        }),
      'users',
      'company:members',
    ),
};
