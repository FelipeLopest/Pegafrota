#!/usr/bin/env node
/**
 * =============================================================================
 * PegaNaFrota — Edge Function admin-users contra o BANCO REAL
 * =============================================================================
 * O teste unitário (tests/edge/admin-users.test.mjs) usa clientes falsos e por
 * isso não detectou o achado DB-AUD2-001: o mock de `company_members()` devolvia
 * sucesso artificialmente, escondendo que a RPC depende de auth.uid() e falha
 * sob service role.
 *
 * Aqui os dois clientes são REAIS no que importa: cada um é uma conexão
 * PostgreSQL com o papel e o JWT corretos, e toda RPC executa de verdade.
 *   - userClient  -> `set role authenticated` + request.jwt.claims do usuário
 *   - adminClient -> `set role service_role`, sem identidade
 *
 * O que continua simulado é o GoTrue: `auth.admin.*` opera diretamente sobre
 * auth.users, porque não há servidor de autenticação no ambiente. A parte que a
 * auditoria questionou — contexto autenticado, transação, rollback — é real.
 *
 * Uso:
 *   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/pegafrota \
 *     node --experimental-strip-types \
 *       supabase/tests/integration/admin-users.integration.test.mjs
 * =============================================================================
 */

import postgres from 'pg';
import { randomUUID as criarIdentificadorUnico } from 'node:crypto';
import { tratarRequisicao } from '../../functions/admin-users/gerenciar-equipe.ts';

const ENDERECO_BANCO = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/pegafrota';
const ORIGEM = 'app://peganafrota';
const PERMITIDOS = [ORIGEM];

let quantidade = 0;
let falhas = 0;
function verificar(nome, sucesso, detalhe = '') {
  quantidade += 1;
  if (!sucesso) falhas += 1;
  console.log(`${sucesso ? 'ok  ' : 'NOT OK'} ${quantidade} - ${nome}${detalhe ? ` (${detalhe})` : ''}`);
}

// =============================================================================
// Clientes Supabase apoiados em conexões PostgreSQL reais
// =============================================================================
function converterErroSupabase(erro) {
  return {
    message: erro.message,
    details: erro.detail ?? null,
    hint: erro.hint ?? null,
    code: erro.code ?? null,
  };
}

/** Traduz rpc(nome, {p_x: v}) em `select public.nome(p_x => $1)`. */
async function chamarFuncaoBanco(cliente, nome, parametros) {
  const entradas = Object.entries(parametros ?? {});
  const argumentos = entradas.map(([chave], indiceItem) => `${chave} => $${indiceItem + 1}`).join(', ');
  const valores = entradas.map(([, valor]) => valor);
  try {
    const { rows: linhas } = await cliente.query(`select public.${nome}(${argumentos}) as result`, valores);
    return { data: linhas[0].result, error: null };
  } catch (erro) {
    return { data: null, error: converterErroSupabase(erro) };
  }
}

async function criarUsuarioCliente(usuarioIdentificador) {
  const cliente = new postgres.Client({ connectionString: ENDERECO_BANCO });
  await cliente.connect();
  await cliente.query('select set_config($1, $2, false)', [
    'request.jwt.claims',
    JSON.stringify({ sub: usuarioIdentificador, role: 'authenticated' }),
  ]);
  await cliente.query('set role authenticated');
  return {
    _pg: cliente,
    auth: { getUser: async () => ({ data: { user: { id: usuarioIdentificador } }, error: null }) },
    rpc: (nome, parametros) => chamarFuncaoBanco(cliente, nome, parametros),
  };
}

async function criarAdministradorCliente() {
  const cliente = new postgres.Client({ connectionString: ENDERECO_BANCO });
  await cliente.connect();
  await cliente.query('set role service_role');
  return {
    _pg: cliente,
    rpc: (nome, parametros) => chamarFuncaoBanco(cliente, nome, parametros),
    auth: {
      admin: {
        // GoTrue simulado: escreve direto em auth.users.
        listUsers: async ({ page: pagina, perPage: porPagina }) => {
          const { rows: linhas } = await cliente.query(
            `select id, email from auth.users order by created_at, id limit $1 offset $2`,
            [porPagina, (pagina - 1) * porPagina],
          );
          return { data: { users: linhas }, error: null };
        },
        createUser: async ({ email }) => {
          const identificador = criarIdentificadorUnico();
          await cliente.query(
            `insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at,
                                     raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
             values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
                     $2, now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now())`,
            [identificador, email],
          );
          return { data: { user: { id: identificador } }, error: null };
        },
        inviteUserByEmail: async (email) => {
          const identificador = criarIdentificadorUnico();
          await cliente.query(
            `insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at,
                                     raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
             values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
                     $2, null, '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now())`,
            [identificador, email],
          );
          return { data: { user: { id: identificador } }, error: null };
        },
        deleteUser: async (identificador) => {
          await cliente.query('delete from auth.users where id = $1', [identificador]);
          return { error: null };
        },
      },
    },
  };
}

function requisitar(
  corpo,
  { userId: usuarioIdentificador, origin: origem = ORIGEM, headers: cabecalhos = {} } = {},
) {
  return new Request('https://example.test/admin-users', {
    method: 'POST',
    headers: {
      Origin: origem,
      Authorization: `Bearer ${usuarioIdentificador}`,
      'Content-Type': 'application/json',
      ...cabecalhos,
    },
    body: JSON.stringify(corpo),
  });
}

// =============================================================================
async function principal() {
  console.log('PegaNaFrota — Edge Function contra o banco real\n');

  const raiz = new postgres.Client({ connectionString: ENDERECO_BANCO });
  await raiz.connect();

  const { rows: dadosDemonstracaoLinhas } = await raiz.query(`
    select private.stable_uuid('company:auroraverde')       as company_a,
           private.stable_uuid('company:pedraalta')         as company_b,
           private.stable_uuid('user:auroraverde:admin')    as admin_a,
           private.stable_uuid('user:auroraverde:gestor')   as gestor_a,
           private.stable_uuid('user:auroraverde:operador') as operador_a,
           private.stable_uuid('user:auroraverde:consulta') as viewer_a,
           private.stable_uuid('user:pedraalta:admin')      as admin_b
  `);
  const dadosDemonstracao = dadosDemonstracaoLinhas[0];

  const clientes = [];
  async function dependenciasPara(usuarioIdentificador) {
    const usuarioCliente = await criarUsuarioCliente(usuarioIdentificador);
    const administradorCliente = await criarAdministradorCliente();
    clientes.push(usuarioCliente._pg, administradorCliente._pg);
    return {
      createUserClient: () => usuarioCliente,
      createAdminClient: () => administradorCliente,
      allowedOrigins: PERMITIDOS,
      logger: { error: () => {} },
    };
  }

  // ===========================================================================
  // DB-AUD2-001 — list com contexto autenticado
  // ===========================================================================

  // Prova de que o achado era real: a MESMA RPC, chamada com service role.
  {
    const administrador = await criarAdministradorCliente();
    clientes.push(administrador._pg);
    const { error: erro } = await administrador.rpc('company_members', {});
    verificar(
      'DB-AUD2-001 company_members() sob service role FALHA (o bug era real)',
      erro !== null && /users\.read|FORBIDDEN|PERMISSAO/i.test(erro.message ?? ''),
      erro?.message?.slice(0, 60) ?? 'não falhou',
    );
  }

  {
    const resposta = await tratarRequisicao(
      requisitar({ action: 'list' }, { userId: dadosDemonstracao.admin_a }),
      await dependenciasPara(dadosDemonstracao.admin_a),
    );
    const dadosEnvio = await resposta.json();
    verificar(
      'DB-AUD2-001 list com JWT de company_admin devolve 200',
      resposta.status === 200,
      `status ${resposta.status} ${JSON.stringify(dadosEnvio).slice(0, 120)}`,
    );
    verificar(
      'DB-AUD2-001 list devolve a empresa do chamador',
      dadosEnvio.data?.companyId === dadosDemonstracao.company_a,
    );
    verificar(
      'DB-AUD2-001 list devolve os membros',
      Array.isArray(dadosEnvio.data?.members) && dadosEnvio.data.members.length >= 5,
      `${dadosEnvio.data?.members?.length} membros`,
    );
  }

  {
    // fleet_manager possui users.read: pode listar, não pode mutar.
    const resposta = await tratarRequisicao(
      requisitar({ action: 'list' }, { userId: dadosDemonstracao.gestor_a }),
      await dependenciasPara(dadosDemonstracao.gestor_a),
    );
    verificar(
      'DB-AUD2-001 gestor de frota (users.read) lista com 200',
      resposta.status === 200,
      `status ${resposta.status}`,
    );

    const alterarRegistro = await tratarRequisicao(
      requisitar(
        { action: 'deactivate', userId: dadosDemonstracao.operador_a },
        { userId: dadosDemonstracao.gestor_a },
      ),
      await dependenciasPara(dadosDemonstracao.gestor_a),
    );
    const alterarDadosEnviados = await alterarRegistro.json();
    verificar(
      'DB-AUD2-001 gestor de frota NÃO muta (403)',
      alterarRegistro.status === 403 && alterarDadosEnviados.error.code === 'PERMISSION_DENIED',
    );
  }

  for (const [rotulo, usuarioIdentificador] of [
    ['viewer', dadosDemonstracao.viewer_a],
    ['operador', dadosDemonstracao.operador_a],
  ]) {
    const resposta = await tratarRequisicao(
      requisitar({ action: 'list' }, { userId: usuarioIdentificador }),
      await dependenciasPara(usuarioIdentificador),
    );
    const dadosEnvio = await resposta.json();
    verificar(
      `DB-AUD2-001 ${rotulo} sem users.read recebe 403`,
      resposta.status === 403 && dadosEnvio.error.code === 'PERMISSION_DENIED',
      `status ${resposta.status}`,
    );
  }

  {
    const respostaA = await tratarRequisicao(
      requisitar({ action: 'list' }, { userId: dadosDemonstracao.admin_a }),
      await dependenciasPara(dadosDemonstracao.admin_a),
    );
    const respostaB = await tratarRequisicao(
      requisitar({ action: 'list' }, { userId: dadosDemonstracao.admin_b }),
      await dependenciasPara(dadosDemonstracao.admin_b),
    );
    const primeiroItem = await respostaA.json();
    const segundoItem = await respostaB.json();
    const identificadoresA = new Set(
      primeiroItem.data.members.map((correspondenciaItem) => correspondenciaItem.user_id),
    );
    const sobreposicao = segundoItem.data.members.filter((correspondenciaItem) =>
      identificadoresA.has(correspondenciaItem.user_id),
    );
    verificar(
      'DB-AUD2-001 empresa A nunca lista membros de B',
      segundoItem.data.companyId === dadosDemonstracao.company_b && sobreposicao.length === 0,
      `${sobreposicao.length} sobreposição(ões)`,
    );
  }

  // ===========================================================================
  // DB-AUD2-002 — profile globalmente inativo não é reativado
  // ===========================================================================
  const suspensoIdentificador = criarIdentificadorUnico();
  const suspensoEmail = `suspenso-${suspensoIdentificador.slice(0, 8)}@externo.example.com`;
  await raiz.query(
    `insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at,
                             raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
             $2, now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now())`,
    [suspensoIdentificador, suspensoEmail],
  );
  // Profile suspenso GLOBALMENTE e sem nenhuma membership ativa.
  await raiz.query(
    `insert into public.profiles (id, full_name, phone, active) values ($1, 'Suspenso Global', '11900000000', false)`,
    [suspensoIdentificador],
  );

  for (const acao of ['create', 'invite']) {
    const resposta = await tratarRequisicao(
      requisitar(
        {
          action: acao,
          email: suspensoEmail,
          fullName: 'Tentativa de Reativacao',
          role: 'operator',
          ...(acao === 'create' ? { password: 'senha-bem-longa-1' } : {}),
        },
        { userId: dadosDemonstracao.admin_a },
      ),
      await dependenciasPara(dadosDemonstracao.admin_a),
    );
    const dadosEnvio = await resposta.json();
    verificar(
      `DB-AUD2-002 ${acao} sobre profile globalmente inativo é recusado`,
      resposta.status === 409 && dadosEnvio.error.code === 'PROFILE_GLOBALLY_INACTIVE',
      `status ${resposta.status} code ${dadosEnvio.error?.code}`,
    );
  }

  {
    const { rows: linhas } = await raiz.query('select active, full_name from public.profiles where id = $1', [
      suspensoIdentificador,
    ]);
    verificar('DB-AUD2-002 profiles.active continua false', linhas[0].active === false);
    verificar(
      'DB-AUD2-002 nome global do usuário não foi sobrescrito',
      linhas[0].full_name === 'Suspenso Global',
      linhas[0].full_name,
    );
    const { rows: vinculos } = await raiz.query(
      'select count(*)::int as n from public.company_memberships where user_id = $1',
      [suspensoIdentificador],
    );
    verificar('DB-AUD2-002 nenhuma membership foi criada', vinculos[0].n === 0, `${vinculos[0].n}`);
  }

  {
    // O canal de plataforma continua podendo reativar.
    const administrador = await criarAdministradorCliente();
    clientes.push(administrador._pg);
    await raiz.query(
      `insert into public.company_memberships (company_id, user_id, role, active) values ($1,$2,'operator',false)`,
      [dadosDemonstracao.company_a, suspensoIdentificador],
    );
    const { error: erro } = await administrador.rpc('admin_set_profile_active', {
      p_user_id: suspensoIdentificador,
      p_active: true,
      p_company_id: dadosDemonstracao.company_a,
    });
    const { rows: linhas } = await raiz.query('select active from public.profiles where id = $1', [
      suspensoIdentificador,
    ]);
    verificar(
      'DB-AUD2-002 admin_set_profile_active (plataforma) reativa',
      erro === null && linhas[0].active === true,
      erro?.message ?? '',
    );
    await raiz.query('update public.profiles set active = false where id = $1', [suspensoIdentificador]);
  }

  // ===========================================================================
  // DB-AUD2-003 — falha de auditoria não deixa estado parcial
  // ===========================================================================
  // A auditoria é quebrada de propósito, no meio da transação da RPC.
  const { rows: definicaoLinhas } = await raiz.query(
    `select pg_get_functiondef(p.oid) as def
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'log_admin_action'`,
  );
  const originalAuditoriaDefinicao = definicaoLinhas[0].def;

  async function quebrarAuditoria() {
    await raiz.query(`
      create or replace function public.log_admin_action(
        p_company_id uuid, p_actor_user_id uuid, p_action text, p_entity_id uuid default null,
        p_metadata jsonb default '{}'::jsonb, p_idempotency_key text default null,
        p_result jsonb default null, p_fingerprint text default null
      ) returns bigint language plpgsql security definer set search_path = '' as $fn$
      begin
        raise exception 'AUDIT_UNAVAILABLE: trilha indisponível' using errcode = '58030';
      end $fn$;
    `);
  }
  async function restaurarAuditoria() {
    await raiz.query(originalAuditoriaDefinicao);
  }

  // Alvo dedicado: usuário JÁ ATIVO na empresa A.
  const ativoAlvoIdentificador = criarIdentificadorUnico();
  await raiz.query(
    `insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at,
                             raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
             $2, now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now())`,
    [ativoAlvoIdentificador, `ativo-${ativoAlvoIdentificador.slice(0, 8)}@auroraverde.example.com`],
  );
  await raiz.query(
    `insert into public.profiles (id, full_name, phone, active) values ($1,'Alvo Ativo','11911111111',true)`,
    [ativoAlvoIdentificador],
  );
  await raiz.query(
    `insert into public.company_memberships (company_id, user_id, role, active) values ($1,$2,'operator',true)`,
    [dadosDemonstracao.company_a, ativoAlvoIdentificador],
  );

  await quebrarAuditoria();

  {
    // reactivate sobre quem JÁ ESTAVA ATIVO. O código antigo gravava !active
    // e o usuário terminava INATIVO.
    const resposta = await tratarRequisicao(
      requisitar(
        { action: 'reactivate', userId: ativoAlvoIdentificador },
        { userId: dadosDemonstracao.admin_a },
      ),
      await dependenciasPara(dadosDemonstracao.admin_a),
    );
    const { rows: linhas } = await raiz.query(
      'select active from public.company_memberships where company_id=$1 and user_id=$2',
      [dadosDemonstracao.company_a, ativoAlvoIdentificador],
    );
    verificar(
      'DB-AUD2-003 falha de auditoria em reactivate de usuário JÁ ATIVO devolve erro',
      resposta.status >= 400,
      `status ${resposta.status}`,
    );
    verificar(
      'DB-AUD2-003 ... e o usuário CONTINUA ativo',
      linhas[0].active === true,
      `active=${linhas[0].active}`,
    );
  }

  // Alvo JÁ INATIVO.
  const inativoAlvoIdentificador = criarIdentificadorUnico();
  await restaurarAuditoria();
  await raiz.query(
    `insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at,
                             raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
             $2, now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now())`,
    [inativoAlvoIdentificador, `inativo-${inativoAlvoIdentificador.slice(0, 8)}@auroraverde.example.com`],
  );
  await raiz.query(
    `insert into public.profiles (id, full_name, phone, active) values ($1,'Alvo Inativo','11922222222',true)`,
    [inativoAlvoIdentificador],
  );
  await raiz.query(
    `insert into public.company_memberships (company_id, user_id, role, active) values ($1,$2,'viewer',false)`,
    [dadosDemonstracao.company_a, inativoAlvoIdentificador],
  );
  await quebrarAuditoria();

  {
    const resposta = await tratarRequisicao(
      requisitar(
        { action: 'deactivate', userId: inativoAlvoIdentificador },
        { userId: dadosDemonstracao.admin_a },
      ),
      await dependenciasPara(dadosDemonstracao.admin_a),
    );
    const { rows: linhas } = await raiz.query(
      'select active from public.company_memberships where company_id=$1 and user_id=$2',
      [dadosDemonstracao.company_a, inativoAlvoIdentificador],
    );
    verificar(
      'DB-AUD2-003 falha de auditoria em deactivate de usuário JÁ INATIVO devolve erro',
      resposta.status >= 400,
      `status ${resposta.status}`,
    );
    verificar(
      'DB-AUD2-003 ... e o usuário CONTINUA inativo',
      linhas[0].active === false,
      `active=${linhas[0].active}`,
    );
  }

  {
    // Membership HISTÓRICA (inativa) + provisionamento que falha na auditoria.
    // O código antigo executava DELETE e destruía o histórico.
    const antes = await raiz.query(
      `select role, active, created_at from public.company_memberships where company_id=$1 and user_id=$2`,
      [dadosDemonstracao.company_a, inativoAlvoIdentificador],
    );
    const antesPerfil = await raiz.query('select full_name, phone, active from public.profiles where id=$1', [
      inativoAlvoIdentificador,
    ]);

    const resposta = await tratarRequisicao(
      requisitar(
        {
          action: 'create',
          email: `inativo-${inativoAlvoIdentificador.slice(0, 8)}@auroraverde.example.com`,
          fullName: 'Nome Reescrito Pela Empresa',
          phone: '11999999999',
          role: 'company_admin',
          password: 'senha-bem-longa-1',
        },
        { userId: dadosDemonstracao.admin_a },
      ),
      await dependenciasPara(dadosDemonstracao.admin_a),
    );

    const depois = await raiz.query(
      `select role, active, created_at from public.company_memberships where company_id=$1 and user_id=$2`,
      [dadosDemonstracao.company_a, inativoAlvoIdentificador],
    );
    const depoisPerfil = await raiz.query(
      'select full_name, phone, active from public.profiles where id=$1',
      [inativoAlvoIdentificador],
    );

    verificar(
      'DB-AUD2-003 provisionamento com auditoria falha devolve erro',
      resposta.status >= 400,
      `status ${resposta.status}`,
    );
    verificar('DB-AUD2-003 membership histórica NÃO é apagada', depois.rows.length === 1);
    verificar(
      'DB-AUD2-003 membership histórica mantém role e active originais',
      depois.rows[0]?.role === antes.rows[0].role && depois.rows[0]?.active === antes.rows[0].active,
      `antes ${antes.rows[0].role}/${antes.rows[0].active} depois ${depois.rows[0]?.role}/${depois.rows[0]?.active}`,
    );
    verificar(
      'DB-AUD2-003 profile existente é preservado byte a byte',
      depoisPerfil.rows[0].full_name === antesPerfil.rows[0].full_name &&
        depoisPerfil.rows[0].phone === antesPerfil.rows[0].phone &&
        depoisPerfil.rows[0].active === antesPerfil.rows[0].active,
      `${depoisPerfil.rows[0].full_name}`,
    );
  }

  {
    // Conta NOVA + auditoria falha: a compensação do GoTrue precisa acontecer.
    const novoEmail = `novo-${criarIdentificadorUnico().slice(0, 8)}@auroraverde.example.com`;
    const resposta = await tratarRequisicao(
      requisitar(
        {
          action: 'create',
          email: novoEmail,
          fullName: 'Conta Nova',
          role: 'operator',
          password: 'senha-bem-longa-1',
        },
        { userId: dadosDemonstracao.admin_a },
      ),
      await dependenciasPara(dadosDemonstracao.admin_a),
    );
    const { rows: autenticacaoLinhas } = await raiz.query(
      'select count(*)::int n from auth.users where email=$1',
      [novoEmail],
    );
    const { rows: perfilLinhas } = await raiz.query(
      'select count(*)::int n from public.profiles p join auth.users u on u.id=p.id where u.email=$1',
      [novoEmail],
    );
    verificar('DB-AUD2-003 conta nova com auditoria falha devolve erro', resposta.status >= 400);
    verificar(
      'DB-AUD2-003 conta órfã do GoTrue é compensada',
      autenticacaoLinhas[0].n === 0,
      `${autenticacaoLinhas[0].n} restante(s)`,
    );
    verificar('DB-AUD2-003 nenhum profile parcial sobra', perfilLinhas[0].n === 0);
  }

  await restaurarAuditoria();

  // ===========================================================================
  // DB-AUD2-005 — idempotência vinculada à ação
  // ===========================================================================
  {
    const chave = `chave-${criarIdentificadorUnico().slice(0, 12)}`;
    const primeiro = await tratarRequisicao(
      requisitar(
        {
          action: 'change_role',
          userId: ativoAlvoIdentificador,
          role: 'fleet_manager',
          idempotencyKey: chave,
        },
        { userId: dadosDemonstracao.admin_a },
      ),
      await dependenciasPara(dadosDemonstracao.admin_a),
    );
    const primeiroDadosEnviados = await primeiro.json();
    verificar(
      'DB-AUD2-005 primeira execução com chave funciona',
      primeiro.status === 200,
      `status ${primeiro.status} ${JSON.stringify(primeiroDadosEnviados).slice(0, 100)}`,
    );

    const repeticao = await tratarRequisicao(
      requisitar(
        {
          action: 'change_role',
          userId: ativoAlvoIdentificador,
          role: 'fleet_manager',
          idempotencyKey: chave,
        },
        { userId: dadosDemonstracao.admin_a },
      ),
      await dependenciasPara(dadosDemonstracao.admin_a),
    );
    const repeticaoDadosEnviados = await repeticao.json();
    verificar(
      'DB-AUD2-005 mesmo payload devolve o resultado anterior',
      repeticao.status === 200 && repeticaoDadosEnviados.data.replayed === true,
    );

    const reutilizado = await tratarRequisicao(
      requisitar(
        { action: 'change_role', userId: ativoAlvoIdentificador, role: 'viewer', idempotencyKey: chave },
        { userId: dadosDemonstracao.admin_a },
      ),
      await dependenciasPara(dadosDemonstracao.admin_a),
    );
    const reutilizadoDadosEnviados = await reutilizado.json();
    verificar(
      'DB-AUD2-005 mesma chave com payload DIFERENTE gera conflito',
      reutilizado.status === 409 && reutilizadoDadosEnviados.error.code === 'IDEMPOTENCY_KEY_REUSED',
      `status ${reutilizado.status} code ${reutilizadoDadosEnviados.error?.code}`,
    );

    const outroAcao = await tratarRequisicao(
      requisitar(
        { action: 'deactivate', userId: ativoAlvoIdentificador, idempotencyKey: chave },
        { userId: dadosDemonstracao.admin_a },
      ),
      await dependenciasPara(dadosDemonstracao.admin_a),
    );
    const outroDadosEnviados = await outroAcao.json();
    verificar(
      'DB-AUD2-005 mesma chave em AÇÃO diferente gera conflito',
      outroAcao.status === 409 && outroDadosEnviados.error.code === 'IDEMPOTENCY_KEY_REUSED',
      `status ${outroAcao.status}`,
    );

    const { rows: linhas } = await raiz.query(
      'select role from public.company_memberships where company_id=$1 and user_id=$2',
      [dadosDemonstracao.company_a, ativoAlvoIdentificador],
    );
    verificar(
      'DB-AUD2-005 nenhuma das tentativas conflitantes alterou o vínculo',
      linhas[0].role === 'fleet_manager',
      linhas[0].role,
    );
  }

  // ===========================================================================
  // Integridade global depois de tudo
  // ===========================================================================
  {
    const { rows: linhas } = await raiz.query('select * from private.data_integrity_selftest()');
    verificar(
      'data_integrity_selftest continua vazio',
      linhas.length === 0,
      linhas.map((resultadoItem) => `${resultadoItem.finding}: ${resultadoItem.detail}`).join(' | '),
    );
  }

  for (const cliente of clientes) await cliente.end();
  await raiz.end();

  console.log(`\n1..${quantidade}`);
  if (falhas > 0) {
    console.error(`\nFALHOU: ${falhas} de ${quantidade}.`);
    process.exit(1);
  }
  console.log(`\nTodas as ${quantidade} verificações de integração passaram.`);
}

principal().catch((erro) => {
  console.error('Erro fatal:', erro);
  process.exit(1);
});
