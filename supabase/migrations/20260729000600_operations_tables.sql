-- =============================================================================
-- PegaNaFrota — 000600 — Operação: trips, fuelings, maintenance_records
-- =============================================================================
-- Referência: DATABASE_BLUEPRINT.md §3.7–3.9
-- =============================================================================

-- -----------------------------------------------------------------------------
-- trips
-- -----------------------------------------------------------------------------
create table public.trips (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies (id) on delete restrict,
  vehicle_id          uuid not null references public.vehicles (id) on delete restrict,
  driver_id           uuid references public.drivers (id) on delete restrict,
  status              public.trip_status not null default 'planned',
  origin_label        text not null,
  destination_label   text not null,
  planned_departure_at timestamptz,
  actual_departure_at  timestamptz,
  planned_return_at    timestamptz,
  actual_return_at     timestamptz,
  start_odometer_km   public.odometer_km,
  end_odometer_km     public.odometer_km,
  purpose             text,
  notes               text,
  cancel_reason       text,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  cancelled_at        timestamptz,
  cancelled_by        uuid references public.profiles (id) on delete set null,
  archived_at         timestamptz,
  archived_by         uuid references public.profiles (id) on delete set null,

  constraint trips_origin_len check (char_length(btrim(origin_label)) between 2 and 200),
  constraint trips_destination_len check (char_length(btrim(destination_label)) between 2 and 200),

  -- Garantia: retorno não antecede saída.
  constraint trips_planned_window check (
    planned_return_at is null or planned_departure_at is null
    or planned_return_at >= planned_departure_at
  ),
  constraint trips_actual_window check (
    actual_return_at is null or actual_departure_at is null
    or actual_return_at >= actual_departure_at
  ),

  -- Garantia: quilometragem final maior que a inicial ao concluir.
  constraint trips_odometer_progress check (
    end_odometer_km is null or start_odometer_km is null
    or end_odometer_km > start_odometer_km
  ),

  -- Coerência por status.
  constraint trips_status_planned check (
    status <> 'planned'
    or (actual_departure_at is null and actual_return_at is null
        and start_odometer_km is null and end_odometer_km is null)
  ),
  constraint trips_status_in_progress check (
    status <> 'in_progress'
    or (actual_departure_at is not null and start_odometer_km is not null
        and actual_return_at is null and end_odometer_km is null)
  ),
  constraint trips_status_completed check (
    status <> 'completed'
    or (actual_departure_at is not null and actual_return_at is not null
        and start_odometer_km is not null and end_odometer_km is not null)
  ),
  constraint trips_status_cancelled check (
    status <> 'cancelled'
    or (cancelled_at is not null and private.normalize_label(cancel_reason) is not null)
  )
);

comment on table public.trips is
  'Viagem. A conclusão só acontece por public.complete_trip, que cria o evento de odômetro.';

create index trips_company_departure_idx
  on public.trips (company_id, actual_departure_at desc nulls last);
create index trips_company_status_idx on public.trips (company_id, status);
create index trips_vehicle_time_idx on public.trips (vehicle_id, actual_departure_at desc nulls last);
create index trips_driver_idx on public.trips (driver_id) where driver_id is not null;
create index trips_company_created_idx on public.trips (company_id, created_at desc);

-- Um veículo não pode ter duas viagens em andamento simultâneas.
create unique index trips_one_in_progress_per_vehicle_idx
  on public.trips (vehicle_id)
  where status = 'in_progress';

-- -----------------------------------------------------------------------------
-- fuelings
-- -----------------------------------------------------------------------------
create table public.fuelings (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies (id) on delete restrict,
  vehicle_id       uuid not null references public.vehicles (id) on delete restrict,
  driver_id        uuid references public.drivers (id) on delete restrict,
  trip_id          uuid references public.trips (id) on delete restrict,
  fueled_at        timestamptz not null,
  fuel_type        public.fuel_type not null,
  liters           public.liters not null,
  price_per_liter  numeric(10, 3) not null,
  total_amount     public.money_brl not null,
  odometer_km      public.odometer_km not null,
  station_name     text,
  full_tank        boolean not null default false,
  notes            text,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint fuelings_price_positive check (price_per_liter > 0),
  -- Garantia: total exato, sem ponto flutuante.
  constraint fuelings_total_exact check (total_amount = round(liters * price_per_liter, 2)),
  constraint fuelings_total_positive check (total_amount > 0)
);

comment on table public.fuelings is
  'Abastecimento. total_amount é validado por constraint contra litros x preço, com 2 casas.';
comment on constraint fuelings_total_exact on public.fuelings is
  'Garantia "abastecimento com total exato". Impossível gravar total divergente por qualquer caminho.';

create index fuelings_company_time_idx on public.fuelings (company_id, fueled_at desc);
create index fuelings_vehicle_time_idx on public.fuelings (vehicle_id, fueled_at desc);
create index fuelings_company_created_idx on public.fuelings (company_id, created_at desc);
create index fuelings_driver_idx on public.fuelings (driver_id) where driver_id is not null;

-- -----------------------------------------------------------------------------
-- maintenance_records — modelo unificado de agendamento e histórico
-- -----------------------------------------------------------------------------
create table public.maintenance_records (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null references public.companies (id) on delete restrict,
  vehicle_id             uuid not null references public.vehicles (id) on delete restrict,
  maintenance_type       public.maintenance_type not null,
  status                 public.maintenance_status not null default 'scheduled',
  description            text not null,
  scheduled_for          timestamptz,
  scheduled_odometer_km  public.odometer_km,
  started_at             timestamptz,
  completed_at           timestamptz,
  completion_odometer_km public.odometer_km,
  total_cost             public.money_brl,
  supplier_name          text,
  invoice_number         text,
  notes                  text,
  cancel_reason          text,
  created_by             uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  cancelled_at           timestamptz,
  cancelled_by           uuid references public.profiles (id) on delete set null,
  archived_at            timestamptz,
  archived_by            uuid references public.profiles (id) on delete set null,

  constraint maintenance_description_len check (char_length(btrim(description)) between 3 and 500),

  constraint maintenance_status_scheduled check (
    status <> 'scheduled'
    or (scheduled_for is not null and completed_at is null and total_cost is null)
  ),
  constraint maintenance_status_in_progress check (
    status <> 'in_progress' or (started_at is not null and completed_at is null)
  ),
  -- Garantia: valor de manutenção concluída maior que zero.
  constraint maintenance_status_completed check (
    status <> 'completed'
    or (completed_at is not null and total_cost is not null and total_cost > 0)
  ),
  constraint maintenance_status_cancelled check (
    status <> 'cancelled'
    or (cancelled_at is not null and private.normalize_label(cancel_reason) is not null)
  ),
  constraint maintenance_chronology check (
    completed_at is null or started_at is null or completed_at >= started_at
  ),
  constraint maintenance_archive_consistent check (
    archived_at is null or status in ('completed', 'cancelled')
  )
);

comment on table public.maintenance_records is
  'Agendamento e histórico de manutenção no mesmo modelo, separados por status. '
  'Data futura só é aceita em status=scheduled (trigger de cronologia).';

create index maintenance_company_status_scheduled_idx
  on public.maintenance_records (company_id, status, scheduled_for);
create index maintenance_vehicle_time_idx
  on public.maintenance_records (vehicle_id, coalesce(completed_at, scheduled_for) desc);
create index maintenance_company_completed_idx
  on public.maintenance_records (company_id, completed_at desc)
  where status = 'completed';
create index maintenance_company_created_idx
  on public.maintenance_records (company_id, created_at desc);
