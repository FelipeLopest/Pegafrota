-- =============================================================================
-- PegaNaFrota — 002000 — Views de apoio a dashboard e relatórios
-- =============================================================================
-- TODAS as views usam security_invoker = true (DATABASE_BLUEPRINT.md §7).
-- Consequência: a RLS das tabelas base é aplicada com a identidade de quem
-- consulta. Uma view NUNCA é um caminho de escape do tenant.
--
-- Nenhuma materialized view no MVP (não há evidência de necessidade).
-- Nenhum cálculo financeiro em ponto flutuante.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Presença: veículo dentro ou fora
-- ---------------------------------------------------------------------------
create view public.v_vehicle_presence
with (security_invoker = true) as
select
  v.company_id,
  v.id                       as vehicle_id,
  v.plate,
  v.brand,
  v.model,
  v.status                   as vehicle_status,
  v.current_odometer_km,
  m.id                       as last_movement_id,
  m.movement_type            as last_movement_type,
  m.occurred_at              as last_movement_at,
  m.location_id              as last_location_id,
  l.name                     as last_location_name,
  m.sequence_no,
  coalesce(m.movement_type = 'entry', false) as is_inside
from public.vehicles v
left join lateral (
  select mm.*
  from public.vehicle_movements mm
  where mm.vehicle_id = v.id
  order by mm.sequence_no desc
  limit 1
) m on true
left join public.locations l on l.id = m.location_id
where v.archived_at is null;

comment on view public.v_vehicle_presence is
  'Estado atual de presença por veículo, derivado da última movimentação.';

-- ---------------------------------------------------------------------------
-- Frota por status
-- ---------------------------------------------------------------------------
create view public.v_fleet_status_summary
with (security_invoker = true) as
select
  v.company_id,
  count(*)                                                  as total_vehicles,
  count(*) filter (where v.status = 'available')             as available,
  count(*) filter (where v.status = 'in_use')                as in_use,
  count(*) filter (where v.status = 'in_maintenance')        as in_maintenance,
  count(*) filter (where v.status = 'inactive')              as inactive,
  count(*) filter (where v.status = 'archived')              as archived
from public.vehicles v
group by v.company_id;

-- ---------------------------------------------------------------------------
-- Custos mensais por veículo (combustível + manutenção)
-- ---------------------------------------------------------------------------
create view public.v_vehicle_monthly_costs
with (security_invoker = true) as
with fuel as (
  select
    f.company_id,
    f.vehicle_id,
    date_trunc('month', f.fueled_at at time zone c.timezone)::date as month_start,
    sum(f.total_amount)::numeric(14, 2) as fuel_cost,
    sum(f.liters)::numeric(12, 3)       as liters,
    count(*)                            as fueling_count
  from public.fuelings f
  join public.companies c on c.id = f.company_id
  group by f.company_id, f.vehicle_id, 3
),
maint as (
  select
    m.company_id,
    m.vehicle_id,
    date_trunc('month', m.completed_at at time zone c.timezone)::date as month_start,
    sum(m.total_cost)::numeric(14, 2) as maintenance_cost,
    count(*)                          as maintenance_count
  from public.maintenance_records m
  join public.companies c on c.id = m.company_id
  where m.status = 'completed' and m.completed_at is not null
  group by m.company_id, m.vehicle_id, 3
)
select
  coalesce(f.company_id, mt.company_id)   as company_id,
  coalesce(f.vehicle_id, mt.vehicle_id)   as vehicle_id,
  coalesce(f.month_start, mt.month_start) as month_start,
  coalesce(f.fuel_cost, 0)::numeric(14, 2)        as fuel_cost,
  coalesce(mt.maintenance_cost, 0)::numeric(14, 2) as maintenance_cost,
  (coalesce(f.fuel_cost, 0) + coalesce(mt.maintenance_cost, 0))::numeric(14, 2) as total_cost,
  coalesce(f.liters, 0)::numeric(12, 3)   as liters,
  coalesce(f.fueling_count, 0)            as fueling_count,
  coalesce(mt.maintenance_count, 0)       as maintenance_count
from fuel f
full outer join maint mt
  on mt.company_id = f.company_id
 and mt.vehicle_id = f.vehicle_id
 and mt.month_start = f.month_start;

comment on view public.v_vehicle_monthly_costs is
  'Custos mensais por veículo. Meses calculados no timezone da empresa. Sem ponto flutuante.';

-- ---------------------------------------------------------------------------
-- Consumo por veículo (km/l entre abastecimentos completos)
-- ---------------------------------------------------------------------------
create view public.v_vehicle_fuel_consumption
with (security_invoker = true) as
with ordered as (
  select
    f.company_id,
    f.vehicle_id,
    f.fueled_at,
    f.odometer_km,
    f.liters,
    f.total_amount,
    lag(f.odometer_km) over (partition by f.vehicle_id order by f.fueled_at, f.created_at) as prev_odometer_km
  from public.fuelings f
),
segments as (
  select
    company_id,
    vehicle_id,
    (odometer_km - prev_odometer_km) as distance_km,
    liters,
    total_amount
  from ordered
  where prev_odometer_km is not null
    and odometer_km > prev_odometer_km
)
select
  s.company_id,
  s.vehicle_id,
  v.plate,
  sum(s.distance_km)::numeric(12, 1)                  as total_distance_km,
  sum(s.liters)::numeric(12, 3)                       as total_liters,
  sum(s.total_amount)::numeric(14, 2)                 as total_fuel_cost,
  round(sum(s.distance_km) / nullif(sum(s.liters), 0), 2)      as km_per_liter,
  round(sum(s.total_amount) / nullif(sum(s.distance_km), 0), 4) as cost_per_km,
  count(*)                                            as measured_segments
from segments s
join public.vehicles v on v.id = s.vehicle_id
group by s.company_id, s.vehicle_id, v.plate;

comment on view public.v_vehicle_fuel_consumption is
  'Consumo médio calculado entre abastecimentos consecutivos com odômetro crescente.';

-- ---------------------------------------------------------------------------
-- Manutenções próximas e vencidas
-- ---------------------------------------------------------------------------
create view public.v_maintenance_due
with (security_invoker = true) as
select
  m.company_id,
  m.id            as maintenance_id,
  m.vehicle_id,
  v.plate,
  m.maintenance_type,
  m.status,
  m.description,
  m.scheduled_for,
  m.scheduled_odometer_km,
  v.current_odometer_km,
  (m.scheduled_for < now())                       as is_overdue_by_date,
  (m.scheduled_odometer_km is not null
    and v.current_odometer_km >= m.scheduled_odometer_km) as is_overdue_by_odometer,
  extract(day from (m.scheduled_for - now()))::integer as days_until_due
from public.maintenance_records m
join public.vehicles v on v.id = m.vehicle_id
where m.status in ('scheduled', 'in_progress')
  and m.archived_at is null;

-- ---------------------------------------------------------------------------
-- Últimas entradas e saídas
-- ---------------------------------------------------------------------------
create view public.v_recent_movements
with (security_invoker = true) as
select
  mv.company_id,
  mv.id            as movement_id,
  mv.vehicle_id,
  v.plate,
  v.brand,
  v.model,
  mv.movement_type,
  mv.occurred_at,
  mv.source,
  mv.sequence_no,
  mv.location_id,
  l.name           as location_name,
  mv.plate_read_event_id,
  mv.operator_user_id,
  p.full_name      as operator_name
from public.vehicle_movements mv
join public.vehicles v on v.id = mv.vehicle_id
join public.locations l on l.id = mv.location_id
left join public.profiles p on p.id = mv.operator_user_id;

-- ---------------------------------------------------------------------------
-- Auditoria exposta ao PostgREST (o schema audit não é publicado)
-- ---------------------------------------------------------------------------
create view public.audit_events
with (security_invoker = true) as
select
  e.id,
  e.company_id,
  e.actor_user_id,
  e.action,
  e.entity,
  e.entity_id,
  e.changed_fields,
  e.request_id,
  e.metadata,
  e.occurred_at
from audit.events e;

comment on view public.audit_events is
  'Leitura da trilha de auditoria. security_invoker garante que a RLS de audit.events é aplicada.';

-- ---------------------------------------------------------------------------
-- Grants das views
-- ---------------------------------------------------------------------------
grant select on
  public.v_vehicle_presence,
  public.v_fleet_status_summary,
  public.v_vehicle_monthly_costs,
  public.v_vehicle_fuel_consumption,
  public.v_maintenance_due,
  public.v_recent_movements,
  public.audit_events
to authenticated;
