-- =============================================================================
-- PegaNaFrota — 20260802000100 — Camada global de plataforma (ADITIVA)
-- =============================================================================
-- Cria a identidade global `platform_admin`, que NÃO pertence a nenhuma empresa
-- e NÃO depende de company_memberships.
--
-- Decisões (ADR-011):
--   1. O papel global vive em schema próprio `platform`. Uma migration posterior
--      torna o schema endereçável pelo PostgREST exclusivamente para as RPCs
--      da Edge Function; anon/authenticated continuam sem USAGE/EXECUTE.
--   2. `platform.admins.active` (conta global) é ORTOGONAL a
--      `company_memberships.active` (acesso a UMA empresa). Nunca são fundidos.
--   3. Nenhuma alteração de semântica no banco tenant V2: esta migration só
--      adiciona objetos. Nenhum DROP, nenhum ALTER em tabela existente.
--
-- Referências: 02_PRECEDENCIA_E_DECISOES_OFICIAIS.md, SECURITY_BOUNDARIES.md,
--              ADMIN_PERMISSIONS_UI.md §"Dois eixos independentes"
-- =============================================================================

create schema if not exists platform;

comment on schema platform is
  'Camada global da plataforma. Exposição PostgREST é habilitada posteriormente com grants exclusivos para service_role.';

-- O schema não é concedido a anon/authenticated em nenhuma hipótese.
revoke all on schema platform from public;
grant usage on schema platform to service_role;

-- =============================================================================
-- 1. Enums da camada global
-- =============================================================================

-- Estado da conta global do administrador de plataforma.
create type platform.admin_status as enum ('active', 'blocked');

-- Estado de uma operação administrativa (provisionamento e afins).
--   pending      criada, ainda não iniciada
--   running      em execução
--   succeeded    concluída com sucesso
--   failed       falhou e é potencialmente repetível
--   compensating compensação em andamento
--   compensated  revertida sem deixar registro órfão
--   needs_manual intervenção humana obrigatória (não repetível)
create type platform.operation_status as enum (
  'pending', 'running', 'succeeded', 'failed',
  'compensating', 'compensated', 'needs_manual'
);

-- Estado de cada sub-operação.
create type platform.step_status as enum (
  'pending', 'running', 'succeeded', 'failed', 'skipped', 'compensated'
);

-- Tipo de operação global. Só provisionamento no MVP, mas o enum já é o ponto
-- de extensão para retentativa e futuras operações.
create type platform.operation_kind as enum (
  'provision_company', 'replace_company_admin'
);

-- Motivos padronizados de suspensão. Vocabulário fechado, sem cobrança/planos
-- (ADMIN_BUSINESS_FLOWS.md §"Ciclo de vida da empresa").
create type platform.suspension_reason as enum (
  'solicitacao_do_cliente',
  'violacao_contratual',
  'risco_de_seguranca',
  'cadastro_em_revisao'
);

-- =============================================================================
-- 2. Identidade global
-- =============================================================================
-- Um platform_admin é um auth.users + profiles como qualquer outro, MAIS uma
-- linha aqui. Ele normalmente não possui company_membership; se possuísse, os
-- dois papéis continuariam independentes.

create table platform.admins (
  user_id      uuid primary key references public.profiles (id) on delete restrict,
  status       platform.admin_status not null default 'active',
  granted_at   timestamptz not null default now(),
  granted_by   uuid references public.profiles (id) on delete set null,
  blocked_at   timestamptz,
  blocked_by   uuid references public.profiles (id) on delete set null,
  block_reason text,
  mfa_enrolled boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint platform_admins_block_consistent check (
    (status = 'active'  and blocked_at is null and blocked_by is null and block_reason is null)
    or
    (status = 'blocked' and blocked_at is not null)
  )
);

comment on table platform.admins is
  'Papel global platform_admin. Independente de company_memberships: um platform_admin '
  'não pertence a empresa alguma e não pode ser criado por um company_admin.';
comment on column platform.admins.status is
  'Conta GLOBAL. Não confundir com company_memberships.active, que é acesso a UMA empresa.';

create index platform_admins_status_idx on platform.admins (status);

-- Piso de plataforma: nunca é permitido bloquear o último platform_admin ativo.
-- Sem isso a plataforma ficaria administrativamente inacessível — o equivalente
-- global de LAST_ADMIN_PROTECTED.
create or replace function platform.tg_protect_last_platform_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_remaining integer;
begin
  if tg_op = 'UPDATE' and new.status = 'active' then
    return new;
  end if;
  if old.status <> 'active' then
    return coalesce(new, old);
  end if;

  select count(*) into v_remaining
  from platform.admins a
  where a.status = 'active' and a.user_id <> old.user_id;

  if v_remaining = 0 then
    raise exception
      'LAST_PLATFORM_ADMIN_PROTECTED: a plataforma precisa manter ao menos um administrador ativo'
      using errcode = '23514', hint = 'LAST_PLATFORM_ADMIN_PROTECTED';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger platform_admins_protect_last
  before update or delete on platform.admins
  for each row execute function platform.tg_protect_last_platform_admin();

create trigger platform_admins_touch_updated
  before update on platform.admins
  for each row execute function private.tg_set_updated_at();

-- =============================================================================
-- 3. Helpers de autorização global
-- =============================================================================

-- Verdadeiro somente para conta global ATIVA e profile ATIVO.
-- Os dois eixos precisam estar ativos, como em private.current_membership().
create or replace function private.is_platform_admin(p_user_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from platform.admins a
    join public.profiles p on p.id = a.user_id
    where a.user_id = coalesce(p_user_id, auth.uid())
      and a.status = 'active'
      and p.active
  );
$$;

comment on function private.is_platform_admin(uuid) is
  'Papel global ativo E profile global ativo. Não consulta company_memberships.';

-- Guarda para uso dentro das RPCs administrativas. O ator é sempre explícito:
-- a Edge Function roda como service_role e informa quem é o humano por trás.
create or replace function private.assert_platform_admin(p_actor_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_actor_user_id is null then
    raise exception 'FORBIDDEN: ator não informado'
      using errcode = '42501', hint = 'PERMISSION_DENIED';
  end if;

  if not private.is_platform_admin(p_actor_user_id) then
    raise exception 'FORBIDDEN: ator % não é platform_admin ativo', p_actor_user_id
      using errcode = '42501', hint = 'NOT_PLATFORM_ADMIN';
  end if;
end;
$$;

revoke all on function private.is_platform_admin(uuid) from public, anon, authenticated;
revoke all on function private.assert_platform_admin(uuid) from public, anon, authenticated;
grant execute on function private.is_platform_admin(uuid) to service_role;
grant execute on function private.assert_platform_admin(uuid) to service_role;

-- =============================================================================
-- 4. RLS: negação total por padrão
-- =============================================================================
-- service_role tem BYPASSRLS; habilitar RLS sem policy permissiva é a forma
-- mais forte de dizer "authenticated jamais lê isto", mesmo que um grant
-- futuro escape por engano.

alter table platform.admins enable row level security;
alter table platform.admins force row level security;

revoke all on all tables in schema platform from public, anon, authenticated;
