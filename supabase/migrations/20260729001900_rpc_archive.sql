-- =============================================================================
-- PegaNaFrota — 001900 — Arquivamento (ADR-005)
-- =============================================================================
-- Nenhuma entidade com histórico é apagada. As policies não concedem DELETE e
-- as foreign keys usam on delete restrict; o arquivamento é o caminho oficial.
-- =============================================================================

create or replace function public.archive_vehicle(
  p_vehicle_id uuid,
  p_reason     text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_vehicle    public.vehicles;
  v_open_trips integer;
  v_open_maint integer;
begin
  perform private.assert_permission('vehicles.archive');

  select * into v_vehicle from public.vehicles where id = p_vehicle_id for update;
  if not found then
    raise exception 'VEHICLE_NOT_FOUND: veículo % não existe', p_vehicle_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_vehicle.company_id);

  if v_vehicle.archived_at is not null then
    return jsonb_build_object('vehicleId', p_vehicle_id, 'status', 'archived', 'alreadyArchived', true);
  end if;

  select count(*) into v_open_trips
  from public.trips
  where vehicle_id = p_vehicle_id and status in ('planned', 'in_progress');

  if v_open_trips > 0 then
    raise exception 'VEHICLE_HAS_OPEN_TRIPS: % viagem(ns) em aberto impedem o arquivamento', v_open_trips
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  select count(*) into v_open_maint
  from public.maintenance_records
  where vehicle_id = p_vehicle_id and status in ('scheduled', 'in_progress');

  if v_open_maint > 0 then
    raise exception 'VEHICLE_HAS_OPEN_MAINTENANCE: % manutenção(ões) em aberto impedem o arquivamento',
      v_open_maint
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  update public.vehicles
     set status = 'archived',
         archived_at = now(),
         archived_by = private.current_user_id(),
         notes = case
           when private.normalize_label(p_reason) is null then notes
           else coalesce(notes || E'\n', '') || 'Arquivado: ' || private.normalize_label(p_reason)
         end
   where id = p_vehicle_id;

  return jsonb_build_object(
    'vehicleId', p_vehicle_id,
    'plate', v_vehicle.plate,
    'status', 'archived',
    'archivedAt', now(),
    'alreadyArchived', false
  );
end;
$$;

comment on function public.archive_vehicle is
  'Arquiva o veículo preservando todo o histórico. Recusa se houver viagem ou manutenção em aberto.';

create or replace function public.unarchive_vehicle(p_vehicle_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_vehicle public.vehicles;
begin
  perform private.assert_permission('vehicles.archive');

  select * into v_vehicle from public.vehicles where id = p_vehicle_id for update;
  if not found then
    raise exception 'VEHICLE_NOT_FOUND: veículo % não existe', p_vehicle_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_vehicle.company_id);

  if v_vehicle.archived_at is null then
    return jsonb_build_object('vehicleId', p_vehicle_id, 'status', v_vehicle.status, 'changed', false);
  end if;

  update public.vehicles
     set status = 'available', archived_at = null, archived_by = null
   where id = p_vehicle_id;

  return jsonb_build_object('vehicleId', p_vehicle_id, 'status', 'available', 'changed', true);
end;
$$;

create or replace function public.archive_driver(
  p_driver_id uuid,
  p_reason    text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_driver     public.drivers;
  v_open_trips integer;
begin
  perform private.assert_permission('drivers.archive');

  select * into v_driver from public.drivers where id = p_driver_id for update;
  if not found then
    raise exception 'DRIVER_NOT_FOUND: motorista % não existe', p_driver_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_driver.company_id);

  if v_driver.archived_at is not null then
    return jsonb_build_object('driverId', p_driver_id, 'alreadyArchived', true);
  end if;

  select count(*) into v_open_trips
  from public.trips
  where driver_id = p_driver_id and status in ('planned', 'in_progress');

  if v_open_trips > 0 then
    raise exception 'DRIVER_HAS_OPEN_TRIPS: % viagem(ns) em aberto impedem o arquivamento', v_open_trips
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  update public.drivers
     set active = false,
         archived_at = now(),
         archived_by = private.current_user_id(),
         notes = case
           when private.normalize_label(p_reason) is null then notes
           else coalesce(notes || E'\n', '') || 'Arquivado: ' || private.normalize_label(p_reason)
         end
   where id = p_driver_id;

  return jsonb_build_object('driverId', p_driver_id, 'archivedAt', now(), 'alreadyArchived', false);
end;
$$;

revoke all on function public.archive_vehicle(uuid, text)   from public;
revoke all on function public.unarchive_vehicle(uuid)       from public;
revoke all on function public.archive_driver(uuid, text)    from public;

grant execute on function public.archive_vehicle(uuid, text) to authenticated;
grant execute on function public.unarchive_vehicle(uuid)     to authenticated;
grant execute on function public.archive_driver(uuid, text)  to authenticated;
