-- =============================================================================
-- PegaNaFrota — smoke pós-deploy
-- =============================================================================
-- Execute depois de `supabase db push` e antes do bootstrap/seed remoto.
-- O arquivo falha com exceção se encontrar um desvio estrutural ou de segurança.
-- =============================================================================

set client_min_messages to warning;

do $smoke$
declare
  v_count integer;
  v_nullable text;
  v_delete_action "char";
begin
  select count(*) into v_count from private.security_selftest();
  if v_count <> 0 then
    raise exception 'SMOKE_SECURITY_FAILED: security_selftest retornou % linha(s)', v_count;
  end if;

  select count(*) into v_count from private.data_integrity_selftest();
  if v_count <> 0 then
    raise exception 'SMOKE_INTEGRITY_FAILED: data_integrity_selftest retornou % linha(s)', v_count;
  end if;

  if not exists (
    select 1 from pg_namespace where nspname = 'platform'
  ) then
    raise exception 'SMOKE_PLATFORM_SCHEMA_MISSING';
  end if;

  if not exists (
    select 1
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'platform' and p.proname = 'replace_platform_admin'
  ) then
    raise exception 'SMOKE_PLATFORM_REPLACE_RPC_MISSING';
  end if;

  select is_nullable into v_nullable
  from information_schema.columns
  where table_schema = 'platform'
    and table_name = 'operations'
    and column_name = 'actor_user_id';

  if v_nullable is distinct from 'YES' then
    raise exception 'SMOKE_OPERATIONS_ACTOR_NOT_NULLABLE';
  end if;

  select con.confdeltype into v_delete_action
  from pg_constraint con
  where con.conname = 'operations_actor_user_id_fkey'
    and con.conrelid = 'platform.operations'::regclass;

  if v_delete_action is distinct from 'n'::"char" then
    raise exception 'SMOKE_OPERATIONS_ACTOR_FK_NOT_SET_NULL';
  end if;

  select con.confdeltype into v_delete_action
  from pg_constraint con
  where con.conname = 'admins_user_id_fkey'
    and con.conrelid = 'platform.admins'::regclass;

  if v_delete_action is distinct from 'c'::"char" then
    raise exception 'SMOKE_PLATFORM_ADMIN_FK_NOT_CASCADE';
  end if;

  select count(*) into v_count
  from pg_constraint con
  join lateral unnest(con.conkey) k(attnum) on true
  join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
  where con.conrelid = 'platform.audit_events'::regclass
    and con.contype = 'f'
    and a.attname = 'actor_user_id';

  if v_count <> 0 then
    raise exception 'SMOKE_PLATFORM_AUDIT_ACTOR_MUST_BE_HISTORICAL_NO_FK';
  end if;
end;
$smoke$;

select 'PegaNaFrota smoke OK' as result;
