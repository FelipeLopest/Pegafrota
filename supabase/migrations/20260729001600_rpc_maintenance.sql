-- =============================================================================
-- PegaNaFrota — 001600 — Manutenções
-- =============================================================================
-- Agendar é INSERT direto (RLS exige maintenance.schedule).
-- Iniciar, concluir e cancelar são transacionais.
-- =============================================================================

create or replace function public.start_maintenance(
  p_maintenance_id uuid,
  p_started_at     timestamptz default now()
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
  v_started timestamptz := coalesce(p_started_at, now());
begin
  perform private.assert_permission('maintenance.write');

  select * into v_record from public.maintenance_records where id = p_maintenance_id;
  if not found then
    raise exception 'MAINTENANCE_NOT_FOUND: manutenção % não existe', p_maintenance_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_record.company_id);

  select * into v_vehicle from public.vehicles where id = v_record.vehicle_id for update;
  select * into v_record from public.maintenance_records where id = p_maintenance_id for update;

  if v_record.status <> 'scheduled' then
    raise exception 'MAINTENANCE_INVALID_STATE: manutenção em % não pode ser iniciada', v_record.status
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  if v_vehicle.status = 'in_use' then
    raise exception 'VEHICLE_IN_USE: veículo % está em viagem', v_vehicle.id
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  update public.maintenance_records
     set status = 'in_progress', started_at = v_started
   where id = p_maintenance_id;

  update public.vehicles set status = 'in_maintenance'
   where id = v_vehicle.id and status not in ('archived', 'in_maintenance');

  perform private.log_audit_event(
    v_record.company_id, 'execute', 'public.maintenance_records', p_maintenance_id,
    jsonb_build_object('status', jsonb_build_object('old', v_record.status, 'new', 'in_progress')),
    jsonb_build_object('rpc', 'start_maintenance')
  );

  return jsonb_build_object(
    'maintenanceId', p_maintenance_id,
    'status', 'in_progress',
    'vehicleId', v_vehicle.id,
    'startedAt', v_started
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Conclusão
-- -----------------------------------------------------------------------------
create or replace function public.complete_maintenance(
  p_maintenance_id         uuid,
  p_total_cost             numeric,
  p_completed_at           timestamptz default now(),
  p_completion_odometer_km numeric default null,
  p_supplier_name          text default null,
  p_invoice_number         text default null,
  p_notes                  text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_record    public.maintenance_records;
  v_vehicle   public.vehicles;
  v_event     public.vehicle_odometer_events;
  v_event_id  uuid;
  v_completed timestamptz := coalesce(p_completed_at, now());
begin
  perform private.assert_permission('maintenance.write');

  -- Garantia: valor de manutenção concluída maior que zero.
  if p_total_cost is null or p_total_cost <= 0 then
    raise exception 'MAINTENANCE_COST_INVALID: valor da manutenção concluída deve ser maior que zero'
      using errcode = '23514', hint = 'VALIDATION_ERROR';
  end if;

  select * into v_record from public.maintenance_records where id = p_maintenance_id;
  if not found then
    raise exception 'MAINTENANCE_NOT_FOUND: manutenção % não existe', p_maintenance_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_record.company_id);

  select * into v_vehicle from public.vehicles where id = v_record.vehicle_id for update;
  select * into v_record from public.maintenance_records where id = p_maintenance_id for update;

  if v_record.status not in ('scheduled', 'in_progress') then
    raise exception 'MAINTENANCE_INVALID_STATE: manutenção em % não pode ser concluída', v_record.status
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  if v_completed > now() + interval '5 minutes' then
    raise exception 'VALIDATION_ERROR: data de conclusão não pode estar no futuro'
      using errcode = '22007', hint = 'CHRONOLOGY_ERROR';
  end if;

  if v_record.started_at is not null and v_completed < v_record.started_at then
    raise exception 'MAINTENANCE_CHRONOLOGY_INVALID: conclusão (%) antes do início (%)',
      v_completed, v_record.started_at
      using errcode = '22007', hint = 'CHRONOLOGY_ERROR';
  end if;

  -- Garantia: conclusão cria evento de odômetro quando a quilometragem é informada.
  if p_completion_odometer_km is not null then
    v_event := private.record_odometer_event(
      p_vehicle_id  => v_record.vehicle_id,
      p_odometer_km => p_completion_odometer_km,
      p_occurred_at => v_completed,
      p_source_type => 'maintenance_completion',
      p_source_id   => p_maintenance_id,
      p_reason      => null
    );
    v_event_id := v_event.id;
  end if;

  update public.maintenance_records
     set status = 'completed',
         completed_at = v_completed,
         started_at = coalesce(started_at, v_completed),
         completion_odometer_km = p_completion_odometer_km,
         total_cost = round(p_total_cost, 2),
         supplier_name = coalesce(private.normalize_label(p_supplier_name), supplier_name),
         invoice_number = coalesce(private.normalize_label(p_invoice_number), invoice_number),
         notes = coalesce(private.normalize_label(p_notes), notes),
         -- Agendamento futuro deixa de fazer sentido em registro concluído.
         scheduled_for = case when scheduled_for > v_completed then null else scheduled_for end
   where id = p_maintenance_id;

  update public.vehicles set status = 'available'
   where id = v_record.vehicle_id and status = 'in_maintenance';

  perform private.log_audit_event(
    v_record.company_id, 'execute', 'public.maintenance_records', p_maintenance_id,
    jsonb_build_object(
      'status', jsonb_build_object('old', v_record.status, 'new', 'completed'),
      'total_cost', jsonb_build_object('old', v_record.total_cost, 'new', round(p_total_cost, 2))
    ),
    jsonb_build_object('rpc', 'complete_maintenance', 'odometer_event_id', v_event_id)
  );

  return jsonb_build_object(
    'maintenanceId', p_maintenance_id,
    'status', 'completed',
    'vehicleId', v_record.vehicle_id,
    'completedAt', v_completed,
    'totalCost', round(p_total_cost, 2),
    'completionOdometerKm', p_completion_odometer_km,
    'odometerEventId', v_event_id
  );
end;
$$;

comment on function public.complete_maintenance is
  'Conclui manutenção com custo obrigatório maior que zero e, quando informada, grava a quilometragem no ledger.';

-- -----------------------------------------------------------------------------
-- Cancelamento
-- -----------------------------------------------------------------------------
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
  v_record public.maintenance_records;
begin
  perform private.assert_permission('maintenance.write');

  if private.normalize_label(p_reason) is null then
    raise exception 'VALIDATION_ERROR: motivo do cancelamento é obrigatório'
      using errcode = '22004', hint = 'VALIDATION_ERROR';
  end if;

  select * into v_record from public.maintenance_records where id = p_maintenance_id for update;
  if not found then
    raise exception 'MAINTENANCE_NOT_FOUND: manutenção % não existe', p_maintenance_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
  perform private.assert_company_access(v_record.company_id);

  if v_record.status not in ('scheduled', 'in_progress') then
    raise exception 'MAINTENANCE_INVALID_STATE: manutenção em % não pode ser cancelada', v_record.status
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  update public.maintenance_records
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = private.current_user_id(),
         cancel_reason = private.normalize_label(p_reason)
   where id = p_maintenance_id;

  update public.vehicles set status = 'available'
   where id = v_record.vehicle_id and status = 'in_maintenance';

  perform private.log_audit_event(
    v_record.company_id, 'execute', 'public.maintenance_records', p_maintenance_id,
    jsonb_build_object('status', jsonb_build_object('old', v_record.status, 'new', 'cancelled')),
    jsonb_build_object('rpc', 'cancel_maintenance')
  );

  return jsonb_build_object('maintenanceId', p_maintenance_id, 'status', 'cancelled');
end;
$$;

revoke all on function public.start_maintenance(uuid, timestamptz) from public;
revoke all on function public.complete_maintenance(uuid, numeric, timestamptz, numeric, text, text, text) from public;
revoke all on function public.cancel_maintenance(uuid, text) from public;

grant execute on function public.start_maintenance(uuid, timestamptz) to authenticated;
grant execute on function public.complete_maintenance(uuid, numeric, timestamptz, numeric, text, text, text) to authenticated;
grant execute on function public.cancel_maintenance(uuid, text) to authenticated;
