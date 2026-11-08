-- =============================================================================
-- 16_product_completeness — contratos adicionados pela revisão funcional v8
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public, private, pg_temp;
select * from no_plan();

select has_function('public', 'update_driver', array['uuid','jsonb'],
  'update_driver existe para edição segura de motoristas');
select has_function('public', 'create_location',
  array['text','text','text','text','text','text','text','text','text'],
  'create_location existe');
select has_function('public', 'update_location', array['uuid','jsonb'],
  'update_location existe');
select has_function('public', 'set_location_active', array['uuid','boolean'],
  'set_location_active existe');
select has_function('public', 'archive_location', array['uuid','text'],
  'archive_location existe');
select has_function('public', 'unarchive_location', array['uuid'],
  'unarchive_location existe');
select has_function('public', 'yard_snapshot', array[]::text[],
  'yard_snapshot existe');

select ok(has_function_privilege('authenticated', 'public.update_driver(uuid,jsonb)', 'EXECUTE'),
  'authenticated pode executar update_driver; permissão fina é validada dentro da RPC');
select ok(has_function_privilege('authenticated', 'public.yard_snapshot()', 'EXECUTE'),
  'authenticated pode executar yard_snapshot; movements.read é validada dentro da RPC');
select ok(has_function_privilege('authenticated', 'public.company_members()', 'EXECUTE'),
  'company_members continua disponível ao cliente autenticado');
select ok(not has_function_privilege('service_role', 'public.company_members()', 'EXECUTE'),
  'company_members permanece isolada do service_role; administração usa RPC dedicada');

select ok(
  exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
      unnest(coalesce(p.proconfig, array[]::text[])) cfg
    where n.nspname='public' and p.proname='yard_snapshot' and cfg='search_path=""'
  ),
  'yard_snapshot fixa search_path vazio'
);

select * from finish();
rollback;
