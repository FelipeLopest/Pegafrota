import { validarSenha } from '@peganafrota/validation';

export const PAGINA_RECUPERACAO = 'https://pegafrota.vercel.app/?flow=recover';
export const PAGINA_VERSOES = 'https://github.com/FelipeLopest/Pegafrota/releases';

export function criarGerenciadorConta({
  configurar,
  obterToken,
  salvarSessao,
  transportar = (...argumentos) => fetch(...argumentos),
}) {
  async function autenticar(caminho, { metodo = 'POST', corpo, token } = {}) {
    const configuracao = await configurar();
    let resposta;
    try {
      resposta = await transportar(configuracao.supabaseUrl + '/auth/v1' + caminho, {
        method: metodo,
        headers: {
          'Content-Type': 'application/json',
          apikey: configuracao.anonKey,
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new Error('Sem conexão. Confira a internet e tente novamente.');
    }
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      const erro = new Error(
        resposta.status === 429
          ? 'Aguarde um pouco antes de tentar novamente.'
          : dados.msg ||
              dados.message ||
              dados.error_description ||
              'Não foi possível concluir a solicitação.',
      );
      erro.status = resposta.status;
      throw erro;
    }
    return dados;
  }
  return {
    async recuperar(email, destino = PAGINA_RECUPERACAO) {
      const endereco = String(email || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(endereco))
        throw new Error('Informe um e-mail válido.');
      const url = new URL(destino);
      if (
        !(
          url.protocol === 'https:' ||
          (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
        ) ||
        url.username ||
        url.password
      )
        throw new Error('Endereço de recuperação inválido.');
      await autenticar('/recover?redirect_to=' + encodeURIComponent(url.href), {
        corpo: { email: endereco },
      });
      return 'Se houver uma conta com esse e-mail, você receberá o link para definir outra senha.';
    },
    async trocar(senhaAtual, novaSenha, confirmar) {
      const validacao = validarSenha(novaSenha, { confirm: confirmar });
      if (!validacao.ok) throw new Error(Object.values(validacao.errors)[0]);
      if (!senhaAtual) throw new Error('Informe sua senha atual.');
      if (novaSenha === senhaAtual) throw new Error('Escolha uma senha diferente da atual.');
      const tokenInicial = obterToken();
      if (!tokenInicial) throw new Error('Entre novamente para trocar sua senha.');
      const usuario = await autenticar('/user', {
        metodo: 'GET',
        token: tokenInicial,
      });
      const confirmada = await autenticar('/token?grant_type=password', {
        corpo: { email: usuario.email, password: senhaAtual },
      });
      if (confirmada.user?.id !== usuario.id || obterToken() !== tokenInicial)
        throw new Error('A sessão mudou. Abra novamente a troca de senha.');
      await autenticar('/user', {
        metodo: 'PUT',
        token: confirmada.access_token,
        corpo: { password: novaSenha },
      });
      if (obterToken() !== tokenInicial)
        throw new Error('Senha alterada. Entre novamente com sua nova senha.');
      await salvarSessao(confirmada);
      return true;
    },
    async verificarRecuperacao(tokenHash) {
      if (!tokenHash || tokenHash.length > 512) throw new Error('Link de recuperação inválido.');
      return autenticar('/verify', {
        corpo: { token_hash: tokenHash, type: 'recovery' },
      });
    },
    async concluirRecuperacao(token, novaSenha, confirmar) {
      const validacao = validarSenha(novaSenha, { confirm: confirmar });
      if (!validacao.ok) throw new Error(Object.values(validacao.errors)[0]);
      if (!token) throw new Error('O link expirou. Solicite outro link de recuperação.');
      await autenticar('/user', {
        metodo: 'PUT',
        token,
        corpo: { password: novaSenha },
      });
      await autenticar('/logout', { token, corpo: {} }).catch(() => {});
      return true;
    },
  };
}

export function interpretarRecuperacao(endereco) {
  const url = new URL(endereco);
  const fragmento = new URLSearchParams(url.hash.slice(1));
  const tipo = fragmento.get('type') || url.searchParams.get('type');
  const recuperacao = url.searchParams.get('flow') === 'recover' || tipo === 'recovery';
  if (!recuperacao) return null;
  return {
    token: tipo === 'recovery' ? fragmento.get('access_token') : null,
    tokenHash: tipo === 'recovery' ? url.searchParams.get('token_hash') : null,
    erro: fragmento.get('error_description') || url.searchParams.get('error_description') || null,
  };
}
