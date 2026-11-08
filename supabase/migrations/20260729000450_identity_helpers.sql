-- =============================================================================
-- PegaNaFrota — 000450 — Helpers de identidade e autorização
-- =============================================================================
-- Separado de 000300 porque estas funções leem companies, profiles e
-- company_memberships, criadas em 000400.
--
-- TODAS são SECURITY DEFINER de propósito: as policies de company_memberships
-- as invocam, e uma função SECURITY INVOKER causaria recursão infinita de RLS.
--
-- Referência: SECURITY_MODEL.md §5.2, DATABASE_BLUEPRINT.md §4
-- =============================================================================

-- IMPORTANTE: current_user_company_id() e current_user_role() são SECURITY
-- DEFINER e por isso ignoram RLS. Isso é obrigatório: as policies de
-- company_memberships chamam essas funções e haveria recursão infinita se elas
-- fossem SECURITY INVOKER.

create or replace function private.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid();
$$;
comment on function private.current_user_id() is 'UUID do usuário autenticado, ou NULL.';

-- Resolve empresa + papel exigindo profile ativo E membership ativa
-- (SECURITY_MODEL.md §7: os dois estados precisam estar ativos).
create or replace function private.current_membership()
returns table (company_id uuid, role public.membership_role)
language sql
stable
security definer
set search_path = ''
as $$
  select m.company_id, m.role
  from public.company_memberships m
  join public.profiles p on p.id = m.user_id
  join public.companies c on c.id = m.company_id
  where m.user_id = auth.uid()
    and m.active
    and p.active
    and c.status = 'active'
  limit 1;
$$;

create or replace function private.current_user_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select company_id from private.current_membership();
$$;
comment on function private.current_user_company_id() is
  'Empresa ativa do usuário. NULL bloqueia toda policy de negócio.';

create or replace function private.current_user_role()
returns public.membership_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from private.current_membership();
$$;

create or replace function private.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.current_membership());
$$;

create or replace function private.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.current_membership() cm
    join private.role_permissions rp on rp.role = cm.role
    where rp.permission_code = p_permission
  );
$$;
comment on function private.has_permission(text) is
  'True quando o papel do usuário ativo possui a permissão atômica informada.';

create or replace function private.current_permissions()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(rp.permission_code order by rp.permission_code), array[]::text[])
  from private.current_membership() cm
  join private.role_permissions rp on rp.role = cm.role;
$$;

-- Guarda de empresa para uso dentro de RPCs.
create or replace function private.assert_company_access(p_company_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company uuid;
begin
  v_company := private.current_user_company_id();

  if v_company is null then
    raise exception 'FORBIDDEN: usuário sem empresa ativa'
      using errcode = '42501', hint = 'AUTH_NO_ACTIVE_MEMBERSHIP';
  end if;

  if p_company_id is null or p_company_id <> v_company then
    raise exception 'FORBIDDEN: recurso pertence a outra empresa'
      using errcode = '42501', hint = 'TENANT_MISMATCH';
  end if;
end;
$$;

create or replace function private.assert_permission(p_permission text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission(p_permission) then
    raise exception 'FORBIDDEN: permissão % negada para o papel atual', p_permission
      using errcode = '42501', hint = 'PERMISSION_DENIED';
  end if;
end;
$$;

