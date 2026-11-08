import { requisitar } from '../comunicacao/enviar-requisicao.mjs';
import { sessao } from './sessao-do-usuario.mjs';
import { contexto } from './empresa-e-permissoes-do-usuario.mjs';

export async function entrar(email, senha, { manterConectado = true } = {}) {
  const dados = await requisitar('/auth/v1/token?grant_type=password', {
    body: { email, password: senha },
    auth: false,
  });
  await sessao.set(dados, { persistir: manterConectado });
  return dados;
}

export async function sair() {
  try {
    await requisitar('/auth/v1/logout', { body: {} });
  } catch {}
  await sessao.clear();
  contexto.clear();
}
