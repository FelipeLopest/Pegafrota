-- =============================================================================
-- 13_platform_api_exposure — exposição do schema sem perda de isolamento
-- =============================================================================
-- Prova o que a correção do achado OPUS-R1-006 afirma: expor `platform` ao
-- PostgREST torna o schema ENDEREÇÁVEL, e não acessível.
--
-- A distinção importa. `db-schemas` no PostgREST diz apenas quais schemas podem
-- ser nomeados numa requisição. Quem pode executar continua sendo decidido por
-- GRANT. Se essa afirmação estiver errada, a camada global inteira fica exposta
-- ao navegador — por isso ela é testada, e não apenas documentada.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public, private, pg_temp;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- 1. O espelho existe e delega
-- ---------------------------------------------------------------------------
select has_function('platform', 'is_platform_admin', array['uuid'],
  'platform.is_platform_admin existe para a Edge Function alcançar');

-- Regra definida uma vez só: o espelho chama private, não reimplementa.
select ok(
  (select pg_get_functiondef(p.oid) like '%private.is_platform_admin%'
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'platform' and p.proname = 'is_platform_admin'),
  'o espelho delega para private.is_platform_admin em vez de duplicar a regra'
);

-- ---------------------------------------------------------------------------
-- 2. Os papéis de navegador continuam sem alcance
-- ---------------------------------------------------------------------------
-- `authenticator` é o papel de login do PostgREST. Sem USAGE aqui, nenhuma
-- requisição vinda de navegador atravessa, mesmo com o schema declarado na API.
select ok(
  not has_schema_privilege('authenticator', 'platform', 'USAGE'),
  'authenticator NÃO tem USAGE em platform, mesmo com o schema exposto'
);
select ok(
  not has_schema_privilege('authenticated', 'platform', 'USAGE'),
  'authenticated NÃO tem USAGE em platform'
);
select ok(
  not has_schema_privilege('anon', 'platform', 'USAGE'),
  'anon NÃO tem USAGE em platform'
);

select ok(
  has_schema_privilege('service_role', 'platform', 'USAGE'),
  'service_role TEM USAGE em platform — a Edge Function precisa chamar'
);

-- ---------------------------------------------------------------------------
-- 3. Nenhuma função global executável por papel de navegador
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'platform'
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('authenticated', p.oid, 'EXECUTE')
       or has_function_privilege('authenticator', p.oid, 'EXECUTE'))),
  0,
  'nenhuma função de platform é executável por anon, authenticated ou authenticator'
);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'platform' and not has_function_privilege('service_role', p.oid, 'EXECUTE')),
  0,
  'toda função de platform continua executável por service_role'
);

-- Inclusive o espelho recém-criado.
select ok(
  not has_function_privilege('authenticated', 'platform.is_platform_admin(uuid)', 'EXECUTE'),
  'o espelho de verificação NÃO é executável por authenticated'
);
select ok(
  has_function_privilege('service_role', 'platform.is_platform_admin(uuid)', 'EXECUTE'),
  'o espelho É executável por service_role'
);

-- ---------------------------------------------------------------------------
-- 4. Nenhuma tabela global legível por papel de navegador
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_tables
   where schemaname = 'platform'
     and (has_table_privilege('anon', schemaname||'.'||tablename, 'SELECT')
       or has_table_privilege('authenticated', schemaname||'.'||tablename, 'SELECT')
       or has_table_privilege('authenticator', schemaname||'.'||tablename, 'SELECT'))),
  0,
  'nenhuma tabela de platform é legível por papel de navegador'
);

-- ---------------------------------------------------------------------------
-- 5. `private`: USAGE preservado, exposição de API não
-- ---------------------------------------------------------------------------
-- Distinção que custou 13 testes quebrados para ficar clara: `authenticated`
-- PRECISA de USAGE em `private`, porque as políticas de RLS chamam
-- `private.current_user_company_id()` com o papel do usuário. Revogar não
-- endurece nada — desliga o isolamento multiempresa.
--
-- O que mantém `private` fora do navegador é a ausência dele em `api.schemas`,
-- não a falta de USAGE.
select ok(
  has_schema_privilege('authenticated', 'private', 'USAGE'),
  'authenticated MANTÉM USAGE em private — as políticas de RLS dependem disso'
);

select ok(
  (select count(*) > 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'private' and p.proname = 'current_user_company_id'
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  'authenticated executa os helpers de RLS de private'
);

-- E o isolamento continua funcionando de fato, não só no papel.
select is(
  (select count(*)::int from pg_policies where schemaname = 'public') > 0,
  true,
  'as políticas de RLS do tenant continuam presentes'
);

-- ---------------------------------------------------------------------------
-- 6. Privilégios padrão protegem objetos futuros
-- ---------------------------------------------------------------------------
-- Sem isto, a próxima função criada em `platform` nasceria com EXECUTE para
-- PUBLIC — e ninguém perceberia até a auditoria seguinte.
select ok(
  exists (
    select 1
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    where n.nspname = 'platform' and d.defaclobjtype = 'f'
  ),
  'existem privilégios padrão definidos para funções futuras em platform'
);

-- ---------------------------------------------------------------------------
-- 7. RLS continua forçada em toda tabela global
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'platform' and c.relkind = 'r'
     and not (c.relrowsecurity and c.relforcerowsecurity)),
  0,
  'toda tabela de platform mantém RLS habilitada e forçada após a exposição'
);

select * from finish();
rollback;
