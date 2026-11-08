import testar from 'node:test';
import verificar from 'node:assert/strict';
import { readFileSync as lerArquivo } from 'node:fs';

// Casos registrados a partir da versão original. Não altere os campos da API ao traduzir variáveis.
const casos = JSON.parse(lerArquivo(new URL('./casos-contratos-dados.json', import.meta.url), 'utf8'));
globalThis.window = {
  dispatchEvent() {},
  pnf: {
    getConfig: async () => ({ supabaseUrl: 'http://127.0.0.1:54321', anonKey: 'chave-ficticia' }),
    getConfigStatus: async () => ({}),
    session: { save: async () => ({ persisted: true }), clear: async () => {}, load: async () => null },
  },
};
const { dados } = await import('../dados/dados-do-programa.mjs');
const { sessao } = await import('../acesso/sessao-do-usuario.mjs');
await sessao.set({ access_token: 'mesmo-token' });

for (const caso of casos) {
  testar(`contrato preservado: ${caso.metodo}`, async () => {
    const chamadas = [];
    globalThis.fetch = async (endereco, opcoes) => {
      const destino = new URL(endereco);
      chamadas.push({
        caminho: destino.pathname + destino.search,
        metodo: opcoes.method,
        corpo: opcoes.body ? JSON.parse(opcoes.body) : null,
        contagem: opcoes.headers.Prefer ?? null,
      });
      return new Response('[]', { status: 200, headers: { 'content-range': '0-0/0' } });
    };
    let funcao = dados;
    for (const parte of caso.metodo.split('.')) funcao = funcao[parte];
    await funcao(...caso.argumentos);
    verificar.deepEqual(chamadas, caso.chamadas);
  });
}
