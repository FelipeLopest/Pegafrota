export const LIMITE_IMAGEM = 307200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validarDimensoesJpeg(imagem: Uint8Array) {
  let posicao = 2;
  while (posicao < imagem.length - 2) {
    if (imagem[posicao++] !== 255) throw new Error('INVALID_IMAGE');
    while (imagem[posicao] === 255) posicao++;
    const marcador = imagem[posicao++];
    if (marcador === 0xd9 || marcador === 0xda) break;
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd8)) continue;
    const tamanho = (imagem[posicao] << 8) | imagem[posicao + 1];
    if (tamanho < 2 || posicao + tamanho > imagem.length) throw new Error('INVALID_IMAGE');
    if (marcador === 0xc0 || marcador === 0xc2) {
      if (tamanho < 8 || imagem[posicao+2] !== 8) throw new Error('INVALID_IMAGE');
      const altura = (imagem[posicao+3] << 8) | imagem[posicao+4];
      const largura = (imagem[posicao+5] << 8) | imagem[posicao+6];
      if (altura < 32 || largura < 32 || altura * largura > 2000000) throw new Error('INVALID_IMAGE');
      return;
    }
    posicao += tamanho;
  }
  throw new Error('INVALID_IMAGE');
}

export async function lerImagemLimitada(requisicao: Request): Promise<Uint8Array> {
  const tamanho = Number(requisicao.headers.get('content-length'));
  if (!Number.isInteger(tamanho) || tamanho < 4 || tamanho > LIMITE_IMAGEM)
    throw new Error('IMAGE_TOO_LARGE');
  if (!requisicao.body) throw new Error('INVALID_IMAGE');
  const leitor = requisicao.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done: terminou, value: dados } = await leitor.read();
      if (terminou) break;
      total += dados.length;
      if (total > LIMITE_IMAGEM) {
        await leitor.cancel();
        throw new Error('IMAGE_TOO_LARGE');
      }
      partes.push(dados);
    }
  } finally {
    leitor.releaseLock();
  }
  if (total !== tamanho) throw new Error('INVALID_IMAGE');
  const imagem = new Uint8Array(total);
  let posicao = 0;
  for (const parte of partes) {
    imagem.set(parte, posicao);
    posicao += parte.length;
  }
  if (
    imagem[0] !== 255 ||
    imagem[1] !== 216 ||
    imagem[total - 2] !== 255 ||
    imagem[total - 1] !== 217
  )
    throw new Error('INVALID_IMAGE');
  validarDimensoesJpeg(imagem);
  return imagem;
}

type Dependencias = {
  reservar: (dados: Record<string, unknown>) => Promise<any>;
  salvar: (caminho: string, imagem: Uint8Array) => Promise<void>;
  concluir: (identificador: string) => Promise<void>;
};
export function criarRecepcaoCamera(dependencias: Dependencias) {
  return async (requisicao: Request): Promise<Response> => {
    const responder = (corpo: unknown, status = 200) =>
      new Response(JSON.stringify(corpo), {
        status,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          ...(status === 429 ? { 'Retry-After': '2' } : {}),
        },
      });
    try {
      if (requisicao.method !== 'POST') return responder({ error: 'METHOD_NOT_ALLOWED' }, 405);
      // O dispositivo nativo não envia Origin. Não expor este serviço como API de navegador.
      if (requisicao.headers.has('origin')) return responder({ error: 'DEVICE_ONLY' }, 403);
      const chave = requisicao.headers.get('x-camera-key') || '';
      if (!/^pnfc_[a-f0-9]{64}$/.test(chave))
        return responder({ error: 'DEVICE_UNAUTHORIZED' }, 401);
      const batimento = requisicao.headers.get('x-camera-heartbeat') === '1';
      const versao = (requisicao.headers.get('x-camera-version') || '').slice(0, 60);
      let imagem: Uint8Array | null = null;
      const evento = requisicao.headers.get('x-camera-event');
      const passagem = requisicao.headers.get('x-camera-passage');
      const capturada = requisicao.headers.get('x-camera-captured-at');
      if (!batimento) {
        if (requisicao.headers.get('content-type')?.split(';')[0] !== 'image/jpeg')
          return responder({ error: 'JPEG_REQUIRED' }, 415);
        if (
          !UUID.test(evento || '') ||
          !UUID.test(passagem || '') ||
          !capturada ||
          !Number.isFinite(Date.parse(capturada))
        )
          return responder({ error: 'INVALID_CAPTURE' }, 400);
        imagem = await lerImagemLimitada(requisicao);
      } else if (Number(requisicao.headers.get('content-length') || 0) > 0)
        return responder({ error: 'EMPTY_HEARTBEAT_REQUIRED' }, 400);
      const reserva = await dependencias.reservar({
        p_key: chave,
        p_event_id: batimento ? null : evento,
        p_passage_id: batimento ? null : passagem,
        p_captured_at: batimento ? null : capturada,
        p_heartbeat: batimento,
        p_version: versao,
        p_status: (requisicao.headers.get('x-camera-status') || 'ready').slice(0, 40),
      });
      if (batimento) return responder(reserva);
      if (!reserva.duplicate) {
        if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/.test(reserva.path))
          throw new Error('INVALID_RESERVATION');
        await dependencias.salvar(reserva.path, imagem!);
        await dependencias.concluir(reserva.id);
      }
      return responder(
        { accepted: true, id: reserva.id, duplicate: Boolean(reserva.duplicate) },
        202,
      );
    } catch (erro) {
      const mensagem = String((erro as Error)?.message || '');
      if (mensagem.includes('DEVICE_UNAUTHORIZED'))
        return responder({ error: 'DEVICE_UNAUTHORIZED' }, 401);
      if (/DEVICE_RATE_LIMIT|DEVICE_QUEUE_FULL|DEVICE_DAILY_LIMIT/.test(mensagem))
        return responder({ error: 'RETRY_LATER' }, 429);
      if (mensagem.includes('IMAGE_TOO_LARGE')) return responder({ error: 'IMAGE_TOO_LARGE' }, 413);
      if (/INVALID_IMAGE|CAPTURE_INVALID_TIME/.test(mensagem))
        return responder({ error: 'INVALID_CAPTURE' }, 400);
      return responder({ error: 'CAPTURE_UNAVAILABLE' }, 503);
    }
  };
}
