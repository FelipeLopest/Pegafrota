import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function validarConfiguracaoPublica(configuracao) {
  const { supabaseUrl, anonKey } = configuracao;
  let endereco;
  try {
    endereco = new URL(supabaseUrl);
  } catch {
    throw new Error('Endereço público do Supabase inválido.');
  }
  if (
    endereco.username ||
    endereco.password ||
    !(
      endereco.protocol === 'https:' ||
      (endereco.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(endereco.hostname))
    )
  ) {
    throw new Error(
      'Use HTTPS para o Supabase; HTTP é permitido somente no desenvolvimento local.',
    );
  }
  if (typeof anonKey !== 'string' || !anonKey)
    throw new Error('Chave pública do Supabase ausente.');
  if (!anonKey.startsWith('sb_publishable_')) {
    let dados;
    try {
      dados = JSON.parse(Buffer.from(anonKey.split('.')[1], 'base64url').toString());
    } catch {}
    // Esta checagem evita embutir uma chave privilegiada por engano; não autentica o JWT.
    if (dados?.role !== 'anon')
      throw new Error('Somente chave anon ou publishable pode ser incorporada.');
  }
  return { supabaseUrl: endereco.origin, anonKey };
}

export function lerConfiguracaoPublica(raiz, ambiente = process.env) {
  const valores = { ...ambiente };
  const arquivoAmbiente = join(raiz, '.env');
  if (existsSync(arquivoAmbiente)) {
    for (const linha of readFileSync(arquivoAmbiente, 'utf8').split(/\r?\n/)) {
      const partes = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linha);
      if (partes && valores[partes[1]] == null)
        valores[partes[1]] = partes[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  const arquivoPublico = join(raiz, 'configuracao-publica.json');
  const padrao = existsSync(arquivoPublico) ? JSON.parse(readFileSync(arquivoPublico, 'utf8')) : {};
  return validarConfiguracaoPublica({
    supabaseUrl: valores.PNF_SUPABASE_URL ?? padrao.supabaseUrl,
    anonKey: valores.PNF_SUPABASE_ANON_KEY ?? padrao.anonKey,
  });
}
