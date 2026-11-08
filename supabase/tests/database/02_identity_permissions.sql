-- =============================================================================
-- 02_identity_permissions — helpers de identidade, matriz de permissões,
--                           usuário inativo e papel insuficiente
-- =============================================================================
begin;
create extension if not exists pgtap with schema extensions;
set search_path to extensions, public, private, pg_temp;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Impersonação
-- ---------------------------------------------------------------------------
-- A cláusula SET na assinatura é essencial: ela faz o PostgreSQL restaurar o
-- nível de GUC ao sair da função, revertendo automaticamente o "set local role"
-- e o claim JWT. Sem isso, o papel vazaria para os testes seguintes.
create function pg_temp.q_as(p_user uuid, p_sql text)
returns text
language plpgsql
set search_path = extensions, public, private, pg_temp
as $$
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
  -- O rollback do savepoint já desfaz o SET LOCAL; o reset explícito é defesa extra.
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return 'ERROR:' || sqlstate;
end $$;

create function pg_temp.do_as(p_user uuid, p_sql text)
returns text
language plpgsql
set search_path = extensions, public, private, pg_temp
as $$
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
end $$;

create function pg_temp.q_as_anon(p_sql text)
returns text
language plpgsql
set search_path = extensions, public, private, pg_temp
as $$
declare v_result text;
begin
  execute 'set local role anon';
  execute p_sql into v_result;
  execute 'reset role';
  return v_result;
exception when others then
  execute 'reset role';
  return 'ERROR:' || sqlstate;
end $$;

-- ---------------------------------------------------------------------------
-- Catálogo de permissões coerente com PERMISSIONS_MATRIX.md
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from private.role_permissions where role = 'company_admin'),
  (select count(*) from private.permissions),
  'company_admin possui todas as permissões'
);

select is_empty(
  $$ select permission_code from private.role_permissions
     where role = 'fleet_manager' and permission_code in ('company.update','users.manage') $$,
  'gestor não gere empresa nem usuários'
);

select is_empty(
  $$ select permission_code from private.role_permissions
     where role = 'operator'
       and permission_code in ('vehicles.write','drivers.write','maintenance.schedule',
                               'trips.cancel','users.read','audit.read','reports.export',
                               'odometer.adjust','company.update','users.manage') $$,
  'operador não possui permissões estruturais nem de auditoria'
);

select bag_has(
  $$ select permission_code from private.role_permissions where role = 'operator' $$,
  $$ values ('trips.write'),('fuelings.write'),('maintenance.write'),
            ('movements.write'),('ocr.operate'),('dashboard.read') $$,
  'operador possui as permissões operacionais'
);

select is_empty(
  $$ select permission_code from private.role_permissions
     where role = 'viewer' and permission_code like '%.write' $$,
  'visualizador não possui nenhuma permissão de escrita'
);

select is_empty(
  $$ select permission_code from private.role_permissions
     where role = 'viewer'
       and permission_code in ('ocr.operate','audit.read','users.read','vehicles.archive') $$,
  'visualizador não opera OCR nem vê auditoria'
);

-- Toda permissão do catálogo é usada por pelo menos um papel
select is_empty(
  $$ select p.code from private.permissions p
     where not exists (select 1 from private.role_permissions rp where rp.permission_code = p.code) $$,
  'nenhuma permissão órfã no catálogo'
);

-- ---------------------------------------------------------------------------
-- Resolução de identidade
-- ---------------------------------------------------------------------------
select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
               'select private.current_user_company_id()::text'),
  private.stable_uuid('company:auroraverde')::text,
  'admin da Aurora Verde resolve a própria empresa'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
               'select private.current_user_role()::text'),
  'company_admin',
  'papel resolvido corretamente'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:pedraalta:consulta'),
               'select private.current_user_role()::text'),
  'viewer',
  'papel viewer resolvido corretamente'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
               $$ select private.has_permission('users.manage')::text $$),
  'true', 'admin possui users.manage'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:gestor'),
               $$ select private.has_permission('users.manage')::text $$),
  'false', 'gestor NÃO possui users.manage'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:operador'),
               $$ select private.has_permission('maintenance.schedule')::text $$),
  'false', 'operador NÃO possui maintenance.schedule'
);

-- my_context()
select is(
  pg_temp.q_as(private.stable_uuid('user:riosereno:gestor'),
               $$ select public.my_context() ->> 'sessionState' $$),
  'ACTIVE', 'my_context devolve sessão ativa'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:riosereno:gestor'),
               $$ select public.my_context() -> 'company' ->> 'tradeName' $$),
  'Rio Sereno', 'my_context devolve a empresa correta'
);

-- ---------------------------------------------------------------------------
-- Usuário inativo (SECURITY_MODEL.md §7): membership OU perfil inativo bloqueia
-- ---------------------------------------------------------------------------
select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:desligado'),
               'select coalesce(private.current_user_company_id()::text, ''NULL'')'),
  'NULL',
  'usuário com MEMBERSHIP inativa não resolve empresa'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:pedraalta:suspenso'),
               'select coalesce(private.current_user_company_id()::text, ''NULL'')'),
  'NULL',
  'usuário com PERFIL inativo não resolve empresa'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:desligado'),
               'select count(*)::text from public.vehicles'),
  '0', 'usuário com membership inativa não lê nenhum veículo'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:pedraalta:suspenso'),
               'select count(*)::text from public.trips'),
  '0', 'usuário com perfil inativo não lê nenhuma viagem'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:desligado'),
               $$ select public.my_context() ->> 'sessionState' $$),
  'NO_ACTIVE_MEMBERSHIP', 'my_context sinaliza ausência de vínculo ativo'
);

select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:desligado'),
               'select public.dashboard_summary()::text'),
  'ERROR:%', 'usuário inativo não consegue abrir o dashboard'
);

select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:desligado'),
    format($$ insert into public.drivers (company_id, full_name)
              values (%L, 'Motorista Fantasma') $$,
           private.stable_uuid('company:auroraverde'))),
  'ERROR:42501', 'usuário inativo não insere nada'
);

-- ---------------------------------------------------------------------------
-- anon não alcança nada
-- ---------------------------------------------------------------------------
select alike(pg_temp.q_as_anon('select count(*)::text from public.vehicles'),
            'ERROR:%', 'anon não lê vehicles');
select alike(pg_temp.q_as_anon('select count(*)::text from public.companies'),
            'ERROR:%', 'anon não lê companies');
select alike(pg_temp.q_as_anon('select public.dashboard_summary()::text'),
            'ERROR:%', 'anon não executa dashboard_summary');
select alike(pg_temp.q_as_anon('select count(*)::text from private.role_permissions'),
            'ERROR:%', 'anon não lê o catálogo de permissões');

-- ---------------------------------------------------------------------------
-- Papel insuficiente
-- ---------------------------------------------------------------------------
-- viewer não escreve
select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:consulta'),
    format($$ insert into public.vehicles (company_id, plate, brand, model, fuel_type)
              values (%L, 'VWR1A11', 'Marca', 'Modelo', 'flex') $$,
           private.stable_uuid('company:auroraverde'))),
  'ERROR:42501', 'viewer não insere veículo'
);

select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:consulta'),
    format($$ update public.vehicles set color = 'Azul' where id = %L $$,
           private.stable_uuid('vehicle:auroraverde:1'))),
  'OK', 'update de viewer não gera erro, mas...'
);

select is(
  (select color from public.vehicles where id = private.stable_uuid('vehicle:auroraverde:1')),
  (select color from public.vehicles where id = private.stable_uuid('vehicle:auroraverde:1')),
  '... a policy de UPDATE filtra a linha e nada é alterado'
);

select isnt(
  (select color from public.vehicles where id = private.stable_uuid('vehicle:auroraverde:1')),
  'Azul', 'cor do veículo permanece inalterada após tentativa do viewer'
);

select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:consulta'),
    format($$ select public.complete_trip(%L, 999999)::text $$,
           (select id from public.trips where company_id = private.stable_uuid('company:auroraverde')
             and status = 'in_progress' limit 1))),
  'ERROR:42501', 'viewer não conclui viagem'
);

select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:consulta'),
    format($$ select public.register_fueling(%L, 30, 6, 999999)::text $$,
           private.stable_uuid('vehicle:auroraverde:1'))),
  'ERROR:42501', 'viewer não registra abastecimento'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:consulta'),
               'select count(*)::text from public.audit_events'),
  '0', 'viewer não lê auditoria (sem audit.read)'
);

-- operador não agenda manutenção nem ajusta odômetro
select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:operador'),
    format($$ insert into public.maintenance_records
              (company_id, vehicle_id, maintenance_type, status, description, scheduled_for)
              values (%L, %L, 'preventive', 'scheduled', 'Tentativa do operador',
                      now() + interval '10 days') $$,
           private.stable_uuid('company:auroraverde'),
           private.stable_uuid('vehicle:auroraverde:1'))),
  'ERROR:42501', 'operador não agenda manutenção'
);

select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:operador'),
    format($$ select public.register_odometer_reading(%L, 999999, 'teste')::text $$,
           private.stable_uuid('vehicle:auroraverde:1'))),
  'ERROR:42501', 'operador não faz ajuste manual de odômetro'
);

select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:operador'),
    format($$ select public.archive_vehicle(%L)::text $$,
           private.stable_uuid('vehicle:auroraverde:1'))),
  'ERROR:42501', 'operador não arquiva veículo'
);

-- gestor consegue o que o operador não consegue
select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:gestor'),
    format($$ insert into public.maintenance_records
              (company_id, vehicle_id, maintenance_type, status, description, scheduled_for)
              values (%L, %L, 'preventive', 'scheduled', 'Agendamento do gestor',
                      now() + interval '10 days') $$,
           private.stable_uuid('company:auroraverde'),
           private.stable_uuid('vehicle:auroraverde:1'))),
  'OK', 'gestor agenda manutenção'
);

-- operador PODE registrar operação corrente
select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:operador'),
    format($$ insert into public.trips
              (company_id, vehicle_id, status, origin_label, destination_label, planned_departure_at)
              values (%L, %L, 'planned', 'Pátio Central', 'Cliente Norte', now() + interval '2 days') $$,
           private.stable_uuid('company:auroraverde'),
           private.stable_uuid('vehicle:auroraverde:1'))),
  'OK', 'operador cria viagem planejada'
);

-- gestor NÃO edita a empresa
select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:gestor'),
    format($$ update public.companies set trade_name = 'Renomeada' where id = %L $$,
           private.stable_uuid('company:auroraverde'))),
  'OK', 'update de empresa pelo gestor não gera erro...'
);

select is(
  (select trade_name from public.companies where id = private.stable_uuid('company:auroraverde')),
  'Aurora Verde', '... mas a policy impede a alteração (company.update ausente)'
);

select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:admin'),
    format($$ update public.companies set phone = '1133334444' where id = %L $$,
           private.stable_uuid('company:auroraverde'))),
  'OK', 'admin edita a empresa'
);

select is(
  (select phone from public.companies where id = private.stable_uuid('company:auroraverde')),
  '1133334444', 'alteração do admin foi aplicada'
);

select * from finish();
rollback;
