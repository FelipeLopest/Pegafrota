-- =============================================================================
-- PegaNaFrota — 001400 — Viagens
-- =============================================================================
-- A criação de viagem planejada é INSERT direto sob RLS. Iniciar, concluir e
-- cancelar são transacionais porque tocam o veículo e o ledger de odômetro.
-- =============================================================================

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

-- -----------------------------------------------------------------------------
-- Conclusão: atualiza viagem, ledger e veículo em uma única transação
-- -----------------------------------------------------------------------------
create or replace function public.complete_trip(
  p_trip_id          uuid,
  p_end_odometer_km  numeric,
  p_actual_return_at timestamptz default now(),
  p_notes            text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_trip    public.trips;
  v_vehicle public.vehicles;
  v_event   public.vehicle_odometer_events;
  v_return  timestamptz := coalesce(p_actual_return_at, now());
begin
  perform private.assert_permission('trips.write');

  select * into v_trip from public.trips where id = p_trip_id;
  if not found then
    raise exception 'TRIP_NOT_FOUND: viagem % não existe', p_trip_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_trip.company_id);

  select * into v_vehicle from public.vehicles where id = v_trip.vehicle_id for update;
  select * into v_trip from public.trips where id = p_trip_id for update;

  if v_trip.status <> 'in_progress' then
    raise exception 'TRIP_INVALID_STATE: só é possível concluir viagem em andamento (atual: %)',
      v_trip.status
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  if p_end_odometer_km is null then
    raise exception 'VALIDATION_ERROR: quilometragem final é obrigatória'
      using errcode = '22004', hint = 'VALIDATION_ERROR';
  end if;

  -- Garantia: quilometragem final maior que a inicial.
  if p_end_odometer_km <= v_trip.start_odometer_km then
    raise exception 'TRIP_ODOMETER_INVALID: final (%) deve ser maior que inicial (%)',
      p_end_odometer_km, v_trip.start_odometer_km
      using errcode = '23514', hint = 'VALIDATION_ERROR';
  end if;

  -- Garantia: retorno não antecede a saída.
  if v_return < v_trip.actual_departure_at then
    raise exception 'TRIP_CHRONOLOGY_INVALID: retorno (%) antes da saída (%)',
      v_return, v_trip.actual_departure_at
      using errcode = '22007', hint = 'CHRONOLOGY_ERROR';
  end if;

  if v_return > now() + interval '5 minutes' then
    raise exception 'VALIDATION_ERROR: data de retorno não pode estar no futuro'
      using errcode = '22007', hint = 'CHRONOLOGY_ERROR';
  end if;

  -- Ledger primeiro: se a quilometragem for inválida, nada é gravado.
  v_event := private.record_odometer_event(
    p_vehicle_id  => v_trip.vehicle_id,
    p_odometer_km => p_end_odometer_km,
    p_occurred_at => v_return,
    p_source_type => 'trip_completion',
    p_source_id   => p_trip_id,
    p_reason      => null
  );

  update public.trips
     set status = 'completed',
         actual_return_at = v_return,
         end_odometer_km = p_end_odometer_km,
         notes = coalesce(private.normalize_label(p_notes), notes)
   where id = p_trip_id;

  update public.vehicles
     set status = 'available'
   where id = v_trip.vehicle_id
     and status = 'in_use';

  perform private.log_audit_event(
    v_trip.company_id, 'execute', 'public.trips', p_trip_id,
    jsonb_build_object(
      'status', jsonb_build_object('old', v_trip.status, 'new', 'completed'),
      'end_odometer_km', jsonb_build_object('old', null, 'new', p_end_odometer_km)
    ),
    jsonb_build_object('rpc', 'complete_trip', 'odometer_event_id', v_event.id)
  );

  return jsonb_build_object(
    'tripId', p_trip_id,
    'status', 'completed',
    'vehicleId', v_trip.vehicle_id,
    'actualReturnAt', v_return,
    'startOdometerKm', v_trip.start_odometer_km,
    'endOdometerKm', p_end_odometer_km,
    'distanceKm', p_end_odometer_km - v_trip.start_odometer_km,
    'odometerEventId', v_event.id
  );
end;
$$;

comment on function public.complete_trip is
  'Conclusão transacional: valida cronologia e quilometragem, cria evento no ledger e libera o veículo.';

-- -----------------------------------------------------------------------------
-- Cancelamento
-- -----------------------------------------------------------------------------
create or replace function public.cancel_trip(
  p_trip_id uuid,
  p_reason  text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_trip public.trips;
begin
  perform private.assert_permission('trips.cancel');

  if private.normalize_label(p_reason) is null then
    raise exception 'VALIDATION_ERROR: motivo do cancelamento é obrigatório'
      using errcode = '22004', hint = 'VALIDATION_ERROR';
  end if;

  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found then
    raise exception 'TRIP_NOT_FOUND: viagem % não existe', p_trip_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_trip.company_id);

  if v_trip.status not in ('planned', 'in_progress') then
    raise exception 'TRIP_INVALID_STATE: viagem em % não pode ser cancelada', v_trip.status
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  update public.trips
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = private.current_user_id(),
         cancel_reason = private.normalize_label(p_reason),
         actual_departure_at = null,
         actual_return_at = null,
         start_odometer_km = null,
         end_odometer_km = null
   where id = p_trip_id;

  -- Uma viagem cancelada nunca gera evento de odômetro: o ledger permanece
  -- intacto e a quilometragem do veículo não é afetada.
  update public.vehicles
     set status = 'available'
   where id = v_trip.vehicle_id
     and status = 'in_use';

  perform private.log_audit_event(
    v_trip.company_id, 'execute', 'public.trips', p_trip_id,
    jsonb_build_object('status', jsonb_build_object('old', v_trip.status, 'new', 'cancelled')),
    jsonb_build_object('rpc', 'cancel_trip', 'reason', private.normalize_label(p_reason))
  );

  return jsonb_build_object('tripId', p_trip_id, 'status', 'cancelled');
end;
$$;

revoke all on function public.start_trip(uuid, timestamptz, numeric) from public;
revoke all on function public.complete_trip(uuid, numeric, timestamptz, text) from public;
revoke all on function public.cancel_trip(uuid, text) from public;

grant execute on function public.start_trip(uuid, timestamptz, numeric) to authenticated;
grant execute on function public.complete_trip(uuid, numeric, timestamptz, text) to authenticated;
grant execute on function public.cancel_trip(uuid, text) to authenticated;
