-- As leituras originais permanecem no histórico. Os documentos operacionais
-- passam a refletir a correção aprovada e a saída entra no mesmo odômetro.
begin;

create function private.tg_registrar_odometro_partida()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.record_odometer_event(
    new.vehicle_id, new.start_odometer_km, new.actual_departure_at,
    'trip_departure', new.id
  );
  return new;
end;
$$;

create trigger trips_odometer_departure
after update of status on public.trips
for each row when (old.status = 'planned' and new.status = 'in_progress')
execute function private.tg_registrar_odometro_partida();

-- A saída já gravada na viagem também serve de limite para viagens abertas
-- na versão anterior, mesmo quando a leitura ainda não consta no histórico.
create function private.odometer_departure_floor(p_vehicle uuid, p_date timestamptz)
returns numeric
language sql stable security definer
set search_path = ''
as $$
  select max(t.start_odometer_km)::numeric
  from public.trips t
  where t.vehicle_id = p_vehicle and t.status = 'in_progress'
    and (p_date is null or t.actual_departure_at <= p_date)
$$;

create or replace function private.refresh_odometer(p_vehicle uuid)
returns numeric
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_km numeric;
begin
  select effective_km into v_km
    from private.effective_odometer_events
    where vehicle_id = p_vehicle
    order by occurred_at desc, created_at desc, id desc limit 1;
  if v_km is null then
    select odometer_km into v_km from private.odometer_baselines where vehicle_id = p_vehicle;
  end if;
  v_km := greatest(v_km, private.odometer_departure_floor(p_vehicle, null));
  update public.vehicles set current_odometer_km = coalesce(v_km, current_odometer_km)
    where id = p_vehicle returning current_odometer_km into v_km;
  return v_km;
end;
$$;

create or replace function private.tg_odometer_ledger_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_anterior numeric;
  v_seguinte numeric;
  v_corrigido public.vehicle_odometer_events;
begin
  if new.occurred_at > now() + interval '5 minutes' then
    raise exception 'ODOMETER_FUTURE_EVENT: data no futuro' using hint = 'CHRONOLOGY_ERROR';
  end if;
  if exists (
    select 1 from private.odometer_revisions r
    where r.correction_event_id = new.id and r.vehicle_id = new.vehicle_id
  ) then
    select * into v_corrigido from public.vehicle_odometer_events
      where id = new.correction_of_id and vehicle_id = new.vehicle_id;
    if not found then
      raise exception 'ODOMETER_CORRECTION_TARGET_NOT_FOUND' using hint = 'NOT_FOUND';
    end if;
    new.corrected_from_km := v_corrigido.odometer_km;
    new.previous_km := new.odometer_km;
    return new;
  end if;

  select effective_km into v_anterior
    from private.effective_odometer_events
    where vehicle_id = new.vehicle_id and occurred_at <= new.occurred_at
    order by occurred_at desc, created_at desc, id desc limit 1;
  select effective_km into v_seguinte
    from private.effective_odometer_events
    where vehicle_id = new.vehicle_id and occurred_at > new.occurred_at
    order by occurred_at, created_at, id limit 1;
  if v_anterior is null then
    select odometer_km into v_anterior from private.odometer_baselines where vehicle_id = new.vehicle_id;
  end if;
  -- A própria saída deve guardar a leitura anterior real. Demais eventos
  -- contam a saída legada como limite mínimo a partir do seu horário.
  if new.source_type <> 'trip_departure' then
    v_anterior := greatest(v_anterior, private.odometer_departure_floor(new.vehicle_id, new.occurred_at));
  end if;
  if new.odometer_km < coalesce(v_anterior, 0)
     or (v_seguinte is not null and new.odometer_km > v_seguinte) then
    raise exception 'ODOMETER_CHRONOLOGY_CONFLICT: leitura não cabe entre as leituras válidas anterior (%) e posterior (%)',
      v_anterior, v_seguinte using errcode = '23514', hint = 'ODOMETER_REGRESSION';
  end if;
  new.previous_km := coalesce(v_anterior, 0);
  if new.correction_of_id is not null then
    select * into v_corrigido from public.vehicle_odometer_events
      where id = new.correction_of_id and vehicle_id = new.vehicle_id;
    if not found or private.normalize_label(new.reason) is null then
      raise exception 'ODOMETER_CORRECTION_INVALID' using hint = 'VALIDATION_ERROR';
    end if;
    new.corrected_from_km := v_corrigido.odometer_km;
  end if;
  return new;
end;
$$;

create function private.tg_refletir_correcao_odometro()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_evento public.vehicle_odometer_events;
  v_viagem public.trips;
  v_saida numeric;
  v_retorno numeric;
begin
  select * into strict v_evento from public.vehicle_odometer_events
    where id = new.event_id and vehicle_id = new.vehicle_id and company_id = new.company_id;

  if v_evento.source_type <> 'trip_departure'
     and new.corrected_km < private.odometer_departure_floor(new.vehicle_id, v_evento.occurred_at) then
    raise exception 'ODOMETER_CHRONOLOGY_CONFLICT: a leitura não pode ficar abaixo da saída da viagem aberta'
      using errcode = '23514', hint = 'ODOMETER_REGRESSION';
  end if;

  if v_evento.source_type in ('trip_departure', 'trip_completion') then
    -- correct_odometer já bloqueia o veículo antes do documento.
    select * into strict v_viagem from public.trips
      where id = v_evento.source_id and vehicle_id = new.vehicle_id and company_id = new.company_id
      for update;
    v_saida := v_viagem.start_odometer_km;
    v_retorno := v_viagem.end_odometer_km;
    if v_evento.source_type = 'trip_departure' then
      v_saida := new.corrected_km;
    else
      v_retorno := new.corrected_km;
    end if;
    if v_retorno is not null and
       (v_retorno < v_saida or (v_viagem.status = 'completed' and v_retorno = v_saida)) then
      raise exception 'TRIP_ODOMETER_INVALID: a leitura de retorno precisa respeitar a leitura de saída'
        using errcode = '23514', hint = 'ODOMETER_REGRESSION';
    end if;
    -- As leituras originais e cada correção continuam no histórico
    -- append-only. A linha de viagem muda só os valores operacionais.
    update public.trips set start_odometer_km = v_saida, end_odometer_km = v_retorno
      where id = v_viagem.id;
  elsif v_evento.source_type = 'maintenance_completion' then
    -- Só o próximo agendamento aberto é recalculado. Revisões iniciadas,
    -- finalizadas ou arquivadas preservam os valores usados na operação.
    update public.maintenance_records proxima
      set scheduled_odometer_km = new.corrected_km + plano.interval_km
      from public.maintenance_plans plano
      where proxima.previous_maintenance_id = v_evento.source_id
        and proxima.plan_id = plano.id and plano.interval_km is not null
        and proxima.company_id = new.company_id and proxima.vehicle_id = new.vehicle_id
        and proxima.status = 'scheduled' and proxima.archived_at is null;
  end if;
  return new;
end;
$$;

create trigger odometer_revisions_propagate
after insert on private.odometer_revisions
for each row execute function private.tg_refletir_correcao_odometro();

-- Atualize somente viagens abertas legadas, se a quilometragem de saída
-- ainda é superior à mostrada na ficha. Não reescreva eventos históricos.
update public.vehicles v
set current_odometer_km = t.start_odometer_km
from public.trips t
where t.vehicle_id = v.id and t.company_id = v.company_id
  and t.status = 'in_progress' and t.start_odometer_km > v.current_odometer_km;

revoke all on function private.tg_registrar_odometro_partida(),
  private.odometer_departure_floor(uuid, timestamptz), private.tg_refletir_correcao_odometro()
from public, anon, authenticated, service_role;
commit;
