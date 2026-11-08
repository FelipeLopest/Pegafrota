-- =============================================================================
-- PegaNaFrota — 20260731000400 — Ordem de locks padronizada
-- =============================================================================
-- Corrige DB-AUD-008.
--
-- start_trip / complete_trip / start_maintenance / complete_maintenance já
-- bloqueavam VEÍCULO -> DOCUMENTO. cancel_trip e cancel_maintenance faziam o
-- inverso (DOCUMENTO -> VEÍCULO), o que fecha um ciclo de espera entre duas
-- transações concorrentes e produz deadlock real.
--
-- Ordem única do projeto, agora sem exceção:
--   resolver IDs sem lock -> lock no veículo -> lock no documento
--   -> revalidar estado -> alterar
-- =============================================================================

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
  v_trip    public.trips;
  v_vehicle public.vehicles;
begin
  perform private.assert_permission('trips.cancel');

  if private.normalize_label(p_reason) is null then
    raise exception 'VALIDATION_ERROR: motivo do cancelamento é obrigatório'
      using errcode = '22004', hint = 'VALIDATION_ERROR';
  end if;

  -- (1) resolver os IDs SEM lock.
  select * into v_trip from public.trips where id = p_trip_id;
  if not found then
    raise exception 'TRIP_NOT_FOUND: viagem % não existe', p_trip_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_trip.company_id);

  -- (2) veículo primeiro, (3) documento depois — mesma ordem de start/complete.
  select * into v_vehicle from public.vehicles where id = v_trip.vehicle_id for update;
  select * into v_trip    from public.trips    where id = p_trip_id           for update;

  -- (4) revalidar já com os locks em mãos.
  if v_trip.status not in ('planned', 'in_progress') then
    raise exception 'TRIP_INVALID_STATE: viagem em % não pode ser cancelada', v_trip.status
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  -- (5) alterar.
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

  -- Viagem cancelada nunca gera evento de odômetro: o ledger permanece intacto.
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

comment on function public.cancel_trip(uuid, text) is
  'Cancela viagem. Ordem de lock veículo -> viagem, idêntica a start/complete (DB-AUD-008).';

create or replace function public.cancel_maintenance(
  p_maintenance_id uuid,
  p_reason         text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_record  public.maintenance_records;
  v_vehicle public.vehicles;
  v_other   integer;
begin
  perform private.assert_permission('maintenance.write');

  if private.normalize_label(p_reason) is null then
    raise exception 'VALIDATION_ERROR: motivo do cancelamento é obrigatório'
      using errcode = '22004', hint = 'VALIDATION_ERROR';
  end if;

  -- (1) resolver os IDs SEM lock.
  select * into v_record from public.maintenance_records where id = p_maintenance_id;
  if not found then
    raise exception 'MAINTENANCE_NOT_FOUND: manutenção % não existe', p_maintenance_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_record.company_id);

  -- (2) veículo primeiro, (3) documento depois.
  select * into v_vehicle from public.vehicles            where id = v_record.vehicle_id for update;
  select * into v_record  from public.maintenance_records where id = p_maintenance_id    for update;

  -- (4) revalidar já com os locks em mãos.
  if v_record.status not in ('scheduled', 'in_progress') then
    raise exception 'MAINTENANCE_INVALID_STATE: manutenção em % não pode ser cancelada', v_record.status
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  -- (5) alterar.
  update public.maintenance_records
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = private.current_user_id(),
         cancel_reason = private.normalize_label(p_reason)
   where id = p_maintenance_id;

  -- DB-AUD-009: o veículo só volta a ficar disponível se nenhuma outra
  -- manutenção seguir em andamento.
  select count(*) into v_other
  from public.maintenance_records m
  where m.vehicle_id = v_record.vehicle_id
    and m.status = 'in_progress'
    and m.id <> p_maintenance_id;

  if v_other = 0 then
    update public.vehicles set status = 'available'
     where id = v_record.vehicle_id and status = 'in_maintenance';
  end if;

  perform private.log_audit_event(
    v_record.company_id, 'execute', 'public.maintenance_records', p_maintenance_id,
    jsonb_build_object('status', jsonb_build_object('old', v_record.status, 'new', 'cancelled')),
    jsonb_build_object('rpc', 'cancel_maintenance')
  );

  return jsonb_build_object('maintenanceId', p_maintenance_id, 'status', 'cancelled');
end;
$$;

comment on function public.cancel_maintenance(uuid, text) is
  'Cancela manutenção. Ordem de lock veículo -> manutenção, idêntica a start/complete (DB-AUD-008).';
