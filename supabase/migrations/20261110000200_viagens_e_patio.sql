-- Operação real: presença inicial, comando explícito e viagens coerentes.
begin;

-- A placa identifica o ativo dentro de cada cliente. Nenhum histórico é compartilhado.
alter table public.vehicles drop constraint vehicles_plate_unique;
alter table public.vehicles add constraint vehicles_company_plate_unique unique(company_id,plate);
alter table public.vehicle_movements drop constraint movements_first_is_entry;
alter table public.vehicle_movements drop constraint movements_alternation_parity;
alter table public.trips drop constraint trips_odometer_progress;
alter table public.trips add constraint trips_odometer_progress check(end_odometer_km is null or start_odometer_km is null or end_odometer_km>start_odometer_km or (status='cancelled' and end_odometer_km=start_odometer_km));

create table private.initial_vehicle_presence(
 vehicle_id uuid primary key references public.vehicles(id) on delete cascade,
 company_id uuid not null references public.companies(id) on delete cascade,
 presence text not null check(presence in('inside','outside')),
 location_id uuid references public.locations(id) on delete set null,
 recorded_at timestamptz not null default now(),recorded_by uuid references public.profiles(id) on delete set null,
 reason text not null check(char_length(btrim(reason))>=10)
);
revoke all on private.initial_vehicle_presence from public,anon,authenticated,service_role;

create function private.current_vehicle_movement(p_vehicle_id uuid)
returns public.movement_type language sql stable security definer set search_path='' as $$
 select coalesce((select movement_type from public.vehicle_movements where vehicle_id=p_vehicle_id order by sequence_no desc limit 1),
   (select case presence when 'inside' then 'entry'::public.movement_type else 'exit'::public.movement_type end from private.initial_vehicle_presence where vehicle_id=p_vehicle_id))
$$;
revoke all on function private.current_vehicle_movement(uuid) from public,anon,authenticated,service_role;

create function public.set_initial_presence(p_vehicle_id uuid,p_presence text,p_location_id uuid,p_reason text,p_command_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.vehicles; c jsonb; anterior jsonb;
begin
 perform private.assert_permission('movements.write');
 select * into v from public.vehicles where id=p_vehicle_id;
 if not found then raise exception 'VEHICLE_NOT_FOUND' using hint='NOT_FOUND'; end if;
 perform private.assert_company_access(v.company_id);
 c:=private.begin_operation(v.company_id,p_command_id,'initial_presence',jsonb_build_array(p_vehicle_id,p_presence,p_location_id,p_reason)); if c is not null then return c;end if;
 select * into v from public.vehicles where id=p_vehicle_id for update;
 if v.archived_at is not null or p_presence is null or p_presence not in('inside','outside') or char_length(btrim(coalesce(p_reason,'')))<10 then raise exception 'INVALID_INPUT: informe presença e motivo' using hint='VALIDATION_ERROR'; end if;
 if exists(select 1 from public.vehicle_movements where vehicle_id=v.id) then raise exception 'PRESENCE_HAS_HISTORY: já existe movimentação; use o histórico' using hint='CONFLICT_STATE';end if;
 if (p_presence='inside' and p_location_id is null) or (p_location_id is not null and not exists(select 1 from public.locations where id=p_location_id and company_id=v.company_id and active and archived_at is null)) then raise exception 'LOCATION_NOT_FOUND: selecione base ativa da empresa' using hint='VALIDATION_ERROR';end if;
 select to_jsonb(i) into anterior from private.initial_vehicle_presence i where vehicle_id=v.id;
 insert into private.initial_vehicle_presence(vehicle_id,company_id,presence,location_id,recorded_by,reason) values(v.id,v.company_id,p_presence,p_location_id,private.current_user_id(),p_reason)
 on conflict(vehicle_id) do update set presence=excluded.presence,location_id=excluded.location_id,reason=excluded.reason,recorded_at=now(),recorded_by=excluded.recorded_by;
 perform private.log_audit_event(v.company_id,'execute','public.vehicles',v.id,jsonb_build_object('presence',jsonb_build_object('old',anterior->>'presence','new',p_presence)),jsonb_build_object('rpc','set_initial_presence','locationId',p_location_id,'reason',p_reason));
 return private.finish_operation(v.company_id,p_command_id,jsonb_build_object('vehicleId',v.id,'presence',p_presence,'locationId',p_location_id));
end $$;

create function public.movement_command(p_vehicle_id uuid,p_location_id uuid,p_direction public.movement_type,p_occurred_at timestamptz,p_command_id uuid,p_notes text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.vehicles; m public.vehicle_movements; anterior public.vehicle_movements; estado public.movement_type; c jsonb; quando timestamptz:=coalesce(p_occurred_at,now());
begin
 perform private.assert_permission('movements.write');
 select * into v from public.vehicles where id=p_vehicle_id;
 if not found then raise exception 'VEHICLE_NOT_FOUND' using hint='NOT_FOUND';end if;
 perform private.assert_company_access(v.company_id);
 c:=private.begin_operation(v.company_id,p_command_id,'movement',jsonb_build_array(p_vehicle_id,p_location_id,p_direction,p_occurred_at,p_notes));
 if c is not null then return c||jsonb_build_object('deduplicated',true);end if;
 select * into v from public.vehicles where id=p_vehicle_id for update;
 if v.archived_at is not null then raise exception 'VEHICLE_ARCHIVED' using hint='CONFLICT_ARCHIVED';end if;
 if not exists(select 1 from public.locations where id=p_location_id and company_id=v.company_id and active and archived_at is null) then raise exception 'LOCATION_NOT_FOUND: selecione base ativa da empresa' using hint='VALIDATION_ERROR';end if;
 select * into anterior from public.vehicle_movements where vehicle_id=v.id order by sequence_no desc limit 1;
 estado:=private.current_vehicle_movement(v.id);
 if p_direction is null or (p_direction='exit' and estado is distinct from 'entry') or (p_direction='entry' and estado='entry') then raise exception 'MOVEMENT_DIRECTION_CONFLICT: confira a presença e o sentido. Para primeira saída, confirme a presença inicial.' using hint='CONFLICT_STATE';end if;
 if quando>now()+interval '5 minutes' or (anterior.id is not null and quando<anterior.occurred_at) then raise exception 'MOVEMENT_CHRONOLOGY: data incompatível com a última passagem' using hint='CHRONOLOGY_ERROR';end if;
 insert into public.vehicle_movements(company_id,vehicle_id,location_id,movement_type,sequence_no,occurred_at,source,operator_user_id,notes)
 values(v.company_id,v.id,p_location_id,p_direction,coalesce(anterior.sequence_no,0)+1,quando,'manual',private.current_user_id(),private.normalize_label(p_notes)) returning * into m;
 return private.finish_operation(v.company_id,p_command_id,jsonb_build_object('movementId',m.id,'vehicleId',v.id,'plate',v.plate,'movementType',m.movement_type,'occurredAt',m.occurred_at,'locationId',m.location_id,'sequenceNo',m.sequence_no,'deduplicated',false,'vehicleIsInside',m.movement_type='entry'));
end $$;

create or replace function public.register_vehicle_movement(
  p_vehicle_id           uuid,
  p_location_id          uuid,
  p_source               public.movement_source default 'manual',
  p_plate_read_event_id  uuid default null,
  p_notes                text default null,
  p_dedup_window_seconds integer default 90
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_vehicle   public.vehicles;
  v_location  public.locations;
  v_last      public.vehicle_movements;
  v_movement  public.vehicle_movements;
  v_read      public.plate_read_events;
  v_camera    public.cameras;
  v_consumed  uuid;
  v_next_seq  integer;
  v_type      public.movement_type;
  v_window    interval;
begin
  if p_source = 'ocr' then
    perform private.assert_permission('ocr.operate');
  else
    perform private.assert_permission('movements.write');
  end if;

  -- ---------------------------------------------------------------------
  -- (0) Origem manual NUNCA carrega leitura de placa (DB-AUD-007).
  -- ---------------------------------------------------------------------
  if p_source = 'manual' and p_plate_read_event_id is not null then
    raise exception
      'MOVEMENT_MANUAL_WITH_READ: movimentação manual não aceita plate_read_event_id'
      using errcode = '22023', hint = 'OCR_INVALID_PAYLOAD';
  end if;

  if p_source = 'ocr' and p_plate_read_event_id is null then
    raise exception 'MOVEMENT_OCR_REQUIRES_READ: origem ocr exige plate_read_event_id'
      using errcode = '22004', hint = 'OCR_INVALID_PAYLOAD';
  end if;

  v_window := make_interval(secs => least(greatest(coalesce(p_dedup_window_seconds, 90), 0), 3600));

  -- (1)(2) localizar e bloquear o veículo (ordem de lock padronizada).
  select * into v_vehicle from public.vehicles where id = p_vehicle_id for update;
  if not found then
    raise exception 'VEHICLE_NOT_FOUND: veículo % não existe', p_vehicle_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_vehicle.company_id);

  if v_vehicle.archived_at is not null then
    raise exception 'VEHICLE_ARCHIVED: veículo % está arquivado', p_vehicle_id
      using errcode = '42501', hint = 'CONFLICT_ARCHIVED';
  end if;

  select * into v_location from public.locations where id = p_location_id;
  if not found then
    raise exception 'LOCATION_NOT_FOUND: local % não existe', p_location_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_location.company_id);

  if not v_location.active or v_location.archived_at is not null then
    raise exception 'LOCATION_INACTIVE: local % está inativo', p_location_id
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  -- ---------------------------------------------------------------------
  -- (2b) Validação integral da leitura OCR — ANTES de qualquer INSERT.
  -- ---------------------------------------------------------------------
  if p_source = 'ocr' then
    -- Bloqueia a leitura: impede que duas transações consumam o mesmo evento.
    select * into v_read
    from public.plate_read_events
    where id = p_plate_read_event_id
    for update;

    if not found then
      raise exception 'PLATE_READ_NOT_FOUND: leitura % não existe', p_plate_read_event_id
        using errcode = 'P0002', hint = 'NOT_FOUND';
    end if;

    -- Mesma empresa, por lógica e não apenas pela FK composta.
    if v_read.company_id <> v_vehicle.company_id then
      raise exception 'PLATE_READ_TENANT_MISMATCH: leitura pertence a outra empresa'
        using errcode = '42501', hint = 'TENANT_MISMATCH';
    end if;
    perform private.assert_company_access(v_read.company_id);

    if v_read.status <> 'confirmed' then
      raise exception
        'PLATE_READ_NOT_CONFIRMED: leitura em % não pode originar movimentação', v_read.status
        using errcode = '55000', hint = 'CONFLICT_STATE';
    end if;

    if v_read.matched_vehicle_id is distinct from p_vehicle_id then
      raise exception
        'PLATE_READ_VEHICLE_MISMATCH: leitura aponta o veículo % e não o veículo %',
        v_read.matched_vehicle_id, p_vehicle_id
        using errcode = '42501', hint = 'CONFLICT_STATE';
    end if;

    -- Câmera e local coerentes.
    select * into v_camera from public.cameras where id = v_read.camera_id;
    if not found then
      raise exception 'CAMERA_NOT_FOUND: câmera da leitura % não existe', p_plate_read_event_id
        using errcode = 'P0002', hint = 'NOT_FOUND';
    end if;

    if v_camera.location_id <> p_location_id then
      raise exception
        'PLATE_READ_LOCATION_MISMATCH: a câmera da leitura pertence ao local % e não ao local %',
        v_camera.location_id, p_location_id
        using errcode = '42501', hint = 'CONFLICT_STATE';
    end if;

    -- Placa coerente OU override manual explicitamente justificado.
    if v_read.normalized_plate is distinct from v_vehicle.plate
       and private.normalize_label(v_read.manual_override_reason) is null then
      raise exception
        'PLATE_READ_PLATE_MISMATCH: placa lida (%) difere da placa do veículo (%) sem override auditado',
        coalesce(v_read.normalized_plate, '(vazia)'), v_vehicle.plate
        using errcode = '42501', hint = 'CONFLICT_STATE';
    end if;

    -- Evento ainda não consumido.
    select m.id into v_consumed
    from public.vehicle_movements m
    where m.plate_read_event_id = p_plate_read_event_id
    limit 1;

    if v_consumed is not null then
      raise exception
        'PLATE_READ_ALREADY_CONSUMED: leitura % já originou a movimentação %',
        p_plate_read_event_id, v_consumed
        -- 55000 e não 23505 de propósito: o handler de unique_violation no fim
        -- desta função traduziria um 23505 em MOVEMENT_CONFLICT (40001) e o
        -- cliente receberia "tente de novo" em vez de "leitura já usada".
        using errcode = '55000', hint = 'CONFLICT_DUPLICATE';
    end if;
  end if;

  -- (3) última movimentação do veículo.
  select * into v_last
  from public.vehicle_movements
  where vehicle_id = p_vehicle_id
  order by sequence_no desc
  limit 1;

  -- (5) deduplicação: mesmo veículo, mesmo local, mesma origem, dentro da janela.
  if v_last.id is not null
     and v_last.location_id = p_location_id
     and v_last.source = p_source
     and v_window > interval '0'
     and greatest(now() - v_last.occurred_at, interval '0') < v_window then
    return jsonb_build_object(
      'movementId', v_last.id,
      'vehicleId', p_vehicle_id,
      'plate', v_vehicle.plate,
      'movementType', v_last.movement_type,
      'occurredAt', v_last.occurred_at,
      'locationId', v_last.location_id,
      'sequenceNo', v_last.sequence_no,
      'deduplicated', true,
      'vehicleIsInside', (v_last.movement_type = 'entry')
    );
  end if;

  -- (4) primeira movimentação é Entrada; depois alternância obrigatória.
  v_next_seq := coalesce(v_last.sequence_no, 0) + 1;
  v_type := case when private.current_vehicle_movement(p_vehicle_id)='entry' then 'exit' else 'entry' end;

  -- (6) registrar. occurred_at é SEMPRE carimbo do servidor.
  insert into public.vehicle_movements (
    company_id, vehicle_id, location_id, movement_type, sequence_no,
    occurred_at, source, plate_read_event_id, operator_user_id, notes
  )
  values (
    v_vehicle.company_id, p_vehicle_id, p_location_id, v_type, v_next_seq,
    now(), p_source, p_plate_read_event_id, private.current_user_id(),
    private.normalize_label(p_notes)
  )
  returning * into v_movement;

  -- (7) novo estado.
  return jsonb_build_object(
    'movementId', v_movement.id,
    'vehicleId', p_vehicle_id,
    'plate', v_vehicle.plate,
    'movementType', v_movement.movement_type,
    'occurredAt', v_movement.occurred_at,
    'locationId', v_movement.location_id,
    'sequenceNo', v_movement.sequence_no,
    'deduplicated', false,
    'vehicleIsInside', (v_movement.movement_type = 'entry')
  );
exception
  when unique_violation then
    raise exception 'MOVEMENT_CONFLICT: outra movimentação do veículo % foi registrada simultaneamente',
      p_vehicle_id
      using errcode = '40001', hint = 'CONFLICT_RETRY';
end;
$$;
create or replace function public.camera_finish(p_capture_id uuid,p_claim_id uuid,p_plate text default null,
 p_confidence numeric default 0,p_ambiguous boolean default false,p_error text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_capture public.camera_captures; v_camera public.cameras; v_plate text; v_result jsonb;
 v_count integer; v_vehicle public.vehicles; v_last public.vehicle_movements; v_auto boolean;
begin
 perform private.assert_permission('ocr.operate');
 select c.* into v_camera from public.cameras c join public.camera_captures j on j.camera_id=c.id where j.id=p_capture_id for update of c;
 perform private.assert_company_access(v_camera.company_id);
 select * into v_capture from public.camera_captures where id=p_capture_id for update;
 if v_capture.claim_id is distinct from p_claim_id or v_capture.claimed_by is distinct from private.current_user_id() or v_capture.status<>'processing' or v_capture.lease_until<now() then raise exception 'CLAIM_EXPIRED'; end if;
 if p_confidence is null or p_confidence<0 or p_confidence>1 then raise exception 'INVALID_CONFIDENCE'; end if;
 if p_error is not null then
  update public.camera_captures set status=case when attempts<3 then 'queued' else 'error' end,error_message=left(p_error,240),lease_until=null where id=p_capture_id;
  return jsonb_build_object('status','error');
 end if;
 v_plate:=upper(regexp_replace(coalesce(p_plate,''),'[ -]','','g'));
 if v_plate !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then
  update public.camera_captures set status='ignored',processed_at=now(),result='{"reason":"Nenhuma placa brasileira válida identificada"}' where id=p_capture_id;
  return jsonb_build_object('status','ignored');
 end if;
 update public.camera_captures set suggested_plate=v_plate,confidence=p_confidence,processed_at=now() where id=p_capture_id;
 select result into v_result from private.camera_passages where camera_id=v_camera.id and passage_id=v_capture.passage_id;
 if found then
  update public.camera_captures set status='ignored',result=v_result where id=p_capture_id;
  return jsonb_build_object('status','ignored','reason','Passagem já processada');
 end if;
 if not v_camera.active then raise exception 'CAMERA_INACTIVE'; end if;
 -- Uma primeira foto ruim não impede duas fotos seguintes boas da mesma passagem.
 -- Mantê-la revisável sem criar uma leitura idempotente definitiva prematuramente.
 if v_camera.automatic_enabled and not p_ambiguous and p_confidence<v_camera.min_confidence then
  update public.camera_captures set status='review',result=jsonb_build_object('reason','Confiança insuficiente; aguardando outras capturas ou revisão.') where id=p_capture_id;
  return jsonb_build_object('status','review');
 end if;
 v_auto:=v_camera.automatic_enabled and v_camera.direction<>'both' and not p_ambiguous
  and p_confidence>=v_camera.min_confidence and v_capture.captured_at>now()-interval '2 minutes';
 select count(*) into v_count from public.camera_captures where camera_id=v_camera.id and passage_id=v_capture.passage_id
  and suggested_plate=v_plate and confidence>=v_camera.min_confidence and processed_at is not null
  and captured_at between v_capture.captured_at-interval '15 seconds' and v_capture.captured_at+interval '15 seconds';
 if v_auto and v_count<2 then
  update public.camera_captures set status='waiting_consensus',result='{"reason":"Aguardando segunda captura concordante"}' where id=p_capture_id;
  return jsonb_build_object('status','waiting_consensus');
 end if;
 -- Leituras conflitantes da mesma passagem nunca geram uma alternância automática.
 if exists(select 1 from public.camera_captures where camera_id=v_camera.id and passage_id=v_capture.passage_id and suggested_plate<>v_plate and confidence>=v_camera.min_confidence) then v_auto:=false; end if;
 select * into v_vehicle from public.vehicles where company_id=v_camera.company_id and plate=v_plate and archived_at is null for update;
 if v_auto and found then
  select * into v_last from public.vehicle_movements where vehicle_id=v_vehicle.id order by occurred_at desc,created_at desc limit 1;
  if (v_camera.direction='entry' and private.current_vehicle_movement(v_vehicle.id)='entry') or
     (v_camera.direction='exit' and private.current_vehicle_movement(v_vehicle.id) is distinct from 'entry') then
   v_result:=jsonb_build_object('status','ignored','reason','Presença atual incompatível com a direção da câmera; confira no pátio.');
   insert into private.camera_passages(camera_id,passage_id,result) values(v_camera.id,v_capture.passage_id,v_result);
   update public.camera_captures set status='ignored',result=v_result where id=p_capture_id;
   update public.camera_captures set status='ignored',result=v_result where camera_id=v_camera.id and passage_id=v_capture.passage_id and status in ('waiting_consensus','review');
   return v_result;
  end if;
 end if;
 v_result:=public.register_plate_read(v_camera.id,v_plate,case when v_auto then p_confidence else 0 end,
  'rapidocr-windows-1','1.0.0',v_capture.captured_at,null,'esp32:'||v_camera.id||':'||v_capture.passage_id,null,90,v_auto);
 update public.camera_captures set status=case when v_result->>'status' in ('confirmed','duplicate') then 'done' else 'review' end,
  plate_read_event_id=(v_result->>'plateReadEventId')::uuid,result=v_result where id=p_capture_id;
 insert into private.camera_passages(camera_id,passage_id,result) values(v_camera.id,v_capture.passage_id,v_result);
 update public.camera_captures set status='ignored',result=v_result where camera_id=v_camera.id and passage_id=v_capture.passage_id and id<>p_capture_id and status in ('waiting_consensus','review');
 return v_result;
end $$;

create or replace function public.vehicle_presence(p_vehicle_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v public.vehicles; m public.vehicle_movements; i private.initial_vehicle_presence; s text;
begin
 perform private.assert_permission('movements.read'); select * into v from public.vehicles where id=p_vehicle_id;
 if not found then raise exception 'VEHICLE_NOT_FOUND' using hint='NOT_FOUND';end if; perform private.assert_company_access(v.company_id);
 select * into m from public.vehicle_movements where vehicle_id=v.id order by sequence_no desc limit 1;
 select * into i from private.initial_vehicle_presence where vehicle_id=v.id;
 s:=case when m.id is null then coalesce(i.presence,'unknown') when m.movement_type='entry' then 'inside' else 'outside' end;
 return jsonb_build_object('vehicleId',v.id,'plate',v.plate,'presence',s,'vehicleIsInside',s='inside','isInside',s='inside','hasMovements',m.id is not null,'lastMovementType',m.movement_type,'locationId',coalesce(m.location_id,i.location_id),'occurredAt',coalesce(m.occurred_at,i.recorded_at),'lastMovement',case when m.id is not null then jsonb_build_object('id',m.id,'movementType',m.movement_type,'locationId',m.location_id,'occurredAt',m.occurred_at,'sequenceNo',m.sequence_no) end);
end $$;

create or replace function public.yard_snapshot()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c uuid; tz text; today date; resultado jsonb;
begin
 perform private.assert_permission('movements.read');c:=private.current_user_company_id();select timezone into tz from public.companies where id=c;tz:=coalesce(tz,'America/Sao_Paulo');today:=(now() at time zone tz)::date;
 with presentes as(
 select v.id,v.plate,v.brand,v.model,v.status,case when m.id is null then coalesce(i.presence,'unknown') when m.movement_type='entry' then 'inside' else 'outside' end as presence,
 m.movement_type as "lastMovementType",coalesce(m.location_id,i.location_id) as "locationId",coalesce(m.occurred_at,i.recorded_at) as "occurredAt"
 from public.vehicles v left join lateral(select id,movement_type,location_id,occurred_at from public.vehicle_movements where vehicle_id=v.id order by sequence_no desc limit 1)m on true
 left join private.initial_vehicle_presence i on i.vehicle_id=v.id where v.company_id=c and v.archived_at is null),
 diario as(select count(*) filter(where movement_type='entry') entradas,count(*) filter(where movement_type='exit') saidas from public.vehicle_movements where company_id=c and (occurred_at at time zone tz)::date=today)
 select jsonb_build_object('timezone',tz,'localDate',today,'entriesToday',(select entradas from diario),'exitsToday',(select saidas from diario),'inside',count(*) filter(where presence='inside'),'outside',count(*) filter(where presence='outside'),'neverMoved',count(*) filter(where presence='unknown'),'vehicles',coalesce(jsonb_agg(to_jsonb(presentes) order by plate),'[]')) into resultado from presentes;
 return resultado;
end $$;

create or replace function public.start_trip(
  p_trip_id             uuid,
  p_actual_departure_at timestamptz default now(),
  p_start_odometer_km   numeric default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_trip     public.trips;
  v_vehicle  public.vehicles;
  v_start_km public.odometer_km;
  v_driver public.drivers;
  v_timezone text;
  v_departure timestamptz := coalesce(p_actual_departure_at, now());
begin
  perform private.assert_permission('trips.write');

  select * into v_trip from public.trips where id = p_trip_id;
  if not found then
    raise exception 'TRIP_NOT_FOUND: viagem % não existe', p_trip_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_trip.company_id);

  -- Lock do veículo antes do documento (ordem padronizada anti-deadlock).
  select * into v_vehicle from public.vehicles where id = v_trip.vehicle_id for update;
  select * into v_trip from public.trips where id = p_trip_id for update;

  if v_trip.vehicle_id is distinct from v_vehicle.id then raise exception 'TRIP_CHANGED: recarregue o planejamento' using hint='CONFLICT_RETRY'; end if;
  if v_trip.status <> 'planned' then
    raise exception 'TRIP_INVALID_STATE: viagem % está em % e não pode ser iniciada',
      p_trip_id, v_trip.status
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  if v_vehicle.archived_at is not null or v_vehicle.status in ('archived', 'inactive', 'in_maintenance') then
    raise exception 'VEHICLE_UNAVAILABLE: veículo % está em % e não pode iniciar viagem',
      v_vehicle.id, v_vehicle.status
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  select * into v_driver from public.drivers where id=v_trip.driver_id for update;
  if not found or v_driver.company_id<>v_trip.company_id or not v_driver.active or v_driver.archived_at is not null then
    raise exception 'DRIVER_INACTIVE: escolha um motorista ativo' using hint='CONFLICT_STATE';
  end if;
  select timezone into v_timezone from public.companies where id=v_trip.company_id;
  if v_driver.license_expires_on is not null and v_driver.license_expires_on<(v_departure at time zone coalesce(v_timezone,'America/Sao_Paulo'))::date then
    raise exception 'DRIVER_LICENSE_EXPIRED: a validade da CNH cadastrada já passou' using hint='CONFLICT_STATE';
  end if;
  if exists(select 1 from public.trips where driver_id=v_driver.id and status='in_progress' and id<>p_trip_id) then
    raise exception 'DRIVER_BUSY: motorista já tem uma viagem em andamento' using hint='CONFLICT_STATE';
  end if;
  if v_departure > now() + interval '5 minutes' then
    raise exception 'VALIDATION_ERROR: data de saída não pode estar no futuro'
      using errcode = '22007', hint = 'CHRONOLOGY_ERROR';
  end if;

  v_start_km := coalesce(p_start_odometer_km, v_vehicle.current_odometer_km);

  if v_start_km < v_vehicle.current_odometer_km then
    raise exception 'ODOMETER_REGRESSION: quilometragem inicial % menor que a atual %',
      v_start_km, v_vehicle.current_odometer_km
      using errcode = '23514', hint = 'ODOMETER_REGRESSION';
  end if;

  update public.trips
     set status = 'in_progress',
         actual_departure_at = v_departure,
         start_odometer_km = v_start_km
   where id = p_trip_id;

  update public.vehicles set status = 'in_use' where id = v_vehicle.id;

  perform private.log_audit_event(
    v_trip.company_id, 'execute', 'public.trips', p_trip_id,
    jsonb_build_object('status', jsonb_build_object('old', v_trip.status, 'new', 'in_progress')),
    jsonb_build_object('rpc', 'start_trip')
  );

  return jsonb_build_object(
    'tripId', p_trip_id,
    'status', 'in_progress',
    'vehicleId', v_vehicle.id,
    'actualDepartureAt', v_departure,
    'startOdometerKm', v_start_km
  );
end;
$$;

create or replace function public.cancel_trip(p_trip_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.trips;
begin
 perform private.assert_permission('trips.cancel');select * into v from public.trips where id=p_trip_id for update;
 if not found then raise exception 'TRIP_NOT_FOUND' using hint='NOT_FOUND';end if;perform private.assert_company_access(v.company_id);
 if v.status<>'planned' then raise exception 'TRIP_INVALID_STATE: para viagem iniciada use Encerrar viagem interrompida' using hint='CONFLICT_STATE';end if;
 if private.normalize_label(p_reason) is null then raise exception 'REASON_REQUIRED' using hint='VALIDATION_ERROR';end if;
 update public.trips set status='cancelled',cancel_reason=private.normalize_label(p_reason),cancelled_at=now(),cancelled_by=private.current_user_id() where id=v.id;
 perform private.log_audit_event(v.company_id,'execute','public.trips',v.id,jsonb_build_object('status',jsonb_build_object('old','planned','new','cancelled')),jsonb_build_object('rpc','cancel_trip','reason',p_reason));
 return jsonb_build_object('tripId',v.id,'status','cancelled');
end $$;

create function public.save_trip(p_trip_id uuid,p_vehicle_id uuid,p_driver_id uuid,p_origin_label text,p_destination_label text,p_planned_departure_at timestamptz,p_planned_return_at timestamptz,p_purpose text,p_notes text,p_command_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c uuid; r jsonb; v public.trips;
begin
 perform private.assert_permission('trips.write');c:=private.current_user_company_id();
 r:=private.begin_operation(c,p_command_id,'save_trip',jsonb_build_array(p_trip_id,p_vehicle_id,p_driver_id,p_origin_label,p_destination_label,p_planned_departure_at,p_planned_return_at,p_purpose,p_notes));if r is not null then return r;end if;
 if p_trip_id is null then r:=public.create_trip(p_vehicle_id,p_driver_id,p_origin_label,p_destination_label,p_planned_departure_at,p_planned_return_at,p_purpose,p_notes);
 else
  select * into v from public.trips where id=p_trip_id and company_id=c for update;
  if not found then raise exception 'TRIP_NOT_FOUND' using hint='NOT_FOUND';end if;
  if v.status<>'planned' then raise exception 'TRIP_INVALID_STATE: só o planejamento pode ser editado' using hint='CONFLICT_STATE';end if;
  if not exists(select 1 from public.vehicles where id=p_vehicle_id and company_id=c and archived_at is null and status<>'inactive') or not exists(select 1 from public.drivers where id=p_driver_id and company_id=c and archived_at is null and active) then raise exception 'RESOURCE_UNAVAILABLE: escolha veículo e motorista ativos' using hint='VALIDATION_ERROR';end if;
  if private.normalize_label(p_origin_label) is null or private.normalize_label(p_destination_label) is null or p_planned_return_at<=p_planned_departure_at then raise exception 'INVALID_INPUT: origem, destino ou período inválido' using hint='VALIDATION_ERROR';end if;
  update public.trips set vehicle_id=p_vehicle_id,driver_id=p_driver_id,origin_label=private.normalize_label(p_origin_label),destination_label=private.normalize_label(p_destination_label),planned_departure_at=p_planned_departure_at,planned_return_at=p_planned_return_at,purpose=private.normalize_label(p_purpose),notes=private.normalize_label(p_notes) where id=v.id;
  perform private.log_audit_event(c,'update','public.trips',v.id,jsonb_build_object('previous',jsonb_build_object('vehicleId',v.vehicle_id,'driverId',v.driver_id,'origin',v.origin_label,'destination',v.destination_label,'departure',v.planned_departure_at,'return',v.planned_return_at)),jsonb_build_object('rpc','save_trip'));
  r:=jsonb_build_object('tripId',v.id,'status','planned');
 end if;
 return private.finish_operation(c,p_command_id,r);
end $$;

create function public.interrupt_trip(p_trip_id uuid,p_end_odometer_km numeric,p_actual_return_at timestamptz,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.trips; d timestamptz:=coalesce(p_actual_return_at,now()); e public.vehicle_odometer_events;
begin
 perform private.assert_permission('trips.cancel');select * into v from public.trips where id=p_trip_id;
 if not found then raise exception 'TRIP_NOT_FOUND' using hint='NOT_FOUND';end if;perform private.assert_company_access(v.company_id);
 perform 1 from public.vehicles where id=v.vehicle_id for update;
 select * into v from public.trips where id=p_trip_id for update;
 if v.status<>'in_progress' then raise exception 'TRIP_INVALID_STATE' using hint='CONFLICT_STATE';end if;
 if p_end_odometer_km is null or p_end_odometer_km<v.start_odometer_km or d<v.actual_departure_at or d>now()+interval '5 minutes' or char_length(btrim(coalesce(p_reason,'')))<10 then raise exception 'INVALID_INPUT: confira retorno, quilometragem e motivo' using hint='VALIDATION_ERROR';end if;
 e:=private.record_odometer_event(v.vehicle_id,p_end_odometer_km,d,'trip_completion',v.id,p_reason);
 update public.trips set status='cancelled',actual_return_at=d,end_odometer_km=p_end_odometer_km,cancelled_at=now(),cancelled_by=private.current_user_id(),cancel_reason=p_reason where id=v.id;
 update public.vehicles set status=case when exists(select 1 from public.maintenance_records where vehicle_id=v.vehicle_id and status='in_progress') then 'in_maintenance'::public.vehicle_status else 'available'::public.vehicle_status end where id=v.vehicle_id and status='in_use';
 perform private.log_audit_event(v.company_id,'execute','public.trips',v.id,jsonb_build_object('status',jsonb_build_object('old','in_progress','new','cancelled'),'distanceKm',p_end_odometer_km-v.start_odometer_km),jsonb_build_object('rpc','interrupt_trip','reason',p_reason));
 return jsonb_build_object('tripId',v.id,'status','cancelled','interrupted',true,'odometerEventId',e.id,'distanceKm',p_end_odometer_km-v.start_odometer_km);
end $$;

create function public.trip_operation(p_trip_id uuid,p_action text,p_odometer_km numeric,p_occurred_at timestamptz,p_location_id uuid,p_reason text,p_command_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.trips; r jsonb; movimento jsonb;
begin
 perform private.assert_permission(case when p_action='interrupt' then 'trips.cancel' else 'trips.write' end);
 select * into v from public.trips where id=p_trip_id;
 if not found then raise exception 'TRIP_NOT_FOUND' using hint='NOT_FOUND';end if;perform private.assert_company_access(v.company_id);
 r:=private.begin_operation(v.company_id,p_command_id,'trip_operation',jsonb_build_array(p_trip_id,p_action,p_odometer_km,p_occurred_at,p_location_id,p_reason));if r is not null then return r;end if;
 case p_action when 'start' then r:=public.start_trip(p_trip_id,p_occurred_at,p_odometer_km);
 when 'complete' then r:=public.complete_trip(p_trip_id,p_odometer_km,p_occurred_at,p_reason);
 when 'interrupt' then r:=public.interrupt_trip(p_trip_id,p_odometer_km,p_occurred_at,p_reason);
 else raise exception 'INVALID_INPUT: ação de viagem inválida' using hint='VALIDATION_ERROR';end case;
 if p_location_id is not null then
  select * into v from public.trips where id=p_trip_id;
  movimento:=public.movement_command(v.vehicle_id,p_location_id,case when p_action='start' then 'exit'::public.movement_type else 'entry'::public.movement_type end,p_occurred_at,gen_random_uuid(),'Passagem vinculada à viagem '||p_trip_id::text);
  r:=r||jsonb_build_object('movement',movimento);
 end if;
 return private.finish_operation(v.company_id,p_command_id,r);
end $$;

revoke all on function public.set_initial_presence(uuid,text,uuid,text,uuid),public.movement_command(uuid,uuid,public.movement_type,timestamptz,uuid,text),public.save_trip(uuid,uuid,uuid,text,text,timestamptz,timestamptz,text,text,uuid),public.interrupt_trip(uuid,numeric,timestamptz,text),public.trip_operation(uuid,text,numeric,timestamptz,uuid,text,uuid) from public,anon,service_role;
grant execute on function public.set_initial_presence(uuid,text,uuid,text,uuid),public.movement_command(uuid,uuid,public.movement_type,timestamptz,uuid,text),public.save_trip(uuid,uuid,uuid,text,text,timestamptz,timestamptz,text,text,uuid),public.interrupt_trip(uuid,numeric,timestamptz,text),public.trip_operation(uuid,text,numeric,timestamptz,uuid,text,uuid) to authenticated;
commit;
