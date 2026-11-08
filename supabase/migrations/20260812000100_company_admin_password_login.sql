-- =============================================================================
-- PegaNaFrota — 20260812000100 — Primeiro administrador com senha direta
-- =============================================================================
-- O administrador da plataforma define a senha inicial no provisionamento.
-- A conta Auth é criada pela Edge Function com email_confirm=true; esta RPC
-- cria o profile/vínculo company_admin já ATIVO e conclui a operação sem convite.
-- A etapa histórica `send_invite` é mantida apenas por compatibilidade com o
-- modelo de operações existente e fica marcada como `skipped`.
-- =============================================================================

create or replace function platform.provision_first_admin_password(
  p_operation_id  uuid,
  p_actor_user_id uuid,
  p_company_id    uuid,
  p_user_id       uuid,
  p_email         text,
  p_full_name     text,
  p_phone         text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profile    public.profiles;
  v_membership public.company_memberships;
  v_other      uuid;
  v_result     jsonb;
begin
  perform private.assert_platform_admin(p_actor_user_id);
  perform platform.mark_step(p_operation_id, 'link_company_admin', 'running');

  if private.normalize_label(p_full_name) is null then
    raise exception 'INVALID_INPUT: nome completo é obrigatório'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  if p_user_id is null or p_company_id is null then
    raise exception 'INVALID_INPUT: empresa e usuário são obrigatórios'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  -- ADR-004: uma conta não pode ter vínculo ativo com duas empresas.
  select m.company_id into v_other
  from public.company_memberships m
  where m.user_id = p_user_id and m.active and m.company_id <> p_company_id
  limit 1;

  if v_other is not null then
    raise exception 'USER_ALREADY_LINKED: usuário já possui vínculo ativo com outra empresa'
      using errcode = '23505', hint = 'auth_email_conflict', detail = v_other::text;
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    insert into public.profiles (id, full_name, phone, active)
    values (
      p_user_id,
      private.normalize_label(p_full_name),
      private.normalize_digits(p_phone),
      true
    )
    returning * into v_profile;
  elsif not v_profile.active then
    raise exception 'PROFILE_GLOBALLY_INACTIVE: a conta global está bloqueada'
      using errcode = '42501', hint = 'PROFILE_GLOBALLY_INACTIVE';
  end if;

  insert into public.company_memberships (company_id, user_id, role, active)
  values (p_company_id, p_user_id, 'company_admin', true)
  on conflict (company_id, user_id) do update
     set role = 'company_admin', active = true
  returning * into v_membership;

  perform platform.mark_step(
    p_operation_id,
    'link_company_admin',
    'succeeded',
    'Vínculo company_admin ativo; login por senha liberado'
  );

  perform platform.mark_step(
    p_operation_id,
    'send_invite',
    'skipped',
    'Convite não necessário: acesso criado diretamente com senha'
  );

  perform platform.log_event(
    p_actor_user_id => p_actor_user_id,
    p_action        => 'company_admin.provisioned',
    p_result        => 'success',
    p_target_type   => 'public.company_memberships',
    p_target_id     => p_user_id,
    p_company_id    => p_company_id,
    p_operation_id  => p_operation_id,
    p_metadata      => jsonb_build_object(
      'email', lower(btrim(p_email)),
      'role', 'company_admin',
      'accessMode', 'password',
      'inviteSent', false
    )
  );

  v_result := jsonb_build_object(
    'companyId', p_company_id,
    'userId', p_user_id,
    'role', 'company_admin',
    'membershipActive', v_membership.active,
    'inviteSent', false,
    'accessMode', 'password'
  );

  -- Concluir na MESMA transação do vínculo evita estado "admin ativo + operação
  -- falhou" caso a etapa final do banco encontre algum problema.
  return platform.finish_provisioning(
    p_operation_id  => p_operation_id,
    p_actor_user_id => p_actor_user_id,
    p_result        => v_result
  );
end;
$$;

revoke all on function platform.provision_first_admin_password(
  uuid, uuid, uuid, uuid, text, text, text
) from public, anon, authenticated;

grant execute on function platform.provision_first_admin_password(
  uuid, uuid, uuid, uuid, text, text, text
) to service_role;

notify pgrst, 'reload schema';
