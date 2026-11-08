#!/usr/bin/env node
import postgres from 'pg';
import arquivosSistema from 'node:fs';
import caminhosSistema from 'node:path';

const { Client: ClienteBanco } = postgres;
const enderecoBanco = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!enderecoBanco) {
  console.error(
    'NÃO EXECUTADO — defina SUPABASE_DB_URL ou DATABASE_URL com a connection string do banco remoto.',
  );
  process.exit(2);
}

const raiz = process.cwd();
const arquivoDados = caminhosSistema.join(
  raiz,
  'apps',
  'company-desktop',
  'src',
  'renderer',
  'lib',
  'data.mjs',
);
const fonte = arquivosSistema.readFileSync(arquivoDados, 'utf8');
const funcaoBancoNomes = [
  ...new Set(
    [...fonte.matchAll(/\brpc\(\s*['\"]([A-Za-z0-9_]+)['\"]/g)].map(
      (correspondenciaItem) => correspondenciaItem[1],
    ),
  ),
].sort();

const exatoObrigatorio = [
  'public.update_driver(uuid,jsonb)',
  'public.create_location(text,text,text,text,text,text,text,text,text)',
  'public.update_location(uuid,jsonb)',
  'public.set_location_active(uuid,boolean)',
  'public.archive_location(uuid,text)',
  'public.unarchive_location(uuid)',
  'public.yard_snapshot()',
  'public.company_members()',
];
const obrigatorioMigration = '20260808000200';

const cliente = new ClienteBanco({ connectionString: enderecoBanco, ssl: { rejectUnauthorized: false } });
try {
  await cliente.connect();

  const migracao = await cliente.query(
    `select exists(
       select 1 from supabase_migrations.schema_migrations where version = $1
     ) as applied`,
    [obrigatorioMigration],
  );

  const disponivel = await cliente.query(
    `select distinct p.proname
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = any($1::text[])`,
    [funcaoBancoNomes],
  );
  const nomes = new Set(disponivel.rows.map((resultadoItem) => resultadoItem.proname));
  const ausentesPorNome = funcaoBancoNomes.filter((nome) => !nomes.has(nome));

  const ausentesExato = [];
  for (const assinatura of exatoObrigatorio) {
    const buscaAtual = await cliente.query('select to_regprocedure($1) is not null as ok', [assinatura]);
    if (!buscaAtual.rows[0]?.ok) ausentesExato.push(assinatura);
  }

  console.log('PegaNaFrota — contratos do backend remoto');
  console.log(`Migration ${obrigatorioMigration}: ${migracao.rows[0]?.applied ? 'OK' : 'AUSENTE'}`);
  console.log(`RPCs usadas pelo Desktop: ${funcaoBancoNomes.length}`);

  if (ausentesPorNome.length) console.log(`RPCs ausentes por nome: ${ausentesPorNome.join(', ')}`);
  else console.log('RPCs por nome: OK');

  if (ausentesExato.length) console.log(`Assinaturas críticas ausentes: ${ausentesExato.join(', ')}`);
  else console.log('Assinaturas críticas: OK');

  if (!migracao.rows[0]?.applied || ausentesPorNome.length || ausentesExato.length) {
    console.error('\nBACKEND DESATUALIZADO. Rode:');
    console.error('  npx supabase db push --db-url "$env:SUPABASE_DB_URL"');
    console.error('Depois, no SQL Editor:');
    console.error("  NOTIFY pgrst, 'reload schema';");
    process.exit(1);
  }

  console.log('\nPASS — o backend remoto atende aos contratos desta versão.');
} catch (erro) {
  console.error(`Falha ao verificar o backend remoto: ${erro.message}`);
  process.exit(1);
} finally {
  await cliente.end().catch(() => {});
}
