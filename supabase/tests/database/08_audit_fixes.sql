-- =============================================================================
-- 08_audit_fixes — um teste por achado da auditoria de 30/07/2026
-- =============================================================================
-- Cada bloco cita o ID do achado que ele cobre. O objetivo é que uma nova
-- auditoria consiga ir direto de DB-AUD-nnn para a prova correspondente.
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public, private, pg_temp;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Impersonação (idêntica aos demais arquivos)
-- ---------------------------------------------------------------------------
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

create function pg_temp.err(p_sql text) returns text language plpgsql as $fn$
begin
  execute p_sql;
  return 'NO_ERROR';
exception when others then
  return sqlstate;
end $fn$;

-- ---------------------------------------------------------------------------
-- Atalhos para os IDs determinísticos do seed
-- ---------------------------------------------------------------------------
create function pg_temp.u(p text) returns uuid language sql as
  $$ select private.stable_uuid('user:' || p) $$;
create function pg_temp.co(p text) returns uuid language sql as
  $$ select private.stable_uuid('company:' || p) $$;
create function pg_temp.v(p text) returns uuid language sql as
  $$ select private.stable_uuid('vehicle:' || p) $$;

-- ===========================================================================
-- DB-AUD-002 — proteção do último administrador
-- ===========================================================================
select is(
  private.count_effective_admins(pg_temp.co('auroraverde'), null), 1,
  'DB-AUD-002 Aurora Verde tem exatamente um administrador efetivo (cenário do achado)'
);

-- O caminho explorado pelo achado: UPDATE direto em profiles.active.
select is(
  pg_temp.do_as(pg_temp.u('auroraverde:admin'),
    format($q$ update public.profiles set active = false where id = %L $q$,
           pg_temp.u('auroraverde:admin'))),
  'ERROR:42501',
  'DB-AUD-002 administrador não desativa profile por UPDATE direto (grant de coluna)'
);

select is(
  pg_temp.do_as(pg_temp.u('auroraverde:admin'),
    format($q$ update public.profiles set active = false where id = %L $q$,
           pg_temp.u('auroraverde:gestor'))),
  'ERROR:42501',
  'DB-AUD-002 administrador não desativa profile de terceiro por UPDATE direto'
);

-- O canal privilegiado existe, mas continua submetido ao piso de administradores.
select is(
  pg_temp.err(format(
    $q$ select public.admin_set_profile_active(%L, false, %L) $q$,
    pg_temp.u('auroraverde:admin'), pg_temp.co('auroraverde'))),
  '23514',
  'DB-AUD-002 nem o canal administrativo desativa o profile do último admin'
);

select is(
  pg_temp.do_as(pg_temp.u('auroraverde:admin'),
    format($q$ update public.company_memberships set active = false where user_id = %L and company_id = %L $q$,
           pg_temp.u('auroraverde:admin'), pg_temp.co('auroraverde'))),
  'ERROR:23514',
  'DB-AUD-002 último administrador não desativa a própria membership'
);

-- Com dois administradores, desativar um é legítimo.
select is(
  private.count_effective_admins(pg_temp.co('camponovo'), null), 2,
  'DB-AUD-002 Campo Novo tem dois administradores efetivos'
);

select is(
  pg_temp.do_as(pg_temp.u('camponovo:admin'),
    format($q$ update public.company_memberships set active = false where user_id = %L and company_id = %L $q$,
           pg_temp.u('camponovo:admin2'), pg_temp.co('camponovo'))),
  'OK',
  'DB-AUD-002 com dois administradores, desativar um é permitido'
);

select is(
  private.count_effective_admins(pg_temp.co('camponovo'), null), 1,
  'DB-AUD-002 sobrou exatamente um administrador em Campo Novo'
);

select is(
  pg_temp.do_as(pg_temp.u('camponovo:admin'),
    format($q$ update public.company_memberships set active = false where user_id = %L and company_id = %L $q$,
           pg_temp.u('camponovo:admin'), pg_temp.co('camponovo'))),
  'ERROR:23514',
  'DB-AUD-002 o segundo já não pode ser desativado'
);

-- Rebaixar o papel também é caminho de esvaziamento.
select is(
  pg_temp.do_as(pg_temp.u('auroraverde:admin'),
    format($q$ update public.company_memberships set role = 'viewer' where user_id = %L and company_id = %L $q$,
           pg_temp.u('auroraverde:admin'), pg_temp.co('auroraverde'))),
  'ERROR:23514',
  'DB-AUD-002 último administrador não se rebaixa a viewer'
);

-- ===========================================================================
-- DB-AUD-003 — vínculo histórico entre empresas
-- ===========================================================================
-- Cenário exato do achado: membership INATIVA na Aurora Verde e ATIVA na Pedra Alta.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'cruzado@teste.example.com');
insert into public.profiles (id, full_name, phone) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Usuario Cruzado', '11999990000');
insert into public.company_memberships (company_id, user_id, role, active) values
  (pg_temp.co('auroraverde'), 'aaaaaaaa-0000-4000-8000-000000000001', 'operator', false);
insert into public.company_memberships (company_id, user_id, role, active) values
  (pg_temp.co('pedraalta'), 'aaaaaaaa-0000-4000-8000-000000000001', 'operator', true);

select is(
  pg_temp.q_as(pg_temp.u('auroraverde:admin'),
    $q$ select count(*)::text from public.profiles
        where id = 'aaaaaaaa-0000-4000-8000-000000000001' $q$),
  '0',
  'DB-AUD-003 admin de A não enxerga profile de usuário hoje ativo em B'
);

select is(
  pg_temp.q_as(pg_temp.u('pedraalta:admin'),
    $q$ select count(*)::text from public.profiles
        where id = 'aaaaaaaa-0000-4000-8000-000000000001' $q$),
  '1',
  'DB-AUD-003 admin da empresa atual (B) continua enxergando o profile'
);

select lives_ok(
  format($q$ select pg_temp.do_as(%L,
    $inner$ update public.profiles set full_name = 'Invadido'
            where id = 'aaaaaaaa-0000-4000-8000-000000000001' $inner$) $q$,
    pg_temp.u('auroraverde:admin')),
  'DB-AUD-003 tentativa de alteração pelo admin de A não gera erro (RLS filtra)'
);

select is(
  (select full_name from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'Usuario Cruzado',
  'DB-AUD-003 ... e o profile permanece intacto'
);

select is(
  private.user_belongs_to_current_company('aaaaaaaa-0000-4000-8000-000000000001'),
  false,
  'DB-AUD-003 helper recusa vínculo histórico quando existe ativo em outra empresa'
);

-- O ex-funcionário SEM vínculo ativo em lugar nenhum continua visível para a empresa.
select is(
  pg_temp.q_as(pg_temp.u('auroraverde:admin'),
    format($q$ select count(*)::text from public.profiles where id = %L $q$,
           pg_temp.u('auroraverde:desligado'))),
  '1',
  'DB-AUD-003 usuário desligado sem vínculo ativo continua na lista da empresa'
);

select is(
  pg_temp.q_as(pg_temp.u('auroraverde:admin'),
    $q$ select jsonb_array_length(public.company_members() -> 'members')::text $q$),
  (select count(*)::text from public.company_memberships
    where company_id = pg_temp.co('auroraverde')),
  'DB-AUD-003 company_members() devolve todos os membros da empresa do chamador'
);

select is(
  pg_temp.q_as(pg_temp.u('auroraverde:consulta'),
    $q$ select public.company_members()::text $q$),
  'ERROR:42501',
  'DB-AUD-003 viewer sem users.read não usa company_members()'
);

-- ===========================================================================
-- DB-AUD-004 — início direto de viagem
-- ===========================================================================
select is(
  pg_temp.do_as(pg_temp.u('auroraverde:operador'),
    format($q$ update public.trips set status = 'in_progress' where id = %L $q$,
           (select id from public.trips
             where company_id = pg_temp.co('auroraverde') and status = 'planned' limit 1))),
  'ERROR:42501',
  'DB-AUD-004 UPDATE direto planned -> in_progress é recusado'
);

select is(
  pg_temp.do_as(pg_temp.u('auroraverde:operador'),
    format($q$ update public.trips
               set status = 'in_progress', actual_departure_at = now(), start_odometer_km = 10
               where id = %L $q$,
           (select id from public.trips
             where company_id = pg_temp.co('auroraverde') and status = 'planned' limit 1))),
  'ERROR:42501',
  'DB-AUD-004 tentativa completa de iniciar viagem por UPDATE é recusada'
);

-- vehicle_id ESTÁ no grant de coluna: quem recusa aqui é o trigger defensivo,
-- não o grant. É a prova de que a segunda camada está viva.
select is(
  pg_temp.do_as(pg_temp.u('auroraverde:operador'),
    format($q$ update public.trips set vehicle_id = %L where id = %L $q$,
           (select v.id from public.vehicles v
             where v.company_id = pg_temp.co('auroraverde')
               and v.archived_at is null
               and v.id <> (select t.vehicle_id from public.trips t
                             where t.company_id = pg_temp.co('auroraverde')
                               and t.status = 'in_progress' limit 1)
             limit 1),
           (select id from public.trips
             where company_id = pg_temp.co('auroraverde') and status = 'in_progress' limit 1))),
  'ERROR:42501',
  'DB-AUD-004 veículo de viagem em andamento é imutável (bloqueado pelo trigger)'
);

select is(
  pg_temp.do_as(pg_temp.u('auroraverde:operador'),
    format($q$ update public.trips set origin_label = 'Novo Ponto de Partida' where id = %L $q$,
           (select id from public.trips
             where company_id = pg_temp.co('auroraverde') and status = 'planned' limit 1))),
  'OK',
  'DB-AUD-004 edição descritiva de viagem planejada continua permitida'
);

select is(
  pg_temp.do_as(pg_temp.u('auroraverde:operador'),
    format($q$ insert into public.trips
               (company_id, vehicle_id, status, origin_label, destination_label,
                actual_departure_at, start_odometer_km)
               values (%L, %L, 'in_progress', 'A', 'B', now(), 10) $q$,
           pg_temp.co('auroraverde'), pg_temp.v('auroraverde:5'))),
  'ERROR:42501',
  'DB-AUD-004 INSERT direto de viagem já em andamento é recusado'
);

-- ===========================================================================
-- DB-AUD-005 — manutenção
-- ===========================================================================
select is(
  pg_temp.do_as(pg_temp.u('auroraverde:gestor'),
    format($q$ insert into public.maintenance_records
               (company_id, vehicle_id, maintenance_type, status, description, started_at)
               values (%L, %L, 'corrective', 'in_progress', 'Entrada direta', now()) $q$,
           pg_temp.co('auroraverde'), pg_temp.v('auroraverde:5'))),
  'ERROR:42501',
  'DB-AUD-005 INSERT direto com status in_progress é recusado'
);

select is(
  pg_temp.do_as(pg_temp.u('auroraverde:gestor'),
    format($q$ update public.maintenance_records set status = 'in_progress' where id = %L $q$,
           (select id from public.maintenance_records
             where company_id = pg_temp.co('auroraverde') and status = 'scheduled' limit 1))),
  'ERROR:42501',
  'DB-AUD-005 UPDATE direto scheduled -> in_progress é recusado'
);

-- O exploit literal descrito na auditoria.
select is(
  pg_temp.do_as(pg_temp.u('auroraverde:gestor'),
    format($q$ update public.maintenance_records
               set archived_at = now(), total_cost = 1, description = 'alterado'
               where id = %L $q$,
           (select id from public.maintenance_records
             where company_id = pg_temp.co('auroraverde') and status = 'completed' limit 1))),
  'ERROR:42501',
  'DB-AUD-005 arquivar não é carona para reescrever custo e descrição'
);

select is(
  pg_temp.err(format(
    $q$ update public.maintenance_records
        set archived_at = now(), total_cost = 1
        where id = %L $q$,
    (select id from public.maintenance_records
      where company_id = pg_temp.co('auroraverde') and status = 'completed' limit 1))),
  '42501',
  'DB-AUD-005 a mesma tentativa é recusada até para o dono da tabela'
);

-- Arquivamento oficial preserva os campos financeiros e históricos.
create temporary table _maint_before on commit drop as
select id, total_cost, description, completed_at, completion_odometer_km
from public.maintenance_records
where company_id = pg_temp.co('auroraverde') and status = 'completed' limit 1;

select is(
  pg_temp.q_as(pg_temp.u('auroraverde:gestor'),
    format($q$ select (public.archive_maintenance(%L) ->> 'archived') $q$,
           (select id from _maint_before))),
  'true',
  'DB-AUD-005 archive_maintenance arquiva registro finalizado'
);

select is(
  (select count(*) from public.maintenance_records m
    join _maint_before b on b.id = m.id
   where m.total_cost is not distinct from b.total_cost
     and m.description is not distinct from b.description
     and m.completed_at is not distinct from b.completed_at
     and m.completion_odometer_km is not distinct from b.completion_odometer_km),
  1::bigint,
  'DB-AUD-005 arquivamento oficial não altera campos financeiros nem históricos'
);

select isnt(
  (select archived_at from public.maintenance_records where id = (select id from _maint_before)),
  null,
  'DB-AUD-005 ... e archived_at foi de fato preenchido'
);

-- ===========================================================================
-- DB-AUD-006 — arquivamento direto de veículo e motorista
-- ===========================================================================
select is(
  pg_temp.do_as(pg_temp.u('auroraverde:gestor'),
    format($q$ update public.vehicles set status = 'archived', archived_at = now() where id = %L $q$,
           pg_temp.v('auroraverde:5'))),
  'ERROR:42501',
  'DB-AUD-006 veículo não é arquivado por UPDATE direto'
);

select is(
  pg_temp.do_as(pg_temp.u('auroraverde:gestor'),
    format($q$ update public.vehicles set archived_by = %L where id = %L $q$,
           pg_temp.u('auroraverde:operador'), pg_temp.v('auroraverde:5'))),
  'ERROR:42501',
  'DB-AUD-006 archived_by do veículo não pode ser forjado'
);

select is(
  pg_temp.do_as(pg_temp.u('auroraverde:gestor'),
    format($q$ update public.vehicles set status = 'inactive' where id = %L $q$,
           pg_temp.v('auroraverde:5'))),
  'ERROR:42501',
  'DB-AUD-006 status do veículo não muda por UPDATE direto'
);

select is(
  pg_temp.do_as(pg_temp.u('auroraverde:gestor'),
    format($q$ update public.vehicles set color = 'Prata' where id = %L $q$,
           pg_temp.v('auroraverde:5'))),
  'OK',
  'DB-AUD-006 edição cadastral do veículo continua permitida'
);

select is(
  pg_temp.do_as(pg_temp.u('auroraverde:gestor'),
    format($q$ update public.drivers set active = false, archived_at = now() where id = %L $q$,
           (select id from public.drivers where company_id = pg_temp.co('auroraverde') limit 1))),
  'ERROR:42501',
  'DB-AUD-006 motorista não é arquivado por UPDATE direto'
);

select is(
  pg_temp.do_as(pg_temp.u('auroraverde:gestor'),
    format($q$ update public.drivers set active = false where id = %L $q$,
           (select id from public.drivers where company_id = pg_temp.co('auroraverde') limit 1))),
  'ERROR:42501',
  'DB-AUD-006 desativação de motorista exige RPC'
);

-- A RPC oficial continua verificando viagens em aberto.
select is(
  pg_temp.q_as(pg_temp.u('auroraverde:gestor'),
    format($q$ select public.archive_driver(%L)::text $q$,
           (select d.id from public.drivers d
             join public.trips t on t.driver_id = d.id and t.status in ('planned','in_progress')
            where d.company_id = pg_temp.co('auroraverde') limit 1))),
  'ERROR:55000',
  'DB-AUD-006 archive_driver continua recusando motorista com viagem aberta'
);

-- ===========================================================================
-- DB-AUD-007 — movimentação por leitura OCR inválida
-- ===========================================================================
insert into auth.users (id, email) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'ocr@teste.example.com');
insert into public.profiles (id, full_name) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'Operador OCR');
insert into public.company_memberships (company_id, user_id, role, active) values
  (pg_temp.co('auroraverde'), 'bbbbbbbb-0000-4000-8000-000000000001', 'operator', true);

insert into public.vehicles (id, company_id, plate, brand, model, fuel_type, current_odometer_km)
values ('cccccccc-0000-4000-8000-000000000001', pg_temp.co('auroraverde'),
        'TST1A11', 'Marca Teste', 'Modelo Teste', 'diesel_s10', 5000);

select is(
  pg_temp.q_as('bbbbbbbb-0000-4000-8000-000000000001',
    format($q$ select public.register_vehicle_movement(%L, %L, 'manual', %L)::text $q$,
           'cccccccc-0000-4000-8000-000000000001',
           private.stable_uuid('location:auroraverde:1'),
           (select id from public.plate_read_events
             where company_id = pg_temp.co('auroraverde') and status = 'confirmed' limit 1))),
  'ERROR:22023',
  'DB-AUD-007 movimentação manual com plate_read_event_id é recusada'
);

select is(
  pg_temp.q_as('bbbbbbbb-0000-4000-8000-000000000001',
    format($q$ select public.register_vehicle_movement(%L, %L, 'ocr', null)::text $q$,
           'cccccccc-0000-4000-8000-000000000001',
           private.stable_uuid('location:auroraverde:1'))),
  'ERROR:22004',
  'DB-AUD-007 movimentação ocr sem leitura é recusada'
);

select is(
  pg_temp.q_as('bbbbbbbb-0000-4000-8000-000000000001',
    format($q$ select public.register_vehicle_movement(%L, %L, 'ocr', %L)::text $q$,
           'cccccccc-0000-4000-8000-000000000001',
           private.stable_uuid('location:auroraverde:1'),
           (select id from public.plate_read_events
             where company_id = pg_temp.co('auroraverde') and status = 'unknown_plate' limit 1))),
  'ERROR:55000',
  'DB-AUD-007 leitura unknown_plate não gera movimentação'
);

select is(
  pg_temp.q_as('bbbbbbbb-0000-4000-8000-000000000001',
    format($q$ select public.register_vehicle_movement(%L, %L, 'ocr', %L)::text $q$,
           'cccccccc-0000-4000-8000-000000000001',
           private.stable_uuid('location:auroraverde:1'),
           (select id from public.plate_read_events
             where company_id = pg_temp.co('auroraverde') and status = 'low_confidence' limit 1))),
  'ERROR:55000',
  'DB-AUD-007 leitura low_confidence não gera movimentação'
);

select is(
  pg_temp.q_as('bbbbbbbb-0000-4000-8000-000000000001',
    format($q$ select public.register_vehicle_movement(%L, %L, 'ocr', %L)::text $q$,
           'cccccccc-0000-4000-8000-000000000001',
           private.stable_uuid('location:auroraverde:1'),
           (select id from public.plate_read_events
             where company_id = pg_temp.co('auroraverde') and status = 'confirmed' limit 1))),
  'ERROR:42501',
  'DB-AUD-007 leitura confirmada de OUTRO veículo não gera movimentação'
);

-- Leitura correta, ainda não consumida: precisa passar.
select is(
  pg_temp.q_as('bbbbbbbb-0000-4000-8000-000000000001',
    format($q$ select (public.register_plate_read(%L, 'TST1A11', 0.99, 'teste-ocr',
                        '1.0.0', now(), null, null, null, 90, false) ->> 'status') $q$,
           private.stable_uuid('camera:1:1:1'))),
  'confirmed',
  'DB-AUD-007 leitura válida do veículo de teste é confirmada'
);

create temporary table _read on commit drop as
select id from public.plate_read_events
where matched_vehicle_id = 'cccccccc-0000-4000-8000-000000000001'
  and status = 'confirmed'
order by created_at desc limit 1;

select is(
  pg_temp.q_as('bbbbbbbb-0000-4000-8000-000000000001',
    format($q$ select (public.register_vehicle_movement(%L, %L, 'ocr', %L) ->> 'movementType') $q$,
           'cccccccc-0000-4000-8000-000000000001',
           private.stable_uuid('location:auroraverde:1'),
           (select id from _read))),
  'entry',
  'DB-AUD-007 leitura confirmada, coerente e não consumida gera movimentação'
);

select is(
  pg_temp.q_as('bbbbbbbb-0000-4000-8000-000000000001',
    format($q$ select public.register_vehicle_movement(%L, %L, 'ocr', %L, null, 0)::text $q$,
           'cccccccc-0000-4000-8000-000000000001',
           private.stable_uuid('location:auroraverde:1'),
           (select id from _read))),
  'ERROR:55000',
  'DB-AUD-007 a mesma leitura não pode ser consumida duas vezes'
);

select is(
  pg_temp.q_as('bbbbbbbb-0000-4000-8000-000000000001',
    format($q$ select public.register_vehicle_movement(%L, %L, 'ocr', %L)::text $q$,
           'cccccccc-0000-4000-8000-000000000001',
           private.stable_uuid('location:auroraverde:2'),
           (select id from _read))),
  'ERROR:42501',
  'DB-AUD-007 local diferente do local da câmera é recusado'
);

-- ===========================================================================
-- DB-AUD-009 — manutenção em veículo indisponível
-- ===========================================================================
insert into public.maintenance_records
  (id, company_id, vehicle_id, maintenance_type, status, description, scheduled_for)
values
  ('dddddddd-0000-4000-8000-000000000001', pg_temp.co('auroraverde'),
   pg_temp.v('auroraverde:14'), 'preventive', 'scheduled', 'Manutenção em arquivado',
   now() + interval '1 day'),
  ('dddddddd-0000-4000-8000-000000000002', pg_temp.co('auroraverde'),
   private.stable_uuid('vehicle:auroraverde:1'), 'preventive', 'scheduled', 'Segunda manutenção',
   now() + interval '1 day');

select is(
  pg_temp.q_as(pg_temp.u('auroraverde:gestor'),
    $q$ select public.start_maintenance('dddddddd-0000-4000-8000-000000000001')::text $q$),
  'ERROR:42501',
  'DB-AUD-009 start_maintenance recusa veículo arquivado'
);

update public.vehicles set status = 'inactive'
where id = private.stable_uuid('vehicle:auroraverde:1') and status = 'available';

select is(
  pg_temp.q_as(pg_temp.u('auroraverde:gestor'),
    $q$ select public.start_maintenance('dddddddd-0000-4000-8000-000000000002')::text $q$),
  'ERROR:55000',
  'DB-AUD-009 start_maintenance recusa veículo inativo'
);

update public.vehicles set status = 'available'
where id = private.stable_uuid('vehicle:auroraverde:1');

select is(
  pg_temp.q_as(pg_temp.u('auroraverde:gestor'),
    $q$ select (public.start_maintenance('dddddddd-0000-4000-8000-000000000002') ->> 'status') $q$),
  'in_progress',
  'DB-AUD-009 veículo disponível entra em manutenção normalmente'
);

insert into public.maintenance_records
  (id, company_id, vehicle_id, maintenance_type, status, description, scheduled_for)
values
  ('dddddddd-0000-4000-8000-000000000003', pg_temp.co('auroraverde'),
   private.stable_uuid('vehicle:auroraverde:1'), 'corrective', 'scheduled', 'Terceira manutenção',
   now() + interval '1 day');

select is(
  pg_temp.q_as(pg_temp.u('auroraverde:gestor'),
    $q$ select public.start_maintenance('dddddddd-0000-4000-8000-000000000003')::text $q$),
  'ERROR:55000',
  'DB-AUD-009 segunda manutenção simultânea no mesmo veículo é recusada'
);

select is(
  pg_temp.err($q$ update public.maintenance_records
                  set status = 'in_progress', started_at = now()
                  where id = 'dddddddd-0000-4000-8000-000000000003' $q$),
  '23505',
  'DB-AUD-009 índice único impede duas manutenções em andamento até para o dono'
);

-- ===========================================================================
-- DB-AUD-013 — ator falsificado
-- ===========================================================================
select is(
  pg_temp.do_as(pg_temp.u('auroraverde:operador'),
    format($q$ insert into public.trips
               (company_id, vehicle_id, status, origin_label, destination_label, created_by)
               values (%L, %L, 'planned', 'Origem X', 'Destino Y', %L) $q$,
           pg_temp.co('auroraverde'), pg_temp.v('auroraverde:5'),
           pg_temp.u('pedraalta:admin'))),
  'OK',
  'DB-AUD-013 INSERT com created_by de outra empresa não falha...'
);

select is(
  (select created_by from public.trips
    where origin_label = 'Origem X' and destination_label = 'Destino Y' limit 1),
  pg_temp.u('auroraverde:operador'),
  'DB-AUD-013 ... porque o servidor carimba created_by com o autor real'
);

select is(
  pg_temp.do_as(pg_temp.u('auroraverde:operador'),
    format($q$ update public.trips set created_by = %L where id = %L $q$,
           pg_temp.u('auroraverde:admin'),
           (select id from public.trips where origin_label = 'Origem X' limit 1))),
  'ERROR:42501',
  'DB-AUD-013 created_by não pode ser alterado depois'
);

select is(
  pg_temp.err(format(
    $q$ insert into public.trips
        (company_id, vehicle_id, status, origin_label, destination_label, created_by)
        values (%L, %L, 'planned', 'Origem Z', 'Destino Z', %L) $q$,
    pg_temp.co('auroraverde'), pg_temp.v('auroraverde:5'), pg_temp.u('pedraalta:admin'))),
  '42501',
  'DB-AUD-013 nem o dono da tabela grava ator de outra empresa'
);

select is(
  (select count(*) from public.trips t
    where not private.actor_belongs_to_company(t.created_by, t.company_id)),
  0::bigint,
  'DB-AUD-013 nenhuma viagem do seed tem ator fora da empresa'
);

-- ===========================================================================
-- DB-AUD-014 — cronologia do odômetro
-- ===========================================================================
select is(
  pg_temp.q_as(pg_temp.u('auroraverde:admin'),
    format($q$ select public.register_odometer_reading(%L, 999999, 'ajuste retroativo',
                                                        now() - interval '400 days')::text $q$,
           pg_temp.v('auroraverde:5'))),
  'ERROR:22007',
  'DB-AUD-014 leitura de odômetro retrodatada é recusada'
);

select is(
  pg_temp.q_as(pg_temp.u('auroraverde:operador'),
    format($q$ select public.register_fueling(%L, 40, 6.20, 999999, 'diesel_s10',
                                               now() - interval '400 days')::text $q$,
           pg_temp.v('auroraverde:5'))),
  'ERROR:22007',
  'DB-AUD-014 abastecimento retrodatado é recusado'
);

select is(
  pg_temp.err(format(
    $q$ insert into public.vehicle_odometer_events
        (company_id, vehicle_id, occurred_at, odometer_km, source_type, source_id)
        values (%L, %L, now() - interval '400 days', 999999, 'trip_completion', gen_random_uuid()) $q$,
    pg_temp.co('auroraverde'), pg_temp.v('auroraverde:5'))),
  '23514',
  'DB-AUD-014 INSERT retrodatado no ledger é recusado até para o dono'
);

select is(
  pg_temp.q_as(pg_temp.u('auroraverde:admin'),
    format($q$ select (public.register_odometer_reading(%L, 999999, 'correção de leitura')
                        ->> 'odometerKm') $q$,
           pg_temp.v('auroraverde:5'))),
  '999999.0',
  'DB-AUD-014 ajuste manual com data corrente continua funcionando'
);

-- ===========================================================================
-- DB-AUD-018 — limiar e horário de leitura sob controle do servidor
-- ===========================================================================
select is(
  pg_temp.q_as('bbbbbbbb-0000-4000-8000-000000000001',
    format($q$ select (public.register_plate_read(%L, 'TST1A11', 0.30, 'teste-ocr',
                        '1.0.0', now(), null, null, 0, 90, false) ->> 'status') $q$,
           private.stable_uuid('camera:1:1:1'))),
  'low_confidence',
  'DB-AUD-018 limiar zero enviado pelo cliente não vence o piso da câmera'
);

select is(
  pg_temp.q_as('bbbbbbbb-0000-4000-8000-000000000001',
    format($q$ select (public.register_plate_read(%L, 'TST1A11', 0.90, 'teste-ocr',
                        '1.0.0', now(), null, null, 0.95, 90, false) ->> 'status') $q$,
           private.stable_uuid('camera:1:1:1'))),
  'low_confidence',
  'DB-AUD-018 o cliente ainda pode ser MAIS rigoroso que o piso'
);

select is(
  pg_temp.q_as('bbbbbbbb-0000-4000-8000-000000000001',
    format($q$ select public.register_plate_read(%L, 'TST1A11', 0.99, 'teste-ocr',
                        '1.0.0', now() - interval '48 hours', null, null, null, 90, false)::text $q$,
           private.stable_uuid('camera:1:1:1'))),
  'ERROR:22007',
  'DB-AUD-018 captura com data muito antiga é recusada'
);

select is(
  pg_temp.q_as('bbbbbbbb-0000-4000-8000-000000000001',
    format($q$ select public.register_plate_read(%L, 'TST1A11', 0.99, 'teste-ocr',
                        '1.0.0', now() + interval '2 days', null, null, null, 90, false)::text $q$,
           private.stable_uuid('camera:1:1:1'))),
  'ERROR:22007',
  'DB-AUD-018 captura no futuro é recusada'
);

-- ===========================================================================
-- DB-AUD-019 — motorização versus produto abastecido
-- ===========================================================================
select is(
  pg_temp.err(format(
    $q$ insert into public.fuelings
        (company_id, vehicle_id, fueled_at, fuel_type, liters, price_per_liter,
         total_amount, odometer_km)
        values (%L, %L, now(), 'flex', 30, 6.00, 180.00, 999999) $q$,
    pg_temp.co('auroraverde'), private.stable_uuid('vehicle:auroraverde:2'))),
  '23514',
  'DB-AUD-019 abastecimento com combustível flex é recusado por constraint'
);

select is(
  pg_temp.q_as(pg_temp.u('auroraverde:operador'),
    format($q$ select public.register_fueling(%L, 30, 6.00, 999999)::text $q$,
           '4cd6f3dc-6a8d-5f3f-ae4e-ec15681e4ce6')),
  'ERROR:22004',
  'DB-AUD-019 veículo flex exige o produto abastecido explicitamente'
);

select is(
  private.fuel_is_compatible('flex', 'flex'), false,
  'DB-AUD-019 flex deixou de ser produto compatível'
);
select is(
  private.fuel_is_compatible('flex', 'ethanol'), true,
  'DB-AUD-019 flex continua aceitando etanol'
);

select is(
  (select count(*) from public.fuelings where fuel_type in ('flex', 'electric')),
  0::bigint,
  'DB-AUD-019 nenhum abastecimento do seed usa motorização como produto'
);

-- ===========================================================================
-- DB-AUD-020 — consumo somente entre tanques cheios
-- ===========================================================================
select cmp_ok(
  (select count(*) from public.v_vehicle_fuel_consumption), '>', 0::bigint,
  'DB-AUD-020 a view de consumo continua produzindo linhas'
);

-- Prova direta: os segmentos medidos batem com a contagem de ciclos fechados
-- de tanque cheio, e não com o total de abastecimentos.
select is(
  (select sum(measured_segments) from public.v_vehicle_fuel_consumption),
  (select sum(greatest(n - 1, 0)) from (
     select vehicle_id, count(*) as n from public.fuelings where full_tank group by vehicle_id
   ) t),
  'DB-AUD-020 número de segmentos = ciclos entre tanques cheios'
);

select cmp_ok(
  (select sum(measured_segments)::bigint from public.v_vehicle_fuel_consumption),
  '<',
  (select count(*)::bigint from public.fuelings),
  'DB-AUD-020 ... e é menor que o total de abastecimentos (parciais não fecham ciclo)'
);

select is(
  (select count(*) from public.v_vehicle_fuel_consumption where km_per_liter <= 0),
  0::bigint,
  'DB-AUD-020 nenhum consumo calculado é zero ou negativo'
);

-- ===========================================================================
-- DB-AUD-021 — intervalos invertidos
-- ===========================================================================
select is(
  pg_temp.q_as(pg_temp.u('auroraverde:gestor'),
    $q$ select public.dashboard_summary(now(), now() - interval '30 days')::text $q$),
  'ERROR:22007',
  'DB-AUD-021 dashboard_summary recusa intervalo invertido'
);

select is(
  pg_temp.q_as(pg_temp.u('auroraverde:gestor'),
    $q$ select count(*)::text from public.report_monthly_costs(now(), now() - interval '30 days') $q$),
  'ERROR:22007',
  'DB-AUD-021 report_monthly_costs recusa intervalo invertido'
);

select is(
  pg_temp.q_as(pg_temp.u('auroraverde:gestor'),
    $q$ select public.report_vehicle_costs(now(), now() - interval '30 days')::text $q$),
  'ERROR:22007',
  'DB-AUD-021 report_vehicle_costs recusa intervalo invertido'
);

select is(
  pg_temp.q_as(pg_temp.u('auroraverde:gestor'),
    $q$ select public.report_recent_movements(now(), now() - interval '7 days')::text $q$),
  'ERROR:22007',
  'DB-AUD-021 report_recent_movements recusa intervalo invertido'
);

select isnt(
  pg_temp.q_as(pg_temp.u('auroraverde:gestor'),
    $q$ select public.report_vehicle_costs(now() - interval '30 days', now())::text $q$),
  'ERROR:22007',
  'DB-AUD-021 intervalo correto continua funcionando'
);

-- ===========================================================================
-- Autotestes continuam limpos depois de tudo
-- ===========================================================================
select is(
  (select count(*) from private.security_selftest()), 0::bigint,
  'autoteste de segurança permanece vazio'
);

select * from finish();
rollback;
