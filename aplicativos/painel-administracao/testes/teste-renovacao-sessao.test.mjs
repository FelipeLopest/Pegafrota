import testar from 'node:test';
import verificar from 'node:assert/strict';
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
