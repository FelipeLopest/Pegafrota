import teste from 'node:test';
import verificar from 'node:assert/strict';
import {
  criarRecepcaoCamera,
  LIMITE_IMAGEM,
} from '../../functions/camera-intake/receber-captura.ts';

const chave = 'pnfc_' + 'a'.repeat(64);
const identificador = '11111111-1111-4111-8111-111111111111';
const caminho = `${identificador}/${identificador}/${identificador}.jpg`;
const jpegMinimo = new Uint8Array([255,216,255,192,0,11,8,1,224,2,128,1,1,17,0,255,217]);
function preparar({ duplicada = false, falhar = null } = {}) {
  const chamadas = [];
  const atender = criarRecepcaoCamera({
    async reservar(dados) {
      chamadas.push(['reservar', dados]);
      if (falhar) throw new Error(falhar);
      return dados.p_heartbeat
        ? { ok: true }
        : { id: identificador, path: caminho, duplicate: duplicada };
    },
    async salvar(...argumentos) {
      chamadas.push(['salvar', ...argumentos]);
    },
    async concluir(id) {
      chamadas.push(['concluir', id]);
    },
  });
  return { atender, chamadas };
}
function pedido(alteracoes = {}, corpo = jpegMinimo) {
  const headers = {
    'x-camera-key': chave,
    'x-camera-event': identificador,
    'x-camera-passage': identificador,
    'x-camera-captured-at': new Date().toISOString(),
    'content-type': 'image/jpeg',
    'content-length': String(corpo.length),
    ...alteracoes,
  };
  return new Request('https://example.test/camera-intake', {
    method: 'POST',
    headers,
    body: corpo,
  });
}
teste('Intake autentica, deriva o caminho e conclui somente após upload', async () => {
  const { atender, chamadas } = preparar();
  verificar.equal((await atender(pedido())).status, 202);
  verificar.deepEqual(
    chamadas.map((c) => c[0]),
    ['reservar', 'salvar', 'concluir'],
  );
  verificar.equal(chamadas[1][1], caminho);
  verificar.equal(chamadas[0][1].p_key, chave);
  verificar.equal(chamadas[0][1].company_id, undefined);
});
teste(
  'Intake rejeita chave ausente, origem de navegador e corpo grande antes do banco',
  async () => {
    for (const [headers, status] of [
      [{ 'x-camera-key': '' }, 401],
      [{ origin: 'https://intruso.test' }, 403],
      [{ 'content-length': String(LIMITE_IMAGEM + 1) }, 413],
    ]) {
      const { atender, chamadas } = preparar();
      verificar.equal((await atender(pedido(headers))).status, status);
      verificar.equal(chamadas.length, 0);
    }
  },
);
teste('Intake rejeita JPEG inválido, MIME e identificadores arbitrários', async () => {
  for (const [headers, bytes, status] of [
    [{}, new Uint8Array([1, 2, 3, 4]), 400],
    [{ 'content-type': 'image/png' }, new Uint8Array([1, 2, 3, 4]), 415],
    [{ 'x-camera-event': '../../arquivo' }, new Uint8Array([255, 216, 255, 217]), 400],
  ]) {
    const { atender, chamadas } = preparar();
    verificar.equal((await atender(pedido(headers, bytes))).status, status);
    verificar.equal(chamadas.length, 0);
  }
});
teste('Intake confirma reenvio sem sobrescrever imagem', async () => {
  const { atender, chamadas } = preparar({ duplicada: true });
  verificar.equal((await atender(pedido())).status, 202);
  verificar.deepEqual(
    chamadas.map((c) => c[0]),
    ['reservar'],
  );
});
teste('Dimensões abusivas de JPEG são rejeitadas antes de gravar',async()=>{
  const { atender, chamadas } = preparar();
  const imagem = jpegMinimo.slice(); imagem[7]=255;imagem[8]=255;imagem[9]=255;imagem[10]=255;
  verificar.equal((await atender(pedido({},imagem))).status,400);
  verificar.equal(chamadas.length,0);
});
teste('Heartbeat não cria upload e exige corpo vazio', async () => {
  const { atender, chamadas } = preparar();
  verificar.equal(
    (await atender(pedido({ 'x-camera-heartbeat': '1', 'content-length': '0' }, new Uint8Array())))
      .status,
    200,
  );
  verificar.equal(chamadas[0][1].p_heartbeat, true);
  verificar.equal(chamadas.length, 1);
  verificar.equal((await atender(pedido({ 'x-camera-heartbeat': '1' }))).status, 400);
});
teste('Intake preserva limites, revogação e indisponibilidade sem revelar segredos', async () => {
  for (const [erro, status] of [
    ['DEVICE_UNAUTHORIZED', 401],
    ['DEVICE_RATE_LIMIT', 429],
    ['DEVICE_QUEUE_FULL', 429],
    ['DEVICE_DAILY_LIMIT', 429],
    ['CAPTURE_INVALID_TIME_OR_ID', 400],
    ['erro interno com chave privada', 503],
  ]) {
    const { atender } = preparar({ falhar: erro });
    const resposta = await atender(pedido());
    verificar.equal(resposta.status, status);
    verificar.ok(!(await resposta.text()).includes('chave privada'));
  }
});
