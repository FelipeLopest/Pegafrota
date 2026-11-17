import testar from 'node:test';
import verificar from 'node:assert/strict';
import { usuarioAtual } from '../acesso/entrar-e-sair.mjs';
import { renovarSessao, sessao } from '../acesso/sessao-do-usuario.mjs';

testar('chamadas paralelas compartilham a renovação e não recuperam sessão encerrada', async (teste) => {
  const documentoAnterior = globalThis.document;
  const armazenamentoAnterior = globalThis.sessionStorage;
  const armazenamento = new Map();
  globalThis.document = {
    getElementById: () => ({
      textContent: JSON.stringify({ supabaseUrl: 'http://127.0.0.1:54321', anonKey: 'simulada' }),
    }),
  };
  globalThis.sessionStorage = {
    getItem: (chave) => armazenamento.get(chave),
    setItem: (chave, valor) => armazenamento.set(chave, valor),
    removeItem: (chave) => armazenamento.delete(chave),
  };
  try {
    const ator = { id: 'test-user' };
    const inicial = { access_token: 'anterior', refresh_token: 'renovacao', user: ator };
    const nova = { access_token: 'novo', refresh_token: 'nova-renovacao', user: ator };
    let responder;
    const transporte = teste.mock.method(globalThis, 'fetch', () =>
      new Promise((resolver) => {
        responder = resolver;
      }),
    );
    sessao.set(inicial);
    const geracaoInicial = sessao.geracao;
    const primeira = renovarSessao(inicial.access_token, geracaoInicial);
    const segunda = renovarSessao(inicial.access_token, geracaoInicial);
    verificar.equal(transporte.mock.callCount(), 1);
    responder(Response.json(nova));
    verificar.deepEqual(await Promise.all([primeira, segunda]), [true, true]);
    verificar.deepEqual(sessao.get(), nova);
    verificar.equal(sessao.geracao, geracaoInicial);

    const pendente = renovarSessao(nova.access_token, geracaoInicial);
    sessao.clear();
    const outroUsuario = { access_token: 'outra', user: { id: 'another-user' } };
    sessao.set(outroUsuario);
    responder(Response.json(nova));
    verificar.equal(await pendente, false);
    verificar.deepEqual(sessao.get(), outroUsuario);
  } finally {
    globalThis.document = documentoAnterior;
    globalThis.sessionStorage = armazenamentoAnterior;
  }
});

testar('sessão encerrada em 403 retorna ao login e falha temporária preserva o acesso', async (teste) => {
  const armazenamento = new Map();
  teste.mock.method(globalThis, 'fetch', async (url) => {
    if (url.includes('refresh_token')) {
      return Response.json({ error_code: 'refresh_token_not_found' }, { status: 400 });
    }
    return Response.json({ error_code: 'session_not_found' }, { status: 403 });
  });
  const documentoAnterior = globalThis.document;
  const armazenamentoAnterior = globalThis.sessionStorage;
  globalThis.document = {
    getElementById: () => ({
      textContent: JSON.stringify({ supabaseUrl: 'http://127.0.0.1:54321', anonKey: 'simulada' }),
    }),
  };
  globalThis.sessionStorage = {
    getItem: (chave) => armazenamento.get(chave),
    setItem: (chave, valor) => armazenamento.set(chave, valor),
    removeItem: (chave) => armazenamento.delete(chave),
  };
  const acesso = { access_token: 'anterior', refresh_token: 'renovacao' };
  try {
    sessao.set(acesso);
    await verificar.rejects(usuarioAtual(), { hint: 'session_not_found', status: 401 });
    verificar.equal(sessao.accessToken, null);
    verificar.equal(globalThis.fetch.mock.callCount(), 2);

    globalThis.fetch.mock.mockImplementation(async () => Response.json({}, { status: 503 }));
    sessao.set(acesso);
    await verificar.rejects(usuarioAtual(), { status: 503 });
    verificar.deepEqual(sessao.get(), acesso);

    globalThis.fetch.mock.mockImplementation(async () => Response.json({}, { status: 403 }));
    await verificar.rejects(usuarioAtual(), { status: 403 });
    verificar.deepEqual(sessao.get(), acesso);
  } finally {
    globalThis.document = documentoAnterior;
    globalThis.sessionStorage = armazenamentoAnterior;
  }
});
