import teste from 'node:test';
import verificar from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  validarConfiguracaoPublica,
  lerConfiguracaoPublica,
} from '../../../ferramentas/apoio/configuracao-publica.mjs';

const chave = (papel) =>
  'eyJhbGciOiJIUzI1NiJ9.' +
  Buffer.from(JSON.stringify({ role: papel })).toString('base64url') +
  '.assinatura';
teste('Configuração distribuída contém somente URL e chave pública', () => {
  verificar.deepEqual(
    validarConfiguracaoPublica({
      supabaseUrl: 'https://exemplo.supabase.co/',
      anonKey: chave('anon'),
      SMTP_RELAY_TOKEN: 'privado',
    }),
    { supabaseUrl: 'https://exemplo.supabase.co', anonKey: chave('anon') },
  );
});
teste('Configuração pública rejeita chave privilegiada e formato desconhecido', () => {
  for (const anonKey of [chave('service_role'), 'sb_secret_privada', 'valor-invalido', '']) {
    verificar.throws(() =>
      validarConfiguracaoPublica({ supabaseUrl: 'https://exemplo.supabase.co', anonKey }),
    );
  }
});
teste('Configuração pública exige HTTPS fora de localhost', () => {
  verificar.throws(() =>
    validarConfiguracaoPublica({
      supabaseUrl: 'http://exemplo.supabase.co',
      anonKey: chave('anon'),
    }),
  );
  verificar.throws(() =>
    validarConfiguracaoPublica({
      supabaseUrl: 'https://usuario:senha@exemplo.supabase.co',
      anonKey: chave('anon'),
    }),
  );
  verificar.equal(
    validarConfiguracaoPublica({ supabaseUrl: 'http://127.0.0.1:54321', anonKey: chave('anon') })
      .supabaseUrl,
    'http://127.0.0.1:54321',
  );
});
teste('Compilação sem .env usa configuração pública; ambiente e .env podem substituí-la', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'pnf-config-'));
  try {
    writeFileSync(
      join(pasta, 'configuracao-publica.json'),
      JSON.stringify({ supabaseUrl: 'https://padrao.supabase.co', anonKey: chave('anon') }),
    );
    verificar.equal(lerConfiguracaoPublica(pasta, {}).supabaseUrl, 'https://padrao.supabase.co');
    writeFileSync(join(pasta, '.env'), 'PNF_SUPABASE_URL=https://arquivo.supabase.co\n');
    verificar.equal(lerConfiguracaoPublica(pasta, {}).supabaseUrl, 'https://arquivo.supabase.co');
    verificar.equal(
      lerConfiguracaoPublica(pasta, { PNF_SUPABASE_URL: 'https://ambiente.supabase.co' })
        .supabaseUrl,
      'https://ambiente.supabase.co',
    );
    writeFileSync(join(pasta, '.env'), 'PNF_SUPABASE_ANON_KEY=sb_secret_privada');
    verificar.throws(() => lerConfiguracaoPublica(pasta, {}));
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
});
