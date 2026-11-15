import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
const chave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const servidor = createClient(Deno.env.get('SUPABASE_URL')!, chave, {
  auth: { persistSession: false },
});
Deno.serve(async (requisicao) => {
  if (requisicao.method !== 'POST' || requisicao.headers.get('authorization') !== `Bearer ${chave}`)
    return new Response(null, { status: 401 });
  let removidas = 0;
  try {
    // Limite por execução: manutenção retomável, sem processar infinitamente na Edge Function.
    for (let lote = 0; lote < 5; lote++) {
      const { data, error } = await servidor.rpc('camera_expired_images', { p_limit: 100 });
      if (error) throw error;
      if (data?.length) {
        const { error: erroRemocao } = await servidor.storage
          .from('camera-captures')
          .remove(data.map((item: any) => item.object_path));
        if (erroRemocao) throw erroRemocao;
      }
      const { error: erroMarcacao } = await servidor.rpc('camera_mark_deleted', {
        p_ids: (data || []).map((item: any) => item.id),
      });
      if (erroMarcacao) throw erroMarcacao;
      removidas += data?.length || 0;
      if (!data?.length || data.length < 100) break;
    }
    return Response.json({ removed: removidas });
  } catch {
    return Response.json({ error: 'CLEANUP_FAILED' }, { status: 503 });
  }
});
