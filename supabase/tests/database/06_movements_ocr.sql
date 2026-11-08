-- =============================================================================
-- 06_movements_ocr — alternância, deduplicação e pipeline OCR (ADR-007/ADR-009)
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
-- 1. Primeira movimentação é sempre Entrada
-- ===========================================================================
-- Veículo novo, sem histórico de movimentação.
insert into public.vehicles (id, company_id, plate, brand, model, fuel_type, current_odometer_km)
values (private.stable_uuid('test:vehicle:novo'), private.stable_uuid('company:auroraverde'),
        'TST1A01', 'Marca', 'Modelo', 'flex', 1000);

select is(
  (select count(*) from public.vehicle_movements
    where vehicle_id = private.stable_uuid('test:vehicle:novo')),
  0::bigint, 'veículo novo não possui movimentação'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:operador'),
    format($q$ select (public.register_vehicle_movement(%L, %L) ->> 'movementType') $q$,
           private.stable_uuid('test:vehicle:novo'),
           private.stable_uuid('location:auroraverde:1'))),
  'entry', 'primeira movimentação é Entrada'
);

select is(
  (select sequence_no from public.vehicle_movements
    where vehicle_id = private.stable_uuid('test:vehicle:novo')),
  1, 'sequência inicia em 1'
);

-- A constraint impede gravar Saída como primeira movimentação, mesmo como postgres
select is(
  pg_temp.err(format($q$
    insert into public.vehicle_movements
      (company_id, vehicle_id, location_id, movement_type, sequence_no, source)
    values (%L, %L, %L, 'exit', 1, 'manual')
  $q$, private.stable_uuid('company:auroraverde'),
       private.stable_uuid('vehicle:auroraverde:5'),
       private.stable_uuid('location:auroraverde:1'))),
  '23514', 'sequence_no 1 com tipo exit viola a check constraint de paridade'
);

-- ===========================================================================
-- 2. Alternância obrigatória
-- ===========================================================================
select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:operador'),
    format($q$ select (public.register_vehicle_movement(%L, %L, 'manual', null, null, 0)
                       ->> 'movementType') $q$,
           private.stable_uuid('test:vehicle:novo'),
           private.stable_uuid('location:auroraverde:1'))),
  'exit', 'segunda movimentação é Saída'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:operador'),
    format($q$ select (public.register_vehicle_movement(%L, %L, 'manual', null, null, 0)
                       ->> 'movementType') $q$,
           private.stable_uuid('test:vehicle:novo'),
           private.stable_uuid('location:auroraverde:1'))),
  'entry', 'terceira movimentação volta a ser Entrada'
);

select results_eq(
  format($q$ select movement_type::text from public.vehicle_movements
             where vehicle_id = %L order by sequence_no $q$,
         private.stable_uuid('test:vehicle:novo')),
  $q$ values ('entry'),('exit'),('entry') $q$,
  'sequência alternada e sem buracos'
);

-- Duas entradas consecutivas são estruturalmente impossíveis
select is(
  pg_temp.err(format($q$
    insert into public.vehicle_movements
      (company_id, vehicle_id, location_id, movement_type, sequence_no, source)
    values (%L, %L, %L, 'entry', 4, 'manual')
  $q$, private.stable_uuid('company:auroraverde'),
       private.stable_uuid('test:vehicle:novo'),
       private.stable_uuid('location:auroraverde:1'))),
  '23514', 'entrada em sequência par é recusada pela paridade'
);

-- Nenhuma movimentação do seed viola a alternância
select is(
  (select count(*) from public.vehicle_movements
    where (sequence_no % 2 = 1 and movement_type <> 'entry')
       or (sequence_no % 2 = 0 and movement_type <> 'exit')),
  0::bigint, 'nenhuma movimentação do seed fora de alternância'
);

select is(
  (select count(*) from (
     select vehicle_id, max(sequence_no) mx, count(*) ct
     from public.vehicle_movements group by vehicle_id) t
   where t.mx <> t.ct),
  0::bigint, 'nenhum buraco na sequência de movimentações do seed'
);

-- ===========================================================================
-- 3. Concorrência: o índice único é o que garante a serialização
-- ===========================================================================
select is(
  pg_temp.err(format($q$
    insert into public.vehicle_movements
      (company_id, vehicle_id, location_id, movement_type, sequence_no, source)
    values (%L, %L, %L, 'entry', 3, 'manual')
  $q$, private.stable_uuid('company:auroraverde'),
       private.stable_uuid('test:vehicle:novo'),
       private.stable_uuid('location:auroraverde:1'))),
  '23505',
  'sequence_no repetido viola o índice único (é o que faz a corrida ter um único vencedor)'
);

-- ===========================================================================
-- 4. Deduplicação de movimentação
-- ===========================================================================
select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:operador'),
    format($q$ select (public.register_vehicle_movement(%L, %L, 'manual', null, null, 300)
                       ->> 'deduplicated') $q$,
           private.stable_uuid('test:vehicle:novo'),
           private.stable_uuid('location:auroraverde:1'))),
  'true', 'clique repetido dentro da janela é deduplicado'
);

select is(
  (select count(*) from public.vehicle_movements
    where vehicle_id = private.stable_uuid('test:vehicle:novo')),
  3::bigint, 'deduplicação não criou nova movimentação'
);

-- ===========================================================================
-- 5. Movimentações são imutáveis e o cliente não escreve nelas
-- ===========================================================================
select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ insert into public.vehicle_movements
               (company_id, vehicle_id, location_id, movement_type, sequence_no, source)
               values (%L, %L, %L, 'exit', 4, 'manual') $q$,
           private.stable_uuid('company:auroraverde'),
           private.stable_uuid('test:vehicle:novo'),
           private.stable_uuid('location:auroraverde:1'))),
  'ERROR:42501', 'authenticated não faz INSERT direto em vehicle_movements'
);

select is(
  pg_temp.err($q$ update public.vehicle_movements set notes = 'x'
                  where id = (select id from public.vehicle_movements limit 1) $q$),
  '23514', 'UPDATE em movimentação é bloqueado até para o dono da tabela'
);

-- occurred_at é sempre carimbo do servidor
select cmp_ok(
  (select occurred_at from public.vehicle_movements
    where vehicle_id = private.stable_uuid('test:vehicle:novo') order by sequence_no desc limit 1),
  '>', now() - interval '1 minute',
  'occurred_at é gerado pelo servidor, não enviado pelo cliente'
);

-- ===========================================================================
-- 6. Presença
-- ===========================================================================
select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:operador'),
    format($q$ select (public.vehicle_presence(%L) ->> 'isInside') $q$,
           private.stable_uuid('test:vehicle:novo'))),
  'true', 'após Entrada o veículo está dentro'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:operador'),
    format($q$ select (public.vehicle_presence(%L) ->> 'nextMovementType') $q$,
           private.stable_uuid('test:vehicle:novo'))),
  'exit', 'próxima movimentação prevista é Saída'
);

select cmp_ok(
  (select count(*) from public.v_vehicle_presence where is_inside), '>', 0::bigint,
  'existem veículos dentro do pátio'
);
select cmp_ok(
  (select count(*) from public.v_vehicle_presence where not is_inside), '>', 0::bigint,
  'existem veículos fora do pátio'
);

-- ===========================================================================
-- 7. OCR: leitura desconhecida NÃO cria movimentação
-- ===========================================================================
select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:operador'),
    format($q$ select (public.register_plate_read(%L, 'ZZZ-9Z99', 0.97, 'demo-ocr-1.4.2')
                       ->> 'status') $q$,
           private.stable_uuid('camera:1:1:1'))),
  'unknown_plate', 'placa fora da frota é classificada como desconhecida'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:operador'),
    format($q$ select coalesce((public.register_plate_read(%L, 'ZZZ-9Z98', 0.97, 'demo-ocr-1.4.2')
                       -> 'movement')::text, 'null') $q$,
           private.stable_uuid('camera:1:1:1'))),
  'null', 'leitura desconhecida não devolve movimentação'
);

select is(
  (select count(*) from public.vehicle_movements m
    join public.plate_read_events e on e.id = m.plate_read_event_id
    where e.status <> 'confirmed'),
  0::bigint, 'nenhuma movimentação originada de leitura não confirmada'
);

select is(
  (select matched_vehicle_id from public.plate_read_events
    where normalized_plate = 'ZZZ9Z99' order by created_at desc limit 1),
  null::uuid, 'leitura desconhecida não aponta veículo'
);

-- ===========================================================================
-- 8. OCR: baixa confiança não cria movimentação
-- ===========================================================================
select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:operador'),
    format($q$ select (public.register_plate_read(%L, %L, 0.42, 'demo-ocr-1.4.2') ->> 'status') $q$,
           private.stable_uuid('camera:1:1:1'),
           (select plate from public.vehicles where id = private.stable_uuid('vehicle:auroraverde:5')))),
  'low_confidence', 'confiança abaixo do limiar é recusada'
);

select is(
  (select count(*) from public.vehicle_movements m
    join public.plate_read_events e on e.id = m.plate_read_event_id
    where e.status = 'low_confidence'),
  0::bigint, 'leitura de baixa confiança não gera movimentação'
);

-- ===========================================================================
-- 9. OCR: leitura confirmada gera UMA movimentação
-- ===========================================================================
select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:operador'),
    format($q$ select (public.register_plate_read(%L, %L, 0.96, 'demo-ocr-1.4.2') ->> 'status') $q$,
           private.stable_uuid('camera:1:1:1'),
           (select plate from public.vehicles where id = private.stable_uuid('vehicle:auroraverde:5')))),
  'confirmed', 'placa da frota com boa confiança é confirmada'
);

select is(
  (select count(*) from public.vehicle_movements m
    join public.plate_read_events e on e.id = m.plate_read_event_id
    where e.normalized_plate = (select plate from public.vehicles
                                 where id = private.stable_uuid('vehicle:auroraverde:5'))
      and e.status = 'confirmed'
      and m.created_at > now() - interval '1 minute'),
  1::bigint, 'leitura confirmada gerou exatamente uma movimentação'
);

select is(
  (select source::text from public.vehicle_movements
    where vehicle_id = private.stable_uuid('vehicle:auroraverde:5')
    order by sequence_no desc limit 1),
  'ocr', 'movimentação registrada com origem OCR'
);

-- Uma leitura nunca gera duas movimentações
select is(
  pg_temp.err(format($q$
    insert into public.vehicle_movements
      (company_id, vehicle_id, location_id, movement_type, sequence_no, source, plate_read_event_id)
    select company_id, vehicle_id, location_id,
           case when (sequence_no + 1) %% 2 = 1 then 'entry' else 'exit' end::public.movement_type,
           sequence_no + 1, 'ocr', plate_read_event_id
    from public.vehicle_movements
    where vehicle_id = %L and plate_read_event_id is not null
    order by sequence_no desc limit 1
  $q$, private.stable_uuid('vehicle:auroraverde:5'))),
  '23505', 'reutilizar o mesmo plate_read_event_id viola o índice único'
);

select is(
  (select count(*) from (
     select plate_read_event_id from public.vehicle_movements
     where plate_read_event_id is not null
     group by 1 having count(*) > 1) d),
  0::bigint, 'nenhuma leitura do seed gerou mais de uma movimentação'
);

-- ===========================================================================
-- 10. OCR: deduplicação de leitura
-- ===========================================================================
select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:operador'),
    format($q$ select (public.register_plate_read(%L, %L, 0.96, 'demo-ocr-1.4.2') ->> 'status') $q$,
           private.stable_uuid('camera:1:1:1'),
           (select plate from public.vehicles where id = private.stable_uuid('vehicle:auroraverde:5')))),
  'duplicate', 'segunda leitura da mesma placa na janela é duplicada'
);

select isnt(
  (select duplicate_of_id from public.plate_read_events
    where status = 'duplicate' order by created_at desc limit 1),
  null::uuid, 'leitura duplicada aponta a leitura original'
);

select is(
  (select count(*) from public.vehicle_movements m
    join public.plate_read_events e on e.id = m.plate_read_event_id
    where e.status = 'duplicate'),
  0::bigint, 'leitura duplicada não gera movimentação'
);

-- ===========================================================================
-- 11. OCR: idempotência por client_event_id
-- ===========================================================================
select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:operador'),
    format($q$ select (public.register_plate_read(%L, %L, 0.95, 'demo-ocr-1.4.2', '1.0.0',
                        now(), null, 'idem-key-001') ->> 'idempotent') $q$,
           private.stable_uuid('camera:1:1:1'),
           (select plate from public.vehicles where id = private.stable_uuid('vehicle:auroraverde:7')))),
  'false', 'primeira chamada com client_event_id não é idempotente'
);

select is(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:operador'),
    format($q$ select (public.register_plate_read(%L, %L, 0.95, 'demo-ocr-1.4.2', '1.0.0',
                        now(), null, 'idem-key-001') ->> 'idempotent') $q$,
           private.stable_uuid('camera:1:1:1'),
           (select plate from public.vehicles where id = private.stable_uuid('vehicle:auroraverde:7')))),
  'true', 'reenvio do mesmo client_event_id devolve o registro existente'
);

select is(
  (select count(*) from public.plate_read_events where client_event_id = 'idem-key-001'),
  1::bigint, 'reenvio não duplicou a leitura'
);

-- ===========================================================================
-- 12. OCR: escrita direta e câmera de outra empresa
-- ===========================================================================
select is(
  pg_temp.do_as(private.stable_uuid('user:auroraverde:admin'),
    format($q$ insert into public.plate_read_events
               (company_id, camera_id, captured_at, raw_text, confidence,
                status, engine_version, contract_version)
               values (%L, %L, now(), 'AAA1A11', 0.99, 'confirmed', 'x', '1.0.0') $q$,
           private.stable_uuid('company:auroraverde'),
           private.stable_uuid('camera:1:1:1'))),
  'ERROR:42501', 'authenticated não faz INSERT direto em plate_read_events'
);

select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:operador'),
    format($q$ select public.register_plate_read(%L, 'AAA1A11', 0.99, 'x')::text $q$,
           private.stable_uuid('camera:4:1:1'))),
  'ERROR:%', 'câmera de outra empresa é recusada'
);

-- viewer não opera OCR
select alike(
  pg_temp.q_as(private.stable_uuid('user:auroraverde:consulta'),
    format($q$ select public.register_plate_read(%L, 'AAA1A11', 0.99, 'x')::text $q$,
           private.stable_uuid('camera:1:1:1'))),
  'ERROR:42501', 'viewer não registra leitura de placa'
);

-- Todos os status previstos existem no seed
select bag_has(
  $q$ select distinct status::text from public.plate_read_events $q$,
  $q$ values ('confirmed'),('unknown_plate'),('duplicate'),('low_confidence'),('error') $q$,
  'seed cobre leituras confirmadas, desconhecidas, duplicadas, de baixa confiança e com erro'
);

select * from finish();
rollback;
