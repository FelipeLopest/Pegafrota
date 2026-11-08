-- =============================================================================
-- PegaNaFrota — 20260812000200 — exclusão definitiva e gestão de usuários
-- =============================================================================
-- Recursos administrativos globais:
--   * listar todos os usuários de uma empresa;
--   * redefinir senha de usuário ativo (a senha continua somente no Supabase Auth);
--   * excluir/desvincular usuário de uma empresa com proteção do último admin;
--   * excluir definitivamente uma empresa ARQUIVADA e todos os dados do tenant.
--
-- A exclusão definitiva é intencionalmente um segundo passo após o arquivamento.
-- Ela remove os dados operacionais do tenant e a auditoria do tenant. A trilha
-- global da plataforma é preservada, mas referências/payloads da empresa são
-- saneados para não manter cadastro operacional apagado.
-- =============================================================================

-- Contexto interno usado apenas durante o purge transacional. O segundo teste
-- (JWT service_role) impede que um cliente authenticated habilite o bypass
-- apenas definindo um GUC customizado.
create or replace function private.is_platform_hard_delete()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(current_setting('app.platform_hard_delete', true), '') = 'on'
     and coalesce(
       nullif(current_setting('request.jwt.claim.role', true), ''),
       (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
     ) = 'service_role';
$$;

-- Durante o purge, registros imutáveis precisam poder sair fisicamente. Fora
-- desse contexto, o comportamento append-only/imutável continua idêntico.
create or replace function private.tg_forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_platform_hard_delete() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  raise exception 'IMMUTABLE_RECORD: % em %.% não é permitido',
    tg_op, tg_table_schema, tg_table_name
    using errcode = '23514', hint = 'APPEND_ONLY_TABLE';
end;
$$;

create or replace function private.tg_forbid_update_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_platform_hard_delete() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  raise exception 'IMMUTABLE_RECORD: % em %.% não é permitido',
    tg_op, tg_table_schema, tg_table_name
    using errcode = '23514', hint = 'IMMUTABLE_RECORD';
end;
$$;

-- O trigger do último administrador continua valendo em qualquer exclusão
-- normal. Ele é ignorado somente quando a PRÓPRIA empresa está sendo purgada.
create or replace function private.tg_protect_last_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_company uuid;
  v_remaining integer;
begin
  if private.is_platform_hard_delete() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.active and new.role = 'company_admin' then
      return new;
    end if;
    if not (old.active and old.role = 'company_admin') then
      return new;
    end if;
    v_company := old.company_id;
  else
    if not (old.active and old.role = 'company_admin') then
      return old;
    end if;
    v_company := old.company_id;
  end if;

  select count(*) into v_remaining
  from public.company_memberships m
  where m.company_id = v_company
    and m.role = 'company_admin'
    and m.active
    and m.id <> old.id;

  if v_remaining = 0 then
    raise exception
      'LAST_ADMIN_PROTECTED: a empresa % precisa manter ao menos um company_admin ativo', v_company
      using errcode = '23514', hint = 'LAST_ADMIN_PROTECTED';
  end if;

  if tg_op = 'UPDATE' then return new; end if;
  return old;
end;
$$;

-- Não gera uma cascata de eventos de auditoria para cada linha eliminada pelo
-- purge. Um único evento global company.deleted_permanently é registrado ao fim.
create or replace function private.log_audit_event(
  p_company_id     uuid,
  p_action         audit.event_action,
  p_entity         text,
  p_entity_id      uuid,
  p_changed_fields jsonb default null,
  p_metadata       jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_platform_hard_delete() then
    return;
  end if;

  insert into audit.events (
    company_id, actor_user_id, action, entity, entity_id,
    changed_fields, request_id, metadata
  )
  values (
    p_company_id,
    private.current_user_id(),
    p_action,
    p_entity,
    p_entity_id,
    p_changed_fields,
    private.request_id(),
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

-- =============================================================================
-- 1. Usuários de uma empresa
-- =============================================================================
create or replace function platform.list_company_members(
  p_actor_user_id uuid,
  p_company_id    uuid,
  p_search        text default null,
  p_page          integer default 1,
  p_page_size     integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_search text := private.normalize_label(p_search);
  v_total integer;
  v_items jsonb;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  if not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'NOT_FOUND: empresa % não existe', p_company_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  select count(*) into v_total
  from public.company_memberships m
  join public.profiles p on p.id = m.user_id
  left join auth.users au on au.id = m.user_id
  where m.company_id = p_company_id
    and (v_search is null
      or p.full_name ilike '%' || v_search || '%'
      or coalesce(au.email, '') ilike '%' || v_search || '%'
      or m.role::text ilike '%' || v_search || '%');

  select coalesce(jsonb_agg(x order by ord), '[]'::jsonb) into v_items
  from (
    select row_number() over (order by m.created_at, p.full_name) as ord,
      jsonb_build_object(
        'membershipId', m.id,
        'userId', m.user_id,
        'fullName', p.full_name,
        'email', au.email,
        'phone', p.phone,
        'role', m.role,
        'companyAccessActive', m.active,
        'globalAccountActive', p.active,
        'emailConfirmed', (au.email_confirmed_at is not null),
        'lastSeenAt', p.last_seen_at,
        'linkedAt', m.created_at
      ) as x
    from public.company_memberships m
    join public.profiles p on p.id = m.user_id
    left join auth.users au on au.id = m.user_id
    where m.company_id = p_company_id
      and (v_search is null
        or p.full_name ilike '%' || v_search || '%'
        or coalesce(au.email, '') ilike '%' || v_search || '%'
        or m.role::text ilike '%' || v_search || '%')
    order by m.created_at, p.full_name
    offset (v_page - 1) * v_size
    limit v_size
  ) s;

  return jsonb_build_object(
    'items', v_items,
    'page', v_page,
    'pageSize', v_size,
    'total', v_total
  );
end;
$$;

-- Valida o alvo e informa à Edge Function se a identidade Auth pode ser apagada
-- inteira ou se deve apenas perder o vínculo com esta empresa.
create or replace function platform.prepare_delete_company_member(
  p_actor_user_id    uuid,
  p_company_id       uuid,
  p_user_id          uuid,
  p_confirmed_identity text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_membership public.company_memberships;
  v_profile public.profiles;
  v_email text;
  v_expected text;
  v_other_admins integer;
  v_has_other_memberships boolean;
  v_is_platform_admin boolean;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  select * into v_membership
  from public.company_memberships m
  where m.company_id = p_company_id and m.user_id = p_user_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: usuário não pertence à empresa'
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  select * into v_profile from public.profiles where id = p_user_id;
  if not found then
    raise exception 'NOT_FOUND: perfil do usuário não existe'
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  select email into v_email from auth.users where id = p_user_id;
  v_expected := coalesce(v_email, v_profile.full_name);

  if private.normalize_label(p_confirmed_identity) is distinct from private.normalize_label(v_expected) then
    raise exception 'CONFIRMATION_MISMATCH: confirmação não corresponde ao usuário'
      using errcode = '22023', hint = 'CONFIRMATION_MISMATCH';
  end if;

  if v_membership.active and v_membership.role = 'company_admin' then
    select count(*) into v_other_admins
    from public.company_memberships m
    where m.company_id = p_company_id
      and m.role = 'company_admin'
      and m.active
      and m.user_id <> p_user_id;

    if v_other_admins = 0 then
      raise exception 'LAST_ADMIN_PROTECTED: a empresa precisa manter ao menos um administrador ativo'
        using errcode = '23514', hint = 'LAST_ADMIN_PROTECTED';
    end if;
  end if;

  select exists(
    select 1 from public.company_memberships m
    where m.user_id = p_user_id and m.company_id <> p_company_id
  ) into v_has_other_memberships;

  select exists(
    select 1 from platform.admins a where a.user_id = p_user_id
  ) into v_is_platform_admin;

  return jsonb_build_object(
    'userId', p_user_id,
    'fullName', v_profile.full_name,
    'email', v_email,
    'role', v_membership.role,
    'deleteAuthUser', not v_has_other_memberships and not v_is_platform_admin,
    'hasOtherMemberships', v_has_other_memberships,
    'isPlatformAdmin', v_is_platform_admin
  );
end;
$$;

create or replace function platform.unlink_company_member(
  p_actor_user_id uuid,
  p_company_id    uuid,
  p_user_id       uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_membership public.company_memberships;
  v_name text;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  select * into v_membership
  from public.company_memberships m
  where m.company_id = p_company_id and m.user_id = p_user_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: usuário não pertence à empresa'
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  select full_name into v_name from public.profiles where id = p_user_id;

  -- O trigger memberships_protect_last_admin continua como última barreira.
  delete from platform.company_invites
  where company_id = p_company_id and user_id = p_user_id;

  delete from public.company_memberships
  where id = v_membership.id;

  perform platform.log_event(
    p_actor_user_id,
    'company.member.deleted',
    'success',
    'public.profiles',
    p_user_id,
    p_company_id,
    null,
    jsonb_build_object('role', v_membership.role, 'authUserDeleted', false)
  );

  return jsonb_build_object(
    'userId', p_user_id,
    'fullName', v_name,
    'membershipDeleted', true,
    'authUserDeleted', false
  );
end;
$$;

create or replace function platform.get_company_member_for_password_reset(
  p_actor_user_id uuid,
  p_company_id    uuid,
  p_user_id       uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_membership public.company_memberships;
  v_profile public.profiles;
  v_email text;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  select * into v_membership
  from public.company_memberships m
  where m.company_id = p_company_id and m.user_id = p_user_id;

  if not found then
    raise exception 'NOT_FOUND: usuário não pertence à empresa'
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  select * into v_profile from public.profiles where id = p_user_id;
  if not found then
    raise exception 'NOT_FOUND: perfil do usuário não existe'
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  if not v_membership.active or not v_profile.active then
    raise exception 'USER_NOT_ACTIVE: só é possível alterar a senha de usuário com acesso ativo'
      using errcode = '23514', hint = 'USER_NOT_ACTIVE';
  end if;

  select email into v_email from auth.users where id = p_user_id;
  if v_email is null then
    raise exception 'NOT_FOUND: identidade Auth não encontrada'
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  return jsonb_build_object(
    'userId', p_user_id,
    'fullName', v_profile.full_name,
    'email', v_email,
    'role', v_membership.role
  );
end;
$$;

-- =============================================================================
-- 2. Exclusão definitiva da empresa
-- =============================================================================
create or replace function platform.hard_delete_company(
  p_actor_user_id uuid,
  p_company_id    uuid,
  p_confirmed_name text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_company public.companies;
  v_members jsonb := '[]'::jsonb;
  v_counts jsonb;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  select * into v_company
  from public.companies
  where id = p_company_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: empresa % não existe', p_company_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  if v_company.status <> 'archived' then
    raise exception 'CONFLICT_STATE: arquive a empresa antes da exclusão definitiva'
      using errcode = '23514', hint = 'CONFLICT_STATE';
  end if;

  if private.normalize_label(p_confirmed_name) is distinct from private.normalize_label(v_company.trade_name) then
    raise exception 'CONFIRMATION_MISMATCH: nome informado não corresponde à empresa'
      using errcode = '22023', hint = 'CONFIRMATION_MISMATCH';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', m.user_id,
    'fullName', p.full_name,
    'email', au.email,
    'deleteAuthUser',
      not exists (
        select 1 from public.company_memberships other
        where other.user_id = m.user_id and other.company_id <> p_company_id
      )
      and not exists (
        select 1 from platform.admins pa where pa.user_id = m.user_id
      )
  )), '[]'::jsonb)
  into v_members
  from public.company_memberships m
  join public.profiles p on p.id = m.user_id
  left join auth.users au on au.id = m.user_id
  where m.company_id = p_company_id;

  select jsonb_build_object(
    'members', (select count(*) from public.company_memberships where company_id = p_company_id),
    'drivers', (select count(*) from public.drivers where company_id = p_company_id),
    'vehicles', (select count(*) from public.vehicles where company_id = p_company_id),
    'trips', (select count(*) from public.trips where company_id = p_company_id),
    'fuelings', (select count(*) from public.fuelings where company_id = p_company_id),
    'maintenance', (select count(*) from public.maintenance_records where company_id = p_company_id),
    'locations', (select count(*) from public.locations where company_id = p_company_id),
    'movements', (select count(*) from public.vehicle_movements where company_id = p_company_id),
    'plateReads', (select count(*) from public.plate_read_events where company_id = p_company_id)
  ) into v_counts;

  perform set_config('app.platform_hard_delete', 'on', true);

  -- Histórico GLOBAL permanece, mas sem FK/payload cadastral da empresa apagada.
  update platform.audit_events
  set company_id = null,
      metadata = jsonb_build_object('purged', true, 'deletedCompanyId', p_company_id)
  where company_id = p_company_id;

  update platform.operations
  set company_id = null,
      request_payload = jsonb_build_object('purged', true, 'deletedCompanyId', p_company_id),
      result_payload = case when result_payload is null then null
        else jsonb_build_object('purged', true, 'deletedCompanyId', p_company_id) end,
      error_detail = null
  where company_id = p_company_id;

  delete from platform.company_invites where company_id = p_company_id;

  -- Dependências mais profundas primeiro.
  delete from public.vehicle_movements where company_id = p_company_id;

  update public.plate_read_events
  set duplicate_of_id = null
  where company_id = p_company_id and duplicate_of_id is not null;
  delete from public.plate_read_events where company_id = p_company_id;

  delete from public.fuelings where company_id = p_company_id;
  delete from public.maintenance_records where company_id = p_company_id;
  delete from public.trips where company_id = p_company_id;

  update public.vehicle_odometer_events
  set correction_of_id = null
  where company_id = p_company_id and correction_of_id is not null;
  delete from public.vehicle_odometer_events where company_id = p_company_id;

  delete from public.cameras where company_id = p_company_id;
  delete from public.locations where company_id = p_company_id;
  delete from public.vehicles where company_id = p_company_id;
  delete from public.drivers where company_id = p_company_id;
  delete from public.company_memberships where company_id = p_company_id;

  -- A auditoria do tenant é dado do próprio tenant e sai junto com ele.
  delete from audit.events where company_id = p_company_id;

  delete from public.companies where id = p_company_id;

  perform set_config('app.platform_hard_delete', 'off', true);

  perform platform.log_event(
    p_actor_user_id,
    'company.deleted_permanently',
    'success',
    'public.companies',
    p_company_id,
    null,
    null,
    jsonb_build_object(
      'deletedCompanyId', p_company_id,
      'counts', v_counts
    )
  );

  return jsonb_build_object(
    'companyId', p_company_id,
    'tradeName', v_company.trade_name,
    'deleted', true,
    'members', v_members,
    'counts', v_counts
  );
end;
$$;

-- =============================================================================
-- 3. Grants — somente a Edge Function com service_role
-- =============================================================================
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'platform'
      and p.proname in (
        'list_company_members',
        'prepare_delete_company_member',
        'unlink_company_member',
        'get_company_member_for_password_reset',
        'hard_delete_company'
      )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end
$$;
