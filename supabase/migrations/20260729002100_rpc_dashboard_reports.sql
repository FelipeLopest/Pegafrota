-- =============================================================================
-- PegaNaFrota — 002100 — Dashboard e relatórios
-- =============================================================================
-- Estas funções são SECURITY DEFINER e resolvem a empresa no servidor. O
-- cliente não envia company_id em nenhuma delas.
-- Intervalos de tempo são sempre explícitos (DATA_ACCESS.md §10).
-- =============================================================================

create or replace function public.dashboard_summary(
  p_from timestamptz default (now() - interval '30 days'),
  p_to   timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company uuid;
  v_from    timestamptz := coalesce(p_from, now() - interval '30 days');
  v_to      timestamptz := coalesce(p_to, now());
  v_fleet   jsonb;
  v_presence jsonb;
  v_ops     jsonb;
  v_costs   jsonb;
  v_alerts  jsonb;
begin
  perform private.assert_permission('dashboard.read');
  v_company := private.current_user_company_id();

  if v_to < v_from then
    raise exception 'VALIDATION_ERROR: intervalo inválido (fim antes do início)'
      using errcode = '22007', hint = 'VALIDATION_ERROR';
  end if;

  -- Frota por status
  select jsonb_build_object(
           'total', count(*),
           'available', count(*) filter (where status = 'available'),
           'inUse', count(*) filter (where status = 'in_use'),
           'inMaintenance', count(*) filter (where status = 'in_maintenance'),
           'inactive', count(*) filter (where status = 'inactive'),
           'archived', count(*) filter (where status = 'archived')
         )
    into v_fleet
  from public.vehicles where company_id = v_company;

  -- Dentro / fora
  select jsonb_build_object(
           'inside', count(*) filter (where last_type = 'entry'),
           'outside', count(*) filter (where last_type = 'exit'),
           'neverMoved', count(*) filter (where last_type is null)
         )
    into v_presence
  from (
    select (
      select mm.movement_type
      from public.vehicle_movements mm
      where mm.vehicle_id = v.id
      order by mm.sequence_no desc
      limit 1
    ) as last_type
    from public.vehicles v
    where v.company_id = v_company and v.archived_at is null
  ) t;

  -- Operação no período
  select jsonb_build_object(
           'tripsCompleted', (
             select count(*) from public.trips
             where company_id = v_company and status = 'completed'
               and actual_return_at between v_from and v_to
           ),
           'tripsInProgress', (
             select count(*) from public.trips
             where company_id = v_company and status = 'in_progress'
           ),
           'distanceKm', coalesce((
             select sum(end_odometer_km - start_odometer_km) from public.trips
             where company_id = v_company and status = 'completed'
               and actual_return_at between v_from and v_to
           ), 0),
           'fuelings', (
             select count(*) from public.fuelings
             where company_id = v_company and fueled_at between v_from and v_to
           ),
           'liters', coalesce((
             select sum(liters) from public.fuelings
             where company_id = v_company and fueled_at between v_from and v_to
           ), 0),
           'maintenanceCompleted', (
             select count(*) from public.maintenance_records
             where company_id = v_company and status = 'completed'
               and completed_at between v_from and v_to
           ),
           'movements', (
             select count(*) from public.vehicle_movements
             where company_id = v_company and occurred_at between v_from and v_to
           ),
           'plateReads', (
             select count(*) from public.plate_read_events
             where company_id = v_company and captured_at between v_from and v_to
           )
         )
    into v_ops;

  -- Custos no período
  select jsonb_build_object(
           'fuelCost', coalesce((
             select sum(total_amount) from public.fuelings
             where company_id = v_company and fueled_at between v_from and v_to
           ), 0)::numeric(14, 2),
           'maintenanceCost', coalesce((
             select sum(total_cost) from public.maintenance_records
             where company_id = v_company and status = 'completed'
               and completed_at between v_from and v_to
           ), 0)::numeric(14, 2),
           'totalCost', (
             coalesce((select sum(total_amount) from public.fuelings
                       where company_id = v_company and fueled_at between v_from and v_to), 0)
             + coalesce((select sum(total_cost) from public.maintenance_records
                         where company_id = v_company and status = 'completed'
                           and completed_at between v_from and v_to), 0)
           )::numeric(14, 2)
         )
    into v_costs;

  -- Alertas
  select jsonb_build_object(
           'maintenanceOverdue', (
             select count(*) from public.maintenance_records m
             join public.vehicles v on v.id = m.vehicle_id
             where m.company_id = v_company and m.status = 'scheduled'
               and (m.scheduled_for < now()
                    or (m.scheduled_odometer_km is not null
                        and v.current_odometer_km >= m.scheduled_odometer_km))
           ),
           'maintenanceNext30Days', (
             select count(*) from public.maintenance_records
             where company_id = v_company and status = 'scheduled'
               and scheduled_for between now() and now() + interval '30 days'
           ),
           'licenseExpiring', (
             select count(*) from public.drivers
             where company_id = v_company and active
               and license_expires_on is not null
               and license_expires_on <= (now() + interval '30 days')::date
           ),
           'unknownPlateReads', (
             select count(*) from public.plate_read_events
             where company_id = v_company and status = 'unknown_plate'
               and captured_at between v_from and v_to
           ),
           'lowConfidenceReads', (
             select count(*) from public.plate_read_events
             where company_id = v_company and status = 'low_confidence'
               and captured_at between v_from and v_to
           )
         )
    into v_alerts;

  return jsonb_build_object(
    'companyId', v_company,
    'period', jsonb_build_object('from', v_from, 'to', v_to),
    'fleet', v_fleet,
    'presence', v_presence,
    'operations', v_ops,
    'costs', v_costs,
    'alerts', v_alerts,
    'generatedAt', now()
  );
end;
$$;

comment on function public.dashboard_summary is
  'KPIs do dashboard em uma única chamada. Empresa resolvida no servidor, nunca recebida do cliente.';

-- ---------------------------------------------------------------------------
-- Custos mensais consolidados
-- ---------------------------------------------------------------------------
create or replace function public.report_monthly_costs(
  p_from timestamptz default (now() - interval '12 months'),
  p_to   timestamptz default now()
)
returns table (
  month_start      date,
  fuel_cost        numeric(14, 2),
  maintenance_cost numeric(14, 2),
  total_cost       numeric(14, 2),
  liters           numeric(12, 3),
  distance_km      numeric(12, 1)
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company  uuid;
  v_timezone text;
begin
  perform private.assert_permission('reports.read');
  v_company := private.current_user_company_id();

  select c.timezone into v_timezone from public.companies c where c.id = v_company;
  v_timezone := coalesce(v_timezone, 'UTC');

  return query
  with months as (
    select generate_series(
      date_trunc('month', coalesce(p_from, now() - interval '12 months') at time zone v_timezone),
      date_trunc('month', coalesce(p_to, now()) at time zone v_timezone),
      interval '1 month'
    )::date as m
  ),
  fuel as (
    select date_trunc('month', f.fueled_at at time zone v_timezone)::date as m,
           sum(f.total_amount)::numeric(14, 2) as cost,
           sum(f.liters)::numeric(12, 3) as lt
    from public.fuelings f
    where f.company_id = v_company
      and f.fueled_at between coalesce(p_from, now() - interval '12 months') and coalesce(p_to, now())
    group by 1
  ),
  maint as (
    select date_trunc('month', mr.completed_at at time zone v_timezone)::date as m,
           sum(mr.total_cost)::numeric(14, 2) as cost
    from public.maintenance_records mr
    where mr.company_id = v_company and mr.status = 'completed'
      and mr.completed_at between coalesce(p_from, now() - interval '12 months') and coalesce(p_to, now())
    group by 1
  ),
  dist as (
    select date_trunc('month', t.actual_return_at at time zone v_timezone)::date as m,
           sum(t.end_odometer_km - t.start_odometer_km)::numeric(12, 1) as km
    from public.trips t
    where t.company_id = v_company and t.status = 'completed'
      and t.actual_return_at between coalesce(p_from, now() - interval '12 months') and coalesce(p_to, now())
    group by 1
  )
  select
    months.m,
    coalesce(fuel.cost, 0)::numeric(14, 2),
    coalesce(maint.cost, 0)::numeric(14, 2),
    (coalesce(fuel.cost, 0) + coalesce(maint.cost, 0))::numeric(14, 2),
    coalesce(fuel.lt, 0)::numeric(12, 3),
    coalesce(dist.km, 0)::numeric(12, 1)
  from months
  left join fuel  on fuel.m  = months.m
  left join maint on maint.m = months.m
  left join dist  on dist.m  = months.m
  order by months.m;
end;
$$;

-- ---------------------------------------------------------------------------
-- Custo por veículo
-- ---------------------------------------------------------------------------
create or replace function public.report_vehicle_costs(
  p_from      timestamptz default (now() - interval '12 months'),
  p_to        timestamptz default now(),
  p_page      integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company uuid;
  v_page    integer := greatest(coalesce(p_page, 1), 1);
  v_size    integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_from    timestamptz := coalesce(p_from, now() - interval '12 months');
  v_to      timestamptz := coalesce(p_to, now());
  v_total   bigint;
  v_items   jsonb;
begin
  perform private.assert_permission('reports.read');
  v_company := private.current_user_company_id();

  select count(*) into v_total from public.vehicles where company_id = v_company;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.total_cost desc), '[]'::jsonb)
    into v_items
  from (
    select
      v.id           as vehicle_id,
      v.plate,
      v.brand,
      v.model,
      v.status,
      v.current_odometer_km,
      coalesce(f.fuel_cost, 0)::numeric(14, 2)     as fuel_cost,
      coalesce(f.liters, 0)::numeric(12, 3)        as liters,
      coalesce(m.maintenance_cost, 0)::numeric(14, 2) as maintenance_cost,
      (coalesce(f.fuel_cost, 0) + coalesce(m.maintenance_cost, 0))::numeric(14, 2) as total_cost,
      coalesce(tr.distance_km, 0)::numeric(12, 1)  as distance_km,
      round(
        (coalesce(f.fuel_cost, 0) + coalesce(m.maintenance_cost, 0))
        / nullif(coalesce(tr.distance_km, 0), 0), 4
      ) as cost_per_km
    from public.vehicles v
    left join (
      select vehicle_id, sum(total_amount) as fuel_cost, sum(liters) as liters
      from public.fuelings
      where company_id = v_company and fueled_at between v_from and v_to
      group by vehicle_id
    ) f on f.vehicle_id = v.id
    left join (
      select vehicle_id, sum(total_cost) as maintenance_cost
      from public.maintenance_records
      where company_id = v_company and status = 'completed'
        and completed_at between v_from and v_to
      group by vehicle_id
    ) m on m.vehicle_id = v.id
    left join (
      select vehicle_id, sum(end_odometer_km - start_odometer_km) as distance_km
      from public.trips
      where company_id = v_company and status = 'completed'
        and actual_return_at between v_from and v_to
      group by vehicle_id
    ) tr on tr.vehicle_id = v.id
    where v.company_id = v_company
    order by (coalesce(f.fuel_cost, 0) + coalesce(m.maintenance_cost, 0)) desc, v.plate
    limit v_size offset (v_page - 1) * v_size
  ) t;

  return jsonb_build_object(
    'items', v_items,
    'page', v_page,
    'pageSize', v_size,
    'total', v_total,
    'hasNext', (v_page * v_size) < v_total,
    'period', jsonb_build_object('from', v_from, 'to', v_to)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Movimentações recentes (timeline paginada)
-- ---------------------------------------------------------------------------
create or replace function public.report_recent_movements(
  p_from        timestamptz default (now() - interval '7 days'),
  p_to          timestamptz default now(),
  p_vehicle_id  uuid default null,
  p_location_id uuid default null,
  p_page        integer default 1,
  p_page_size   integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company uuid;
  v_page    integer := greatest(coalesce(p_page, 1), 1);
  v_size    integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_from    timestamptz := coalesce(p_from, now() - interval '7 days');
  v_to      timestamptz := coalesce(p_to, now());
  v_total   bigint;
  v_items   jsonb;
begin
  perform private.assert_permission('movements.read');
  v_company := private.current_user_company_id();

  select count(*) into v_total
  from public.vehicle_movements mv
  where mv.company_id = v_company
    and mv.occurred_at between v_from and v_to
    and (p_vehicle_id is null or mv.vehicle_id = p_vehicle_id)
    and (p_location_id is null or mv.location_id = p_location_id);

  select coalesce(jsonb_agg(to_jsonb(t) order by t.occurred_at desc), '[]'::jsonb)
    into v_items
  from (
    select mv.id as movement_id, mv.vehicle_id, v.plate, mv.movement_type,
           mv.occurred_at, mv.source, mv.sequence_no, mv.location_id,
           l.name as location_name, mv.plate_read_event_id
    from public.vehicle_movements mv
    join public.vehicles v on v.id = mv.vehicle_id
    join public.locations l on l.id = mv.location_id
    where mv.company_id = v_company
      and mv.occurred_at between v_from and v_to
      and (p_vehicle_id is null or mv.vehicle_id = p_vehicle_id)
      and (p_location_id is null or mv.location_id = p_location_id)
    order by mv.occurred_at desc
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

-- ---------------------------------------------------------------------------
-- Manutenções vencidas e próximas
-- ---------------------------------------------------------------------------
create or replace function public.report_maintenance_due(
  p_horizon_days integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company uuid;
  v_horizon integer := least(greatest(coalesce(p_horizon_days, 30), 1), 365);
  v_items   jsonb;
begin
  perform private.assert_permission('maintenance.read');
  v_company := private.current_user_company_id();

  select coalesce(jsonb_agg(to_jsonb(t) order by t.scheduled_for nulls last), '[]'::jsonb)
    into v_items
  from (
    select m.id as maintenance_id, m.vehicle_id, v.plate, m.maintenance_type,
           m.description, m.scheduled_for, m.scheduled_odometer_km,
           v.current_odometer_km,
           (m.scheduled_for < now()) as overdue_by_date,
           (m.scheduled_odometer_km is not null
            and v.current_odometer_km >= m.scheduled_odometer_km) as overdue_by_odometer
    from public.maintenance_records m
    join public.vehicles v on v.id = m.vehicle_id
    where m.company_id = v_company
      and m.status = 'scheduled'
      and (
        m.scheduled_for <= now() + make_interval(days => v_horizon)
        or (m.scheduled_odometer_km is not null
            and v.current_odometer_km >= m.scheduled_odometer_km)
      )
    order by m.scheduled_for nulls last
  ) t;

  return jsonb_build_object('items', v_items, 'horizonDays', v_horizon, 'generatedAt', now());
end;
$$;

revoke all on function public.dashboard_summary(timestamptz, timestamptz) from public;
revoke all on function public.report_monthly_costs(timestamptz, timestamptz) from public;
revoke all on function public.report_vehicle_costs(timestamptz, timestamptz, integer, integer) from public;
revoke all on function public.report_recent_movements(timestamptz, timestamptz, uuid, uuid, integer, integer) from public;
revoke all on function public.report_maintenance_due(integer) from public;

grant execute on function public.dashboard_summary(timestamptz, timestamptz) to authenticated;
grant execute on function public.report_monthly_costs(timestamptz, timestamptz) to authenticated;
grant execute on function public.report_vehicle_costs(timestamptz, timestamptz, integer, integer) to authenticated;
grant execute on function public.report_recent_movements(timestamptz, timestamptz, uuid, uuid, integer, integer) to authenticated;
grant execute on function public.report_maintenance_due(integer) to authenticated;
