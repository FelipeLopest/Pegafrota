-- =============================================================================
-- PegaNaFrota — 20260731000700 — Dados e relatórios
-- =============================================================================
-- Corrige:
--   DB-AUD-019  enum de abastecimento mistura motorização e produto
--   DB-AUD-020  consumo médio não usa somente ciclos de tanque cheio
--   DB-AUD-021  intervalos invertidos não são validados em todas as RPCs
-- =============================================================================

-- =============================================================================
-- 1. Motorização x produto abastecido (DB-AUD-019)
-- =============================================================================
-- Decisão: manter UM enum e separar o significado por COLUNA, com constraint
-- explícita. Criar um segundo enum obrigaria a reescrever FKs, views e
-- contratos de RPC sem ganho real — 'flex' e 'electric' descrevem a
-- MOTORIZAÇÃO do veículo e simplesmente não são produtos vendidos na bomba.
alter table public.fuelings
  add constraint fuelings_product_is_sellable
  check (fuel_type not in ('flex', 'electric'));

comment on constraint fuelings_product_is_sellable on public.fuelings is
  'DB-AUD-019: flex e electric são motorização, não produto abastecido.';

comment on column public.vehicles.fuel_type is
  'MOTORIZAÇÃO/compatibilidade do veículo. Pode ser flex ou electric.';
comment on column public.fuelings.fuel_type is
  'PRODUTO efetivamente abastecido. Nunca flex nem electric (constraint fuelings_product_is_sellable).';

-- Um veículo flex passa a aceitar apenas produtos reais.
create or replace function private.fuel_is_compatible(
  p_vehicle_fuel public.fuel_type,
  p_fueling_fuel public.fuel_type
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_fueling_fuel in ('flex', 'electric') then false
    else case p_vehicle_fuel
      when 'flex'        then p_fueling_fuel in ('gasoline', 'ethanol', 'cng')
      when 'gasoline'    then p_fueling_fuel in ('gasoline', 'cng')
      when 'ethanol'     then p_fueling_fuel in ('ethanol')
      when 'diesel_s10'  then p_fueling_fuel in ('diesel_s10', 'diesel_s500')
      when 'diesel_s500' then p_fueling_fuel in ('diesel_s10', 'diesel_s500')
      when 'cng'         then p_fueling_fuel in ('cng', 'gasoline')
      when 'electric'    then false
      else false
    end
  end;
$$;
comment on function private.fuel_is_compatible(public.fuel_type, public.fuel_type) is
  'Compatibilidade motorização x produto. Veículo elétrico não abastece; flex não recebe "flex".';

-- register_fueling herdava fuel_type do veículo quando o cliente não informava.
-- Para veículo flex isso gravava o produto 'flex', que a constraint agora
-- recusa: a RPC passa a exigir o produto explicitamente nesse caso.
create or replace function private.default_fuel_product(p_vehicle_fuel public.fuel_type)
returns public.fuel_type
language sql
immutable
set search_path = ''
as $$
  select case p_vehicle_fuel
    when 'flex'     then null
    when 'electric' then null
    else p_vehicle_fuel
  end;
$$;

-- =============================================================================
-- 2. Guarda única de intervalo para relatórios (DB-AUD-021)
-- =============================================================================
create or replace function private.assert_report_range(
  p_from timestamptz,
  p_to   timestamptz
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_from is not null and p_to is not null and p_to < p_from then
    raise exception 'VALIDATION_ERROR: intervalo inválido (fim antes do início)'
      using errcode = '22007', hint = 'VALIDATION_ERROR';
  end if;
end;
$$;
comment on function private.assert_report_range(timestamptz, timestamptz) is
  'Validação padronizada de intervalo. Usada por todas as RPCs de relatório (DB-AUD-021).';

-- =============================================================================
-- 3. Consumo médio somente entre tanques cheios (DB-AUD-020)
-- =============================================================================
-- A view antiga anunciava "entre abastecimentos completos" mas media entre
-- QUAISQUER dois abastecimentos consecutivos. Com tanque parcial no meio, o
-- km/l resultante é ficção: a distância percorrida não corresponde ao volume
-- somado.
--
-- Método correto (o mesmo usado por qualquer sistema de frota):
--   segmento = do tanque cheio N ao tanque cheio N+1
--   distância = odômetro(N+1) - odômetro(N)
--   litros    = soma de TODOS os abastecimentos após N até N+1 inclusive
--
-- Abastecimentos parciais continuam entrando no litro consumido; o que eles não
-- podem fazer é FECHAR um segmento de medição.
drop view if exists public.v_vehicle_fuel_consumption;

create view public.v_vehicle_fuel_consumption
with (security_invoker = true) as
with marked as (
  select
    f.company_id,
    f.vehicle_id,
    f.odometer_km,
    f.liters,
    f.total_amount,
    f.full_tank,
    -- Quantos tanques cheios existem ANTES desta linha. Todas as linhas entre
    -- dois tanques cheios compartilham o mesmo valor, o que forma o segmento.
    count(*) filter (where f.full_tank) over (
      partition by f.vehicle_id
      order by f.fueled_at, f.created_at, f.id
      rows between unbounded preceding and 1 preceding
    ) as cycle_no,
    -- Odômetro do tanque cheio que abriu o segmento.
    max(case when f.full_tank then f.odometer_km end) over (
      partition by f.vehicle_id
      order by f.fueled_at, f.created_at, f.id
      rows between unbounded preceding and 1 preceding
    ) as opening_km
  from public.fuelings f
),
segments as (
  select
    m.company_id,
    m.vehicle_id,
    m.cycle_no,
    max(m.opening_km)                                   as opening_km,
    max(m.odometer_km) filter (where m.full_tank)       as closing_km,
    sum(m.liters)                                       as liters,
    sum(m.total_amount)                                 as total_amount
  from marked m
  group by m.company_id, m.vehicle_id, m.cycle_no
  -- Segmento só conta quando é FECHADO por um tanque cheio e ABERTO por outro.
  having bool_or(m.full_tank) and max(m.opening_km) is not null
)
select
  s.company_id,
  s.vehicle_id,
  v.plate,
  sum(s.closing_km - s.opening_km)::numeric(12, 1)  as total_distance_km,
  sum(s.liters)::numeric(12, 3)                     as total_liters,
  sum(s.total_amount)::numeric(14, 2)               as total_fuel_cost,
  round(sum(s.closing_km - s.opening_km) / nullif(sum(s.liters), 0), 2)   as km_per_liter,
  round(sum(s.total_amount) / nullif(sum(s.closing_km - s.opening_km), 0), 4) as cost_per_km,
  count(*)                                          as measured_segments
from segments s
join public.vehicles v on v.id = s.vehicle_id
where s.closing_km > s.opening_km
group by s.company_id, s.vehicle_id, v.plate;

comment on view public.v_vehicle_fuel_consumption is
  'Consumo médio medido SOMENTE entre ciclos de tanque cheio (DB-AUD-020). '
  'Abastecimentos parciais somam litros mas não fecham segmento.';

grant select on public.v_vehicle_fuel_consumption to authenticated;

-- =============================================================================
-- 4. RPCs de relatório com validação de intervalo padronizada (DB-AUD-021)
-- =============================================================================
-- Os corpos abaixo são os originais de 20260729002100, sem alteração de lógica:
-- a única mudança é a chamada a private.assert_report_range no topo.
-- ---------------------------------------------------------------------------
-- report_monthly_costs — corpo idêntico ao original, com a guarda de intervalo no topo
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
  perform private.assert_report_range(p_from, p_to);
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
-- report_vehicle_costs — corpo idêntico ao original, com a guarda de intervalo no topo
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
  perform private.assert_report_range(p_from, p_to);
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
-- report_recent_movements — corpo idêntico ao original, com a guarda de intervalo no topo
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
  perform private.assert_report_range(p_from, p_to);
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

-- =============================================================================
-- 5. register_fueling: produto explícito para veículo flex/elétrico
-- =============================================================================
create or replace function public.register_fueling(
  p_vehicle_id      uuid,
  p_liters          numeric,
  p_price_per_liter numeric,
  p_odometer_km     numeric,
  p_fuel_type       public.fuel_type default null,
  p_fueled_at       timestamptz default now(),
  p_driver_id       uuid default null,
  p_trip_id         uuid default null,
  p_station_name    text default null,
  p_full_tank       boolean default false,
  p_notes           text default null,
  p_total_amount    numeric default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_vehicle   public.vehicles;
  v_trip      public.trips;
  v_driver    public.drivers;
  v_fuel_type public.fuel_type;
  v_total     numeric(14, 2);
  v_fueled_at timestamptz := coalesce(p_fueled_at, now());
  v_fueling   public.fuelings;
  v_event     public.vehicle_odometer_events;
  v_last_at   timestamptz;
begin
  perform private.assert_permission('fuelings.write');

  if p_liters is null or p_liters <= 0 then
    raise exception 'VALIDATION_ERROR: litros deve ser maior que zero'
      using errcode = '22004', hint = 'VALIDATION_ERROR';
  end if;

  if p_price_per_liter is null or p_price_per_liter <= 0 then
    raise exception 'VALIDATION_ERROR: valor por litro deve ser maior que zero'
      using errcode = '22004', hint = 'VALIDATION_ERROR';
  end if;

  if p_odometer_km is null then
    raise exception 'VALIDATION_ERROR: quilometragem do abastecimento é obrigatória'
      using errcode = '22004', hint = 'VALIDATION_ERROR';
  end if;

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

  if p_trip_id is not null then
    select * into v_trip from public.trips where id = p_trip_id;
    if not found then
      raise exception 'TRIP_NOT_FOUND: viagem % não existe', p_trip_id
        using errcode = 'P0002', hint = 'NOT_FOUND';
    end if;
    if v_trip.vehicle_id <> p_vehicle_id then
      raise exception 'FUELING_TRIP_MISMATCH: a viagem % pertence a outro veículo', p_trip_id
        using errcode = '23514', hint = 'VALIDATION_ERROR';
    end if;
    perform private.assert_company_access(v_trip.company_id);
  end if;

  if p_driver_id is not null then
    select * into v_driver from public.drivers where id = p_driver_id;
    if not found then
      raise exception 'DRIVER_NOT_FOUND: motorista % não existe', p_driver_id
        using errcode = 'P0002', hint = 'NOT_FOUND';
    end if;
    perform private.assert_company_access(v_driver.company_id);
    if v_driver.archived_at is not null then
      raise exception 'DRIVER_ARCHIVED: motorista % está arquivado', p_driver_id
        using errcode = '42501', hint = 'CONFLICT_ARCHIVED';
    end if;
  end if;

  -- DB-AUD-019: sem produto explícito, um veículo flex gravaria combustível
  -- 'flex', que não é produto vendido.
  v_fuel_type := coalesce(p_fuel_type, private.default_fuel_product(v_vehicle.fuel_type));
  if v_fuel_type is null then
    raise exception
      'FUELING_PRODUCT_REQUIRED: veículo % é % e exige o produto abastecido explicitamente',
      p_vehicle_id, v_vehicle.fuel_type
      using errcode = '22004', hint = 'VALIDATION_ERROR';
  end if;

  v_total := round(p_liters * p_price_per_liter, 2);
  if p_total_amount is not null and round(p_total_amount, 2) <> v_total then
    raise exception
      'FUELING_TOTAL_MISMATCH: total informado (%) difere do calculado (%)',
      round(p_total_amount, 2), v_total
      using errcode = '23514', hint = 'VALIDATION_ERROR';
  end if;

  if v_fueled_at > now() + interval '5 minutes' then
    raise exception 'VALIDATION_ERROR: data do abastecimento não pode estar no futuro'
      using errcode = '22007', hint = 'CHRONOLOGY_ERROR';
  end if;

  select max(e.occurred_at) into v_last_at
  from public.vehicle_odometer_events e
  where e.vehicle_id = p_vehicle_id;

  if v_last_at is not null and v_fueled_at < v_last_at then
    raise exception
      'FUELING_BACKDATED: data % é anterior ao último evento de odômetro do veículo (%)',
      v_fueled_at, v_last_at
      using errcode = '22007', hint = 'CHRONOLOGY_ERROR';
  end if;

  insert into public.fuelings (
    company_id, vehicle_id, driver_id, trip_id, fueled_at, fuel_type,
    liters, price_per_liter, total_amount, odometer_km,
    station_name, full_tank, notes, created_by
  )
  values (
    v_vehicle.company_id, p_vehicle_id, p_driver_id, p_trip_id, v_fueled_at, v_fuel_type,
    p_liters, p_price_per_liter, v_total, p_odometer_km,
    private.normalize_label(p_station_name), coalesce(p_full_tank, false),
    private.normalize_label(p_notes), private.current_user_id()
  )
  returning * into v_fueling;

  v_event := private.record_odometer_event(
    p_vehicle_id  => p_vehicle_id,
    p_odometer_km => p_odometer_km,
    p_occurred_at => v_fueled_at,
    p_source_type => 'fueling',
    p_source_id   => v_fueling.id,
    p_reason      => null
  );

  return jsonb_build_object(
    'fuelingId', v_fueling.id,
    'vehicleId', p_vehicle_id,
    'fueledAt', v_fueled_at,
    'fuelType', v_fuel_type,
    'liters', v_fueling.liters,
    'pricePerLiter', v_fueling.price_per_liter,
    'totalAmount', v_fueling.total_amount,
    'odometerKm', v_fueling.odometer_km,
    'odometerEventId', v_event.id
  );
end;
$$;
