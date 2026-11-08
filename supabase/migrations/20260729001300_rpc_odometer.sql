-- =============================================================================
-- PegaNaFrota — 001300 — Odômetro (ADR-006)
-- =============================================================================
-- private.record_odometer_event é o ÚNICO caminho de escrita do ledger e o
-- único caminho de atualização de vehicles.current_odometer_km. Todas as demais
-- RPCs transacionais (viagem, abastecimento, manutenção) passam por aqui.
--
-- Ordem de lock padronizada em todo o projeto: VEÍCULO primeiro, depois o
-- documento (viagem/manutenção). Isso evita deadlock entre RPCs concorrentes.
-- =============================================================================

create or replace function private.record_odometer_event(
  p_vehicle_id       uuid,
  p_odometer_km      numeric,
  p_occurred_at      timestamptz,
  p_source_type      public.odometer_source_type,
  p_source_id        uuid default null,
  p_reason           text default null,
  p_correction_of_id uuid default null
)
returns public.vehicle_odometer_events
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_vehicle public.vehicles;
  v_event   public.vehicle_odometer_events;
begin
  if p_odometer_km is null then
    raise exception 'VALIDATION_ERROR: odometer_km é obrigatório'
      using errcode = '22004', hint = 'VALIDATION_ERROR';
  end if;

  -- Lock da linha do veículo: serializa qualquer outra RPC do mesmo veículo.
  select * into v_vehicle
  from public.vehicles
  where id = p_vehicle_id
  for update;

  if not found then
    raise exception 'VEHICLE_NOT_FOUND: veículo % não existe', p_vehicle_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  perform private.assert_company_access(v_vehicle.company_id);

  if v_vehicle.archived_at is not null then
    raise exception 'VEHICLE_ARCHIVED: veículo % está arquivado', p_vehicle_id
      using errcode = '42501', hint = 'CONFLICT_ARCHIVED';
  end if;

  -- Garantia central: quilometragem nunca regride.
  if p_odometer_km < v_vehicle.current_odometer_km then
    raise exception
      'ODOMETER_REGRESSION: % é menor que a quilometragem atual (%) do veículo %',
      p_odometer_km, v_vehicle.current_odometer_km, p_vehicle_id
      using errcode = '23514', hint = 'ODOMETER_REGRESSION';
  end if;

  insert into public.vehicle_odometer_events (
    company_id, vehicle_id, occurred_at, odometer_km, previous_km,
    source_type, source_id, reason, correction_of_id, created_by
  )
  values (
    v_vehicle.company_id,
    p_vehicle_id,
    coalesce(p_occurred_at, now()),
    p_odometer_km,
    v_vehicle.current_odometer_km,
    p_source_type,
    p_source_id,
    private.normalize_label(p_reason),
    p_correction_of_id,
    private.current_user_id()
  )
  returning * into v_event;

  -- Cache derivado. O trigger de guarda permite porque estamos em SECURITY DEFINER.
  update public.vehicles
     set current_odometer_km = p_odometer_km
   where id = p_vehicle_id
     and current_odometer_km <> p_odometer_km;

  return v_event;
end;
$$;

comment on function private.record_odometer_event is
  'Única porta de escrita do ledger de odômetro. Lock no veículo + validação de não regressão.';

-- -----------------------------------------------------------------------------
-- Ajuste manual autorizado
-- -----------------------------------------------------------------------------
create or replace function public.register_odometer_reading(
  p_vehicle_id       uuid,
  p_odometer_km      numeric,
  p_reason           text,
  p_occurred_at      timestamptz default now(),
  p_correction_of_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event public.vehicle_odometer_events;
begin
  perform private.assert_permission('odometer.adjust');

  if private.normalize_label(p_reason) is null then
    raise exception 'VALIDATION_ERROR: justificativa é obrigatória no ajuste manual'
      using errcode = '22004', hint = 'VALIDATION_ERROR';
  end if;

  v_event := private.record_odometer_event(
    p_vehicle_id  => p_vehicle_id,
    p_odometer_km => p_odometer_km,
    p_occurred_at => coalesce(p_occurred_at, now()),
    p_source_type => 'manual_adjustment',
    p_source_id   => null,
    p_reason      => p_reason,
    p_correction_of_id => p_correction_of_id
  );

  perform private.log_audit_event(
    v_event.company_id,
    'execute',
    'public.vehicle_odometer_events',
    v_event.id,
    jsonb_build_object(
      'odometer_km', jsonb_build_object('old', v_event.previous_km, 'new', v_event.odometer_km)
    ),
    jsonb_build_object('rpc', 'register_odometer_reading', 'vehicle_id', p_vehicle_id)
  );

  return jsonb_build_object(
    'eventId', v_event.id,
    'vehicleId', v_event.vehicle_id,
    'odometerKm', v_event.odometer_km,
    'previousKm', v_event.previous_km,
    'occurredAt', v_event.occurred_at,
    'sourceType', v_event.source_type
  );
end;
$$;

comment on function public.register_odometer_reading is
  'Ajuste manual de quilometragem. Exige permissão odometer.adjust e justificativa. Sempre auditado.';

-- -----------------------------------------------------------------------------
-- Histórico paginado
-- -----------------------------------------------------------------------------
create or replace function public.vehicle_odometer_history(
  p_vehicle_id uuid,
  p_page       integer default 1,
  p_page_size  integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company   uuid;
  v_page      integer := greatest(coalesce(p_page, 1), 1);
  v_size      integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_total     bigint;
  v_items     jsonb;
begin
  perform private.assert_permission('odometer.read');
  v_company := private.current_user_company_id();

  select count(*) into v_total
  from public.vehicle_odometer_events e
  where e.company_id = v_company and e.vehicle_id = p_vehicle_id;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.occurred_at desc), '[]'::jsonb)
    into v_items
  from (
    select e.id, e.occurred_at, e.odometer_km, e.previous_km,
           e.source_type, e.source_id, e.reason, e.created_by, e.created_at
    from public.vehicle_odometer_events e
    where e.company_id = v_company and e.vehicle_id = p_vehicle_id
    order by e.occurred_at desc, e.created_at desc
    limit v_size offset (v_page - 1) * v_size
  ) t;

  return jsonb_build_object(
    'items', v_items,
    'page', v_page,
    'pageSize', v_size,
    'total', v_total,
    'hasNext', (v_page * v_size) < v_total
  );
end;
$$;

revoke all on function public.register_odometer_reading(uuid, numeric, text, timestamptz, uuid) from public;
revoke all on function public.vehicle_odometer_history(uuid, integer, integer) from public;
grant execute on function public.register_odometer_reading(uuid, numeric, text, timestamptz, uuid) to authenticated;
grant execute on function public.vehicle_odometer_history(uuid, integer, integer) to authenticated;
