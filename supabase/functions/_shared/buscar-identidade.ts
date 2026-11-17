interface IdentidadeAutenticacao {
  id: string;
  email: string;
  email_confirmed_at: string | null;
}

export async function buscarUsuarioAutenticacaoPorEmail(
  administrador: {
    rpc: (
      nome: string,
      parametros: { p_email: string },
    ) => PromiseLike<{ data: IdentidadeAutenticacao | null; error: unknown }>;
  },
  email: string,
): Promise<IdentidadeAutenticacao | null> {
  const { data: conta, error: erro } = await administrador.rpc('pnf_auth_user_by_email', {
    p_email: email,
  });
  if (erro) throw erro;
  return conta;
}
