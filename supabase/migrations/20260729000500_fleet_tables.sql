-- =============================================================================
-- PegaNaFrota — 000500 — Frota: drivers, vehicles, vehicle_odometer_events
-- =============================================================================
-- Referência: DATABASE_BLUEPRINT.md §3.4–3.6, ADR-005, ADR-006
-- =============================================================================

-- -----------------------------------------------------------------------------
-- drivers — registro operacional, sem login (dados pessoais mínimos)
-- -----------------------------------------------------------------------------
create table public.drivers (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies (id) on delete restrict,
  full_name         text not null,
  internal_document text,
  phone             text,
  license_category  text,
  license_expires_on date,
  active            boolean not null default true,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  archived_at       timestamptz,
  archived_by       uuid references public.profiles (id) on delete set null,

  constraint drivers_full_name_len check (char_length(btrim(full_name)) between 2 and 150),
  constraint drivers_phone_format check (phone is null or phone ~ '^[0-9]{10,13}$'),
  constraint drivers_license_category_valid check (
    license_category is null
    or license_category in ('A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE')
  ),
  constraint drivers_archive_consistent check (
    (archived_at is null) or (archived_at is not null and active = false)
  )
);

comment on table public.drivers is
  'Motorista operacional. Não possui login (fora do MVP). Arquivamento em vez de exclusão.';

create unique index drivers_company_document_idx
  on public.drivers (company_id, internal_document)
  where internal_document is not null and archived_at is null;

create index drivers_company_active_idx on public.drivers (company_id, active);
create index drivers_company_created_idx on public.drivers (company_id, created_at desc);
create index drivers_company_name_idx on public.drivers (company_id, lower(full_name));

-- -----------------------------------------------------------------------------
-- vehicles
-- -----------------------------------------------------------------------------
create table public.vehicles (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies (id) on delete restrict,
  plate               text not null,
  brand               text not null,
  model               text not null,
  model_year          smallint,
  manufacture_year    smallint,
  color               text,
  fuel_type           public.fuel_type not null,
  category            text,
  tank_capacity_l     numeric(8, 2),
  status              public.vehicle_status not null default 'available',
  current_odometer_km public.odometer_km not null default 0,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  archived_at         timestamptz,
  archived_by         uuid references public.profiles (id) on delete set null,

  -- Garantia: placa globalmente única (DATABASE_BLUEPRINT.md §3.5).
  constraint vehicles_plate_unique unique (plate),
  -- Placa nacional antiga (AAA0000) ou Mercosul (AAA0A00), sempre normalizada.
  constraint vehicles_plate_format check (
    plate ~ '^[A-Z]{3}[0-9]{4}$' or plate ~ '^[A-Z]{3}[0-9][A-Z][0-9]{2}$'
  ),
  constraint vehicles_brand_len check (char_length(btrim(brand)) between 1 and 80),
  constraint vehicles_model_len check (char_length(btrim(model)) between 1 and 80),
  constraint vehicles_model_year_range check (model_year is null or model_year between 1950 and 2100),
  constraint vehicles_manufacture_year_range check (
    manufacture_year is null or manufacture_year between 1950 and 2100
  ),
  constraint vehicles_year_order check (
    model_year is null or manufacture_year is null or model_year >= manufacture_year
  ),
  constraint vehicles_tank_positive check (tank_capacity_l is null or tank_capacity_l > 0),
  constraint vehicles_archive_consistent check (
    (archived_at is null and status <> 'archived')
    or (archived_at is not null and status = 'archived')
  )
);

comment on table public.vehicles is
  'Veículo da frota. current_odometer_km é cache derivado do ledger e só muda por RPC (ADR-006).';
comment on column public.vehicles.current_odometer_km is
  'Cache do último evento do ledger. Escrita direta bloqueada por trigger.';

create index vehicles_company_status_idx on public.vehicles (company_id, status);
create index vehicles_company_created_idx on public.vehicles (company_id, created_at desc);
create index vehicles_company_plate_idx on public.vehicles (company_id, plate);
create index vehicles_company_active_idx
  on public.vehicles (company_id)
  where archived_at is null;

-- -----------------------------------------------------------------------------
-- vehicle_odometer_events — ledger imutável (ADR-006)
-- -----------------------------------------------------------------------------
create table public.vehicle_odometer_events (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies (id) on delete restrict,
  vehicle_id       uuid not null references public.vehicles (id) on delete restrict,
  occurred_at      timestamptz not null,
  odometer_km      public.odometer_km not null,
  previous_km      public.odometer_km,
  source_type      public.odometer_source_type not null,
  source_id        uuid,
  reason           text,
  correction_of_id uuid references public.vehicle_odometer_events (id) on delete restrict,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),

  constraint odometer_events_no_backward check (previous_km is null or odometer_km >= previous_km),
  constraint odometer_events_manual_needs_reason check (
    source_type <> 'manual_adjustment' or private.normalize_label(reason) is not null
  ),
  constraint odometer_events_source_id_required check (
    source_type in ('vehicle_registration', 'manual_adjustment') or source_id is not null
  )
);

comment on table public.vehicle_odometer_events is
  'Ledger imutável de quilometragem. UPDATE e DELETE bloqueados por trigger. ADR-006.';
comment on column public.vehicle_odometer_events.correction_of_id is
  'Evento compensatório: aponta para o evento que este corrige. Correções nunca reduzem a quilometragem.';

-- Garantia: único evento por fonte (idempotência das RPCs transacionais).
create unique index odometer_events_source_unique_idx
  on public.vehicle_odometer_events (source_type, source_id)
  where source_id is not null;

create index odometer_events_vehicle_time_idx
  on public.vehicle_odometer_events (vehicle_id, occurred_at desc, created_at desc);
create index odometer_events_company_time_idx
  on public.vehicle_odometer_events (company_id, occurred_at desc);
create index odometer_events_correction_idx
  on public.vehicle_odometer_events (correction_of_id)
  where correction_of_id is not null;
