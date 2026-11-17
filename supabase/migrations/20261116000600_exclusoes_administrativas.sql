-- Exclusões administrativas preservam a autoria operacional quando necessário.
begin;

create function private.confirmation_matches(p_given text, p_expected text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    lower(private.normalize_label(p_given)) = lower(private.normalize_label(p_expected)),
    false
  );
$$;

create function private.has_operational_authorship(p_user_id uuid, p_company_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.vehicle_odometer_events
    where created_by = p_user_id and (p_company_id is null or company_id = p_company_id)
  ) or exists (
    select 1 from private.odometer_revisions
    where created_by = p_user_id and (p_company_id is null or company_id = p_company_id)
  ) or exists (
    select 1 from private.odometer_voids
    where created_by = p_user_id and (p_company_id is null or company_id = p_company_id)
  ) or exists (
    select 1 from public.vehicle_movements
    where operator_user_id = p_user_id and (p_company_id is null or company_id = p_company_id)
  ) or exists (
    select 1 from public.trips
    where p_user_id in (created_by, cancelled_by, archived_by)
      and (p_company_id is null or company_id = p_company_id)
  ) or exists (
    select 1 from public.maintenance_records
    where p_user_id in (created_by, cancelled_by, archived_by)
      and (p_company_id is null or company_id = p_company_id)
  ) or exists (
    select 1 from public.fuelings
    where p_user_id in (created_by, voided_by)
      and (p_company_id is null or company_id = p_company_id)
  ) or exists (
    select 1 from public.plate_read_events
    where p_user_id in (created_by, manual_override_by)
      and (p_company_id is null or company_id = p_company_id)
  ) or exists (
    select 1 from public.vehicles
    where archived_by = p_user_id and (p_company_id is null or company_id = p_company_id)
  ) or exists (
    select 1 from public.drivers
    where archived_by = p_user_id and (p_company_id is null or company_id = p_company_id)
  ) or exists (
    select 1 from public.locations
    where archived_by = p_user_id and (p_company_id is null or company_id = p_company_id)
  ) or exists (
    select 1 from private.initial_vehicle_presence
    where recorded_by = p_user_id and (p_company_id is null or company_id = p_company_id)
  ) or exists (
    select 1 from public.maintenance_plans
    where created_by = p_user_id and (p_company_id is null or company_id = p_company_id)
  );
$$;

create function private.account_retention_reason(p_user_id uuid, p_company_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when exists (
      select 1 from platform.admins where user_id = p_user_id
    ) then 'platform_admin'
    when exists (
      select 1 from public.company_memberships
      where user_id = p_user_id and company_id <> p_company_id
    ) then 'other_company_membership'
    when private.has_operational_authorship(p_user_id, null) then 'operational_history'
  end;
$$;

revoke all on function private.confirmation_matches(text, text),
  private.has_operational_authorship(uuid, uuid),
  private.account_retention_reason(uuid, uuid) from public, anon, authenticated, service_role;


create or replace function platform.set_company_status(
  p_actor_user_id   uuid,
  p_company_id      uuid,
  p_status          public.company_status,
  p_reason_code     platform.suspension_reason default null,
  p_confirmed_name  text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_company public.companies;
  v_prior   public.company_status;
  v_action  text;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  select * into v_company from public.companies where id = p_company_id for update;
  if not found then
    raise exception 'NOT_FOUND: empresa % não existe', p_company_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  v_prior := v_company.status;

  -- Idempotente: pedir o estado em que já está devolve sucesso sem novo evento.
  if v_prior = p_status then
    return jsonb_build_object('id', p_company_id, 'status', p_status, 'changed', false);
  end if;

  -- Transições válidas: active <-> suspended, e {active|suspended} -> archived.
  -- O arquivamento impede novas mudanças de status.
  if v_prior = 'archived' then
    raise exception 'CONFLICT_STATE: empresa arquivada não muda de estado'
      using errcode = '55000', hint = 'CONFLICT_ARCHIVED';
  end if;

  if p_status = 'suspended' then
    if p_reason_code is null then
      raise exception 'INVALID_INPUT: motivo padronizado é obrigatório para suspender'
        using errcode = '22023', hint = 'REASON_REQUIRED';
    end if;
    v_action := 'company.suspended';
  elsif p_status = 'active' then
    v_action := 'company.reactivated';
  else
    -- archived exige o nome digitado conferindo, além da identidade validada na
    -- Edge Function. Duas barreiras para uma ação irreversível.
    if not private.confirmation_matches(p_confirmed_name, v_company.trade_name) then
      raise exception 'CONFIRMATION_MISMATCH: o nome digitado não confere'
        using errcode = '22023', hint = 'CONFIRMATION_MISMATCH';
    end if;
    v_action := 'company.archived';
  end if;

  update public.companies
     set status      = p_status,
         archived_at = case when p_status = 'archived' then now() else archived_at end,
         archived_by = case when p_status = 'archived' then p_actor_user_id else archived_by end
   where id = p_company_id
  returning * into v_company;

  perform platform.log_event(
    p_actor_user_id => p_actor_user_id,
    p_action        => v_action,
    p_result        => 'success',
    p_target_type   => 'public.companies',
    p_target_id     => p_company_id,
    p_company_id    => p_company_id,
    p_metadata      => jsonb_build_object(
                         'priorStatus', v_prior,
                         'newStatus', p_status,
                         'reasonCode', p_reason_code,
                         'idempotencyKey', p_idempotency_key
                       )
  );

  return jsonb_build_object('id', p_company_id, 'status', p_status, 'changed', true,
                            'priorStatus', v_prior);
end;
$$;

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
  v_retention_reason text;
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

  if not private.confirmation_matches(p_confirmed_identity, v_expected) then
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
  v_retention_reason := private.account_retention_reason(p_user_id, p_company_id);

  return jsonb_build_object(
    'userId', p_user_id,
    'fullName', v_profile.full_name,
    'email', v_email,
    'role', v_membership.role,
    'deleteAuthUser', v_retention_reason is null,
    'retainedReason', v_retention_reason,
    'hasOtherMemberships', v_has_other_memberships,
    'isPlatformAdmin', v_is_platform_admin
  );
end;
$$;

create or replace function platform.unlink_company_member(
  p_actor_user_id uuid,
  p_company_id uuid,
  p_user_id uuid
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
  v_preserve_membership boolean;
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
  v_preserve_membership := private.has_operational_authorship(p_user_id, p_company_id);

  delete from platform.company_invites
  where company_id = p_company_id and user_id = p_user_id;

  -- O vínculo inativo mantém a validação de autoria quando registros são editados
  -- posteriormente. O trigger de proteção do último administrador vale nos dois casos.
  if v_preserve_membership then
    update public.company_memberships
    set active = false
    where id = v_membership.id and active;
  else
    delete from public.company_memberships where id = v_membership.id;
  end if;

  perform platform.log_event(
    p_actor_user_id,
    'company.member.deleted',
    'success',
    'public.profiles',
    p_user_id,
    p_company_id,
    null,
    jsonb_build_object(
      'role', v_membership.role,
      'membershipDeleted', not v_preserve_membership,
      'authUserDeleted', false
    )
  );

  return jsonb_build_object(
    'userId', p_user_id,
    'fullName', v_name,
    'companyAccessRevoked', true,
    'membershipDeleted', not v_preserve_membership,
    'authUserDeleted', false
  );
end;
$$;

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

  if not private.confirmation_matches(p_confirmed_name, v_company.trade_name) then
    raise exception 'CONFIRMATION_MISMATCH: nome informado não corresponde à empresa'
      using errcode = '22023', hint = 'CONFIRMATION_MISMATCH';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', m.user_id,
    'fullName', p.full_name,
    'email', au.email
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

  -- Exclui fontes e duplicatas na mesma operação, preservando as restrições
  -- de cada linha até que todas as referências da empresa sejam removidas.
  delete from public.plate_read_events where company_id = p_company_id;

  delete from public.fuelings where company_id = p_company_id;
  delete from public.maintenance_records where company_id = p_company_id;
  delete from public.trips where company_id = p_company_id;

  delete from private.odometer_revisions where company_id = p_company_id;
  delete from private.odometer_voids where company_id = p_company_id;
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

  -- Só agora é possível saber se uma conta ainda tem registros fora do tenant.
  select coalesce(jsonb_agg(m.dados || jsonb_build_object(
    'deleteAuthUser', motivo.codigo is null,
    'retainedReason', motivo.codigo
  )), '[]'::jsonb)
  into v_members
  from jsonb_array_elements(v_members) as m(dados)
  cross join lateral (
    select private.account_retention_reason((m.dados->>'userId')::uuid, p_company_id) as codigo
  ) as motivo;

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

commit;
