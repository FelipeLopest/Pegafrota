-- =============================================================================
-- 09_audit2_fixes — achados da segunda auditoria
-- =============================================================================
-- Cobre DB-AUD2-004 (semântica da correção de odômetro) e DB-AUD2-006 (grants).
-- DB-AUD2-001, 002, 003 e 005 vivem na Edge Function e são provados em
-- supabase/tests/integration/admin-users.integration.test.mjs, contra o banco.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public, private, pg_temp;

select * from no_plan();

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

create function pg_temp.err(p_sql text) returns text language plpgsql as $fn$
begin
  execute p_sql;
  return 'NO_ERROR';
exception when others then
  return sqlstate;
end $fn$;

create function pg_temp.u(p text) returns uuid language sql as
  $$ select private.stable_uuid('user:' || p) $$;
create function pg_temp.co(p text) returns uuid language sql as
  $$ select private.stable_uuid('company:' || p) $$;

-- ===========================================================================
-- Cenário do achado DB-AUD2-004, montado exatamente como descrito
-- ===========================================================================
--   dia -3 -> 100 km
--   dia -1 -> 200 km
--   correção retrodatada no dia -2 com 250 km
insert into public.vehicles (id, company_id, plate, brand, model, fuel_type, current_odometer_km)
values ('aaaa2000-0000-4000-8000-000000000001', pg_temp.co('auroraverde'),
        'AUD2A11', 'Marca Teste', 'Modelo Teste', 'diesel_s10', 0);

insert into public.vehicle_odometer_events
  (id, company_id, vehicle_id, occurred_at, odometer_km, source_type, reason)
values
  ('bbbb2000-0000-4000-8000-000000000001', pg_temp.co('auroraverde'),
   'aaaa2000-0000-4000-8000-000000000001', now() - interval '3 days', 100,
   'manual_adjustment', 'leitura inicial'),
  ('bbbb2000-0000-4000-8000-000000000002', pg_temp.co('auroraverde'),
   'aaaa2000-0000-4000-8000-000000000001', now() - interval '1 day', 200,
   'manual_adjustment', 'segunda leitura');

update public.vehicles set current_odometer_km = 200
where id = 'aaaa2000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- A retrodatação é recusada, mesmo sendo uma correção legítima
-- ---------------------------------------------------------------------------
select is(
  pg_temp.err($q$
    insert into public.vehicle_odometer_events
      (company_id, vehicle_id, occurred_at, odometer_km, source_type, reason, correction_of_id)
    values (private.stable_uuid('company:auroraverde'), 'aaaa2000-0000-4000-8000-000000000001',
            now() - interval '2 days', 250, 'manual_adjustment', 'correcao historica',
            'bbbb2000-0000-4000-8000-000000000001')
  $q$),
  '23514',
  'DB-AUD2-004 correção retrodatada é recusada até para o dono da tabela'
);

-- Pela RPC o pedido não é recusado: ele é NORMALIZADO. A correção é aceita,
-- mas o servidor a carimba no instante atual e avisa isso na resposta. Recusar
-- seria pior contrato — o operador quis corrigir, e corrigir é legítimo; o que
-- não é legítimo é reescrever o passado.
select is(
  pg_temp.q_as(pg_temp.u('auroraverde:admin'),
    $q$ select (public.register_odometer_reading(
          'aaaa2000-0000-4000-8000-000000000001', 250, 'odometro trocado na oficina',
          now() - interval '2 days', 'bbbb2000-0000-4000-8000-000000000001')
          ->> 'occurredAtStampedByServer') $q$),
  'true',
  'DB-AUD2-004 a RPC aceita a correção mas avisa que carimbou a data'
);

select ok(
  (select occurred_at from public.vehicle_odometer_events
    where correction_of_id = 'bbbb2000-0000-4000-8000-000000000001')
  > now() - interval '1 minute',
  'DB-AUD2-004 ... e a data pedida (2 dias atrás) foi de fato ignorada'
);

-- ---------------------------------------------------------------------------
-- O evento de correção registra o valor que estava errado
-- ---------------------------------------------------------------------------

select is(
  (select corrected_from_km::text from public.vehicle_odometer_events
    where correction_of_id = 'bbbb2000-0000-4000-8000-000000000001'),
  '100.0',
  'DB-AUD2-004 corrected_from_km é carimbado pelo servidor a partir do evento apontado'
);

select ok(
  (select occurred_at from public.vehicle_odometer_events
    where correction_of_id = 'bbbb2000-0000-4000-8000-000000000001')
  >= (select max(occurred_at) from public.vehicle_odometer_events
       where vehicle_id = 'aaaa2000-0000-4000-8000-000000000001'
         and correction_of_id is null),
  'DB-AUD2-004 a correção fica no fim da linha do tempo, não no meio'
);

-- Uma segunda correção, apontando o outro evento histórico.
select is(
  pg_temp.q_as(pg_temp.u('auroraverde:admin'),
    $q$ select (public.register_odometer_reading(
          'aaaa2000-0000-4000-8000-000000000001', 260, 'segunda correcao',
          null, 'bbbb2000-0000-4000-8000-000000000002') ->> 'correctedFromKm') $q$),
  '200.0',
  'DB-AUD2-004 a segunda correção registra o valor do evento que ela corrige'
);

-- ---------------------------------------------------------------------------
-- Coerência da correção
-- ---------------------------------------------------------------------------
insert into public.vehicles (id, company_id, plate, brand, model, fuel_type, current_odometer_km)
values ('aaaa2000-0000-4000-8000-000000000002', pg_temp.co('auroraverde'),
        'AUD2B22', 'Marca Teste', 'Modelo Teste', 'diesel_s10', 0);

select is(
  pg_temp.q_as(pg_temp.u('auroraverde:admin'),
    $q$ select public.register_odometer_reading(
          'aaaa2000-0000-4000-8000-000000000002', 500, 'correcao cruzada',
          null, 'bbbb2000-0000-4000-8000-000000000001')::text $q$),
  'ERROR:23514',
  'DB-AUD2-004 correção não pode apontar evento de outro veículo'
);

select is(
  pg_temp.q_as(pg_temp.u('auroraverde:admin'),
    $q$ select public.register_odometer_reading(
          'aaaa2000-0000-4000-8000-000000000001', 300, 'x',
          null, 'cccc2000-0000-4000-8000-00000000dead')::text $q$),
  'ERROR:P0002',
  'DB-AUD2-004 correção não pode apontar evento inexistente'
);

select is(
  pg_temp.err($q$
    insert into public.vehicle_odometer_events
      (company_id, vehicle_id, occurred_at, odometer_km, source_type, correction_of_id)
    values (private.stable_uuid('company:auroraverde'), 'aaaa2000-0000-4000-8000-000000000001',
            now(), 400, 'manual_adjustment', 'bbbb2000-0000-4000-8000-000000000001')
  $q$),
  '22004',
  'DB-AUD2-004 correção sem justificativa é recusada'
);

-- Correção continua sem poder reduzir a quilometragem: o ledger é monotônico.
select is(
  pg_temp.q_as(pg_temp.u('auroraverde:admin'),
    $q$ select public.register_odometer_reading(
          'aaaa2000-0000-4000-8000-000000000001', 50, 'tentando reduzir',
          null, 'bbbb2000-0000-4000-8000-000000000001')::text $q$),
  'ERROR:23514',
  'DB-AUD2-004 correção para baixo continua impossível (ledger monotônico)'
);

-- ---------------------------------------------------------------------------
-- A prova que a auditoria pediu: autoteste continua vazio
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from private.data_integrity_selftest()), 0::bigint,
  'DB-AUD2-004 nenhuma correção autorizada deixa a base em estado inválido'
);

-- Invariante independente de ordem: nenhum evento tem km menor que o maior km
-- entre os eventos ESTRITAMENTE anteriores do mesmo veículo.
select is(
  (select count(*) from (
     select e.id, e.odometer_km,
            max(e.odometer_km) over (
              partition by e.vehicle_id order by e.occurred_at
              range between unbounded preceding and current row exclude group
            ) as max_before
     from public.vehicle_odometer_events e
   ) t
   where t.max_before is not null and t.odometer_km < t.max_before),
  0::bigint,
  'DB-AUD2-004 o ledger inteiro permanece monotônico em data e quilometragem'
);

select is(
  (select current_odometer_km::text from public.vehicles
    where id = 'aaaa2000-0000-4000-8000-000000000001'),
  '260.0',
  'DB-AUD2-004 current_odometer_km acompanha a última correção'
);

-- ===========================================================================
-- DB-AUD2-006 — grants coerentes com o contrato
-- ===========================================================================
select is(
  has_function_privilege('service_role', 'public.company_members()', 'execute'),
  false,
  'DB-AUD2-006 company_members() não é mais concedida a service_role'
);

select is(
  has_function_privilege('authenticated', 'public.company_members()', 'execute'),
  true,
  'DB-AUD2-006 company_members() continua disponível ao usuário autenticado'
);

select is(
  has_function_privilege('service_role', 'public.admin_list_company_members(uuid)', 'execute'),
  true,
  'DB-AUD2-006 a contrapartida administrativa existe para service_role'
);

select is(
  has_function_privilege('authenticated', 'public.admin_list_company_members(uuid)', 'execute'),
  false,
  'DB-AUD2-006 ... e não vaza para o usuário autenticado'
);

-- As RPCs administrativas novas são exclusivas do canal privilegiado.
select is(
  has_function_privilege('authenticated',
    'public.admin_provision_member(uuid,uuid,uuid,text,text,text,public.membership_role,text,text)',
    'execute'),
  false,
  'DB-AUD2-003 admin_provision_member não é chamável pelo cliente'
);

select is(
  has_function_privilege('service_role',
    'public.admin_provision_member(uuid,uuid,uuid,text,text,text,public.membership_role,text,text)',
    'execute'),
  true,
  'DB-AUD2-003 admin_provision_member é exclusiva de service_role'
);

select is(
  has_function_privilege('authenticated',
    'public.admin_set_membership_active(uuid,uuid,uuid,boolean,text,text)', 'execute'),
  false,
  'DB-AUD2-003 admin_set_membership_active não é chamável pelo cliente'
);

select is(
  has_function_privilege('authenticated',
    'public.admin_change_member_role(uuid,uuid,uuid,public.membership_role,text,text)', 'execute'),
  false,
  'DB-AUD2-003 admin_change_member_role não é chamável pelo cliente'
);

-- ===========================================================================
-- DB-AUD2-002 — a RPC transacional recusa profile globalmente inativo
-- ===========================================================================
insert into auth.users (id, email) values
  ('dddd2000-0000-4000-8000-000000000001', 'suspenso2@teste.example.com');
insert into public.profiles (id, full_name, active) values
  ('dddd2000-0000-4000-8000-000000000001', 'Suspenso Global', false);

select is(
  pg_temp.err(format($q$
    select public.admin_provision_member(
      %L, %L, 'dddd2000-0000-4000-8000-000000000001',
      'suspenso2@teste.example.com', 'Nome Novo', null, 'operator', null, null)
  $q$, pg_temp.co('auroraverde'), pg_temp.u('auroraverde:admin'))),
  '42501',
  'DB-AUD2-002 admin_provision_member recusa profile globalmente inativo'
);

select is(
  (select active from public.profiles where id = 'dddd2000-0000-4000-8000-000000000001'),
  false,
  'DB-AUD2-002 o profile permanece inativo'
);

select is(
  (select full_name from public.profiles where id = 'dddd2000-0000-4000-8000-000000000001'),
  'Suspenso Global',
  'DB-AUD2-002 o nome global não é sobrescrito pela empresa'
);

select is(
  (select count(*) from public.company_memberships
    where user_id = 'dddd2000-0000-4000-8000-000000000001'),
  0::bigint,
  'DB-AUD2-002 nenhuma membership é criada quando o profile está suspenso'
);

-- Usuário existente e ATIVO: provisiona sem tocar nos dados globais.
insert into auth.users (id, email) values
  ('dddd2000-0000-4000-8000-000000000002', 'ativo2@teste.example.com');
insert into public.profiles (id, full_name, phone, active) values
  ('dddd2000-0000-4000-8000-000000000002', 'Nome Original', '11933333333', true);

select is(
  pg_temp.err(format($q$
    select public.admin_provision_member(
      %L, %L, 'dddd2000-0000-4000-8000-000000000002',
      'ativo2@teste.example.com', 'Nome Reescrito', '11900000000', 'operator', null, null)
  $q$, pg_temp.co('auroraverde'), pg_temp.u('auroraverde:admin'))),
  'NO_ERROR',
  'DB-AUD2-002 usuário existente e ativo é provisionado normalmente'
);

select is(
  (select full_name || '|' || phone from public.profiles
    where id = 'dddd2000-0000-4000-8000-000000000002'),
  'Nome Original|11933333333',
  'DB-AUD2-002 nome e telefone globais de usuário existente NÃO são sobrescritos'
);

select is(
  (select role::text from public.company_memberships
    where user_id = 'dddd2000-0000-4000-8000-000000000002'
      and company_id = pg_temp.co('auroraverde')),
  'operator',
  'DB-AUD2-002 a membership — que é o que a empresa administra — foi criada'
);

-- ===========================================================================
-- DB-AUD2-003 — a RPC devolve o estado anterior, base do rollback exato
-- ===========================================================================
select is(
  (select (public.admin_set_membership_active(
     pg_temp.co('auroraverde'), pg_temp.u('auroraverde:admin'),
     'dddd2000-0000-4000-8000-000000000002', false, null, null) ->> 'previousActive')),
  'true',
  'DB-AUD2-003 admin_set_membership_active informa o estado anterior lido sob lock'
);

select is(
  (select (public.admin_set_membership_active(
     pg_temp.co('auroraverde'), pg_temp.u('auroraverde:admin'),
     'dddd2000-0000-4000-8000-000000000002', false, null, null) ->> 'changed')),
  'false',
  'DB-AUD2-003 desativar quem já está inativo é idempotente e sinaliza changed=false'
);

select is(
  (select (public.admin_change_member_role(
     pg_temp.co('auroraverde'), pg_temp.u('auroraverde:admin'),
     'dddd2000-0000-4000-8000-000000000002', 'viewer', null, null) ->> 'previousRole')),
  'operator',
  'DB-AUD2-003 admin_change_member_role informa o papel anterior'
);

select is(
  (select count(*) from private.security_selftest()), 0::bigint,
  'autoteste de segurança permanece vazio'
);

select * from finish();
rollback;
