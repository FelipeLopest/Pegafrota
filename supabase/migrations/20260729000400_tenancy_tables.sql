-- =============================================================================
-- PegaNaFrota — 000400 — Tenancy: companies, profiles, company_memberships
-- =============================================================================
-- Referência: DATABASE_BLUEPRINT.md §3.1–3.3, ADR-004
-- =============================================================================

-- -----------------------------------------------------------------------------
-- companies
-- -----------------------------------------------------------------------------
create table public.companies (
  id                      uuid primary key default gen_random_uuid(),
  legal_name              text not null,
  trade_name              text not null,
  cnpj                    text not null,
  email                   text,
  phone                   text,
  -- Endereço estruturado (OPEN_QUESTIONS.md §8: campos básicos, não JSONB livre).
  address_street          text,
  address_number          text,
  address_complement      text,
  address_district        text,
  address_city            text,
  address_state           text,
  address_postal_code     text,
  timezone                text not null default 'America/Sao_Paulo',
  status                  public.company_status not null default 'active',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  archived_at             timestamptz,
  archived_by             uuid,

  constraint companies_cnpj_unique unique (cnpj),
  constraint companies_cnpj_format check (cnpj ~ '^[0-9]{14}$'),
  constraint companies_cnpj_valid check (private.is_valid_cnpj(cnpj)),
  constraint companies_state_format check (address_state is null or address_state ~ '^[A-Z]{2}$'),
  constraint companies_legal_name_len check (char_length(btrim(legal_name)) between 3 and 200),
  constraint companies_trade_name_len check (char_length(btrim(trade_name)) between 2 and 200),
  constraint companies_email_format check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
  constraint companies_phone_format check (phone is null or phone ~ '^[0-9]{10,13}$'),
  constraint companies_postal_format check (address_postal_code is null or address_postal_code ~ '^[0-9]{8}$'),
  constraint companies_timezone_valid check (private.normalize_label(timezone) is not null),
  constraint companies_archive_consistent check (
    (archived_at is null and archived_by is null)
    or (archived_at is not null and status = 'archived')
  )
);

comment on table public.companies is
  'Empresa (tenant). CNPJ é globalmente único e validado por módulo 11. Nunca apagada fisicamente.';
comment on column public.companies.status is
  'suspended/archived removem o acesso de TODOS os usuários da empresa (private.current_membership()).';

create index companies_status_idx on public.companies (status);
create index companies_trade_name_idx on public.companies (lower(trade_name));

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
-- Espelho mínimo de auth.users. Nunca duplica senha, token ou identidade externa.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  full_name    text not null,
  phone        text,
  active       boolean not null default true,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint profiles_full_name_len check (char_length(btrim(full_name)) between 2 and 150),
  constraint profiles_phone_format check (phone is null or phone ~ '^[0-9]{10,13}$')
);

comment on table public.profiles is
  'Perfil de aplicação vinculado 1:1 a auth.users. active=false bloqueia RLS imediatamente.';

create index profiles_active_idx on public.profiles (active);

-- -----------------------------------------------------------------------------
-- company_memberships
-- -----------------------------------------------------------------------------
create table public.company_memberships (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.membership_role not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint company_memberships_unique_pair unique (company_id, user_id)
);

comment on table public.company_memberships is
  'Vínculo usuário x empresa. ADR-004: no MVP cada usuário possui no máximo uma membership ativa.';

-- Garantia do MVP: um usuário em uma empresa.
create unique index company_memberships_one_active_per_user_idx
  on public.company_memberships (user_id)
  where active;

create index company_memberships_user_idx on public.company_memberships (user_id);
create index company_memberships_company_role_active_idx
  on public.company_memberships (company_id, role, active);
