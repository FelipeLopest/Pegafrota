-- =============================================================================
-- 10_platform_structure — camada global: estrutura, isolamento e grants
-- =============================================================================
-- O que este arquivo prova:
--   1. A camada global existe com a forma esperada.
--   2. `authenticated` e `anon` NÃO alcançam nada dela — nem schema, nem tabela,
--      nem função. É o critério "nenhuma service_role no navegador" visto do
--      outro lado: mesmo com um JWT válido de usuário de empresa, não há o que
--      chamar.
--   3. A auditoria global é append-only de verdade.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public, private, pg_temp;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Estrutura
-- ---------------------------------------------------------------------------
select has_schema('platform', 'schema platform existe');

select has_table('platform', t, 'tabela platform.' || t || ' existe')
from unnest(array[
  'admins', 'operations', 'operation_steps', 'audit_events',
  'bootstrap_tokens', 'company_invites'
]) t;

select has_type('platform', t, 'tipo platform.' || t || ' existe')
from unnest(array[
  'admin_status', 'operation_status', 'step_status',
  'operation_kind', 'suspension_reason'
]) t;

-- Os quatro estados de operação que a UI precisa distinguir existem.
select bag_eq(
  $$ select unnest(enum_range(null::platform.operation_status))::text $$,
  $$ values ('pending'),('running'),('succeeded'),('failed'),
            ('compensating'),('compensated'),('needs_manual') $$,
  'operation_status cobre sucesso, falha, compensação e intervenção manual'
);

-- Motivos de suspensão são vocabulário fechado e sem cobrança.
select bag_eq(
  $$ select unnest(enum_range(null::platform.suspension_reason))::text $$,
  $$ values ('solicitacao_do_cliente'),('violacao_contratual'),
            ('risco_de_seguranca'),('cadastro_em_revisao') $$,
  'motivos de suspensão são exatamente os quatro aprovados'
);

-- ---------------------------------------------------------------------------
-- Isolamento: o schema global é inalcançável pelos papéis de aplicação
-- ---------------------------------------------------------------------------
select ok(
  not has_schema_privilege('authenticated', 'platform', 'USAGE'),
  'authenticated NÃO tem USAGE no schema platform'
);
select ok(
  not has_schema_privilege('anon', 'platform', 'USAGE'),
  'anon NÃO tem USAGE no schema platform'
);

select is(
  (select count(*)::int
   from pg_tables
   where schemaname = 'platform'
     and (has_table_privilege('authenticated', schemaname||'.'||tablename, 'SELECT')
       or has_table_privilege('authenticated', schemaname||'.'||tablename, 'INSERT')
       or has_table_privilege('authenticated', schemaname||'.'||tablename, 'UPDATE')
       or has_table_privilege('authenticated', schemaname||'.'||tablename, 'DELETE'))),
  0,
  'nenhuma tabela de platform é acessível por authenticated'
);

select is(
  (select count(*)::int
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'platform'
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  0,
  'nenhuma função de platform é executável por authenticated'
);

select is(
  (select count(*)::int
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'platform'
     and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0,
  'nenhuma função de platform é executável por anon'
);

-- Toda função de platform é executável por service_role: a Edge Function
-- precisa conseguir chamar, ou a camada seria inútil.
select is(
  (select count(*)::int
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'platform'
     and not has_function_privilege('service_role', p.oid, 'EXECUTE')),
  0,
  'toda função de platform é executável por service_role'
);

-- ---------------------------------------------------------------------------
-- RLS forçada em toda tabela global
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'platform' and c.relkind = 'r'
     and not (c.relrowsecurity and c.relforcerowsecurity)),
  0,
  'toda tabela de platform tem RLS habilitada E forçada'
);

-- ---------------------------------------------------------------------------
-- O schema global é endereçável pelo PostgREST só para service_role; private/audit ficam fora
-- ---------------------------------------------------------------------------
-- Não dá para inspecionar config.toml daqui; o que se testa é a consequência:
-- sem USAGE para os papéis da API, o PostgREST não enxerga o schema mesmo que
-- alguém o adicionasse em api.schemas por engano.
select ok(
  not has_schema_privilege('authenticator', 'platform', 'USAGE'),
  'authenticator não alcança platform nem por herança direta'
);

-- ---------------------------------------------------------------------------
-- Auditoria global é append-only
-- ---------------------------------------------------------------------------
select platform.log_event(
  p_actor_user_id => null,
  p_action        => 'test.append_only',
  p_result        => 'success'
);

select throws_ok(
  $$ update platform.audit_events set action = 'adulterado'
     where action = 'test.append_only' $$,
  '23514',
  null,
  'UPDATE em platform.audit_events é recusado'
);

select throws_ok(
  $$ delete from platform.audit_events where action = 'test.append_only' $$,
  '23514',
  null,
  'DELETE em platform.audit_events é recusado'
);

-- ---------------------------------------------------------------------------
-- Trilha global e trilha tenant são objetos distintos
-- ---------------------------------------------------------------------------
select isnt(
  'platform.audit_events'::regclass::oid,
  'audit.events'::regclass::oid,
  'auditoria global e auditoria tenant são tabelas distintas'
);

select ok(
  not has_table_privilege('authenticated', 'platform.audit_events', 'SELECT'),
  'um company_admin não lê a auditoria da plataforma'
);

-- ---------------------------------------------------------------------------
-- Toda função de platform tem search_path fixo (não sequestrável)
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'platform'
     and p.prokind = 'f'
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, array[]::text[])) cfg
       where cfg like 'search_path=%'
     )),
  0,
  'toda função de platform fixa search_path'
);

select * from finish();
rollback;
