begin;

-- A identidade Auth é uma etapa externa. Empresa e primeiro vínculo são
-- gravados juntos, depois que a identidade desta operação existe.
create function platform.prepare_company_provisioning(
  p_actor_user_id uuid,
  p_idempotency_key text,
  p_company jsonb,
  p_first_admin jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  operacao platform.operations;
  abertura record;
  empresa jsonb;
  administrador jsonb;
  cnpj_normalizado text := private.normalize_digits(p_company ->> 'cnpj');
  email_normalizado text := lower(btrim(p_first_admin ->> 'email'));
  empresa_existente uuid;
  identidade uuid;
  origem_identidade text;
begin
  perform private.assert_platform_admin(p_actor_user_id);
  if cnpj_normalizado is null or not private.is_valid_cnpj(cnpj_normalizado) then
    raise exception 'O CNPJ informado é inválido.' using errcode = '22023', hint = 'invalid_cnpj';
  end if;
  if email_normalizado is null or email_normalizado !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'Informe um e-mail válido para o primeiro administrador.'
      using errcode = '22023', hint = 'invalid_email';
  end if;
  if private.normalize_label(p_company ->> 'legalName') is null
    or private.normalize_label(p_company ->> 'tradeName') is null
    or private.normalize_label(p_first_admin ->> 'fullName') is null then
    raise exception 'Informe a razão social, o nome da empresa e o nome do primeiro administrador.'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  -- Guarde apenas campos do cadastro. A senha permanece na chamada ao Auth.
  select jsonb_object_agg(campo.key, campo.value) into empresa
    from jsonb_each(p_company) campo
    where campo.key in (
      'legalName', 'tradeName', 'cnpj', 'email', 'phone', 'addressStreet',
      'addressNumber', 'addressComplement', 'addressDistrict', 'addressCity',
      'addressState', 'addressPostalCode', 'timezone'
    );
  administrador := jsonb_build_object(
    'fullName', p_first_admin ->> 'fullName',
    'email', p_first_admin ->> 'email',
    'phone', p_first_admin ->> 'phone',
    'accessMode', 'password'
  );

  select * into abertura
    from platform.open_operation(
      'provision_company', p_actor_user_id, p_idempotency_key,
      jsonb_build_object('company', empresa, 'firstAdmin', administrador),
      array['create_auth_user', 'create_company', 'link_company_admin', 'send_invite']
    );
  select * into strict operacao from platform.operations
    where id = abertura.operation_id for update;
  if operacao.actor_user_id <> p_actor_user_id or operacao.kind <> 'provision_company' then
    raise exception 'Esta operação não pertence à sessão atual.'
      using errcode = '42501', hint = 'PERMISSION_DENIED';
  end if;
  if operacao.status = 'succeeded'
    or (operacao.status = 'running' and operacao.updated_at > now() - interval '5 minutes') then
    return jsonb_build_object('operationId', operacao.id, 'execute', false);
  end if;
  if operacao.company_id is not null or (
    operacao.status not in ('pending', 'running') and not operacao.retryable
  ) then
    raise exception 'Esta tentativa foi encerrada. Revise os dados e inicie um novo cadastro.'
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  select id into empresa_existente from public.companies c where c.cnpj = cnpj_normalizado;
  if found then
    raise exception 'Já existe uma empresa cadastrada com este CNPJ.'
      using errcode = '23505', hint = 'cnpj_already_exists', detail = empresa_existente::text;
  end if;

  select u.id, u.raw_app_meta_data ->> 'pnf_provisioning_operation'
    into identidade, origem_identidade
    from auth.users u
    where lower(u.email) = email_normalizado
    order by u.id limit 1;
  if identidade is not null and origem_identidade is distinct from operacao.id::text then
    raise exception 'Este e-mail já possui uma conta. Informe outro e-mail para o primeiro administrador.'
      using errcode = '23505', hint = 'auth_email_conflict';
  end if;

  update platform.operation_steps
    set status = 'pending', detail = null, error_code = null, started_at = null, finished_at = null
    where operation_id = operacao.id and status in ('failed', 'running');
  operacao := platform.mark_operation(operacao.id, 'running');
  perform platform.mark_step(operacao.id, 'create_auth_user', 'running');
  return jsonb_build_object(
    'operationId', operacao.id, 'attempt', operacao.attempt_count,
    'execute', true, 'authUserId', identidade
  );
end;
$$;

create function platform.complete_company_provisioning(
  p_actor_user_id uuid,
  p_operation_id uuid,
  p_attempt integer,
  p_auth_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  operacao platform.operations;
  administrador jsonb;
  empresa uuid;
  cnpj_normalizado text;
  email_normalizado text;
begin
  perform private.assert_platform_admin(p_actor_user_id);
  select * into operacao from platform.operations where id = p_operation_id for update;
  if not found or operacao.actor_user_id <> p_actor_user_id or operacao.kind <> 'provision_company' then
    raise exception 'Esta operação não pertence à sessão atual.'
      using errcode = '42501', hint = 'PERMISSION_DENIED';
  end if;
  if operacao.status = 'succeeded' then
    return platform.get_operation(p_actor_user_id, p_operation_id);
  end if;
  if operacao.status <> 'running' or operacao.attempt_count is distinct from p_attempt
    or operacao.company_id is not null then
    raise exception 'A tentativa de provisionamento não está mais em andamento.'
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  administrador := operacao.request_payload -> 'firstAdmin';
  email_normalizado := lower(btrim(administrador ->> 'email'));
  if not exists (
    select 1 from auth.users u where u.id = p_auth_user_id
      and lower(u.email) = email_normalizado
      and u.raw_app_meta_data ->> 'pnf_provisioning_operation' = operacao.id::text
      and u.email_confirmed_at is not null
  ) or exists (
    select 1 from public.company_memberships m where m.user_id = p_auth_user_id
  ) or exists (
    select 1 from platform.admins a where a.user_id = p_auth_user_id
  ) then
    raise exception 'A identidade confirmada não pertence a esta operação de cadastro.'
      using errcode = '23505', hint = 'auth_email_conflict';
  end if;

  perform platform.mark_step(operacao.id, 'create_auth_user', 'succeeded', 'Conta com e-mail confirmado.');
  begin
    -- A RPC histórica já conta a tentativa quando grava a empresa.
    -- Reuse a contagem registrada na abertura sob o mesmo bloqueio.
    update platform.operations set attempt_count = p_attempt - 1 where id = operacao.id;
    empresa := (platform.provision_company_record(
      operacao.id, p_actor_user_id, operacao.request_payload -> 'company'
    ) ->> 'companyId')::uuid;
  exception when unique_violation then
    -- O CNPJ pode ter sido cadastrado por outra operação após a prévia.
    cnpj_normalizado := private.normalize_digits(operacao.request_payload #>> '{company,cnpj}');
    select c.id into empresa from public.companies c where c.cnpj = cnpj_normalizado;
    if not found then raise; end if;
    raise exception 'Já existe uma empresa cadastrada com este CNPJ.'
      using errcode = '23505', hint = 'cnpj_already_exists', detail = empresa::text;
  end;

  return platform.provision_first_admin_password(
    operacao.id, p_actor_user_id, empresa, p_auth_user_id, email_normalizado,
    administrador ->> 'fullName', administrador ->> 'phone'
  );
end;
$$;

create function platform.fail_company_provisioning_attempt(
  p_actor_user_id uuid,
  p_operation_id uuid,
  p_attempt integer,
  p_error_code text,
  p_error_detail text,
  p_retryable boolean,
  p_auth_user_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  operacao platform.operations;
  resultado jsonb;
  pode_excluir boolean;
begin
  perform private.assert_platform_admin(p_actor_user_id);
  select * into operacao from platform.operations where id = p_operation_id for update;
  if not found or operacao.actor_user_id <> p_actor_user_id or operacao.kind <> 'provision_company' then
    raise exception 'Esta operação não pertence à sessão atual.'
      using errcode = '42501', hint = 'PERMISSION_DENIED';
  end if;
  if operacao.status <> 'running' or operacao.attempt_count is distinct from p_attempt
    or operacao.company_id is not null then
    return platform.get_operation(p_actor_user_id, p_operation_id);
  end if;

  -- Uma perda de resposta após o commit nunca chega à exclusão. O bloqueio
  -- desta linha é o mesmo da RPC que faz o vínculo definitivo.
  pode_excluir := not p_retryable and p_auth_user_id is not null
    and exists (
      select 1 from auth.users u where u.id = p_auth_user_id
        and u.raw_app_meta_data ->> 'pnf_provisioning_operation' = operacao.id::text
    )
    and not exists (select 1 from public.profiles p where p.id = p_auth_user_id);
  perform platform.mark_step(
    operacao.id, case when p_auth_user_id is null then 'create_auth_user' else 'create_company' end,
    'failed', p_error_detail, p_error_code
  );
  resultado := platform.fail_provisioning(
    operacao.id, p_actor_user_id, p_error_code, p_error_detail, p_retryable
  );
  return resultado || jsonb_build_object('deleteAuthUser', coalesce(pode_excluir, false));
end;
$$;

-- A função de servidor usa os dados já auditados na retentativa; a senha
-- inicial é solicitada ao administrador e nunca fica no banco de operações.
create function platform.get_company_provisioning_retry_request(p_actor_user_id uuid, p_operation_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  operacao platform.operations;
begin
  perform private.assert_platform_admin(p_actor_user_id);
  select * into operacao from platform.operations where id = p_operation_id;
  if not found or operacao.actor_user_id <> p_actor_user_id then
    raise exception 'Somente a pessoa que iniciou este cadastro pode retomá-lo.'
      using errcode = '42501', hint = 'PERMISSION_DENIED';
  end if;
  if operacao.kind <> 'provision_company'
    or operacao.request_payload #>> '{firstAdmin,accessMode}' is distinct from 'password'
    or (operacao.status <> 'succeeded' and (operacao.company_id is not null or not operacao.retryable)) then
    raise exception 'Este cadastro não pode ser retomado com segurança.'
      using errcode = '55000', hint = 'NOT_RETRYABLE';
  end if;
  return operacao.request_payload || jsonb_build_object('idempotencyKey', operacao.idempotency_key);
end;
$$;

revoke all on function platform.prepare_company_provisioning(uuid, text, jsonb, jsonb),
  platform.complete_company_provisioning(uuid, uuid, integer, uuid),
  platform.fail_company_provisioning_attempt(uuid, uuid, integer, text, text, boolean, uuid),
  platform.get_company_provisioning_retry_request(uuid, uuid)
  from public, anon, authenticated;
grant execute on function platform.prepare_company_provisioning(uuid, text, jsonb, jsonb),
  platform.complete_company_provisioning(uuid, uuid, integer, uuid),
  platform.fail_company_provisioning_attempt(uuid, uuid, integer, text, text, boolean, uuid),
  platform.get_company_provisioning_retry_request(uuid, uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;
