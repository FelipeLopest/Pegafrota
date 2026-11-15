import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { criarRecepcaoCamera } from './receber-captura.ts';
const servidor = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);
Deno.serve(
  criarRecepcaoCamera({
    async reservar(dados) {
      const { data, error } = await servidor.rpc('camera_reserve', dados);
      if (error) throw new Error(error.message);
      return data;
    },
    async salvar(caminho, imagem) {
      const { error } = await servidor.storage
        .from('camera-captures')
        .upload(caminho, imagem, { contentType: 'image/jpeg', upsert: false });
      // Um reenvio pode encontrar o mesmo arquivo após upload concluído e resposta perdida.
      if (error && String(error.statusCode) !== '409') throw new Error('UPLOAD_FAILED');
    },
    async concluir(identificador) {
      const { error } = await servidor.rpc('camera_commit_upload', { p_capture_id: identificador });
      if (error) throw new Error('COMMIT_FAILED');
    },
  }),
);
