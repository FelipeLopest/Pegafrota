import testar from 'node:test';
import verificar from 'node:assert/strict';

let gravacoes = [];
let limpezas = 0;
globalThis.window = {
  dispatchEvent() {},
  pnf: {
    getConfig: async () => ({ supabaseUrl: 'http://127.0.0.1:54321', anonKey: 'chave-publica-de-teste' }),
    getConfigStatus: async () => ({}),
    session: {
      save: async (valor) => {
        gravacoes.push(valor);
        return { persisted: true };
      },
      load: async () => null,
      clear: async () => {
        limpezas += 1;
      },
    },
  },
};
const { sessao, tentarRenovarSessao } = await import('../acesso/sessao-do-usuario.mjs');
const { comCache, invalidarCache, cacheLeituras } =
  await import('../comunicacao/consultar-e-guardar-dados.mjs');
const { requisitar } = await import('../comunicacao/enviar-requisicao.mjs');
const respostaJson = (dados, situacao = 200, cabecalhos = {}) =>
  new Response(JSON.stringify(dados), {
    status: situacao,
    headers: { 'Content-Type': 'application/json', ...cabecalhos },
  });

testar('cache não reaproveita dados entre usuários no mesmo processo', async () => {
  cacheLeituras.clear();
  await sessao.set({ access_token: 'usuario-a' });
  verificar.equal(await comCache('empresa', async () => 'empresa-a'), 'empresa-a');
  await sessao.clear();
  await sessao.set({ access_token: 'usuario-b' });
  verificar.equal(await comCache('empresa', async () => 'empresa-b'), 'empresa-b');
});

testar('resposta pendente da sessão anterior não repovoa o cache', async () => {
  cacheLeituras.clear();
  await sessao.set({ access_token: 'usuario-a' });
  let concluirConsulta;
  const pendente = comCache(
    'empresa',
    () =>
      new Promise((resolver) => {
        concluirConsulta = resolver;
      }),
  );
  await Promise.resolve();
  await sessao.clear();
  await sessao.set({ access_token: 'usuario-b' });
  verificar.equal(await comCache('empresa', async () => 'empresa-b'), 'empresa-b');
  concluirConsulta('empresa-a');
  await pendente;
  verificar.equal(await comCache('empresa', async () => 'valor-indevido'), 'empresa-b');
});

testar('invalidação não permite que consulta pendente recoloque dados antigos', async () => {
  cacheLeituras.clear();
  let concluirConsulta;
  const pendente = comCache(
    'vehicles',
    () =>
      new Promise((resolver) => {
        concluirConsulta = resolver;
      }),
  );
  await Promise.resolve();
  invalidarCache('vehicles');
  concluirConsulta('antes-da-alteracao');
  await pendente;
  verificar.equal(await comCache('vehicles', async () => 'depois-da-alteracao'), 'depois-da-alteracao');
});

testar('erro 401 persistente faz uma renovação e uma repetição', async () => {
  await sessao.set({ access_token: 'antigo', refresh_token: 'renovavel' });
  let chamadas = 0;
  let renovacoes = 0;
  globalThis.fetch = async (endereco) => {
    if (endereco.includes('grant_type=refresh_token')) {
      renovacoes += 1;
      return respostaJson({ access_token: 'novo', refresh_token: 'renovavel' });
    }
    chamadas += 1;
    return respostaJson({}, 401);
  };
  await verificar.rejects(requisitar('/rest/v1/vehicles'), (erro) => erro.hint === 'UNAUTHENTICATED');
  verificar.equal(renovacoes, 1);
  verificar.equal(chamadas, 2);
  verificar.equal(sessao.accessToken, null);
});

testar('repetição após renovar mantém a resposta com cabeçalhos de contagem', async () => {
  await sessao.set({ access_token: 'antigo', refresh_token: 'renovavel' });
  let chamadas = 0;
  globalThis.fetch = async (endereco) => {
    if (endereco.includes('grant_type=refresh_token')) return respostaJson({ access_token: 'novo' });
    chamadas += 1;
    return chamadas === 1 ? respostaJson({}, 401) : respostaJson([], 200, { 'content-range': '0-0/37' });
  };
  const resposta = await requisitar('/rest/v1/vehicles', { raw: true });
  verificar.equal(resposta.headers.get('content-range'), '0-0/37');
  verificar.deepEqual(resposta.data, []);
});

testar('sessão sem manter conectado não é gravada nem na renovação', async () => {
  gravacoes = [];
  limpezas = 0;
  await sessao.set({ access_token: 'temporario', refresh_token: 'renovavel' }, { persistir: false });
  globalThis.fetch = async () =>
    respostaJson({ access_token: 'temporario-renovado', refresh_token: 'renovavel' });
  verificar.equal(await tentarRenovarSessao(), true);
  verificar.equal(gravacoes.length, 0);
  verificar.ok(limpezas >= 1);
  verificar.equal(sessao.isEphemeral, false);
});

testar('renovação atrasada não substitui o usuário que entrou depois', async () => {
  await sessao.set({ access_token: 'usuario-a', refresh_token: 'renovavel' });
  let concluirRenovacao;
  globalThis.fetch = () =>
    new Promise((resolver) => {
      concluirRenovacao = resolver;
    });
  const pendente = tentarRenovarSessao();
  await Promise.resolve();
  await Promise.resolve();
  await sessao.clear();
  await sessao.set({ access_token: 'usuario-b' });
  concluirRenovacao(respostaJson({ access_token: 'usuario-a-renovado' }));
  verificar.equal(await pendente, false);
  verificar.equal(sessao.accessToken, 'usuario-b');
});
