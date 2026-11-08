import { configuracao } from '../comunicacao/carregar-configuracao.mjs';
import { requisicaoServidor } from '../comunicacao/verificar-conexao.mjs';
import { ErroBackend, chamar } from '../comunicacao/enviar-requisicao.mjs';
import { sessao } from './sessao-do-usuario.mjs';

export async function chamarAutenticacao(caminho, corpo, cabecalhosExtras = {}) {
  const { supabaseUrl: enderecoSupabase, anonKey: chaveAnonima } = configuracao();
  const resposta = await requisicaoServidor(`${enderecoSupabase}/auth/v1${caminho}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: chaveAnonima,
      ...cabecalhosExtras,
    },
    body: JSON.stringify(corpo),
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    throw new ErroBackend({
      hint: dados.error_code || 'AUTH_ERROR',
      message: dados.msg || dados.error_description || 'Falha na autenticação.',
      status: resposta.status,
    });
  }
  return dados;
}

export async function entrar(email, senha) {
  const dados = await chamarAutenticacao('/token?grant_type=password', { email, password: senha });
  sessao.set(dados);
  return dados;
}

export async function sair() {
  const token = sessao.accessToken;
  if (token) {
    await chamarAutenticacao('/logout', {}, { Authorization: `Bearer ${token}` }).catch(() => {});
  }
  sessao.clear();
}

export async function usuarioAtual() {
  const { supabaseUrl: enderecoSupabase, anonKey: chaveAnonima } = configuracao();
  const token = sessao.accessToken;
  if (!token) return null;
  const resposta = await requisicaoServidor(`${enderecoSupabase}/auth/v1/user`, {
    method: 'GET',
    headers: { apikey: chaveAnonima, Authorization: `Bearer ${token}` },
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    if (resposta.status === 401) sessao.clear();
    throw new ErroBackend({
      hint: dados.error_code || 'AUTH_ERROR',
      message: dados.msg || dados.error_description || 'Não foi possível validar a sessão.',
      status: resposta.status,
    });
  }
  return dados;
}

export async function sessaoPeloFragmentoEndereco({
  accessToken: tokenAcesso,
  refreshToken: tokenRenovacao,
}) {
  if (!tokenAcesso) return false;
  sessao.set({ access_token: tokenAcesso, refresh_token: tokenRenovacao || null });
  try {
    await usuarioAtual();
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    return true;
  } catch {
    sessao.clear();
    return false;
  }
}

export async function definirSenha(senha) {
  const { supabaseUrl: enderecoSupabase, anonKey: chaveAnonima } = configuracao();
  const token = sessao.accessToken;
  if (!token) {
    throw new ErroBackend({ hint: 'UNAUTHENTICATED', message: 'Sessão de ativação ausente.', status: 401 });
  }
  const resposta = await requisicaoServidor(`${enderecoSupabase}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      apikey: chaveAnonima,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ password: senha }),
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    throw new ErroBackend({
      hint: dados.error_code || 'AUTH_ERROR',
      message: dados.msg || dados.error_description || 'Não foi possível definir a senha.',
      status: resposta.status,
    });
  }
  return dados;
}

export async function aceitarConvite(token) {
  if (!token) {
    throw new ErroBackend({ hint: 'INVITE_INVALID', message: 'Convite ausente.', status: 403 });
  }
  return chamar('invite.accept', { token });
}
export { sessaoPeloFragmentoEndereco as sessionFromUrlFragment };
export { aceitarConvite as acceptInvite };
