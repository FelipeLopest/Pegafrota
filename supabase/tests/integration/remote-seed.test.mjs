#!/usr/bin/env node
/**
 * =============================================================================
 * PegaNaFrota — simulação do seed remoto (DB-AUD-012)
 * =============================================================================
 * Não há projeto Supabase remoto no ambiente de auditoria, mas a parte que o
 * achado questiona é verificável localmente: o seed precisa funcionar quando os
 * usuários JÁ EXISTEM com UUID gerado pelo GoTrue, e não com o UUID
 * determinístico de private.stable_uuid().
 *
 * Este teste cria um banco novo, insere as contas com UUID ALEATÓRIO (é o que a
 * Admin API faria) e então aplica supabase/seed.sql. Se o seed continuar
 * amarrado a stable_uuid, ele falha aqui.
 *
 * Uso:
 *   ADMIN_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres \
 *     node supabase/tests/integration/remote-seed.test.mjs
 * =============================================================================
 */

import postgres from 'pg';
import { randomUUID as criarIdentificadorUnico } from 'node:crypto';
import { readFile as lerArquivo, readdir as listarPasta } from 'node:fs/promises';
import { fileURLToPath as converterEnderecoEmCaminho } from 'node:url';
import { dirname as obterPastaPai, join as juntarCaminhos } from 'node:path';

const AQUI = obterPastaPai(converterEnderecoEmCaminho(import.meta.url));
const RAIZ = juntarCaminhos(AQUI, '..', '..', '..');

const ENDERECO_ADMINISTRACAO =
  process.env.ADMIN_DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/postgres';
const BANCO_TESTE = process.env.REMOTE_SIM_DB || 'pegafrota_remote_sim';
const ENDERECO_TESTE = ENDERECO_ADMINISTRACAO.replace(/\/[^/]*$/, `/${BANCO_TESTE}`);

const EMPRESAS = [
  { slug: 'auroraverde', users: ['admin', 'gestor', 'operador', 'consulta', 'desligado'] },
  { slug: 'pedraalta', users: ['admin', 'gestor', 'operador', 'operador2', 'consulta', 'suspenso'] },
  { slug: 'riosereno', users: ['admin', 'gestor', 'gestor2', 'operador', 'operador2', 'consulta'] },
  {
    slug: 'camponovo',
    users: ['admin', 'admin2', 'gestor', 'gestor2', 'operador', 'operador2', 'operador3', 'consulta'],
  },
];

const ENDERECOS_EMAIL = EMPRESAS.flatMap((registro) =>
  registro.users.map((usuarioItem) => `${usuarioItem}@${registro.slug}.example.com`),
);

let quantidade = 0;
let falhas = 0;
function verificar(nome, sucesso, detalhe = '') {
  quantidade += 1;
  if (!sucesso) falhas += 1;
  console.log(`${sucesso ? 'ok  ' : 'NOT OK'} ${quantidade} - ${nome}${detalhe ? ` (${detalhe})` : ''}`);
}

async function principal() {
  console.log('PegaNaFrota — simulação de seed em projeto remoto\n');

  // ---------------------------------------------------------------------------
  // Banco limpo
  // ---------------------------------------------------------------------------
  const raiz = new postgres.Client({ connectionString: ENDERECO_ADMINISTRACAO });
  await raiz.connect();
  await raiz.query(`drop database if exists ${BANCO_TESTE} with (force)`);
  await raiz.query(`create database ${BANCO_TESTE}`);
  await raiz.end();

  const banco = new postgres.Client({ connectionString: ENDERECO_TESTE });
  await banco.connect();

  const adaptador = await lerArquivo(
    juntarCaminhos(RAIZ, 'scripts', 'pg-harness', 'bootstrap-supabase-shim.sql'),
    'utf8',
  );
  await banco.query(adaptador);

  const migrationsPasta = juntarCaminhos(RAIZ, 'supabase', 'migrations');
  const arquivos = (await listarPasta(migrationsPasta))
    .filter((formulario) => formulario.endsWith('.sql'))
    .sort();
  for (const arquivo of arquivos) {
    await banco.query(await lerArquivo(juntarCaminhos(migrationsPasta, arquivo), 'utf8'));
  }
  verificar('migrations aplicam em banco limpo', true, `${arquivos.length} arquivos`);

  // ---------------------------------------------------------------------------
  // Contas com UUID ALEATÓRIO — é o que o GoTrue faria em um projeto real
  // ---------------------------------------------------------------------------
  const autenticacaoIdentificadores = new Map();
  for (const email of ENDERECOS_EMAIL) {
    const identificador = criarIdentificadorUnico();
    autenticacaoIdentificadores.set(email, identificador);
    await banco.query(
      `insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at,
                               raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
               $2, now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now())`,
      [identificador, email],
    );
  }

  const { rows: estavelCheck } = await banco.query(
    `select count(*)::int as n from auth.users u
      where u.id = private.stable_uuid('user:auroraverde:' || split_part(u.email, '@', 1))`,
  );
  verificar(
    'nenhuma conta usa o UUID determinístico (cenário remoto de verdade)',
    estavelCheck[0].n === 0,
    `${estavelCheck[0].n} coincidência(s)`,
  );

  // ---------------------------------------------------------------------------
  // Seed
  // ---------------------------------------------------------------------------
  const dadosDemonstracao = await lerArquivo(juntarCaminhos(RAIZ, 'supabase', 'seed.sql'), 'utf8');
  await banco.query(dadosDemonstracao);
  verificar('seed.sql aplica sobre contas pré-existentes', true);

  // ---------------------------------------------------------------------------
  // O seed usou os UUIDs REAIS?
  // ---------------------------------------------------------------------------
  const { rows: perfis } = await banco.query(
    `select p.id, u.email from public.profiles p join auth.users u on u.id = p.id`,
  );
  verificar(
    'todo profile aponta uma conta real do Auth',
    perfis.length === ENDERECOS_EMAIL.length,
    `${perfis.length}/${ENDERECOS_EMAIL.length}`,
  );

  const divergente = perfis.filter((linha) => autenticacaoIdentificadores.get(linha.email) !== linha.id);
  verificar(
    'profiles usam o UUID devolvido pelo Auth',
    divergente.length === 0,
    `${divergente.length} divergência(s)`,
  );

  const { rows: orfaos } = await banco.query(`
    select count(*)::int as n from public.company_memberships m
    left join auth.users u on u.id = m.user_id where u.id is null
  `);
  verificar('nenhum vínculo órfão', orfaos[0].n === 0, `${orfaos[0].n}`);

  // ---------------------------------------------------------------------------
  // Volumes e histórico completos — não só usuários
  // ---------------------------------------------------------------------------
  const { rows: volumes } = await banco.query(`
    select (select count(*) from public.companies)::int companies,
           (select count(*) from public.company_memberships)::int memberships,
           (select count(*) from public.vehicles)::int vehicles,
           (select count(*) from public.drivers)::int drivers,
           (select count(*) from public.locations)::int locations,
           (select count(*) from public.cameras)::int cameras,
           (select count(*) from public.trips)::int trips,
           (select count(*) from public.fuelings)::int fuelings,
           (select count(*) from public.maintenance_records)::int maintenance,
           (select count(*) from public.vehicle_movements)::int movements,
           (select count(*) from public.vehicle_odometer_events)::int odometer,
           (select count(*) from public.plate_read_events)::int reads
  `);
  const veiculoItem = volumes[0];
  verificar('4 empresas', veiculoItem.companies === 4, `${veiculoItem.companies}`);
  verificar(
    `${ENDERECOS_EMAIL.length} vínculos`,
    veiculoItem.memberships === ENDERECOS_EMAIL.length,
    `${veiculoItem.memberships}`,
  );
  verificar('frota populada', veiculoItem.vehicles >= 60, `${veiculoItem.vehicles} veículos`);
  verificar(
    'cadastros auxiliares populados',
    veiculoItem.drivers > 0 && veiculoItem.locations > 0 && veiculoItem.cameras > 0,
    `${veiculoItem.drivers}/${veiculoItem.locations}/${veiculoItem.cameras}`,
  );
  verificar(
    'histórico operacional populado',
    veiculoItem.trips > 100 &&
      veiculoItem.fuelings > 100 &&
      veiculoItem.maintenance > 10 &&
      veiculoItem.movements > 100 &&
      veiculoItem.odometer > 100 &&
      veiculoItem.reads > 0,
    `viagens=${veiculoItem.trips} abast=${veiculoItem.fuelings} manut=${veiculoItem.maintenance} mov=${veiculoItem.movements} ` +
      `odo=${veiculoItem.odometer} leituras=${veiculoItem.reads}`,
  );

  const { rows: administradores } = await banco.query(`
    select c.trade_name, private.count_effective_admins(c.id, null)::int as n
    from public.companies c where c.status = 'active'
  `);
  verificar(
    'toda empresa ativa tem administrador efetivo',
    administradores.every((resultadoItem) => resultadoItem.n >= 1),
    administradores.map((resultadoItem) => `${resultadoItem.trade_name}=${resultadoItem.n}`).join(', '),
  );

  // ---------------------------------------------------------------------------
  // Autotestes
  // ---------------------------------------------------------------------------
  const { rows: seguranca } = await banco.query('select * from private.security_selftest()');
  verificar(
    'security_selftest sem desvios',
    seguranca.length === 0,
    seguranca.map((resultadoItem) => resultadoItem.finding).join(' | '),
  );

  const { rows: integridade } = await banco.query('select * from private.data_integrity_selftest()');
  verificar(
    'data_integrity_selftest sem apontamentos',
    integridade.length === 0,
    integridade.map((resultadoItem) => `${resultadoItem.finding}: ${resultadoItem.detail}`).join(' | '),
  );

  // ---------------------------------------------------------------------------
  // Idempotência
  // ---------------------------------------------------------------------------
  await banco.query(dadosDemonstracao);
  const { rows: depois } = await banco.query(`
    select (select count(*) from public.companies)::int companies,
           (select count(*) from public.company_memberships)::int memberships,
           (select count(*) from public.trips)::int trips
  `);
  verificar(
    'segunda execução do seed não duplica nada',
    depois[0].companies === veiculoItem.companies &&
      depois[0].memberships === veiculoItem.memberships &&
      depois[0].trips === veiculoItem.trips,
    JSON.stringify(depois[0]),
  );

  await banco.end();

  console.log(`\n1..${quantidade}`);
  if (falhas > 0) {
    console.error(`\nFALHOU: ${falhas} de ${quantidade}.`);
    process.exit(1);
  }
  console.log(`\nTodas as ${quantidade} verificações do seed remoto passaram.`);
}

principal().catch((erro) => {
  console.error('Erro fatal:', erro.message);
  process.exit(1);
});
