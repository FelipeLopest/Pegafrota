#!/usr/bin/env node

import postgres from 'pg';
import { readFile as lerArquivo } from 'node:fs/promises';
import { fileURLToPath as converterEnderecoEmCaminho } from 'node:url';
import { dirname as obterPastaPai, join as juntarCaminhos } from 'node:path';

const AQUI = obterPastaPai(converterEnderecoEmCaminho(import.meta.url));
const RAIZ = juntarCaminhos(AQUI, '../..');

const ENDERECO_SUPABASE = process.env.SUPABASE_URL;
const CHAVE_PRIVILEGIADA_SERVIDOR = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENDERECO_BANCO = process.env.DATABASE_URL;
const SENHA_DEMONSTRACAO = process.env.SEED_DEMO_PASSWORD || 'PegaNaFrota#2026';

const argumentos = new Set(process.argv.slice(2));
const SOMENTE_SIMULAR = argumentos.has('--dry-run');
const REINICIAR = argumentos.has('--reset');

const EMPRESAS = [
  { slug: 'auroraverde', users: ['admin', 'gestor', 'operador', 'consulta', 'desligado'] },
  { slug: 'pedraalta', users: ['admin', 'gestor', 'operador', 'operador2', 'consulta', 'suspenso'] },
  { slug: 'riosereno', users: ['admin', 'gestor', 'gestor2', 'operador', 'operador2', 'consulta'] },
  {
    slug: 'camponovo',
    users: ['admin', 'admin2', 'gestor', 'gestor2', 'operador', 'operador2', 'operador3', 'consulta'],
  },
];

const NOMES_COMPLETOS = {
  'auroraverde:admin': 'Ana R.',
  'auroraverde:gestor': 'Bruno M.',
  'auroraverde:operador': 'Camila S.',
  'auroraverde:consulta': 'Diego L.',
  'auroraverde:desligado': 'Eduarda P.',
  'pedraalta:admin': 'Fabio T.',
  'pedraalta:gestor': 'Gisele A.',
  'pedraalta:operador': 'Henrique B.',
  'pedraalta:operador2': 'Isabela C.',
  'pedraalta:consulta': 'Joao V.',
  'pedraalta:suspenso': 'Karina D.',
  'riosereno:admin': 'Lucas E.',
  'riosereno:gestor': 'Marina F.',
  'riosereno:gestor2': 'Nelson G.',
  'riosereno:operador': 'Olivia H.',
  'riosereno:operador2': 'Paulo I.',
  'riosereno:consulta': 'Renata J.',
  'camponovo:admin': 'Sergio K.',
  'camponovo:admin2': 'Tatiana L.',
  'camponovo:gestor': 'Ulisses M.',
  'camponovo:gestor2': 'Vanessa N.',
  'camponovo:operador': 'Wagner O.',
  'camponovo:operador2': 'Xenia P.',
  'camponovo:operador3': 'Yuri Q.',
  'camponovo:consulta': 'Zilda R.',
};

const ESPERADO = EMPRESAS.flatMap((empresa) =>
  empresa.users.map((parteLocal) => ({
    email: `${parteLocal}@${empresa.slug}.example.com`,
    fullName: NOMES_COMPLETOS[`${empresa.slug}:${parteLocal}`],
  })),
);

let falhas = 0;
function registro(nome, sucessoValue, detalhe = '') {
  if (!sucessoValue) falhas += 1;
  console.log(`${sucessoValue ? '  ok  ' : ' FALHA'} ${nome}${detalhe ? `  — ${detalhe}` : ''}`);
}

function exigirAmbiente() {
  const ausentes = [];
  if (!ENDERECO_SUPABASE) ausentes.push('SUPABASE_URL');
  if (!CHAVE_PRIVILEGIADA_SERVIDOR && !SOMENTE_SIMULAR) ausentes.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!ENDERECO_BANCO && !SOMENTE_SIMULAR) ausentes.push('DATABASE_URL');
  if (ausentes.length > 0) {
    console.error(
      `Faltam variáveis de ambiente: ${ausentes.join(', ')}\n\n` +
        'Nunca coloque a service role key em arquivo versionado.',
    );
    process.exit(1);
  }
}

async function servicosAutenticacao(caminho, opcoes = {}) {
  const resposta = await fetch(`${ENDERECO_SUPABASE}/auth/v1${caminho}`, {
    ...opcoes,
    headers: {
      apikey: CHAVE_PRIVILEGIADA_SERVIDOR,
      Authorization: `Bearer ${CHAVE_PRIVILEGIADA_SERVIDOR}`,
      'Content-Type': 'application/json',
      ...(opcoes.headers || {}),
    },
  });
  const texto = await resposta.text();
  const corpo = texto ? JSON.parse(texto) : null;
  if (!resposta.ok) {
    throw new Error(`${opcoes.method || 'GET'} ${caminho} -> ${resposta.status}: ${texto}`);
  }
  return corpo;
}

async function listarUsuariosExistentes() {
  const porEmail = new Map();
  for (let pagina = 1; pagina <= 200; pagina += 1) {
    const corpo = await servicosAutenticacao(`/admin/users?page=${pagina}&per_page=200`);
    const usuarios = corpo?.users ?? [];
    for (const usuario of usuarios) {
      if (usuario.email) porEmail.set(usuario.email.toLowerCase(), usuario);
    }
    if (usuarios.length < 200) break;
  }
  return porEmail;
}

async function garantirUsuariosAutenticacao() {
  console.log(`\n[1/5] Contas no Auth (${ESPERADO.length} esperadas)`);
  const existente = await listarUsuariosExistentes();
  const mapa = new Map();
  let criado = 0;

  for (const usuario of ESPERADO) {
    const encontrado = existente.get(usuario.email.toLowerCase());
    if (encontrado) {
      mapa.set(usuario.email, encontrado.id);
      continue;
    }
    const corpo = await servicosAutenticacao('/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email: usuario.email,
        password: SENHA_DEMONSTRACAO,
        email_confirm: true,
        user_metadata: { full_name: usuario.fullName },
      }),
    });
    mapa.set(usuario.email, corpo.id);
    criado += 1;
  }

  console.log(`      ${criado} criada(s), ${ESPERADO.length - criado} já existente(s).`);
  registro('todas as contas possuem UUID resolvido', mapa.size === ESPERADO.length, `${mapa.size}`);
  return mapa;
}

async function redefinirBusinessDados(cliente) {
  console.log('\n[--reset] Limpando dados de demonstração');
  await cliente.query('begin');
  await cliente.query(`
    truncate table
      public.vehicle_movements,
      public.plate_read_events,
      public.vehicle_odometer_events,
      public.fuelings,
      public.maintenance_records,
      public.trips,
      public.cameras,
      public.locations,
      public.drivers,
      public.vehicles,
      public.company_memberships,
      public.companies
    cascade
  `);
  await cliente.query('alter table audit.events disable trigger audit_events_no_delete');
  await cliente.query('delete from audit.events');
  await cliente.query('alter table audit.events enable trigger audit_events_no_delete');
  await cliente.query('commit');
  console.log(
    '      dados de negócio removidos (Auth e profiles preservados; profiles serão atualizados pelo seed).',
  );
}

async function aplicarDadosDemonstracao(cliente, mapaUsuarios) {
  console.log('\n[2/5] Aplicando supabase/seed.sql');

  const { rows: ja } = await cliente.query('select count(*)::int as n from public.companies');
  if (ja[0].n > 0 && !REINICIAR) {
    console.log('      base já populada — seed é idempotente, nada a fazer.');
    return;
  }

  const emails = [...mapaUsuarios.keys()];
  const { rows: encontrado } = await cliente.query(
    'select lower(email) as email, id from auth.users where lower(email) = any($1::text[])',
    [emails.map((evento) => evento.toLowerCase())],
  );
  registro(
    'auth.users do projeto contém todas as contas de demonstração',
    encontrado.length === emails.length,
    `${encontrado.length}/${emails.length}`,
  );

  const divergentes = encontrado.filter((linha) => mapaUsuarios.get(linha.email) !== linha.id);
  registro('UUID do banco é idêntico ao devolvido pela Admin API', divergentes.length === 0);

  const codigoSql = await lerArquivo(juntarCaminhos(RAIZ, 'supabase', 'seed.sql'), 'utf8');
  await cliente.query(codigoSql);
  console.log('      seed aplicado.');
}

async function verificarVolumes(cliente) {
  console.log('\n[3/5] Volumes');
  const um = async (codigoSql, parametros = []) => (await cliente.query(codigoSql, parametros)).rows[0];
  const todos = async (codigoSql, parametros = []) => (await cliente.query(codigoSql, parametros)).rows;

  const empresas = await um('select count(*)::int n from public.companies');
  registro('4 empresas', empresas.n === 4, `${empresas.n}`);

  const usuarios = await um('select count(*)::int n from public.company_memberships');
  registro(`${ESPERADO.length} vínculos de usuário`, usuarios.n === ESPERADO.length, `${usuarios.n}`);

  const orfao = await um(`
    select count(*)::int n from public.company_memberships m
    left join auth.users u on u.id = m.user_id
    where u.id is null
  `);
  registro('nenhum vínculo aponta usuário inexistente no Auth', orfao.n === 0, `${orfao.n}`);

  const semPerfil = await um(`
    select count(*)::int n from public.company_memberships m
    left join public.profiles p on p.id = m.user_id
    where p.id is null
  `);
  registro('todo usuário vinculado possui profile', semPerfil.n === 0, `${semPerfil.n}`);

  const porEmpresa = await todos(`
    select c.trade_name,
           (select count(*) from public.company_memberships m where m.company_id = c.id)::int users,
           (select count(*) from public.vehicles v where v.company_id = c.id)::int vehicles,
           (select count(*) from public.drivers d where d.company_id = c.id)::int drivers,
           (select count(*) from public.locations l where l.company_id = c.id)::int locations,
           (select count(*) from public.cameras k where k.company_id = c.id)::int cameras
    from public.companies c order by c.trade_name
  `);
  for (const linha of porEmpresa) {
    registro(`${linha.trade_name}: 3–8 usuários`, linha.users >= 3 && linha.users <= 8, `${linha.users}`);
    registro(
      `${linha.trade_name}: 15–40 veículos`,
      linha.vehicles >= 15 && linha.vehicles <= 40,
      `${linha.vehicles}`,
    );
    registro(
      `${linha.trade_name}: motoristas/locais/câmeras`,
      linha.drivers > 0 && linha.locations > 0 && linha.cameras > 0,
      `${linha.drivers}/${linha.locations}/${linha.cameras}`,
    );
  }

  const historico = await um(`
    select (select count(*) from public.trips)::int trips,
           (select count(*) from public.fuelings)::int fuelings,
           (select count(*) from public.maintenance_records)::int maintenance,
           (select count(*) from public.vehicle_movements)::int movements,
           (select count(*) from public.vehicle_odometer_events)::int odometer
  `);
  registro(
    'histórico operacional populado',
    historico.trips > 100 &&
      historico.fuelings > 100 &&
      historico.maintenance > 10 &&
      historico.movements > 100 &&
      historico.odometer > 100,
    `viagens=${historico.trips} abastecimentos=${historico.fuelings} manutenções=${historico.maintenance} ` +
      `movimentações=${historico.movements} odômetro=${historico.odometer}`,
  );

  const administradores = await todos(`
    select c.trade_name, private.count_effective_admins(c.id, null) as n
    from public.companies c where c.status = 'active'
  `);
  for (const linha of administradores) {
    registro(`${linha.trade_name}: ao menos um administrador efetivo`, Number(linha.n) >= 1, `${linha.n}`);
  }
}

async function verificarIntegridade(cliente) {
  console.log('\n[4/5] Autotestes');
  const seguranca = (await cliente.query('select * from private.security_selftest()')).rows;
  registro(
    'security_selftest sem desvios',
    seguranca.length === 0,
    seguranca.map((resultadoItem) => `${resultadoItem.finding}: ${resultadoItem.object_name}`).join(' | '),
  );

  const integridade = (await cliente.query('select * from private.data_integrity_selftest()')).rows;
  registro(
    'data_integrity_selftest sem apontamentos',
    integridade.length === 0,
    integridade.map((resultadoItem) => `${resultadoItem.finding}: ${resultadoItem.detail}`).join(' | '),
  );
}

async function principal() {
  exigirAmbiente();

  console.log('PegaNaFrota — seed remoto completo');
  console.log(`Destino: ${ENDERECO_SUPABASE}`);

  if (SOMENTE_SIMULAR) {
    console.log(`\n[dry-run] ${ESPERADO.length} contas seriam verificadas/criadas:`);
    for (const usuario of ESPERADO) console.log(`  ${usuario.email}  (${usuario.fullName})`);
    console.log('\n[dry-run] em seguida seria aplicado supabase/seed.sql e validados os volumes.');
    console.log('Nenhuma alteração feita.');
    return;
  }

  const mapaUsuarios = await garantirUsuariosAutenticacao();

  const cliente = new postgres.Client({
    connectionString: ENDERECO_BANCO,
    ssl:
      ENDERECO_BANCO.includes('localhost') || ENDERECO_BANCO.includes('127.0.0.1')
        ? undefined
        : { rejectUnauthorized: false },
  });
  await cliente.connect();

  try {
    if (REINICIAR) await redefinirBusinessDados(cliente);
    await aplicarDadosDemonstracao(cliente, mapaUsuarios);
    await verificarVolumes(cliente);
    await verificarIntegridade(cliente);
  } finally {
    await cliente.end();
  }

  console.log('\n[5/5] Resultado');
  if (falhas > 0) {
    console.error(`${falhas} verificação(ões) falharam.`);
    process.exit(1);
  }
  console.log('Seed remoto concluído e verificado. Nenhuma etapa manual pendente.');
}

principal().catch((erro) => {
  console.error('Falha no seed remoto:', erro.message);
  process.exit(1);
});
