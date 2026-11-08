-- =============================================================================
-- 04_odometer_ledger — ledger imutável e sem regressão (ADR-006)
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
-- 1. Ledger sem regressão
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.vehicle_odometer_events
   where previous_km is not null and odometer_km < previous_km),
  0::bigint, 'nenhum evento do seed regride em relação ao anterior'
);

select is(
  (select count(*) from public.vehicles v
   where v.current_odometer_km <> coalesce(
     (select max(e.odometer_km) from public.vehicle_odometer_events e where e.vehicle_id = v.id),
     v.current_odometer_km)),
  0::bigint, 'cache current_odometer_km sempre igual ao topo do ledger'
);

-- INSERT direto com valor menor é recusado pelo trigger, até como postgres
select is(
  pg_temp.err(format($q$
    insert into public.vehicle_odometer_events
      (company_id, vehicle_id, occurred_at, odometer_km, source_type, reason)
    values (%L, %L, now(), 1, 'manual_adjustment', 'tentativa de regressão')
  $q$, private.stable_uuid('company:auroraverde'),
       private.stable_uuid('vehicle:auroraverde:1'))),
  '23514', 'inserção com quilometragem menor que a máxima é recusada'
);

-- Valor igual ao atual é aceito (não é regressão)
select lives_ok(format($q$
  insert into public.vehicle_odometer_events
    (company_id, vehicle_id, occurred_at, odometer_km, source_type, reason)
  values (%L, %L, now(), (select current_odometer_km from public.vehicles where id = %L),
          'manual_adjustment', 'conferência sem alteração')
$q$, private.stable_uuid('company:auroraverde'),
     private.stable_uuid('vehicle:auroraverde:1'),
     private.stable_uuid('vehicle:auroraverde:1')),
  'quilometragem igual à atual é aceita');

-- ---------------------------------------------------------------------------
-- 2. Ledger imutável (ADR-006)
-- ---------------------------------------------------------------------------
select is(
  pg_temp.err($q$
    update public.vehicle_odometer_events set odometer_km = 1 where id = (
      select id from public.vehicle_odometer_events limit 1)
  $q$),
  '23514', 'UPDATE no ledger é bloqueado mesmo para o dono da tabela'
);

select is(
  pg_temp.err($q$
    delete from public.vehicle_odometer_events where id = (
      select id from public.vehicle_odometer_events limit 1)
  $q$),
  '23514', 'DELETE no ledger é bloqueado mesmo para o dono da tabela'
);

select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:admin'),
    $q$ delete from public.vehicle_odometer_events
        where id = (select id from public.vehicle_odometer_events limit 1) $q$),
  'ERROR:42501', 'authenticated não tem nem o privilégio de DELETE no ledger'
);

select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ insert into public.vehicle_odometer_events
               (company_id, vehicle_id, occurred_at, odometer_km, source_type, reason)
               values (%L, %L, now(), 9999999, 'manual_adjustment', 'bypass') $q$,
           private.stable_uuid('company:auroraverde'),
           private.stable_uuid('vehicle:auroraverde:1'))),
  'ERROR:42501', 'authenticated não faz INSERT direto no ledger'
);

-- ---------------------------------------------------------------------------
-- 3. current_odometer_km não muda por CRUD comum
-- ---------------------------------------------------------------------------
select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ update public.vehicles set current_odometer_km = 999999 where id = %L $q$,
           private.stable_uuid('vehicle:auroraverde:1'))),
  'ERROR:42501', 'escrita direta em current_odometer_km é bloqueada'
);

select isnt(
  (select current_odometer_km::numeric from public.vehicles
    where id = private.stable_uuid('vehicle:auroraverde:1')),
  999999::numeric, 'quilometragem do veículo não foi alterada'
);

-- Outros campos continuam editáveis
select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ update public.vehicles set color = 'Verde' where id = %L $q$,
           private.stable_uuid('vehicle:auroraverde:1'))),
  'OK', 'campos não críticos do veículo continuam editáveis'
);

select is(
  (select color from public.vehicles where id = private.stable_uuid('vehicle:auroraverde:1')),
  'Verde', 'cor foi atualizada normalmente'
);

-- ---------------------------------------------------------------------------
-- 4. Um evento por fonte (idempotência das RPCs)
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from (
     select source_type, source_id from public.vehicle_odometer_events
     where source_id is not null
     group by 1, 2 having count(*) > 1) d),
  0::bigint, 'nenhuma fonte com dois eventos de odômetro'
);

select is(
  pg_temp.err(format($q$
    insert into public.vehicle_odometer_events
      (company_id, vehicle_id, occurred_at, odometer_km, source_type, source_id)
    values (%L, %L, now(), 9999998, 'trip_completion', %L)
  $q$, private.stable_uuid('company:auroraverde'),
       private.stable_uuid('vehicle:auroraverde:1'),
       (select source_id from public.vehicle_odometer_events
         where source_type = 'trip_completion'
           and vehicle_id = private.stable_uuid('vehicle:auroraverde:1') limit 1))),
  '23505', 'segundo evento para a mesma viagem viola o índice único por fonte'
);

-- ---------------------------------------------------------------------------
-- 5. Ajuste manual autorizado
-- ---------------------------------------------------------------------------
select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ select public.register_odometer_reading(%L,
      (select current_odometer_km + 50 from public.vehicles where id = %L),
      'conferência física')::text $q$,
      private.stable_uuid('vehicle:auroraverde:2'),
      private.stable_uuid('vehicle:auroraverde:2'))),
  '{%', 'admin registra ajuste manual de odômetro'
);

select is(
  (select current_odometer_km::numeric from public.vehicles
    where id = private.stable_uuid('vehicle:auroraverde:2')),
  (select max(odometer_km)::numeric from public.vehicle_odometer_events
    where vehicle_id = private.stable_uuid('vehicle:auroraverde:2')),
  'cache foi atualizado pelo ajuste manual'
);

select is(
  (select source_type::text from public.vehicle_odometer_events
    where vehicle_id = private.stable_uuid('vehicle:auroraverde:2')
    order by created_at desc, odometer_km desc limit 1),
  'manual_adjustment', 'evento gravado com origem manual_adjustment'
);

-- Justificativa é obrigatória
select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ select public.register_odometer_reading(%L, 9999990, '   ')::text $q$,
           private.stable_uuid('vehicle:auroraverde:3'))),
  'ERROR:%', 'ajuste manual sem justificativa é recusado'
);

-- Ajuste manual não pode regredir
select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ select public.register_odometer_reading(%L, 1, 'tentativa de regressão')::text $q$,
           private.stable_uuid('vehicle:auroraverde:3'))),
  'ERROR:%', 'nem o admin consegue regredir a quilometragem'
);

-- Veículo arquivado não recebe evento
select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ select public.register_odometer_reading(%L,
             (select current_odometer_km + 10 from public.vehicles where id = %L),
             'teste em arquivado')::text $q$,
           private.stable_uuid('vehicle:auroraverde:14'),
           private.stable_uuid('vehicle:auroraverde:14'))),
  'ERROR:%', 'veículo arquivado não aceita novo evento de odômetro'
);

-- ---------------------------------------------------------------------------
-- 6. Histórico consultável e paginado
-- ---------------------------------------------------------------------------
select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ select (public.vehicle_odometer_history(%L, 1, 10) ->> 'pageSize') $q$,
           private.stable_uuid('vehicle:auroraverde:1'))),
  '10', 'histórico respeita o pageSize'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ select jsonb_array_length(public.vehicle_odometer_history(%L, 1, 5) -> 'items')::text $q$,
           private.stable_uuid('vehicle:auroraverde:1'))),
  '5', 'histórico devolve exatamente 5 itens na primeira página'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ select jsonb_array_length(public.vehicle_odometer_history(%L, 1, 5) -> 'items')::text $q$,
           private.stable_uuid('vehicle:camponovo:1'))),
  '0', 'histórico de veículo de outra empresa vem vazio'
);

-- Toda origem prevista aparece no ledger do seed
select bag_has(
  $q$ select distinct source_type::text from public.vehicle_odometer_events $q$,
  $q$ values ('vehicle_registration'),('trip_completion'),('fueling'),
             ('maintenance_completion'),('manual_adjustment') $q$,
  'ledger do seed cobre todas as origens de quilometragem'
);

select * from finish();
rollback;
