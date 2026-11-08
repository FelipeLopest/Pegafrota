import { ERRO_PLATAFORMA } from '@peganafrota/contracts';
import { configuracao } from './carregar-configuracao.mjs';
import { sessao } from '../acesso/sessao-do-usuario.mjs';
import { requisicaoServidor } from './verificar-conexao.mjs';

export class ErroBackend extends Error {
  constructor({
    hint: dica,
    message: mensagem,
    detail: detalhe,
    status: situacao,
    retryAfterSeconds: repetirDepoisSegundos,
  }) {
    super(mensagem || dica || 'Erro');
    this.name = 'BackendError';
    this.hint = dica || 'INTERNAL_ERROR';
    this.detail = detalhe ?? null;
    this.status = situacao ?? 0;
    this.retryAfterSeconds = repetirDepoisSegundos ?? null;
  }

  get isConflict() {
    return this.status === 409;
  }

  get isValidation() {
    return this.status === 422;
  }

  get lostAccess() {
    return this.status === 403 && this.hint === ERRO_PLATAFORMA.NOT_PLATFORM_ADMIN;
  }
}

export let requisicaoSequencia = 0;

export async function chamar(acao, dadosEnvio = {}, opcoes = {}) {
  const { supabaseUrl: enderecoSupabase, anonKey: chaveAnonima } = configuracao();
  const token = sessao.accessToken;

  if (!token) {
    throw new ErroBackend({ hint: 'UNAUTHENTICATED', message: 'Sessão expirada.', status: 401 });
  }

  const requisicaoIdentificador = `adm-${Date.now().toString(36)}-${(requisicaoSequencia += 1)}`;

  const cabecalhos = {
    'Content-Type': 'application/json',
    apikey: chaveAnonima,
    Authorization: `Bearer ${token}`,
    'x-request-id': requisicaoIdentificador,
  };

  let resposta;
  try {
    resposta = await requisicaoServidor(`${enderecoSupabase}/functions/v1/platform-admin`, {
      method: 'POST',
      headers: cabecalhos,
      body: JSON.stringify({ action: acao, payload: dadosEnvio }),
      signal: opcoes.signal,
    });
  } catch (erro) {
    if (erro?.name === 'AbortError') throw erro;
    throw new ErroBackend({
      hint: 'NETWORK_ERROR',
      message: 'Sem conexão com o servidor.',
      status: 0,
    });
  }

  const corpo = await resposta.json().catch(() => ({}));
  const dica = corpo?.error?.hint;

  if (resposta.status === 401) {
    sessao.clear();
    throw new ErroBackend({ hint: 'UNAUTHENTICATED', message: 'Sessão expirada.', status: 401 });
  }

  if (!resposta.ok) {
    throw new ErroBackend({
      hint: corpo?.error?.hint,
      message: corpo?.error?.message,
      detail: corpo?.error?.detail,
      status: resposta.status,
      retryAfterSeconds: resposta.headers.get('Retry-After')
        ? Number(resposta.headers.get('Retry-After'))
        : null,
    });
  }

  return corpo.data;
}
