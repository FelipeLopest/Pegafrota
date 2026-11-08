-- =============================================================================
-- 05_operations — viagem, abastecimento, manutenção e arquivamento
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
-- Atalhos para os veículos determinísticos do seed (empresa Aurora Verde)
--   seq 1  : disponível, flex, com viagem planejada
--   seq 2  : disponível, diesel_s10, sem pendência (arquivável)
--   seq 3  : em viagem (trip:open)
--   seq 6  : em manutenção (maint:running)
--   seq 14 : arquivado
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- VIAGEM
-- ===========================================================================
select is(
  (select status::text from public.trips
    where id = private.stable_uuid('trip:open:' || private.stable_uuid('vehicle:auroraverde:3')::text)),
  'in_progress', 'seed possui viagem em andamento para o veículo 3'
);

-- Conclusão pela RPC
select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:gestor'),
    format($q$ select public.complete_trip(%L,
             (select current_odometer_km + 137.5 from public.vehicles where id = %L))::text $q$,
           private.stable_uuid('trip:open:' || private.stable_uuid('vehicle:auroraverde:3')::text),
           private.stable_uuid('vehicle:auroraverde:3'))),
  '{%', 'complete_trip executa com sucesso'
);

select is(
  (select status::text from public.trips
    where id = private.stable_uuid('trip:open:' || private.stable_uuid('vehicle:auroraverde:3')::text)),
  'completed', 'viagem passou para concluída'
);

select is(
  (select status::text from public.vehicles where id = private.stable_uuid('vehicle:auroraverde:3')),
  'available', 'veículo foi liberado ao concluir a viagem'
);

select is(
  (select count(*) from public.vehicle_odometer_events
    where source_type = 'trip_completion'
      and source_id = private.stable_uuid('trip:open:' || private.stable_uuid('vehicle:auroraverde:3')::text)),
  1::bigint, 'conclusão criou exatamente um evento no ledger'
);

select is(
  (select v.current_odometer_km::numeric from public.vehicles v
    where v.id = private.stable_uuid('vehicle:auroraverde:3')),
  (select t.end_odometer_km::numeric from public.trips t
    where t.id = private.stable_uuid('trip:open:' || private.stable_uuid('vehicle:auroraverde:3')::text)),
  'cache do veículo igual à quilometragem final da viagem'
);

-- Concluir duas vezes é recusado
select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:gestor'),
    format($q$ select public.complete_trip(%L, 9999990)::text $q$,
           private.stable_uuid('trip:open:' || private.stable_uuid('vehicle:auroraverde:3')::text))),
  'ERROR:%', 'concluir a mesma viagem duas vezes é recusado'
);

-- Quilometragem final menor que a inicial
select is(
  (select status::text from public.trips
    where id = private.stable_uuid('trip:open:' || private.stable_uuid('vehicle:auroraverde:10')::text)),
  'in_progress', 'veículo 10 também está em viagem'
);

select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:gestor'),
    format($q$ select public.complete_trip(%L, 1)::text $q$,
           private.stable_uuid('trip:open:' || private.stable_uuid('vehicle:auroraverde:10')::text))),
  'ERROR:%', 'quilometragem final menor que a inicial é recusada'
);

select is(
  (select status::text from public.trips
    where id = private.stable_uuid('trip:open:' || private.stable_uuid('vehicle:auroraverde:10')::text)),
  'in_progress', 'viagem permanece em andamento após falha (transação revertida)'
);

-- Retorno antes da saída
select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:gestor'),
    format($q$ select public.complete_trip(%L,
             (select current_odometer_km + 10 from public.vehicles where id = %L),
             now() - interval '30 days')::text $q$,
           private.stable_uuid('trip:open:' || private.stable_uuid('vehicle:auroraverde:10')::text),
           private.stable_uuid('vehicle:auroraverde:10'))),
  'ERROR:%', 'retorno anterior à saída é recusado pela RPC'
);

-- Conclusão direta por UPDATE é bloqueada (só por RPC)
select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:gestor'),
    format($q$ update public.trips set status = 'completed', actual_return_at = now(),
                                       end_odometer_km = 9999990
               where id = %L $q$,
           private.stable_uuid('trip:open:' || private.stable_uuid('vehicle:auroraverde:10')::text))),
  'ERROR:42501', 'UPDATE direto para status concluído é bloqueado pelo trigger'
);

-- Cancelamento exige permissão trips.cancel
select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:operador'),
    format($q$ select public.cancel_trip(%L, 'teste')::text $q$,
           private.stable_uuid('trip:open:' || private.stable_uuid('vehicle:auroraverde:10')::text))),
  'ERROR:42501', 'operador não cancela viagem'
);

select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:gestor'),
    format($q$ select public.cancel_trip(%L, 'cliente cancelou')::text $q$,
           private.stable_uuid('trip:open:' || private.stable_uuid('vehicle:auroraverde:10')::text))),
  '{%', 'gestor cancela viagem em andamento'
);

select is(
  (select count(*) from public.vehicle_odometer_events
    where source_id = private.stable_uuid('trip:open:' || private.stable_uuid('vehicle:auroraverde:10')::text)),
  0::bigint, 'viagem cancelada NÃO gera evento de odômetro'
);

-- ===========================================================================
-- ABASTECIMENTO
-- ===========================================================================
select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:operador'),
    format($q$ select public.register_fueling(%L, 42.5, 6.199,
             (select current_odometer_km + 80 from public.vehicles where id = %L),
             'gasoline')::text $q$,
           private.stable_uuid('vehicle:auroraverde:1'),
           private.stable_uuid('vehicle:auroraverde:1'))),
  '{%', 'operador registra abastecimento'
);

select is(
  (select total_amount::numeric from public.fuelings
    where vehicle_id = private.stable_uuid('vehicle:auroraverde:1')
    order by created_at desc limit 1),
  round(42.5 * 6.199, 2),
  'total gravado é exatamente round(litros x preço, 2)'
);

-- Vinculado pelo volume exato do teste: independe de janela de tempo, e o seed
-- também registra um abastecimento por RPC no mesmo veículo.
select is(
  (select count(*) from public.vehicle_odometer_events e
    join public.fuelings f on f.id = e.source_id
    where e.source_type = 'fueling'
      and f.vehicle_id = private.stable_uuid('vehicle:auroraverde:1')
      and f.liters = 42.5),
  1::bigint, 'abastecimento criou exatamente um evento de odômetro'
);

-- Total informado divergente é recusado
select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:operador'),
    format($q$ select public.register_fueling(%L, 10, 5,
             (select current_odometer_km + 5 from public.vehicles where id = %L),
             'gasoline', now(), null, null, null, false, null, 999.99)::text $q$,
           private.stable_uuid('vehicle:auroraverde:1'),
           private.stable_uuid('vehicle:auroraverde:1'))),
  'ERROR:%', 'total informado divergente do calculado é recusado'
);

-- Odômetro regressivo no abastecimento
select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:operador'),
    format($q$ select public.register_fueling(%L, 10, 5, 1, 'gasoline')::text $q$,
           private.stable_uuid('vehicle:auroraverde:1'))),
  'ERROR:%', 'abastecimento com odômetro regressivo é recusado'
);

-- A transação inteira é revertida: nenhum abastecimento órfão
select is(
  (select count(*) from public.fuelings
    where vehicle_id = private.stable_uuid('vehicle:auroraverde:1')
      and odometer_km = 1),
  0::bigint, 'abastecimento recusado não deixa registro órfão'
);

-- Litros/preço não podem ser editados depois
select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:gestor'),
    format($q$ update public.fuelings set liters = 1 where id = %L $q$,
           (select id from public.fuelings
             where vehicle_id = private.stable_uuid('vehicle:auroraverde:1')
             order by created_at desc limit 1))),
  'ERROR:42501', 'litros de um abastecimento gravado são imutáveis'
);

select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:gestor'),
    format($q$ update public.fuelings set notes = 'conferido' where id = %L $q$,
           (select id from public.fuelings
             where vehicle_id = private.stable_uuid('vehicle:auroraverde:1')
             order by created_at desc limit 1))),
  'OK', 'observação do abastecimento pode ser corrigida'
);

-- ===========================================================================
-- MANUTENÇÃO
-- ===========================================================================
select is(
  (select status::text from public.maintenance_records
    where id = private.stable_uuid('maint:running:' || private.stable_uuid('vehicle:auroraverde:6')::text)),
  'in_progress', 'seed possui manutenção em execução no veículo 6'
);

select is(
  (select status::text from public.vehicles where id = private.stable_uuid('vehicle:auroraverde:6')),
  'in_maintenance', 'veículo 6 está em manutenção'
);

-- Custo zero é recusado pela RPC
select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:gestor'),
    format($q$ select public.complete_maintenance(%L, 0)::text $q$,
           private.stable_uuid('maint:running:' || private.stable_uuid('vehicle:auroraverde:6')::text))),
  'ERROR:%', 'conclusão de manutenção com custo zero é recusada'
);

select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:gestor'),
    format($q$ select public.complete_maintenance(%L, 1250.90, now(),
             (select current_odometer_km + 5 from public.vehicles where id = %L),
             'Oficina Alfa', 'NF-000123')::text $q$,
           private.stable_uuid('maint:running:' || private.stable_uuid('vehicle:auroraverde:6')::text),
           private.stable_uuid('vehicle:auroraverde:6'))),
  '{%', 'gestor conclui manutenção com custo positivo'
);

select is(
  (select status::text from public.maintenance_records
    where id = private.stable_uuid('maint:running:' || private.stable_uuid('vehicle:auroraverde:6')::text)),
  'completed', 'manutenção passou para concluída'
);

select is(
  (select total_cost::numeric from public.maintenance_records
    where id = private.stable_uuid('maint:running:' || private.stable_uuid('vehicle:auroraverde:6')::text)),
  1250.90::numeric, 'custo gravado corretamente'
);

select is(
  (select status::text from public.vehicles where id = private.stable_uuid('vehicle:auroraverde:6')),
  'available', 'veículo liberado após conclusão da manutenção'
);

select is(
  (select count(*) from public.vehicle_odometer_events
    where source_type = 'maintenance_completion'
      and source_id = private.stable_uuid('maint:running:' || private.stable_uuid('vehicle:auroraverde:6')::text)),
  1::bigint, 'conclusão com quilometragem criou evento no ledger'
);

-- Agendada e concluída convivem no mesmo modelo, separadas por status
select cmp_ok(
  (select count(*) from public.maintenance_records
    where company_id = private.stable_uuid('company:auroraverde') and status = 'scheduled'),
  '>', 0::bigint, 'existem manutenções agendadas'
);

select cmp_ok(
  (select count(*) from public.maintenance_records
    where company_id = private.stable_uuid('company:auroraverde') and status = 'completed'),
  '>', 0::bigint, 'existem manutenções concluídas'
);

select is(
  (select count(*) from public.maintenance_records
    where status = 'completed' and scheduled_for > completed_at),
  0::bigint, 'nenhuma manutenção concluída mantém agendamento futuro'
);

-- Conclusão direta por UPDATE é bloqueada
select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:gestor'),
    format($q$ update public.maintenance_records
               set status = 'completed', completed_at = now(), total_cost = 100
               where id = %L $q$,
           (select id from public.maintenance_records
             where company_id = private.stable_uuid('company:auroraverde')
               and status = 'scheduled' limit 1))),
  'ERROR:42501', 'UPDATE direto para concluída é bloqueado pelo trigger'
);

-- ===========================================================================
-- ARQUIVAMENTO (ADR-005)
-- ===========================================================================
select is(
  (select archived_at is not null from public.vehicles
    where id = private.stable_uuid('vehicle:auroraverde:14')),
  true, 'seed possui veículo arquivado'
);

-- Histórico do veículo arquivado permanece
select cmp_ok(
  (select count(*) from public.trips where vehicle_id = private.stable_uuid('vehicle:auroraverde:14')),
  '>', 0::bigint, 'viagens do veículo arquivado continuam existindo'
);
select cmp_ok(
  (select count(*) from public.vehicle_odometer_events
    where vehicle_id = private.stable_uuid('vehicle:auroraverde:14')),
  '>', 0::bigint, 'ledger do veículo arquivado continua existindo'
);
select cmp_ok(
  (select count(*) from public.vehicle_movements
    where vehicle_id = private.stable_uuid('vehicle:auroraverde:14')),
  '>', 0::bigint, 'movimentações do veículo arquivado continuam existindo'
);

-- DELETE é negado
select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ delete from public.vehicles where id = %L $q$,
           private.stable_uuid('vehicle:auroraverde:14'))),
  'ERROR:42501', 'authenticated não possui privilégio de DELETE em vehicles'
);

select is(
  pg_temp.err(format($q$ delete from public.vehicles where id = %L $q$,
                     private.stable_uuid('vehicle:auroraverde:1'))),
  '23503', 'nem como postgres é possível apagar veículo com histórico (FK restrict)'
);

select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ delete from public.trips where id = %L $q$,
           private.stable_uuid('trip:planned:' || private.stable_uuid('vehicle:auroraverde:1')::text))),
  'ERROR:42501', 'authenticated não apaga viagens'
);

-- Arquivar pela RPC
select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ select public.archive_vehicle(%L, 'venda do ativo')::text $q$,
           private.stable_uuid('vehicle:auroraverde:2'))),
  '{%', 'admin arquiva veículo sem pendências'
);

select is(
  (select status::text from public.vehicles where id = private.stable_uuid('vehicle:auroraverde:2')),
  'archived', 'veículo ficou com status archived'
);

select is(
  (select archived_by from public.vehicles where id = private.stable_uuid('vehicle:auroraverde:2')),
  private.stable_uuid('user:auroraverde:admin'), 'archived_by registra o autor'
);

-- Arquivar com viagem em aberto é recusado
select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ select public.archive_vehicle(%L)::text $q$,
           private.stable_uuid('vehicle:auroraverde:1'))),
  'ERROR:%', 'veículo com viagem planejada não pode ser arquivado'
);

-- Idempotência
select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ select (public.archive_vehicle(%L) ->> 'alreadyArchived') $q$,
           private.stable_uuid('vehicle:auroraverde:2'))),
  'true', 'arquivar duas vezes é idempotente'
);

-- Desarquivar
select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ select (public.unarchive_vehicle(%L) ->> 'status') $q$,
           private.stable_uuid('vehicle:auroraverde:2'))),
  'available', 'desarquivamento devolve o veículo à operação'
);

select * from finish();
rollback;
