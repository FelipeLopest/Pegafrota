export function interpretarEnderecoConvite() {
  const consulta = new URLSearchParams(location.search);
  const resumoCriptografico = location.hash.replace(/^#/, '');
  const parametrosResumoCriptografico = new URLSearchParams(
    resumoCriptografico.includes('=') ? resumoCriptografico.split('?').pop() : '',
  );

  return {
    businessToken: consulta.get('token') || parametrosResumoCriptografico.get('token') || null,
    accessToken: parametrosResumoCriptografico.get('access_token'),
    refreshToken: parametrosResumoCriptografico.get('refresh_token'),
    type: parametrosResumoCriptografico.get('type'),
    error:
      parametrosResumoCriptografico.get('error_description') || parametrosResumoCriptografico.get('error'),
  };
}

export const ETAPAS = { CHECKING: 'checking', PASSWORD: 'password', DONE: 'done', FAILED: 'failed' };

export const ERROS_CONVITE = {
  INVITE_INVALID: {
    title: 'Convite inválido',
    text: 'Este link não corresponde a nenhum convite ativo. Peça ao administrador da plataforma para enviar um novo.',
  },
  INVITE_EXPIRED: {
    title: 'Convite expirado',
    text: 'O prazo deste convite terminou. Peça um novo convite ao administrador da plataforma.',
  },
  INVITE_REVOKED: {
    title: 'Convite cancelado',
    text: 'Este convite foi substituído ou cancelado. Use o link mais recente que você recebeu.',
  },
  INVITE_ALREADY_ACCEPTED: {
    title: 'Convite já utilizado',
    text: 'Este convite já foi aceito. Abra o aplicativo PegaNaFrota Desktop e entre com seu e-mail e senha.',
  },
  WRONG_USER: {
    title: 'Convite de outra pessoa',
    text: 'Este convite foi emitido para outro e-mail. Verifique se você entrou com a conta correta.',
  },
};

// Nomes públicos anteriores preservados para compatibilidade entre os arquivos.
export { interpretarEnderecoConvite as interpretarUrlConvite };
export { ETAPAS as STEP };
export { ERROS_CONVITE as INVITE_ERROR };
