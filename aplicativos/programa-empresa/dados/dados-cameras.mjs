import { selecionar, executarMutacao } from '../comunicacao/consultar-e-guardar-dados.mjs';
import { rpc } from '../comunicacao/enviar-requisicao.mjs';
import { sessao, tentarRenovarSessao } from '../acesso/sessao-do-usuario.mjs';
import { carregarConfiguracao } from '../sistema/carregar-configuracao-da-interface.mjs';

export const dadosCameras = {
  listar: () =>
    selecionar('cameras', {
      columns:
        'id,name,location_id,direction,active,min_confidence,automatic_enabled,settings,last_seen_at,last_capture_at,device_version,device_status',
      order: 'name.asc',
      limit: 100,
    }),
  capturas: () =>
    selecionar('camera_captures', {
      columns:
        'id,camera_id,captured_at,received_at,status,suggested_plate,confidence,object_path,image_deleted_at,result,error_message',
      order: 'received_at.desc',
      limit: 60,
    }),
  salvar: (dados) =>
    rpc('camera_save', {
      p_camera_id: dados.p_camera_id,
      p_name: dados.p_name,
      p_location_id: dados.p_location_id,
      p_direction: dados.p_direction,
      p_active: dados.p_active,
      p_automatic: dados.p_automatic,
      p_min_confidence: dados.p_min_confidence,
      p_roi: dados.p_roi,
      p_daily_limit: dados.p_daily_limit,
    }),
  chave: (identificador, revogar = false) =>
    rpc('camera_rotate_key', { p_camera_id: identificador, p_revoke_only: revogar }),
  reservar: () => rpc('camera_claim'),
  concluir: (dados) =>
    executarMutacao(
      () =>
        rpc('camera_finish', {
          p_capture_id: dados.p_capture_id,
          p_claim_id: dados.p_claim_id,
          p_plate: dados.p_plate,
          p_confidence: dados.p_confidence,
          p_ambiguous: dados.p_ambiguous,
          p_error: dados.p_error,
        }),
      'movements',
      'yard',
      'vehicles',
      'dashboard',
    ),
  revisar: (identificador, veiculo, motivo) =>
    executarMutacao(
      () =>
        rpc('camera_review', {
          p_capture_id: identificador,
          p_vehicle_id: veiculo,
          p_reason: motivo,
        }),
      'movements',
      'yard',
      'vehicles',
      'dashboard',
    ),
};

export async function baixarImagemCamera(caminho, renovada = false) {
  if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/.test(caminho))
    throw new Error('Referência de imagem inválida.');
  const configuracao = await carregarConfiguracao();
  const resposta = await fetch(
    `${configuracao.supabaseUrl}/storage/v1/object/authenticated/camera-captures/${caminho}`,
    {
      headers: { apikey: configuracao.anonKey, Authorization: `Bearer ${sessao.accessToken}` },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    },
  );
  if (resposta.status === 401 && !renovada && (await tentarRenovarSessao()))
    return baixarImagemCamera(caminho, true);
  if (!resposta.ok || !resposta.body)
    throw new Error('Imagem indisponível ou sem permissão de acesso.');
  const leitor = resposta.body.getReader();
  const partes = [];
  let tamanho = 0;
  try {
    while (true) {
      const { done: terminou, value: parte } = await leitor.read();
      if (terminou) break;
      tamanho += parte.length;
      if (tamanho > 307200) {
        await leitor.cancel();
        throw new Error('Imagem excede o tamanho permitido.');
      }
      partes.push(parte);
    }
  } finally {
    leitor.releaseLock();
  }
  return new Blob(partes, { type: 'image/jpeg' });
}
