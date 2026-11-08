-- =============================================================================
-- PegaNaFrota — 20260802000600 — Provisionamento de empresa
-- =============================================================================
-- As quatro sub-operações que a barra de progresso mostra:
--   1. create_company        empresa em public.companies
--   2. create_auth_user      conta no GoTrue  (feito pela Edge Function)
--   3. link_company_admin    primeiro company_admin em company_memberships
--   4. send_invite           convite de uso único
--
-- Divisão de responsabilidade, e a razão dela:
--   A etapa 2 é HTTP para fora do PostgreSQL. Não existe transação que a cubra
--   junto com as outras três. Então o banco expõe DUAS funções transacionais —
--   `provision_company_record` (etapa 1) e `provision_first_admin` (3 e 4) — e a
--   Edge Function costura as três chamadas, marcando o progresso entre elas.
--   Cada função é atômica em si; o que pode ficar pela metade é a COSTURA, e é
--   exatamente para isso que existem a compensação e a retentativa.
--
-- Compensação: uma empresa criada sem administrador é lixo visível na lista de
-- empresas. `compensate_provisioning` a remove — e só consegue remover porque a
-- empresa recém-criada ainda não tem nenhum dado operacional. Se já tiver,
-- a operação vira `needs_manual` em vez de apagar dado de cliente.
-- =============================================================================

-- =============================================================================
-- 1. Etapa 1 — criar a empresa
-- =============================================================================
create or replace function platform.provision_company_record(
  p_operation_id uuid,
  p_actor_user_id uuid,
  p_company jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_company public.companies;
  v_cnpj    text;
  v_existing public.companies;
begin
  perform private.assert_platform_admin(p_actor_user_id);
  perform platform.mark_step(p_operation_id, 'create_company', 'running');

  v_cnpj := private.normalize_digits(p_company ->> 'cnpj');

  if v_cnpj is null or not private.is_valid_cnpj(v_cnpj) then
    perform platform.mark_step(p_operation_id, 'create_company', 'failed',
                               'CNPJ inválido', 'invalid_cnpj');
    raise exception 'INVALID_CNPJ: CNPJ inválido'
      using errcode = '22023', hint = 'invalid_cnpj';
  end if;

  -- Duplicidade é 409 com o ponteiro para a empresa existente: o handoff pede
  -- "alerta com a empresa existente e atalho para abri-la".
  select * into v_existing from public.companies where cnpj = v_cnpj;
  if found then
    perform platform.mark_step(p_operation_id, 'create_company', 'failed',
                               'CNPJ já cadastrado', 'cnpj_already_exists');
    raise exception 'CNPJ_ALREADY_EXISTS: empresa % já usa este CNPJ', v_existing.id
      using errcode = '23505', hint = 'cnpj_already_exists',
            detail = v_existing.id::text;
  end if;

  insert into public.companies (
    legal_name, trade_name, cnpj, email, phone,
    address_street, address_number, address_complement, address_district,
    address_city, address_state, address_postal_code, timezone, status
  )
  values (
    private.normalize_label(p_company ->> 'legalName'),
    private.normalize_label(p_company ->> 'tradeName'),
    v_cnpj,
    nullif(lower(btrim(coalesce(p_company ->> 'email', ''))), ''),
    private.normalize_digits(p_company ->> 'phone'),
    nullif(btrim(coalesce(p_company ->> 'addressStreet', '')), ''),
    nullif(btrim(coalesce(p_company ->> 'addressNumber', '')), ''),
    nullif(btrim(coalesce(p_company ->> 'addressComplement', '')), ''),
    nullif(btrim(coalesce(p_company ->> 'addressDistrict', '')), ''),
    nullif(btrim(coalesce(p_company ->> 'addressCity', '')), ''),
    nullif(upper(btrim(coalesce(p_company ->> 'addressState', ''))), ''),
    private.normalize_digits(p_company ->> 'addressPostalCode'),
    coalesce(private.normalize_label(p_company ->> 'timezone'), 'America/Sao_Paulo'),
    'active'
  )
  returning * into v_company;

  perform platform.mark_step(p_operation_id, 'create_company', 'succeeded',
                             'Empresa ' || v_company.trade_name);
  perform platform.mark_operation(
    p_operation_id => p_operation_id,
    p_status       => 'running',
    p_company_id   => v_company.id
  );

  perform platform.log_event(
    p_actor_user_id => p_actor_user_id,
    p_action        => 'company.created',
    p_result        => 'success',
    p_target_type   => 'public.companies',
    p_target_id     => v_company.id,
    p_company_id    => v_company.id,
    p_operation_id  => p_operation_id,
    p_metadata      => jsonb_build_object('cnpj', v_company.cnpj, 'tradeName', v_company.trade_name)
  );

  return jsonb_build_object('companyId', v_company.id, 'tradeName', v_company.trade_name,
                            'cnpj', v_company.cnpj, 'status', v_company.status);
end;
$$;

-- =============================================================================
-- 2. Etapas 3 e 4 — primeiro company_admin + convite, na MESMA transação
-- =============================================================================
-- Vincular sem convidar deixaria um administrador que não consegue entrar;
-- convidar sem vincular deixaria um convite que não leva a lugar nenhum.
-- As duas coisas são uma só operação.
create or replace function platform.provision_first_admin(
  p_operation_id  uuid,
  p_actor_user_id uuid,
  p_company_id    uuid,
  p_user_id       uuid,
  p_email         text,
  p_full_name     text,
  p_phone         text default null,
  p_invite_token  text default null,
  p_invite_ttl_hours integer default 72,
  p_resend_cooldown_seconds integer default 300
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
  v_invite     jsonb;
  v_other      uuid;
begin
  perform private.assert_platform_admin(p_actor_user_id);
  perform platform.mark_step(p_operation_id, 'link_company_admin', 'running');

  if private.normalize_label(p_full_name) is null then
    perform platform.mark_step(p_operation_id, 'link_company_admin', 'failed',
                               'Nome obrigatório', 'invalid_input');
    raise exception 'INVALID_INPUT: nome completo é obrigatório'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  -- ADR-004: um usuário, uma empresa ativa.
  select m.company_id into v_other
  from public.company_memberships m
  where m.user_id = p_user_id and m.active and m.company_id <> p_company_id
  limit 1;

  if v_other is not null then
    perform platform.mark_step(p_operation_id, 'link_company_admin', 'failed',
                               'Usuário já vinculado a outra empresa', 'auth_email_conflict');
    raise exception 'USER_ALREADY_LINKED: usuário já possui vínculo ativo com outra empresa'
      using errcode = '23505', hint = 'auth_email_conflict', detail = v_other::text;
  end if;

  -- Profile: cria se novo; nunca sobrescreve dados globais de quem já existe.
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    insert into public.profiles (id, full_name, phone, active)
    values (p_user_id, private.normalize_label(p_full_name),
            private.normalize_digits(p_phone), true)
    returning * into v_profile;
  elsif not v_profile.active then
    perform platform.mark_step(p_operation_id, 'link_company_admin', 'failed',
                               'Conta globalmente bloqueada', 'profile_globally_inactive');
    raise exception 'PROFILE_GLOBALLY_INACTIVE: a conta global está bloqueada'
      using errcode = '42501', hint = 'PROFILE_GLOBALLY_INACTIVE';
  end if;

  -- O vínculo nasce INATIVO: só o aceite do convite o ativa. Assim um convite
  -- nunca aceito não vira acesso, e a substituição de administrador não derruba
  -- o titular antes da hora.
  insert into public.company_memberships (company_id, user_id, role, active)
  values (p_company_id, p_user_id, 'company_admin', false)
  on conflict (company_id, user_id) do update set role = 'company_admin'
  returning * into v_membership;

  perform platform.mark_step(p_operation_id, 'link_company_admin', 'succeeded',
                             'Vínculo company_admin criado (pendente de aceite)');

  -- Etapa 4
  perform platform.mark_step(p_operation_id, 'send_invite', 'running');

  v_invite := platform.issue_invite(
    p_company_id    => p_company_id,
    p_user_id       => p_user_id,
    p_email         => p_email,
    p_token_plain   => p_invite_token,
    p_actor_user_id => p_actor_user_id,
    p_ttl_hours     => p_invite_ttl_hours,
    p_resend_cooldown_seconds => p_resend_cooldown_seconds,
    p_operation_id  => p_operation_id,
    p_role          => 'company_admin'
  );

  perform platform.mark_step(p_operation_id, 'send_invite', 'succeeded', 'Convite emitido');

  perform platform.log_event(
    p_actor_user_id => p_actor_user_id,
    p_action        => 'company_admin.provisioned',
    p_result        => 'success',
    p_target_type   => 'public.company_memberships',
    p_target_id     => p_user_id,
    p_company_id    => p_company_id,
    p_operation_id  => p_operation_id,
    p_metadata      => jsonb_build_object('email', lower(btrim(p_email)), 'role', 'company_admin')
  );

  return jsonb_build_object(
    'userId', p_user_id,
    'companyId', p_company_id,
    'role', 'company_admin',
    'membershipActive', v_membership.active,
    'inviteSent', true,
    'expiresAt', v_invite ->> 'expiresAt',
    'resendAvailableAt', v_invite ->> 'resendAvailableAt'
  );
end;
$$;

-- =============================================================================
-- 3. Conclusão
-- =============================================================================
create or replace function platform.finish_provisioning(
  p_operation_id  uuid,
  p_actor_user_id uuid,
  p_result        jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_op platform.operations;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  v_op := platform.mark_operation(
    p_operation_id => p_operation_id,
    p_status       => 'succeeded',
    p_result       => p_result
  );

  perform platform.log_event(
    p_actor_user_id => p_actor_user_id,
    p_action        => 'company.provisioned',
    p_result        => 'success',
    p_target_type   => 'platform.operations',
    p_target_id     => v_op.company_id,
    p_company_id    => v_op.company_id,
    p_operation_id  => p_operation_id,
    p_metadata      => jsonb_build_object('attempts', v_op.attempt_count)
  );

  return jsonb_build_object(
    'operationId', p_operation_id,
    'status', 'succeeded',
    'companyId', v_op.company_id,
    'result', v_op.result_payload
  );
end;
$$;

-- =============================================================================
-- 4. Falha e compensação
-- =============================================================================
create or replace function platform.fail_provisioning(
  p_operation_id  uuid,
  p_actor_user_id uuid,
  p_error_code    text,
  p_error_detail  text default null,
  p_retryable     boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_op platform.operations;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  v_op := platform.mark_operation(
    p_operation_id => p_operation_id,
    p_status       => 'failed',
    p_error_code   => p_error_code,
    p_error_detail => p_error_detail,
    p_retryable    => p_retryable
  );

  perform platform.log_event(
    p_actor_user_id => p_actor_user_id,
    p_action        => 'company.provision_failed',
    p_result        => 'failure',
    p_target_type   => 'platform.operations',
    p_target_id     => v_op.company_id,
    p_company_id    => v_op.company_id,
    p_operation_id  => p_operation_id,
    p_metadata      => jsonb_build_object('errorCode', p_error_code, 'retryable', p_retryable)
  );

  return jsonb_build_object('operationId', p_operation_id, 'status', 'failed',
                            'errorCode', p_error_code, 'retryable', p_retryable);
end;
$$;

-- Reverte uma empresa criada que ficou sem administrador utilizável.
-- Só age sobre empresa VIRGEM: se houver qualquer dado operacional, a operação
-- vira needs_manual. Apagar dado de cliente para limpar um erro nosso seria
-- pior do que o erro.
create or replace function platform.compensate_provisioning(
  p_operation_id  uuid,
  p_actor_user_id uuid,
  p_reason        text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_op        platform.operations;
  v_dirty     boolean;
  v_company   public.companies;
  v_removed   jsonb := '{}'::jsonb;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  select * into v_op from platform.operations where id = p_operation_id for update;
  if not found then
    raise exception 'NOT_FOUND: operação % não existe', p_operation_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  if v_op.status = 'succeeded' then
    raise exception 'CONFLICT_STATE: operação concluída não é compensável'
      using errcode = '55000', hint = 'CONFLICT_STATE';
  end if;

  if v_op.status = 'compensated' then
    return jsonb_build_object('operationId', p_operation_id, 'status', 'compensated',
                              'changed', false);
  end if;

  perform platform.mark_operation(p_operation_id, 'compensating');

  if v_op.company_id is null then
    -- Nada foi criado: compensar é apenas declarar o fato.
    perform platform.mark_operation(
      p_operation_id => p_operation_id, p_status => 'compensated',
      p_error_code => v_op.error_code, p_retryable => true
    );
    return jsonb_build_object('operationId', p_operation_id, 'status', 'compensated',
                              'changed', false, 'removed', v_removed);
  end if;

  select * into v_company from public.companies where id = v_op.company_id for update;

  -- Empresa virgem? Qualquer dado operacional a torna intocável.
  select exists (select 1 from public.vehicles          where company_id = v_op.company_id)
      or exists (select 1 from public.drivers           where company_id = v_op.company_id)
      or exists (select 1 from public.locations         where company_id = v_op.company_id)
      or exists (select 1 from public.trips             where company_id = v_op.company_id)
      or exists (select 1 from public.fuelings          where company_id = v_op.company_id)
      or exists (select 1 from public.maintenance_records where company_id = v_op.company_id)
      or exists (select 1 from public.vehicle_movements where company_id = v_op.company_id)
      or exists (select 1 from public.company_memberships
                  where company_id = v_op.company_id and active)
    into v_dirty;

  if v_dirty then
    perform platform.mark_operation(
      p_operation_id => p_operation_id,
      p_status       => 'needs_manual',
      p_error_code   => 'compensation_blocked',
      p_error_detail => 'A empresa já possui dados; a reversão automática foi recusada.',
      p_retryable    => false
    );

    perform platform.log_event(
      p_actor_user_id => p_actor_user_id,
      p_action        => 'company.provision_compensation_blocked',
      p_result        => 'failure',
      p_target_type   => 'public.companies',
      p_target_id     => v_op.company_id,
      p_company_id    => v_op.company_id,
      p_operation_id  => p_operation_id,
      p_metadata      => jsonb_build_object('reason', 'company_not_empty')
    );

    return jsonb_build_object('operationId', p_operation_id, 'status', 'needs_manual',
                              'changed', false, 'reason', 'company_not_empty');
  end if;

  -- -------------------------------------------------------------------------
  -- Compensação = ARQUIVAR, nunca apagar.
  --
  -- A primeira versão desta função tentava `delete from public.companies`. O
  -- próprio banco recusou, e com razão dupla:
  --   1. `audit.events` é append-only — o trigger private.tg_forbid_mutation()
  --      barra DELETE inclusive para o dono. Criar a empresa já gerou evento de
  --      auditoria, e a FK de audit.events para companies é ON DELETE RESTRICT.
  --      Apagar a empresa exigiria apagar a trilha, isto é, enfraquecer a
  --      auditoria para encobrir um erro nosso.
  --   2. O handoff é explícito: "sem exclusão física de empresa".
  --
  -- Arquivar atinge o objetivo real da compensação — a empresa meio provisionada
  -- some da lista de ativas e não pode ser usada — sem destruir prova nenhuma.
  -- A retentativa reativa a empresa e retoma da etapa que faltou.
  -- -------------------------------------------------------------------------

  -- Convites pendentes deixam de valer.
  with revoked as (
    update platform.company_invites
       set revoked_at = now(), revoked_reason = 'provisioning_compensated'
     where company_id = v_op.company_id
       and accepted_at is null and revoked_at is null
    returning 1
  ) select jsonb_build_object('invitesRevoked', count(*)) into v_removed from revoked;

  -- Vínculos criados pela operação ficam inativos. Não são apagados: o
  -- histórico de quem foi vinculado a quê é parte da prestação de contas.
  with deactivated as (
    update public.company_memberships
       set active = false
     where company_id = v_op.company_id and active
    returning 1
  ) select v_removed || jsonb_build_object('membershipsDeactivated', count(*))
      into v_removed from deactivated;

  update public.companies
     set status = 'archived', archived_at = now(), archived_by = p_actor_user_id
   where id = v_op.company_id;

  perform platform.mark_operation(
    p_operation_id => p_operation_id,
    p_status       => 'compensated',
    p_error_code   => coalesce(v_op.error_code, 'compensated'),
    p_error_detail => private.normalize_label(p_reason),
    p_retryable    => true
  );

  perform platform.log_event(
    p_actor_user_id => p_actor_user_id,
    p_action        => 'company.provision_compensated',
    p_result        => 'compensated',
    p_target_type   => 'public.companies',
    p_target_id     => v_op.company_id,
    p_company_id    => v_op.company_id,
    p_operation_id  => p_operation_id,
    p_metadata      => jsonb_build_object('reverted', v_removed,
                                          'companyTradeName', v_company.trade_name,
                                          'archived', true,
                                          'reason', p_reason)
  );

  return jsonb_build_object('operationId', p_operation_id, 'status', 'compensated',
                            'changed', true, 'companyArchived', true,
                            'reverted', v_removed);
end;
$$;

-- =============================================================================
-- 5. Retentativa
-- =============================================================================
-- Só o backend decide se cabe retentar. A UI lê `retryable` e nada mais.
create or replace function platform.retry_provisioning(
  p_operation_id  uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_op platform.operations;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  select * into v_op from platform.operations where id = p_operation_id for update;
  if not found then
    raise exception 'NOT_FOUND: operação % não existe', p_operation_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  if v_op.status = 'succeeded' then
    -- Idempotência: retentar o que já deu certo devolve o resultado original.
    return jsonb_build_object('operationId', p_operation_id, 'status', 'succeeded',
                              'replayed', true, 'result', v_op.result_payload);
  end if;

  if not v_op.retryable then
    raise exception 'NOT_RETRYABLE: operação % não é repetível', p_operation_id
      using errcode = '55000', hint = 'NOT_RETRYABLE';
  end if;

  -- Etapas que falharam voltam a pendente; as bem-sucedidas permanecem.
  update platform.operation_steps
     set status = 'pending', error_code = null, detail = null,
         started_at = null, finished_at = null
   where operation_id = p_operation_id and status in ('failed', 'running');

  -- Se a compensação arquivou a empresa, retomar significa reativá-la. É por
  -- isso que a compensação arquiva em vez de apagar: o retry reaproveita a
  -- mesma empresa, o mesmo CNPJ e o mesmo id, sem esbarrar na unicidade do CNPJ
  -- nem inventar um segundo registro para o mesmo cliente.
  if v_op.company_id is not null then
    update public.companies
       set status = 'active', archived_at = null, archived_by = null
     where id = v_op.company_id and status = 'archived';
  end if;

  v_op := platform.mark_operation(
    p_operation_id => p_operation_id,
    p_status       => 'running'
  );

  perform platform.log_event(
    p_actor_user_id => p_actor_user_id,
    p_action        => 'company.provision_retried',
    p_result        => 'success',
    p_target_type   => 'platform.operations',
    p_target_id     => v_op.company_id,
    p_company_id    => v_op.company_id,
    p_operation_id  => p_operation_id,
    p_metadata      => jsonb_build_object('attempt', v_op.attempt_count)
  );

  return jsonb_build_object('operationId', p_operation_id, 'status', 'running',
                            'attemptCount', v_op.attempt_count,
                            'requestPayload', v_op.request_payload,
                            'companyId', v_op.company_id);
end;
$$;

-- =============================================================================
-- 6. Grants — tudo em platform é exclusivo de service_role
-- =============================================================================
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'platform'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end
$$;
