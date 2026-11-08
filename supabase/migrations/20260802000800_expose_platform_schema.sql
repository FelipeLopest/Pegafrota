-- =============================================================================
-- PegaNaFrota — 20260802000800 — Exposição controlada do schema `platform`
-- =============================================================================
-- CORREÇÃO DO ACHADO OPUS-R1-006
--
-- A Edge Function chamava `admin.schema('platform').rpc(...)`, mas
-- `config.toml` expunha apenas `public`. O cliente supabase-js fala com o
-- PostgREST, e o PostgREST só enxerga schema declarado em `db-schemas`. Na
-- prática, TODA chamada global falharia com PGRST106 — a camada inteira estava
-- inalcançável, e nenhum teste pgTAP pegaria isso porque pgTAP fala direto com
-- o Postgres, sem passar pelo PostgREST.
--
-- Das três opções da auditoria, foi escolhida a primeira: expor `platform` e
-- manter as permissões fechadas.
--
--   Por que não wrappers em `public`:
--     Criaria uma função em schema público para cada RPC global. Multiplicaria
--     a superfície de ataque e faria o `public` — o único schema que anon e
--     authenticated enxergam — conter os nomes de todas as operações
--     administrativas. Um `revoke` esquecido em qualquer wrapper viraria
--     escalada de privilégio.
--
--   Por que não conexão direta ao Postgres:
--     Traria um pool de conexões e credencial de banco para dentro da Edge
--     Function, além do que ela já precisa. Mais partes móveis, mesmo
--     resultado.
--
-- A segurança NÃO vem de o schema ser invisível — vem dos GRANTS. Expor no
-- PostgREST apenas informa qual schema pode ser endereçado; quem pode executar
-- continua sendo decidido por `has_function_privilege`. `anon` e
-- `authenticated` não têm USAGE no schema, então para eles o endereço existe e
-- não leva a lugar nenhum: PostgREST devolve 404/403 antes de tocar em
-- qualquer função.
--
-- `private` continua FORA da API, como manda a auditoria. A verificação de
-- administrador global, que morava em `private.is_platform_admin`, ganha um
-- espelho em `platform` para a Edge Function alcançar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Espelho da verificação de papel global, alcançável pela Edge Function
-- -----------------------------------------------------------------------------
-- Delega para `private.is_platform_admin`: a regra continua com uma única
-- definição. Duplicar a lógica criaria a chance de as duas divergirem, que é
-- a pior falha possível numa checagem de autorização.
create or replace function platform.is_platform_admin(p_user_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_admin(coalesce(p_user_id, auth.uid()));
$$;

comment on function platform.is_platform_admin(uuid) is
  'Espelho de private.is_platform_admin, alcançável via PostgREST por service_role. '
  'A regra permanece definida uma única vez em private.';

-- -----------------------------------------------------------------------------
-- 2. Permissões: schema endereçável, porém fechado
-- -----------------------------------------------------------------------------
revoke all on schema platform from public, anon, authenticated;
grant usage on schema platform to service_role;

-- authenticator é o papel de login do PostgREST; ele assume anon ou
-- authenticated conforme o JWT. Sem USAGE aqui, nenhuma requisição de
-- navegador atravessa, mesmo com o schema declarado na API.
revoke all on schema platform from authenticator;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'platform'
  loop
    execute format('revoke all on function %s from public, anon, authenticated, authenticator', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end
$$;

revoke all on all tables in schema platform from public, anon, authenticated, authenticator;

-- Objetos criados no futuro herdam a mesma postura, sem depender de alguém
-- lembrar de repetir os grants.
alter default privileges in schema platform
  revoke all on tables from public, anon, authenticated, authenticator;
alter default privileges in schema platform
  revoke all on functions from public, anon, authenticated, authenticator;
alter default privileges in schema platform
  grant execute on functions to service_role;

-- -----------------------------------------------------------------------------
-- 3. `private` permanece fora da API — mas seus GRANTS não mudam
-- -----------------------------------------------------------------------------
-- Aqui houve um erro na primeira versão desta migration, corrigido pelos
-- próprios testes, e vale registrar porque é uma armadilha real:
--
--   Escrevi `revoke all on schema private from ... authenticated`, achando que
--   "fora da API" e "sem permissão" fossem a mesma coisa. Não são, e 13 testes
--   do baseline quebraram na hora.
--
--   O banco V2 concede, de propósito, `usage on schema private to authenticated`
--   (migration 20260729001100). As POLÍTICAS DE RLS chamam
--   `private.current_user_company_id()` e afins, e essas chamadas rodam com o
--   papel do usuário. Tirar o USAGE não fecha nada: quebra o isolamento
--   multiempresa inteiro, porque a política deixa de conseguir avaliar a
--   condição — e o que era para ser um endurecimento vira uma falha.
--
-- O que de fato mantém `private` fora do alcance do navegador é a AUSÊNCIA dele
-- em `api.schemas` no config.toml. O PostgREST só endereça schema declarado; o
-- USAGE existe para as funções chamadas de dentro das políticas, não para
-- requisição HTTP.
--
-- Portanto: nada é revogado de `private`. Os grants do baseline continuam
-- valendo, e a garantia vem do config.toml.
grant usage on schema private to authenticated, service_role;
