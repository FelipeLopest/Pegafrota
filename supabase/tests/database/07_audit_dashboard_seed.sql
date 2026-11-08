-- =============================================================================
-- 07_audit_dashboard_seed — auditoria, agregados e integridade do seed
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

-- ===========================================================================
-- AUDITORIA
-- ===========================================================================
select cmp_ok((select count(*) from audit.events), '>', 1000::bigint,
              'seed produziu trilha de auditoria substancial');

select is_empty(
  $q$ select 1 from audit.events where entity is null or action is null $q$,
  'nenhum evento de auditoria sem entidade ou ação'
);

-- Append-only: nem o dono da tabela altera
select is(
  pg_temp.err($q$ update audit.events set entity = 'x'
                  where id = (select id from audit.events limit 1) $q$),
  '23514', 'UPDATE em audit.events é bloqueado'
);

select is(
  pg_temp.err($q$ delete from audit.events
                  where id = (select id from audit.events limit 1) $q$),
  '23514', 'DELETE em audit.events é bloqueado'
);

-- authenticated não possui os privilégios
select is_empty(
  $q$ select privilege_type from information_schema.role_table_grants
      where grantee = 'authenticated' and table_schema = 'audit'
        and privilege_type in ('INSERT','UPDATE','DELETE') $q$,
  'authenticated só possui SELECT em audit.events'
);

select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ insert into audit.events (company_id, action, entity, entity_id)
               values (%L, 'insert', 'forjado', gen_random_uuid()) $q$,
           private.stable_uuid('company:auroraverde'))),
  'ERROR:42501', 'authenticated não insere na auditoria diretamente'
);

-- Um UPDATE de negócio gera evento com APENAS os campos alterados
select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ update public.vehicles set color = 'Grafite' where id = %L $q$,
           private.stable_uuid('vehicle:auroraverde:1'))),
  'OK', 'admin altera a cor do veículo'
);

select is(
  (select count(*) from audit.events
    where entity = 'public.vehicles'
      and entity_id = private.stable_uuid('vehicle:auroraverde:1')
      and action = 'update'
      and changed_fields ? 'color'
      and occurred_at > now() - interval '1 minute'),
  1::bigint, 'auditoria registrou a alteração de cor'
);

select is(
  (select changed_fields -> 'color' ->> 'new' from audit.events
    where entity = 'public.vehicles'
      and entity_id = private.stable_uuid('vehicle:auroraverde:1')
      and action = 'update'
    order by occurred_at desc limit 1),
  'Grafite', 'auditoria guarda o valor novo'
);

select is(
  (select changed_fields ? 'updated_at' from audit.events
    where entity = 'public.vehicles'
      and entity_id = private.stable_uuid('vehicle:auroraverde:1')
      and action = 'update'
    order by occurred_at desc limit 1),
  false, 'auditoria ignora ruído de updated_at'
);

select is(
  (select actor_user_id from audit.events
    where entity = 'public.vehicles'
      and entity_id = private.stable_uuid('vehicle:auroraverde:1')
      and action = 'update'
    order by occurred_at desc limit 1),
  private.stable_uuid('user:auroraverde:admin'), 'auditoria registra o autor real'
);

-- Arquivamento recebe ação própria
select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ select public.archive_vehicle(%L, 'teste de auditoria')::text $q$,
           private.stable_uuid('vehicle:auroraverde:4'))),
  '{%', 'veículo 4 arquivado'
);

select is(
  (select count(*) from audit.events
    where entity = 'public.vehicles'
      and entity_id = private.stable_uuid('vehicle:auroraverde:4')
      and action = 'archive'),
  1::bigint, 'arquivamento gera ação "archive" na auditoria'
);

-- RPC transacional gera ação "execute"
select cmp_ok(
  (select count(*) from audit.events where action = 'execute'), '>', 0::bigint,
  'seed já produziu eventos de auditoria originados de RPC'
);

select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:gestor'),
    format($q$ select public.complete_trip(%L,
             (select current_odometer_km + 55 from public.vehicles where id = %L))::text $q$,
           private.stable_uuid('trip:open:' || private.stable_uuid('vehicle:auroraverde:17')::text),
           private.stable_uuid('vehicle:auroraverde:17'))),
  '{%', 'complete_trip executado para gerar auditoria'
);

select is(
  (select count(*) from audit.events
    where entity = 'public.trips'
      and entity_id = private.stable_uuid('trip:open:' || private.stable_uuid('vehicle:auroraverde:17')::text)
      and action = 'execute'
      and metadata ->> 'rpc' = 'complete_trip'),
  1::bigint, 'auditoria identifica qual RPC foi executada'
);

-- Auditoria não copia segredos
select is_empty(
  $q$ select id from audit.events
      where changed_fields::text ~* '(password|encrypted_password|token|secret|api_key)' $q$,
  'nenhum evento de auditoria contém material sensível'
);

-- Inserção de linha nova também é auditada
select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:gestor'),
    format($q$ insert into public.drivers (id, company_id, full_name)
               values (%L, %L, 'Motorista Novo T.') $q$,
           private.stable_uuid('test:driver:novo'),
           private.stable_uuid('company:auroraverde'))),
  'OK', 'gestor cadastra motorista'
);

select is(
  (select count(*) from audit.events
    where entity = 'public.drivers' and entity_id = private.stable_uuid('test:driver:novo')
      and action = 'insert'),
  1::bigint, 'inserção de motorista foi auditada'
);

-- ===========================================================================
-- DASHBOARD E RELATÓRIOS
-- ===========================================================================
-- Os agregados da RPC precisam bater com a consulta direta.
select is(
  pg_temp.q_as(private.stable_uuid('user:riosereno:admin'),
    $q$ select (public.dashboard_summary(now() - interval '400 days', now())
                -> 'fleet' ->> 'total') $q$),
  (select count(*)::text from public.vehicles
    where company_id = private.stable_uuid('company:riosereno')),
  'total da frota no dashboard bate com a contagem real'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:riosereno:admin'),
    $q$ select (public.dashboard_summary(now() - interval '400 days', now())
                -> 'costs' ->> 'fuelCost') $q$),
  (select coalesce(sum(total_amount), 0)::numeric(14,2)::text from public.fuelings
    where company_id = private.stable_uuid('company:riosereno')
      and fueled_at between now() - interval '400 days' and now()),
  'custo de combustível do dashboard bate com a soma real'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:riosereno:admin'),
    $q$ select (public.dashboard_summary(now() - interval '400 days', now())
                -> 'operations' ->> 'tripsCompleted') $q$),
  (select count(*)::text from public.trips
    where company_id = private.stable_uuid('company:riosereno') and status = 'completed'
      and actual_return_at between now() - interval '400 days' and now()),
  'viagens concluídas do dashboard batem com a contagem real'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:riosereno:admin'),
    $q$ select ((public.dashboard_summary() -> 'presence' ->> 'inside')::int
              + (public.dashboard_summary() -> 'presence' ->> 'outside')::int
              + (public.dashboard_summary() -> 'presence' ->> 'neverMoved')::int)::text $q$),
  (select count(*)::text from public.vehicles
    where company_id = private.stable_uuid('company:riosereno') and archived_at is null),
  'dentro + fora + nunca movimentado = frota ativa'
);

-- Nenhum agregado essencial vem vazio
select cmp_ok(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    $q$ select (public.dashboard_summary(now() - interval '400 days', now())
                -> 'costs' ->> 'totalCost') $q$)::numeric,
  '>', 0::numeric, 'custo total do período não é zero'
);

select cmp_ok(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    $q$ select (public.dashboard_summary(now() - interval '400 days', now())
                -> 'operations' ->> 'distanceKm') $q$)::numeric,
  '>', 0::numeric, 'distância percorrida no período não é zero'
);

select cmp_ok(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    $q$ select (public.dashboard_summary() -> 'alerts' ->> 'maintenanceOverdue') $q$)::integer,
  '>', 0, 'existem manutenções vencidas para alertar'
);

select cmp_ok(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    $q$ select (public.dashboard_summary() -> 'alerts' ->> 'maintenanceNext30Days') $q$)::integer,
  '>', 0, 'existem manutenções previstas nos próximos 30 dias'
);

select cmp_ok(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    $q$ select (public.dashboard_summary(now() - interval '400 days', now())
                -> 'alerts' ->> 'unknownPlateReads') $q$)::integer,
  '>', 0, 'existem leituras de placa desconhecida para alertar'
);

-- Intervalo invertido é recusado
select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    $q$ select public.dashboard_summary(now(), now() - interval '10 days')::text $q$),
  'ERROR:%', 'intervalo com fim antes do início é recusado'
);

-- Relatórios
select cmp_ok(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    $q$ select count(*)::text from public.report_monthly_costs(
          now() - interval '23 months', now()) $q$)::integer,
  '>=', 24, 'relatório mensal cobre pelo menos 24 meses'
);

select cmp_ok(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    $q$ select count(*)::text from public.report_monthly_costs(
          now() - interval '23 months', now()) where total_cost > 0 $q$)::integer,
  '>=', 20, 'a grande maioria dos meses possui custo lançado'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    $q$ select (public.report_vehicle_costs(now() - interval '400 days', now(), 1, 5)
                ->> 'pageSize') $q$),
  '5', 'relatório por veículo respeita pageSize'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    $q$ select jsonb_array_length(public.report_vehicle_costs(
          now() - interval '400 days', now(), 1, 5) -> 'items')::text $q$),
  '5', 'relatório por veículo devolve 5 itens'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    $q$ select (public.report_vehicle_costs(now() - interval '400 days', now(), 1, 5)
                ->> 'total') $q$),
  (select count(*)::text from public.vehicles
    where company_id = private.stable_uuid('company:auroraverde')),
  'total do relatório é o total real de veículos da empresa'
);

select cmp_ok(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    $q$ select jsonb_array_length(public.report_maintenance_due(30) -> 'items')::text $q$)::integer,
  '>', 0, 'relatório de manutenções previstas não vem vazio'
);

select cmp_ok(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    $q$ select jsonb_array_length(public.report_recent_movements(
          now() - interval '60 days', now()) -> 'items')::text $q$)::integer,
  '>', 0, 'timeline de movimentações não vem vazia'
);

-- Views de apoio não vêm vazias
select cmp_ok((select count(*) from public.v_vehicle_presence), '>', 0::bigint,
              'v_vehicle_presence populada');
select cmp_ok((select count(*) from public.v_vehicle_monthly_costs), '>', 0::bigint,
              'v_vehicle_monthly_costs populada');
select cmp_ok((select count(*) from public.v_vehicle_fuel_consumption), '>', 0::bigint,
              'v_vehicle_fuel_consumption populada');
select cmp_ok((select count(*) from public.v_maintenance_due), '>', 0::bigint,
              'v_maintenance_due populada');
select cmp_ok((select count(*) from public.v_recent_movements), '>', 0::bigint,
              'v_recent_movements populada');

-- Consumo calculado é plausível
select is(
  (select count(*) from public.v_vehicle_fuel_consumption
    where km_per_liter is not null and (km_per_liter <= 0 or km_per_liter > 100)),
  0::bigint, 'consumo médio calculado fica em faixa plausível'
);

-- ===========================================================================
-- SEED
-- ===========================================================================
select is((select count(*) from public.companies), 4::bigint, 'seed criou 4 empresas');

select is_empty(
  $q$ select c.trade_name from public.companies c
      join (select company_id, count(*) n from public.company_memberships group by 1) m
        on m.company_id = c.id
      where m.n < 3 or m.n > 8 $q$,
  'toda empresa tem entre 3 e 8 usuários'
);

select is_empty(
  $q$ select c.trade_name from public.companies c
      join (select company_id, count(*) n from public.vehicles group by 1) v
        on v.company_id = c.id
      where v.n < 15 or v.n > 40 $q$,
  'toda empresa tem entre 15 e 40 veículos'
);

select is_empty(
  $q$ select c.trade_name from public.companies c
      where not exists (select 1 from public.drivers d where d.company_id = c.id)
         or not exists (select 1 from public.locations l where l.company_id = c.id)
         or not exists (select 1 from public.cameras k where k.company_id = c.id) $q$,
  'toda empresa tem motoristas, locais e câmeras'
);

-- Todos os quatro papéis existem em todas as empresas
select is_empty(
  $q$ select c.trade_name || ':' || r.role::text
      from public.companies c
      cross join (select unnest(enum_range(null::public.membership_role)) role) r
      where not exists (
        select 1 from public.company_memberships m
        where m.company_id = c.id and m.role = r.role) $q$,
  'admin, gestor, operador e visualizador presentes em todas as empresas'
);

-- 24 meses de histórico
select cmp_ok(
  (select count(distinct date_trunc('month', actual_departure_at))
   from public.trips where status = 'completed'),
  '>=', 23::bigint, 'histórico cobre ao menos 23 meses distintos de viagens'
);

select cmp_ok(
  (select extract(month from age(now(), min(actual_departure_at)))::integer
        + 12 * extract(year from age(now(), min(actual_departure_at)))::integer
   from public.trips where status = 'completed'),
  '>=', 22, 'a viagem mais antiga tem ao menos 22 meses'
);

select cmp_ok(
  (select max(occurred_at) from public.vehicle_movements),
  '>', now() - interval '10 days', 'existe movimentação recente (dashboard não vem vazio)'
);

-- Todos os status previstos aparecem
select bag_has($q$ select distinct status::text from public.trips $q$,
  $q$ values ('planned'),('in_progress'),('completed'),('cancelled') $q$,
  'seed cobre todos os status de viagem');

select bag_has($q$ select distinct status::text from public.maintenance_records $q$,
  $q$ values ('scheduled'),('in_progress'),('completed'),('cancelled') $q$,
  'seed cobre todos os status de manutenção');

select bag_has($q$ select distinct status::text from public.vehicles $q$,
  $q$ values ('available'),('in_use'),('in_maintenance'),('inactive'),('archived') $q$,
  'seed cobre todos os status de veículo');

select bag_has($q$ select distinct movement_type::text from public.vehicle_movements $q$,
  $q$ values ('entry'),('exit') $q$, 'seed possui entradas e saídas');

select bag_has($q$ select distinct source::text from public.vehicle_movements $q$,
  $q$ values ('manual'),('ocr') $q$, 'seed possui movimentação manual e por OCR');

-- Determinismo dos IDs
select is(
  (select id from public.companies where trade_name = 'Aurora Verde'),
  private.stable_uuid('company:auroraverde'), 'IDs de empresa são determinísticos'
);

select is(
  (select plate from public.vehicles where id = private.stable_uuid('vehicle:auroraverde:7')),
  'AVD0007', 'IDs e placas de veículo são determinísticos'
);

select is(
  (select full_name from public.profiles where id = private.stable_uuid('user:riosereno:admin')),
  'Lucas E.', 'IDs de usuário são determinísticos'
);

-- Coerência de dados independente das constraints
select is_empty(
  $q$ select severity || ': ' || finding || ' — ' || detail
      from private.data_integrity_selftest() $q$,
  'private.data_integrity_selftest() não encontra incoerência'
);

-- Nenhum CNPJ inválido ou duplicado
select is((select count(*) from public.companies where not private.is_valid_cnpj(cnpj)),
          0::bigint, 'todos os CNPJs do seed são válidos');
select is((select count(distinct cnpj) from public.companies), 4::bigint,
          'os 4 CNPJs são distintos');

-- Toda placa do seed está normalizada
select is(
  (select count(*) from public.vehicles where plate <> private.normalize_plate(plate)),
  0::bigint, 'todas as placas estão normalizadas'
);

select * from finish();
rollback;
