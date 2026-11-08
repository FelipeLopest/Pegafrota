-- =============================================================================
-- PegaNaFrota — Harness local: shim da base do Supabase
-- =============================================================================
-- ATENÇÃO: este arquivo NÃO é uma migration e NUNCA deve ser aplicado a um
-- projeto Supabase. Ele existe apenas para permitir rodar exatamente as mesmas
-- migrations e testes contra um PostgreSQL puro (CI sem Docker, revisão
-- offline, auditoria independente).
--
-- Em um projeto Supabase real, tudo o que está aqui já existe na imagem base:
--   - papéis anon / authenticated / service_role / authenticator
--   - schema auth com auth.users, auth.identities, auth.uid(), auth.jwt()
--   - schema extensions
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Papéis da API
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin noinherit;
  end if;
end
$$;

grant anon, authenticated, service_role to authenticator;

-- ---------------------------------------------------------------------------
-- Schemas base
-- ---------------------------------------------------------------------------
create schema if not exists auth authorization current_user;
create schema if not exists extensions authorization current_user;

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- auth.users (subconjunto fiel das colunas usadas pelo projeto)
-- ---------------------------------------------------------------------------
create table if not exists auth.users (
  instance_id            uuid,
  id                     uuid primary key,
  aud                    varchar(255),
  role                   varchar(255),
  email                  varchar(255),
  encrypted_password     varchar(255),
  email_confirmed_at     timestamptz,
  invited_at             timestamptz,
  confirmation_token     varchar(255) default '',
  confirmation_sent_at   timestamptz,
  recovery_token         varchar(255) default '',
  recovery_sent_at       timestamptz,
  email_change_token_new varchar(255) default '',
  email_change           varchar(255) default '',
  email_change_sent_at   timestamptz,
  last_sign_in_at        timestamptz,
  raw_app_meta_data      jsonb,
  raw_user_meta_data     jsonb,
  is_super_admin         boolean,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now(),
  phone                  text,
  phone_confirmed_at     timestamptz,
  banned_until           timestamptz,
  deleted_at             timestamptz
);

create unique index if not exists users_email_partial_key
  on auth.users (email)
  where deleted_at is null;

create table if not exists auth.identities (
  provider_id     text not null,
  user_id         uuid not null references auth.users (id) on delete cascade,
  identity_data   jsonb not null,
  provider        text not null,
  last_sign_in_at timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  email           text,
  id              uuid primary key default gen_random_uuid(),
  constraint identities_provider_id_provider_unique unique (provider_id, provider)
);

-- ---------------------------------------------------------------------------
-- Funções de identidade (mesma semântica do Supabase)
-- ---------------------------------------------------------------------------
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'role', '')::text;
$$;

create or replace function auth.email()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'email', '')::text;
$$;

-- ---------------------------------------------------------------------------
-- Grants equivalentes aos da imagem base
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to service_role;
grant execute on function auth.uid(), auth.jwt(), auth.role(), auth.email()
  to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to postgres;
