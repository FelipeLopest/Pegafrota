-- =============================================================================
-- PegaNaFrota — 000100 — Schemas e extensões
-- =============================================================================
-- Cria os três schemas do modelo:
--   public  : tabelas, views e RPCs expostas pela API PostgREST, sempre sob RLS.
--   private : helpers internos, nunca expostos pela API.
--   audit   : trilha de auditoria append-only.
--
-- Referência: docs/architecture/DATABASE_BLUEPRINT.md §1
-- =============================================================================

create schema if not exists private;
comment on schema private is
  'Helpers internos do PegaNaFrota. Nunca deve ser adicionado a db.schemas do PostgREST.';

create schema if not exists audit;
comment on schema audit is
  'Trilha de auditoria append-only. Escrita apenas por funções SECURITY DEFINER.';

-- O schema "extensions" existe por padrão no Supabase. Criado aqui para permitir
-- que as mesmas migrations rodem em um PostgreSQL puro (harness de teste local).
create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Blindagem de superfície: nada em private/audit é acessível por padrão.
-- Grants mínimos são concedidos explicitamente na migration 001100.
-- -----------------------------------------------------------------------------
revoke all on schema private from public;
revoke all on schema audit from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema private from anon';
    execute 'revoke all on schema audit from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema private from authenticated';
    execute 'revoke all on schema audit from authenticated';
  end if;
end
$$;
