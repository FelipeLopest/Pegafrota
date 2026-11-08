-- =============================================================================
-- PegaNaFrota — 000700 — Acesso físico: locations, cameras,
--                        plate_read_events, vehicle_movements
-- =============================================================================
-- Referência: DATABASE_BLUEPRINT.md §3.10–3.13, ADR-007, ADR-009
-- =============================================================================

-- -----------------------------------------------------------------------------
-- locations
-- -----------------------------------------------------------------------------
create table public.locations (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies (id) on delete restrict,
  name                text not null,
  address_street      text,
  address_number      text,
  address_district    text,
  address_city        text,
  address_state       text,
  address_postal_code text,
  timezone            text not null default 'America/Sao_Paulo',
  active              boolean not null default true,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  archived_at         timestamptz,
  archived_by         uuid references public.profiles (id) on delete set null,

  constraint locations_name_len check (char_length(btrim(name)) between 2 and 120),
  constraint locations_state_format check (address_state is null or address_state ~ '^[A-Z]{2}$'),
  constraint locations_postal_format check (
    address_postal_code is null or address_postal_code ~ '^[0-9]{8}$'
  ),
  constraint locations_archive_consistent check (archived_at is null or active = false)
);

comment on table public.locations is 'Pátio, garagem ou ponto de acesso controlado.';

create unique index locations_company_name_idx
  on public.locations (company_id, lower(btrim(name)))
  where archived_at is null;
create index locations_company_active_idx on public.locations (company_id, active);
create index locations_company_created_idx on public.locations (company_id, created_at desc);

-- -----------------------------------------------------------------------------
-- cameras
-- -----------------------------------------------------------------------------
create table public.cameras (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies (id) on delete restrict,
  location_id      uuid not null references public.locations (id) on delete restrict,
  name             text not null,
  local_identifier text not null,
  direction        public.camera_direction not null default 'both',
  active           boolean not null default true,
  -- Configuração NÃO secreta. Credenciais ficam fora do banco exposto
  -- (SECURITY_MODEL.md §9 e DATABASE_BLUEPRINT.md §3.11).
  settings         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint cameras_name_len check (char_length(btrim(name)) between 2 and 120),
  constraint cameras_local_identifier_len check (char_length(btrim(local_identifier)) between 2 and 120),
  constraint cameras_settings_is_object check (jsonb_typeof(settings) = 'object'),
  constraint cameras_settings_no_secrets check (
    not (settings ?| array[
      'password', 'passwd', 'secret', 'token', 'api_key', 'apiKey',
      'credentials', 'rtsp_url', 'rtspUrl', 'private_key', 'authorization'
    ])
  )
);

comment on table public.cameras is
  'Câmera lógica. A coluna settings é validada para nunca conter credenciais.';

create unique index cameras_company_local_identifier_idx
  on public.cameras (company_id, lower(btrim(local_identifier)));
create index cameras_company_active_idx on public.cameras (company_id, active);
create index cameras_location_idx on public.cameras (location_id);

-- -----------------------------------------------------------------------------
-- plate_read_events — entrada não confiável vinda do worker OCR (ADR-009)
-- -----------------------------------------------------------------------------
create table public.plate_read_events (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies (id) on delete restrict,
  camera_id         uuid not null references public.cameras (id) on delete restrict,
  captured_at       timestamptz not null,
  raw_text          text not null,
  normalized_plate  text,
  confidence        public.confidence_score not null,
  frame_hash        text,
  image_reference   text,
  status            public.plate_read_status not null default 'captured',
  matched_vehicle_id uuid references public.vehicles (id) on delete restrict,
  duplicate_of_id   uuid references public.plate_read_events (id) on delete restrict,
  rejection_reason  text,
  engine_version    text not null,
  contract_version  text not null,
  client_event_id   text,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint plate_read_raw_len check (char_length(raw_text) between 1 and 64),
  constraint plate_read_normalized_format check (
    normalized_plate is null or normalized_plate ~ '^[A-Z0-9]{1,10}$'
  ),
  -- Somente leitura confirmada pode apontar veículo.
  constraint plate_read_confirmed_requires_vehicle check (
    status <> 'confirmed' or matched_vehicle_id is not null
  ),
  constraint plate_read_unknown_has_no_vehicle check (
    status <> 'unknown_plate' or matched_vehicle_id is null
  ),
  constraint plate_read_duplicate_has_origin check (
    status <> 'duplicate' or duplicate_of_id is not null
  ),
  constraint plate_read_frame_hash_format check (
    frame_hash is null or frame_hash ~ '^[a-f0-9]{32,128}$'
  )
);

comment on table public.plate_read_events is
  'Leitura de placa. Somente status=confirmed pode originar movimentação (ADR-007/ADR-009).';
comment on column public.plate_read_events.image_reference is
  'Referência opcional a imagem. Política padrão do MVP: não armazenar imagem (OPEN_QUESTIONS.md §2).';

-- Idempotência do worker OCR (DATA_ACCESS.md §9).
create unique index plate_read_client_event_idx
  on public.plate_read_events (company_id, client_event_id)
  where client_event_id is not null;

create index plate_read_company_camera_time_idx
  on public.plate_read_events (company_id, camera_id, captured_at desc);
create index plate_read_company_status_idx on public.plate_read_events (company_id, status);
create index plate_read_dedup_lookup_idx
  on public.plate_read_events (company_id, normalized_plate, captured_at desc)
  where normalized_plate is not null;
create index plate_read_vehicle_idx
  on public.plate_read_events (matched_vehicle_id)
  where matched_vehicle_id is not null;

-- -----------------------------------------------------------------------------
-- vehicle_movements — Entrada/Saída (ADR-007)
-- -----------------------------------------------------------------------------
create table public.vehicle_movements (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies (id) on delete restrict,
  vehicle_id          uuid not null references public.vehicles (id) on delete restrict,
  location_id         uuid not null references public.locations (id) on delete restrict,
  movement_type       public.movement_type not null,
  -- Sequência densa por veículo. Duas transações concorrentes calculam o mesmo
  -- número e uma delas falha no índice único: a alternância nunca quebra.
  sequence_no         integer not null,
  occurred_at         timestamptz not null default now(),
  source              public.movement_source not null,
  plate_read_event_id uuid references public.plate_read_events (id) on delete restrict,
  operator_user_id    uuid references public.profiles (id) on delete set null,
  notes               text,
  created_at          timestamptz not null default now(),

  constraint movements_sequence_positive check (sequence_no >= 1),
  -- Garantia: a primeira movimentação de um veículo é sempre Entrada.
  constraint movements_first_is_entry check (sequence_no > 1 or movement_type = 'entry'),
  -- Garantia: a paridade da sequência determina o tipo (ímpar=Entrada, par=Saída).
  constraint movements_alternation_parity check (
    (sequence_no % 2 = 1 and movement_type = 'entry')
    or (sequence_no % 2 = 0 and movement_type = 'exit')
  ),
  constraint movements_ocr_requires_read check (
    source <> 'ocr' or plate_read_event_id is not null
  )
);

comment on table public.vehicle_movements is
  'Entrada/Saída. Criada exclusivamente por public.register_vehicle_movement (ADR-007). '
  'occurred_at é sempre carimbo do servidor.';
comment on column public.vehicle_movements.sequence_no is
  'Sequência por veículo. O índice único + a paridade tornam a alternância estruturalmente impossível de violar.';

create unique index movements_vehicle_sequence_idx
  on public.vehicle_movements (vehicle_id, sequence_no);

-- Garantia: um evento OCR confirmado gera no máximo uma movimentação.
create unique index movements_plate_read_unique_idx
  on public.vehicle_movements (plate_read_event_id)
  where plate_read_event_id is not null;

create index movements_company_vehicle_time_idx
  on public.vehicle_movements (company_id, vehicle_id, occurred_at desc);
create index movements_company_time_idx on public.vehicle_movements (company_id, occurred_at desc);
create index movements_location_time_idx on public.vehicle_movements (location_id, occurred_at desc);
