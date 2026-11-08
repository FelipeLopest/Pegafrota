-- =============================================================================
-- 00_structure — schemas, tabelas, tipos, índices, RLS e grants
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public, private, pg_temp;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Schemas
-- ---------------------------------------------------------------------------
select has_schema('public',  'schema public existe');
select has_schema('private', 'schema private existe');
select has_schema('audit',   'schema audit existe');

-- ---------------------------------------------------------------------------
-- Tabelas obrigatórias
-- ---------------------------------------------------------------------------
select has_table('public', t, 'tabela public.' || t || ' existe')
from unnest(array[
  'companies', 'profiles', 'company_memberships', 'drivers', 'vehicles',
  'vehicle_odometer_events', 'trips', 'fuelings', 'maintenance_records',
  'locations', 'cameras', 'plate_read_events', 'vehicle_movements'
]) t;

select has_table('audit', 'events', 'tabela audit.events existe');

-- ---------------------------------------------------------------------------
-- company_id em toda entidade de negócio (ARCHITECTURE.md §7)
-- ---------------------------------------------------------------------------
select has_column('public', t, 'company_id', t || ' possui company_id')
from unnest(array[
  'company_memberships', 'drivers', 'vehicles', 'vehicle_odometer_events',
  'trips', 'fuelings', 'maintenance_records', 'locations', 'cameras',
  'plate_read_events', 'vehicle_movements'
]) t;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
select has_type('public', t, 'enum public.' || t || ' existe')
from unnest(array[
  'company_status', 'membership_role', 'vehicle_status', 'fuel_type',
  'odometer_source_type', 'trip_status', 'maintenance_type', 'maintenance_status',
  'camera_direction', 'plate_read_status', 'movement_type', 'movement_source'
]) t;

select set_eq(
  $$ select unnest(enum_range(null::public.membership_role))::text $$,
  array['company_admin', 'fleet_manager', 'operator', 'viewer'],
  'papéis exatamente conforme SECURITY_MODEL.md §6'
);

select set_eq(
  $$ select unnest(enum_range(null::public.plate_read_status))::text $$,
  array['captured', 'low_confidence', 'unknown_plate', 'duplicate', 'confirmed', 'error'],
  'status de leitura de placa conforme DATABASE_BLUEPRINT.md §3.12'
);

-- ---------------------------------------------------------------------------
-- Dinheiro nunca em ponto flutuante (ARCHITECTURE.md §11)
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select c.table_name || '.' || c.column_name
     from information_schema.columns c
     where c.table_schema = 'public'
       and c.data_type in ('real', 'double precision') $$,
  'nenhuma coluna em public usa ponto flutuante'
);

-- ---------------------------------------------------------------------------
-- RLS habilitada em TODA tabela exposta
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select c.relname from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity $$,
  'nenhuma tabela de public sem RLS'
);

select ok(
  (select relrowsecurity from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'audit' and c.relname = 'events'),
  'audit.events com RLS habilitada'
);

-- Policies separadas por operação
select ok(
  (select count(*) filter (where polcmd = 'r') >= 1
      and count(*) filter (where polcmd = 'a') >= 1
      and count(*) filter (where polcmd = 'w') >= 1
   from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname = 'vehicles'),
  'vehicles possui policies separadas de SELECT, INSERT e UPDATE'
);

select is_empty(
  $$ select c.relname from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
       and not exists (select 1 from pg_policy p where p.polrelid = c.oid) $$,
  'nenhuma tabela com RLS e sem policy'
);

-- ---------------------------------------------------------------------------
-- Views expostas usam security_invoker
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select c.relname from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
       and not coalesce((select option_value::boolean from pg_options_to_table(c.reloptions)
                         where option_name = 'security_invoker'), false) $$,
  'toda view de public usa security_invoker'
);

-- ---------------------------------------------------------------------------
-- Funções SECURITY DEFINER com search_path fixo
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select n.nspname || '.' || p.proname
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private', 'audit') and p.prosecdef
       and not exists (select 1 from unnest(coalesce(p.proconfig, array[]::text[])) cfg
                       where cfg like 'search_path=%') $$,
  'toda função SECURITY DEFINER tem search_path fixo'
);

-- ---------------------------------------------------------------------------
-- Grants: escrita direta proibida nas tabelas transacionais
-- ---------------------------------------------------------------------------
select is_empty(
  format($$ select privilege_type from information_schema.role_table_grants
            where grantee = 'authenticated' and table_schema = 'public'
              and table_name = %L and privilege_type in ('INSERT','UPDATE','DELETE') $$, t),
  'authenticated não escreve direto em ' || t
) from unnest(array['vehicle_odometer_events', 'vehicle_movements', 'plate_read_events']) t;

select is_empty(
  $$ select privilege_type from information_schema.role_table_grants
     where grantee = 'authenticated' and table_schema = 'public'
       and table_name = 'fuelings' and privilege_type = 'INSERT' $$,
  'authenticated não faz INSERT direto em fuelings (só por RPC)'
);

select is_empty(
  $$ select privilege_type from information_schema.role_table_grants
     where grantee = 'authenticated' and table_schema = 'public'
       and table_name in ('vehicles','trips','drivers','maintenance_records','companies','profiles')
       and privilege_type = 'DELETE' $$,
  'nenhum DELETE concedido em tabelas históricas (ADR-005)'
);

-- anon não alcança nada
select is_empty(
  $$ select table_schema || '.' || table_name from information_schema.role_table_grants
     where grantee = 'anon' and table_schema in ('public','private','audit') $$,
  'anon não possui nenhum privilégio de tabela'
);

-- catálogo de permissões inacessível ao cliente
select is_empty(
  $$ select table_name from information_schema.role_table_grants
     where grantee = 'authenticated' and table_schema = 'private' $$,
  'nenhuma tabela de private concedida a authenticated'
);

-- ---------------------------------------------------------------------------
-- Índices exigidos por DATABASE_BLUEPRINT.md §6
-- ---------------------------------------------------------------------------
select has_index('public', 'vehicles', 'vehicles_plate_unique', 'placa é única globalmente');
select has_index('public', 'vehicles', 'vehicles_company_status_idx', 'índice (company_id, status)');
select has_index('public', 'trips', 'trips_company_departure_idx', 'índice de viagens por saída');
select has_index('public', 'fuelings', 'fuelings_company_time_idx', 'índice de abastecimentos por data');
select has_index('public', 'maintenance_records', 'maintenance_company_status_scheduled_idx',
                 'índice de manutenções por status e agendamento');
select has_index('public', 'vehicle_movements', 'movements_company_vehicle_time_idx',
                 'índice de movimentações por veículo e data');
select has_index('public', 'plate_read_events', 'plate_read_company_camera_time_idx',
                 'índice de leituras por câmera e data');
select has_index('public', 'vehicle_odometer_events', 'odometer_events_vehicle_time_idx',
                 'índice do ledger por veículo e data');
select has_index('public', 'company_memberships', 'company_memberships_user_idx', 'índice de membership por usuário');
select has_index('public', 'vehicle_movements', 'movements_vehicle_sequence_idx',
                 'índice único que sustenta a alternância');
select has_index('public', 'vehicle_movements', 'movements_plate_read_unique_idx',
                 'uma leitura OCR gera no máximo uma movimentação');

-- ---------------------------------------------------------------------------
-- FKs compostas garantem coerência de tenant
-- ---------------------------------------------------------------------------
select ok(
  (select count(*) from pg_constraint
   where conname in (
     'trips_vehicle_same_company_fkey', 'fuelings_vehicle_same_company_fkey',
     'maintenance_vehicle_same_company_fkey', 'movements_vehicle_same_company_fkey',
     'movements_location_same_company_fkey', 'plate_read_camera_same_company_fkey',
     'odometer_events_vehicle_same_company_fkey', 'cameras_location_same_company_fkey'
   )) = 8,
  'foreign keys compostas (id, company_id) presentes em todos os relacionamentos'
);

-- ---------------------------------------------------------------------------
-- RPCs obrigatórias (DATABASE_BLUEPRINT.md §4)
-- ---------------------------------------------------------------------------
select has_function('private', f, 'helper private.' || f || ' existe')
from unnest(array[
  'current_user_company_id', 'current_user_role', 'has_permission', 'assert_company_access'
]) f;

select has_function('public', f, 'RPC public.' || f || ' existe')
from unnest(array[
  'register_odometer_reading', 'complete_trip', 'register_fueling',
  'complete_maintenance', 'register_vehicle_movement', 'register_plate_read',
  'archive_vehicle', 'dashboard_summary', 'my_context'
]) f;

-- ---------------------------------------------------------------------------
-- Autoteste de segurança embutido
-- ---------------------------------------------------------------------------
select is_empty(
  $$ select severity || ': ' || finding || ' (' || object_name || ')'
     from private.security_selftest() $$,
  'private.security_selftest() não encontra desvios'
);

select * from finish();
rollback;
