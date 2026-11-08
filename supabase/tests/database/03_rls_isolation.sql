-- =============================================================================
-- 03_rls_isolation — isolamento entre empresas
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public, private, pg_temp;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Impersonação (idêntica em todos os arquivos de teste)
-- ---------------------------------------------------------------------------
-- A cláusula SET na assinatura faz o PostgreSQL restaurar o nível de GUC na
-- saída; o "reset role" explícito é defesa extra para o caminho de sucesso.
create function pg_temp.q_as(p_user uuid, p_sql text)
returns text
language plpgsql
set search_path = extensions, public, private, pg_temp
as $fn$
declare v_result text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute p_sql into v_result;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v_result;
exception when others then
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return 'ERROR:' || sqlstate;
end $fn$;

create function pg_temp.do_as(p_user uuid, p_sql text)
returns text
language plpgsql
set search_path = extensions, public, private, pg_temp
as $fn$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  execute p_sql;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return 'OK';
exception when others then
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return 'ERROR:' || sqlstate;
end $fn$;

create function pg_temp.raises(p_sql text) returns boolean language plpgsql as $fn$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end $fn$;

create function pg_temp.err(p_sql text) returns text language plpgsql as $fn$
begin
  execute p_sql;
  return 'NO_ERROR';
exception when others then
  return sqlstate;
end $fn$;

-- ---------------------------------------------------------------------------
-- 1. Empresa A não lê empresa B
-- ---------------------------------------------------------------------------
-- Cada empresa do seed tem uma contagem própria de veículos: 18/24/31/16.
select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
               'select count(*)::text from public.vehicles'),
  (select count(*)::text from public.vehicles
    where company_id = private.stable_uuid('company:auroraverde')),
  'admin da empresa A vê exatamente os veículos da empresa A'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:riosereno:admin'),
               'select count(*)::text from public.vehicles'),
  (select count(*)::text from public.vehicles
    where company_id = private.stable_uuid('company:riosereno')),
  'admin da empresa C vê exatamente os veículos da empresa C'
);

select isnt(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
               'select count(*)::text from public.vehicles'),
  (select count(*)::text from public.vehicles),
  'nenhum usuário vê a frota global'
);

-- Consulta direcionada a um recurso da outra empresa devolve zero linhas
select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    format('select count(*)::text from public.vehicles where id = %L',
           private.stable_uuid('vehicle:camponovo:1'))),
  '0', 'veículo da empresa D é invisível para a empresa A'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    format('select count(*)::text from public.trips where company_id = %L',
           private.stable_uuid('company:pedraalta'))),
  '0', 'filtro explícito por company_id de outra empresa devolve vazio'
);

-- Todas as tabelas de negócio isolam
select is(
  pg_temp.q_as(private.stable_uuid('user:pedraalta:admin'),
    'select count(distinct company_id)::text from public.trips'),
  '1', 'trips: apenas uma empresa visível'
);
select is(
  pg_temp.q_as(private.stable_uuid('user:pedraalta:admin'),
    'select count(distinct company_id)::text from public.fuelings'),
  '1', 'fuelings: apenas uma empresa visível'
);
select is(
  pg_temp.q_as(private.stable_uuid('user:pedraalta:admin'),
    'select count(distinct company_id)::text from public.maintenance_records'),
  '1', 'maintenance_records: apenas uma empresa visível'
);
select is(
  pg_temp.q_as(private.stable_uuid('user:pedraalta:admin'),
    'select count(distinct company_id)::text from public.vehicle_movements'),
  '1', 'vehicle_movements: apenas uma empresa visível'
);
select is(
  pg_temp.q_as(private.stable_uuid('user:pedraalta:admin'),
    'select count(distinct company_id)::text from public.vehicle_odometer_events'),
  '1', 'vehicle_odometer_events: apenas uma empresa visível'
);
select is(
  pg_temp.q_as(private.stable_uuid('user:pedraalta:admin'),
    'select count(distinct company_id)::text from public.plate_read_events'),
  '1', 'plate_read_events: apenas uma empresa visível'
);
select is(
  pg_temp.q_as(private.stable_uuid('user:pedraalta:admin'),
    'select count(distinct company_id)::text from public.locations'),
  '1', 'locations: apenas uma empresa visível'
);
select is(
  pg_temp.q_as(private.stable_uuid('user:pedraalta:admin'),
    'select count(distinct company_id)::text from public.cameras'),
  '1', 'cameras: apenas uma empresa visível'
);
select is(
  pg_temp.q_as(private.stable_uuid('user:pedraalta:admin'),
    'select count(distinct company_id)::text from public.drivers'),
  '1', 'drivers: apenas uma empresa visível'
);
select is(
  pg_temp.q_as(private.stable_uuid('user:pedraalta:admin'),
    'select count(*)::text from public.companies'),
  '1', 'companies: apenas a própria empresa'
);

-- Views também isolam (security_invoker)
select is(
  pg_temp.q_as(private.stable_uuid('user:pedraalta:admin'),
    'select count(distinct company_id)::text from public.v_vehicle_presence'),
  '1', 'v_vehicle_presence isola por empresa'
);
select is(
  pg_temp.q_as(private.stable_uuid('user:pedraalta:admin'),
    'select count(*)::text from public.v_fleet_status_summary'),
  '1', 'v_fleet_status_summary devolve apenas a linha da própria empresa'
);
select is(
  pg_temp.q_as(private.stable_uuid('user:pedraalta:admin'),
    'select count(distinct company_id)::text from public.v_vehicle_monthly_costs'),
  '1', 'v_vehicle_monthly_costs isola por empresa'
);
select is(
  pg_temp.q_as(private.stable_uuid('user:pedraalta:admin'),
    'select count(distinct company_id)::text from public.v_recent_movements'),
  '1', 'v_recent_movements isola por empresa'
);
select is(
  pg_temp.q_as(private.stable_uuid('user:pedraalta:admin'),
    'select count(distinct company_id)::text from public.v_maintenance_due'),
  '1', 'v_maintenance_due isola por empresa'
);
select is(
  pg_temp.q_as(private.stable_uuid('user:pedraalta:admin'),
    'select count(distinct company_id)::text from public.audit_events'),
  '1', 'audit_events isola por empresa'
);

-- Perfis: só o próprio e os da mesma empresa
select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    'select count(*)::text from public.profiles'),
  (select count(*)::text from public.company_memberships
    where company_id = private.stable_uuid('company:auroraverde')),
  'admin vê apenas os perfis da própria empresa'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:operador'),
    'select count(*)::text from public.profiles'),
  '1', 'operador (sem users.read) vê apenas o próprio perfil'
);

-- ---------------------------------------------------------------------------
-- 2. Empresa A não insere nem atualiza em B
-- ---------------------------------------------------------------------------
select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ insert into public.drivers (company_id, full_name)
               values (%L, 'Motorista Invasor') $q$,
           private.stable_uuid('company:camponovo'))),
  'ERROR:42501', 'INSERT de motorista em outra empresa é bloqueado pela RLS'
);

select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ insert into public.vehicles (company_id, plate, brand, model, fuel_type)
               values (%L, 'INV1A11', 'Marca', 'Modelo', 'flex') $q$,
           private.stable_uuid('company:camponovo'))),
  'ERROR:42501', 'INSERT de veículo em outra empresa é bloqueado'
);

select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ insert into public.locations (company_id, name)
               values (%L, 'Pátio Invasor') $q$,
           private.stable_uuid('company:pedraalta'))),
  'ERROR:42501', 'INSERT de local em outra empresa é bloqueado'
);

-- UPDATE em recurso de outra empresa não afeta nenhuma linha
select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ update public.vehicles set color = 'Invadido' where id = %L $q$,
           private.stable_uuid('vehicle:camponovo:1'))),
  'OK', 'UPDATE cruzado não gera erro (a policy simplesmente não casa a linha)'
);

select isnt(
  (select color from public.vehicles where id = private.stable_uuid('vehicle:camponovo:1')),
  'Invadido', 'nenhuma linha da outra empresa foi alterada'
);

select is(
  pg_temp.do_as(private.stable_uuid('user:camponovo:admin'),
    format($q$ update public.companies set trade_name = 'Invadida' where id = %L $q$,
           private.stable_uuid('company:auroraverde'))),
  'OK', 'UPDATE de outra empresa não gera erro...'
);

select is(
  (select trade_name from public.companies where id = private.stable_uuid('company:auroraverde')),
  'Aurora Verde', '... e não altera nada'
);

-- ---------------------------------------------------------------------------
-- 3. company_id não pode ser trocado
-- ---------------------------------------------------------------------------
select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ update public.vehicles set company_id = %L where id = %L $q$,
           private.stable_uuid('company:camponovo'),
           private.stable_uuid('vehicle:auroraverde:1'))),
  'ERROR:42501', 'trocar company_id de um veículo é bloqueado'
);

select is(
  (select company_id from public.vehicles where id = private.stable_uuid('vehicle:auroraverde:1')),
  private.stable_uuid('company:auroraverde'),
  'company_id do veículo permanece intacto'
);

select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ update public.drivers set company_id = %L where id = %L $q$,
           private.stable_uuid('company:pedraalta'),
           private.stable_uuid('driver:auroraverde:1'))),
  'ERROR:42501', 'trocar company_id de um motorista é bloqueado'
);

select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ update public.trips set company_id = %L
               where company_id = %L and status = 'planned' $q$,
           private.stable_uuid('company:pedraalta'),
           private.stable_uuid('company:auroraverde'))),
  'ERROR:42501', 'trocar company_id de uma viagem é bloqueado'
);

-- ---------------------------------------------------------------------------
-- 4. FKs compostas impedem relacionamento cruzado até como postgres
-- ---------------------------------------------------------------------------
select is(
  pg_temp.err(format($q$
    insert into public.trips (company_id, vehicle_id, status, origin_label, destination_label,
                              planned_departure_at)
    values (%L, %L, 'planned', 'Origem Teste', 'Destino Teste', now() + interval '1 day')
  $q$, private.stable_uuid('company:auroraverde'),
       private.stable_uuid('vehicle:camponovo:1'))),
  '23503',
  'viagem apontando veículo de outra empresa viola a FK composta (sem RLS envolvida)'
);

select is(
  pg_temp.err(format($q$
    insert into public.vehicle_odometer_events
      (company_id, vehicle_id, occurred_at, odometer_km, source_type, reason)
    values (%L, %L, now(), 999999, 'manual_adjustment', 'teste')
  $q$, private.stable_uuid('company:auroraverde'),
       private.stable_uuid('vehicle:camponovo:1'))),
  '23503',
  'evento de odômetro cruzando empresa viola a FK composta'
);

select is(
  pg_temp.err(format($q$
    insert into public.cameras (company_id, location_id, name, local_identifier)
    values (%L, %L, 'Cam Cruzada', 'cam-cruzada')
  $q$, private.stable_uuid('company:auroraverde'),
       private.stable_uuid('location:camponovo:1'))),
  '23503',
  'câmera apontando local de outra empresa viola a FK composta'
);

-- ---------------------------------------------------------------------------
-- 5. RPCs recusam recursos de outra empresa
-- ---------------------------------------------------------------------------
select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ select public.register_fueling(%L, 30, 6, 999999)::text $q$,
           private.stable_uuid('vehicle:camponovo:1'))),
  'ERROR:%', 'register_fueling recusa veículo de outra empresa'
);

select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ select public.archive_vehicle(%L)::text $q$,
           private.stable_uuid('vehicle:camponovo:1'))),
  'ERROR:%', 'archive_vehicle recusa veículo de outra empresa'
);

select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ select public.register_vehicle_movement(%L, %L)::text $q$,
           private.stable_uuid('vehicle:camponovo:1'),
           private.stable_uuid('location:camponovo:1'))),
  'ERROR:%', 'register_vehicle_movement recusa veículo de outra empresa'
);

-- Movimentação com veículo próprio e local de outra empresa
select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ select public.register_vehicle_movement(%L, %L)::text $q$,
           private.stable_uuid('vehicle:auroraverde:1'),
           private.stable_uuid('location:camponovo:1'))),
  'ERROR:%', 'register_vehicle_movement recusa local de outra empresa'
);

-- Dashboard de cada empresa é diferente
select isnt(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    $q$ select (public.dashboard_summary() -> 'fleet' ->> 'total') $q$),
  pg_temp.q_as(private.stable_uuid('user:riosereno:admin'),
    $q$ select (public.dashboard_summary() -> 'fleet' ->> 'total') $q$),
  'dashboard reflete a frota de cada empresa, não a global'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    $q$ select (public.dashboard_summary() ->> 'companyId') $q$),
  private.stable_uuid('company:auroraverde')::text,
  'dashboard_summary resolve a empresa no servidor'
);

select * from finish();
rollback;
