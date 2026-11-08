-- =============================================================================
-- PegaNaFrota — 20260802000500 — RPCs da plataforma
-- =============================================================================
-- Implementa o contrato de BACKEND_CONTRACT_EXPECTATIONS.md.
--
-- Todas vivem em `platform` e são concedidas SOMENTE a service_role. O schema
-- é endereçável pelo PostgREST para a Edge Function, que revalida o papel
-- global em toda requisição — a autoridade nunca é o navegador.
--
-- Ponto central da entrega: os DOIS EIXOS nunca se misturam.
--   suspend_company_access / restore_company_access  → company_memberships.active
--   block_admin_account    / unblock_admin_account   → profiles.active (global)
-- São quatro funções, quatro confirmações e quatro eventos de auditoria.
-- A operação ambígua `platform_set_admin_active` NÃO existe, por decisão do
-- handoff aprovado.
-- =============================================================================

-- =============================================================================
-- 1. Consultas
-- =============================================================================

create or replace function platform.get_dashboard(
  p_actor_user_id uuid,
  p_from timestamptz default now() - interval '30 days',
  p_to   timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  if p_from > p_to then
    raise exception 'INVALID_INPUT: intervalo invertido'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  select jsonb_build_object(
    'generatedAt', now(),
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'kpis', jsonb_build_object(
      'companiesActive',   (select count(*) from public.companies where status = 'active'),
      'companiesSuspended',(select count(*) from public.companies where status = 'suspended'),
      'companiesArchived', (select count(*) from public.companies where status = 'archived'),
      'invitesPending',    (select count(*) from platform.company_invites
                             where accepted_at is null and revoked_at is null and expires_at > now())
    ),
    'delta', jsonb_build_object(
      'companiesCreated', (select count(*) from public.companies
                            where created_at between p_from and p_to)
    ),
    'recentCompanies', coalesce((
      select jsonb_agg(x order by x->>'createdAt' desc)
      from (
        select jsonb_build_object(
          'id', c.id, 'tradeName', c.trade_name, 'legalName', c.legal_name,
          'cnpj', c.cnpj, 'status', c.status, 'createdAt', c.created_at
        ) as x
        from public.companies c
        order by c.created_at desc
        limit 8
      ) s
    ), '[]'::jsonb),
    'failedOperations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'operationId', o.id, 'kind', o.kind, 'status', o.status,
        'errorCode', o.error_code, 'retryable', o.retryable, 'createdAt', o.created_at
      ) order by o.created_at desc)
      from platform.operations o
      where o.status in ('failed', 'needs_manual', 'compensated')
    ), '[]'::jsonb),
    'recentActivity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'action', e.action, 'result', e.result,
        'occurredAt', e.occurred_at, 'actorUserId', e.actor_user_id
      ) order by e.occurred_at desc)
      from (select * from platform.audit_events order by occurred_at desc limit 10) e
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function platform.list_companies(
  p_actor_user_id uuid,
  p_search        text default null,
  p_status        public.company_status default null,
  p_state         text default null,
  p_page          integer default 1,
  p_page_size     integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page   integer := greatest(coalesce(p_page, 1), 1);
  v_size   integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_search text    := private.normalize_label(p_search);
  v_total  integer;
  v_items  jsonb;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  select count(*) into v_total
  from public.companies c
  where (p_status is null or c.status = p_status)
    and (p_state  is null or c.address_state = upper(p_state))
    and (v_search is null
         or c.trade_name ilike '%' || v_search || '%'
         or c.legal_name ilike '%' || v_search || '%'
         or c.cnpj like '%' || private.normalize_digits(v_search) || '%'
         or coalesce(c.email, '') ilike '%' || v_search || '%');

  select coalesce(jsonb_agg(x order by ord), '[]'::jsonb) into v_items
  from (
    select row_number() over (order by c.created_at desc) as ord,
           jsonb_build_object(
             'id', c.id,
             'tradeName', c.trade_name,
             'legalName', c.legal_name,
             'cnpj', c.cnpj,
             'city', c.address_city,
             'state', c.address_state,
             'status', c.status,
             'createdAt', c.created_at,
             'firstAdmin', (
               select jsonb_build_object('userId', p.id, 'fullName', p.full_name)
               from public.company_memberships m
               join public.profiles p on p.id = m.user_id
               where m.company_id = c.id and m.role = 'company_admin'
               order by m.created_at asc
               limit 1
             )
           ) as x
    from public.companies c
    where (p_status is null or c.status = p_status)
      and (p_state  is null or c.address_state = upper(p_state))
      and (v_search is null
           or c.trade_name ilike '%' || v_search || '%'
           or c.legal_name ilike '%' || v_search || '%'
           or c.cnpj like '%' || private.normalize_digits(v_search) || '%'
           or coalesce(c.email, '') ilike '%' || v_search || '%')
    order by c.created_at desc
    offset (v_page - 1) * v_size
    limit v_size
  ) s;

  return jsonb_build_object('items', v_items, 'page', v_page, 'pageSize', v_size, 'total', v_total);
end;
$$;

-- Detalhe da empresa. Devolve SOMENTE cadastro e status.
-- Nenhum veículo, placa, viagem, abastecimento, manutenção ou custo: o critério
-- de aceite "sem acesso à operação do cliente" é imposto aqui, escolhendo as
-- colunas, e não confiando na UI para não pedir.
create or replace function platform.get_company(
  p_actor_user_id uuid,
  p_company_id    uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company public.companies;
  v_result  jsonb;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  select * into v_company from public.companies where id = p_company_id;
  if not found then
    raise exception 'NOT_FOUND: empresa % não existe', p_company_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  select jsonb_build_object(
    'id', v_company.id,
    'legalName', v_company.legal_name,
    'tradeName', v_company.trade_name,
    'cnpj', v_company.cnpj,
    'email', v_company.email,
    'phone', v_company.phone,
    'address', jsonb_build_object(
      'street', v_company.address_street, 'number', v_company.address_number,
      'complement', v_company.address_complement, 'district', v_company.address_district,
      'city', v_company.address_city, 'state', v_company.address_state,
      'postalCode', v_company.address_postal_code
    ),
    'timezone', v_company.timezone,
    'status', v_company.status,
    'createdAt', v_company.created_at,
    'archivedAt', v_company.archived_at,
    'suspension', (
      select jsonb_build_object(
        'reasonCode', e.metadata ->> 'reasonCode',
        'suspendedAt', e.occurred_at,
        'actorUserId', e.actor_user_id
      )
      from platform.audit_events e
      where e.company_id = v_company.id
        and e.action = 'company.suspended'
        and e.result = 'success'
      order by e.occurred_at desc
      limit 1
    ),
    'admins', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', p.id,
        'fullName', p.full_name,
        'role', m.role,
        'companyAccessActive', m.active,
        'globalAccountActive', p.active,
        'linkedAt', m.created_at
      ) order by m.created_at)
      from public.company_memberships m
      join public.profiles p on p.id = m.user_id
      where m.company_id = v_company.id and m.role = 'company_admin'
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- =============================================================================
-- 2. Ciclo de vida da empresa
-- =============================================================================

create or replace function platform.update_company(
  p_actor_user_id uuid,
  p_company_id    uuid,
  p_patch         jsonb,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_company public.companies;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  select * into v_company from public.companies where id = p_company_id for update;
  if not found then
    raise exception 'NOT_FOUND: empresa % não existe', p_company_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  -- Conflito otimista: o handoff pede 409 com versão esperada e atual.
  if p_expected_updated_at is not null
     and v_company.updated_at is distinct from p_expected_updated_at then
    raise exception
      'CONFLICT_STALE: registro alterado por outro administrador (esperado %, atual %)',
      p_expected_updated_at, v_company.updated_at
      using errcode = '40001', hint = 'CONFLICT_STALE';
  end if;

  -- CNPJ nunca é editável: é a identidade fiscal do tenant e chave única.
  if p_patch ? 'cnpj' then
    raise exception 'INVALID_INPUT: CNPJ não é editável'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  update public.companies
     set legal_name          = coalesce(private.normalize_label(p_patch ->> 'legalName'), legal_name),
         trade_name          = coalesce(private.normalize_label(p_patch ->> 'tradeName'), trade_name),
         email               = case when p_patch ? 'email' then p_patch ->> 'email' else email end,
         phone               = case when p_patch ? 'phone'
                                    then private.normalize_digits(p_patch ->> 'phone') else phone end,
         timezone            = coalesce(private.normalize_label(p_patch ->> 'timezone'), timezone),
         address_street      = case when p_patch ? 'addressStreet'
                                    then p_patch ->> 'addressStreet' else address_street end,
         address_number      = case when p_patch ? 'addressNumber'
                                    then p_patch ->> 'addressNumber' else address_number end,
         address_complement  = case when p_patch ? 'addressComplement'
                                    then p_patch ->> 'addressComplement' else address_complement end,
         address_district    = case when p_patch ? 'addressDistrict'
                                    then p_patch ->> 'addressDistrict' else address_district end,
         address_city        = case when p_patch ? 'addressCity'
                                    then p_patch ->> 'addressCity' else address_city end,
         address_state       = case when p_patch ? 'addressState'
                                    then upper(p_patch ->> 'addressState') else address_state end,
         address_postal_code = case when p_patch ? 'addressPostalCode'
                                    then private.normalize_digits(p_patch ->> 'addressPostalCode')
                                    else address_postal_code end
   where id = p_company_id
  returning * into v_company;

  perform platform.log_event(
    p_actor_user_id => p_actor_user_id,
    p_action        => 'company.updated',
    p_result        => 'success',
    p_target_type   => 'public.companies',
    p_target_id     => p_company_id,
    p_company_id    => p_company_id,
    p_metadata      => jsonb_build_object('patchKeys', (select jsonb_agg(k) from jsonb_object_keys(p_patch) k))
  );

  return jsonb_build_object('id', v_company.id, 'updatedAt', v_company.updated_at, 'status', v_company.status);
end;
$$;

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
  -- Empresa arquivada é terminal — não existe exclusão física nem retorno.
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
    if private.normalize_label(p_confirmed_name) is distinct from v_company.trade_name then
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

-- =============================================================================
-- 3. Os dois eixos de bloqueio — quatro funções distintas
-- =============================================================================

-- EIXO EMPRESA: mexe só em company_memberships.active.
create or replace function platform.suspend_company_access(
  p_actor_user_id uuid,
  p_company_id    uuid,
  p_admin_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_membership public.company_memberships;
  v_remaining  integer;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  select * into v_membership
  from public.company_memberships
  where company_id = p_company_id and user_id = p_admin_user_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: vínculo inexistente'
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  if not v_membership.active then
    return jsonb_build_object('companyId', p_company_id, 'userId', p_admin_user_id,
                              'companyAccessActive', false, 'changed', false);
  end if;

  -- Proteção do último administrador. O trigger do banco tenant também barraria,
  -- mas ali o erro sai como 23514 genérico; aqui sai o código que a UI espera
  -- para abrir o ConflictModal `last_admin_protected`.
  if v_membership.role = 'company_admin' then
    select count(*) into v_remaining
    from public.company_memberships m
    where m.company_id = p_company_id
      and m.role = 'company_admin'
      and m.active
      and m.user_id <> p_admin_user_id;

    if v_remaining = 0 then
      perform platform.log_event(
        p_actor_user_id => p_actor_user_id,
        p_action        => 'company_access.suspended',
        p_result        => 'denied',
        p_target_type   => 'public.company_memberships',
        p_target_id     => p_admin_user_id,
        p_company_id    => p_company_id,
        p_metadata      => jsonb_build_object('reason', 'last_admin_protected')
      );
      raise exception
        'LAST_ADMIN_PROTECTED: a empresa ficaria sem administrador ativo'
        using errcode = '23514', hint = 'LAST_ADMIN_PROTECTED';
    end if;
  end if;

  update public.company_memberships set active = false where id = v_membership.id;

  perform platform.log_event(
    p_actor_user_id => p_actor_user_id,
    p_action        => 'company_access.suspended',
    p_result        => 'success',
    p_target_type   => 'public.company_memberships',
    p_target_id     => p_admin_user_id,
    p_company_id    => p_company_id,
    p_metadata      => jsonb_build_object('role', v_membership.role, 'scope', 'company')
  );

  return jsonb_build_object('companyId', p_company_id, 'userId', p_admin_user_id,
                            'companyAccessActive', false, 'changed', true);
end;
$$;

create or replace function platform.restore_company_access(
  p_actor_user_id uuid,
  p_company_id    uuid,
  p_admin_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_membership public.company_memberships;
  v_other      uuid;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  select * into v_membership
  from public.company_memberships
  where company_id = p_company_id and user_id = p_admin_user_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: vínculo inexistente'
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  if v_membership.active then
    return jsonb_build_object('companyId', p_company_id, 'userId', p_admin_user_id,
                              'companyAccessActive', true, 'changed', false);
  end if;

  -- ADR-004 continua valendo: um usuário, uma empresa ativa.
  select m.company_id into v_other
  from public.company_memberships m
  where m.user_id = p_admin_user_id and m.active and m.company_id <> p_company_id
  limit 1;

  if v_other is not null then
    raise exception 'USER_ALREADY_LINKED: usuário já tem vínculo ativo com outra empresa'
      using errcode = '23505', hint = 'USER_ALREADY_LINKED';
  end if;

  update public.company_memberships set active = true where id = v_membership.id;

  perform platform.log_event(
    p_actor_user_id => p_actor_user_id,
    p_action        => 'company_access.restored',
    p_result        => 'success',
    p_target_type   => 'public.company_memberships',
    p_target_id     => p_admin_user_id,
    p_company_id    => p_company_id,
    p_metadata      => jsonb_build_object('role', v_membership.role, 'scope', 'company')
  );

  return jsonb_build_object('companyId', p_company_id, 'userId', p_admin_user_id,
                            'companyAccessActive', true, 'changed', true);
end;
$$;

-- EIXO PLATAFORMA: mexe só em profiles.active. Alcança TODOS os vínculos.
create or replace function platform.block_admin_account(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_reason        text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  if p_actor_user_id = p_target_user_id then
    raise exception 'CANNOT_BLOCK_SELF: o administrador não pode bloquear a própria conta'
      using errcode = '55000', hint = 'CANNOT_BLOCK_SELF';
  end if;

  select * into v_profile from public.profiles where id = p_target_user_id for update;
  if not found then
    raise exception 'NOT_FOUND: perfil % não existe', p_target_user_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  if not v_profile.active then
    return jsonb_build_object('userId', p_target_user_id, 'globalAccountActive', false,
                              'changed', false);
  end if;

  -- Se o alvo também for platform_admin, o piso global se aplica.
  if private.is_platform_admin(p_target_user_id) then
    update platform.admins
       set status = 'blocked', blocked_at = now(),
           blocked_by = p_actor_user_id, block_reason = private.normalize_label(p_reason)
     where user_id = p_target_user_id;
  end if;

  update public.profiles set active = false where id = p_target_user_id;

  perform platform.log_event(
    p_actor_user_id => p_actor_user_id,
    p_action        => 'admin.account_blocked',
    p_result        => 'success',
    p_target_type   => 'public.profiles',
    p_target_id     => p_target_user_id,
    p_metadata      => jsonb_build_object('scope', 'platform', 'reason', p_reason)
  );

  return jsonb_build_object('userId', p_target_user_id, 'globalAccountActive', false,
                            'changed', true, 'scope', 'platform');
end;
$$;

create or replace function platform.unblock_admin_account(
  p_actor_user_id  uuid,
  p_target_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  select * into v_profile from public.profiles where id = p_target_user_id for update;
  if not found then
    raise exception 'NOT_FOUND: perfil % não existe', p_target_user_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  if v_profile.active then
    return jsonb_build_object('userId', p_target_user_id, 'globalAccountActive', true,
                              'changed', false);
  end if;

  update public.profiles set active = true where id = p_target_user_id;

  update platform.admins
     set status = 'active', blocked_at = null, blocked_by = null, block_reason = null
   where user_id = p_target_user_id and status = 'blocked';

  perform platform.log_event(
    p_actor_user_id => p_actor_user_id,
    p_action        => 'admin.account_unblocked',
    p_result        => 'success',
    p_target_type   => 'public.profiles',
    p_target_id     => p_target_user_id,
    p_metadata      => jsonb_build_object('scope', 'platform')
  );

  return jsonb_build_object('userId', p_target_user_id, 'globalAccountActive', true,
                            'changed', true, 'scope', 'platform');
end;
$$;

-- =============================================================================
-- 4. Listagens de administradores, operações e auditoria
-- =============================================================================

-- Os dois eixos aparecem como colunas SEPARADAS, nunca fundidos num só campo.
create or replace function platform.list_company_admins(
  p_actor_user_id uuid,
  p_company_id    uuid default null,
  p_search        text default null,
  p_page          integer default 1,
  p_page_size     integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page   integer := greatest(coalesce(p_page, 1), 1);
  v_size   integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_search text    := private.normalize_label(p_search);
  v_total  integer;
  v_items  jsonb;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  select count(*) into v_total
  from public.company_memberships m
  join public.profiles p on p.id = m.user_id
  where m.role = 'company_admin'
    and (p_company_id is null or m.company_id = p_company_id)
    and (v_search is null or p.full_name ilike '%' || v_search || '%');

  select coalesce(jsonb_agg(x order by ord), '[]'::jsonb) into v_items
  from (
    select row_number() over (order by m.created_at desc) as ord,
           jsonb_build_object(
             'userId', p.id,
             'fullName', p.full_name,
             'phone', p.phone,
             'companyId', c.id,
             'companyTradeName', c.trade_name,
             'role', m.role,
             -- eixo 1: conta global
             'globalAccountActive', p.active,
             -- eixo 2: acesso a esta empresa
             'companyAccessActive', m.active,
             'lastSeenAt', p.last_seen_at,
             'invite', (
               select jsonb_build_object(
                 'status', case
                             when i.accepted_at is not null then 'accepted'
                             when i.revoked_at  is not null then 'revoked'
                             when i.expires_at <= now()     then 'expired'
                             else 'pending' end,
                 'expiresAt', i.expires_at,
                 'resendAvailableAt', i.resend_available_at,
                 'sentAt', i.created_at
               )
               from platform.company_invites i
               where i.company_id = m.company_id and i.user_id = m.user_id
               order by i.created_at desc
               limit 1
             )
           ) as x
    from public.company_memberships m
    join public.profiles  p on p.id = m.user_id
    join public.companies c on c.id = m.company_id
    where m.role = 'company_admin'
      and (p_company_id is null or m.company_id = p_company_id)
      and (v_search is null or p.full_name ilike '%' || v_search || '%')
    order by m.created_at desc
    offset (v_page - 1) * v_size
    limit v_size
  ) s;

  return jsonb_build_object('items', v_items, 'page', v_page, 'pageSize', v_size, 'total', v_total);
end;
$$;

create or replace function platform.list_operations(
  p_actor_user_id uuid,
  p_status        platform.operation_status default null,
  p_page          integer default 1,
  p_page_size     integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page  integer := greatest(coalesce(p_page, 1), 1);
  v_size  integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_total integer;
  v_items jsonb;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  select count(*) into v_total from platform.operations o
  where (p_status is null or o.status = p_status);

  select coalesce(jsonb_agg(x order by ord), '[]'::jsonb) into v_items
  from (
    select row_number() over (order by o.created_at desc) as ord,
           jsonb_build_object(
             'operationId', o.id,
             'kind', o.kind,
             'status', o.status,
             'companyId', o.company_id,
             'companyTradeName', c.trade_name,
             'startedAt', o.started_at,
             'finishedAt', o.finished_at,
             'durationMs', case
                             when o.started_at is null then null
                             else (extract(epoch from (coalesce(o.finished_at, now()) - o.started_at)) * 1000)::bigint
                           end,
             'errorCode', o.error_code,
             'retryable', o.retryable,
             'attemptCount', o.attempt_count,
             'currentStep', (
               select s.step_code from platform.operation_steps s
               where s.operation_id = o.id and s.status in ('running', 'failed')
               order by s.step_index limit 1
             ),
             'createdAt', o.created_at
           ) as x
    from platform.operations o
    left join public.companies c on c.id = o.company_id
    where (p_status is null or o.status = p_status)
    order by o.created_at desc
    offset (v_page - 1) * v_size
    limit v_size
  ) s;

  return jsonb_build_object('items', v_items, 'page', v_page, 'pageSize', v_size, 'total', v_total);
end;
$$;

create or replace function platform.get_operation(
  p_actor_user_id uuid,
  p_operation_id  uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_op platform.operations;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  select * into v_op from platform.operations where id = p_operation_id;
  if not found then
    raise exception 'NOT_FOUND: operação % não existe', p_operation_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  return jsonb_build_object(
    'operationId', v_op.id,
    'kind', v_op.kind,
    'status', v_op.status,
    'companyId', v_op.company_id,
    'targetUserId', v_op.target_user_id,
    'errorCode', v_op.error_code,
    'errorDetail', v_op.error_detail,
    'retryable', v_op.retryable,
    'attemptCount', v_op.attempt_count,
    'startedAt', v_op.started_at,
    'finishedAt', v_op.finished_at,
    'createdAt', v_op.created_at,
    -- O payload de contrato aparece no drawer. Nunca contém senha: a Edge
    -- Function não recebe senha no wizard (o primeiro admin define a dele pelo
    -- convite), então não há o que redigir aqui.
    'requestPayload', v_op.request_payload,
    'resultPayload', v_op.result_payload,
    'steps', coalesce((
      select jsonb_agg(jsonb_build_object(
        'index', s.step_index, 'code', s.step_code, 'status', s.status,
        'detail', s.detail, 'errorCode', s.error_code,
        'startedAt', s.started_at, 'finishedAt', s.finished_at
      ) order by s.step_index)
      from platform.operation_steps s where s.operation_id = v_op.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function platform.list_audit_events(
  p_actor_user_id uuid,
  p_action        text default null,
  p_result        text default null,
  p_from          timestamptz default null,
  p_to            timestamptz default null,
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
  v_page  integer := greatest(coalesce(p_page, 1), 1);
  v_size  integer := least(greatest(coalesce(p_page_size, 50), 1), 200);
  v_total integer;
  v_items jsonb;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'INVALID_INPUT: intervalo invertido'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  select count(*) into v_total
  from platform.audit_events e
  where (p_action is null or e.action = p_action)
    and (p_result is null or e.result = p_result)
    and (p_from   is null or e.occurred_at >= p_from)
    and (p_to     is null or e.occurred_at <= p_to);

  select coalesce(jsonb_agg(x order by ord), '[]'::jsonb) into v_items
  from (
    select row_number() over (order by e.occurred_at desc, e.id desc) as ord,
           jsonb_build_object(
             'id', e.id,
             'occurredAt', e.occurred_at,
             'actorUserId', e.actor_user_id,
             'actorName', p.full_name,
             'action', e.action,
             'result', e.result,
             'targetType', e.target_type,
             'targetId', e.target_id,
             'companyId', e.company_id,
             'companyTradeName', c.trade_name,
             'requestId', e.request_id
           ) as x
    from platform.audit_events e
    left join public.profiles  p on p.id = e.actor_user_id
    left join public.companies c on c.id = e.company_id
    where (p_action is null or e.action = p_action)
      and (p_result is null or e.result = p_result)
      and (p_from   is null or e.occurred_at >= p_from)
      and (p_to     is null or e.occurred_at <= p_to)
    order by e.occurred_at desc, e.id desc
    offset (v_page - 1) * v_size
    limit v_size
  ) s;

  return jsonb_build_object('items', v_items, 'page', v_page, 'pageSize', v_size, 'total', v_total);
end;
$$;

create or replace function platform.get_audit_event(
  p_actor_user_id uuid,
  p_event_id      bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event platform.audit_events;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  select * into v_event from platform.audit_events where id = p_event_id;
  if not found then
    raise exception 'NOT_FOUND: evento % não existe', p_event_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  return jsonb_build_object(
    'id', v_event.id,
    'occurredAt', v_event.occurred_at,
    'actorUserId', v_event.actor_user_id,
    'action', v_event.action,
    'result', v_event.result,
    'targetType', v_event.target_type,
    'targetId', v_event.target_id,
    'companyId', v_event.company_id,
    'operationId', v_event.operation_id,
    'requestId', v_event.request_id,
    'ipAddress', host(v_event.ip_address),
    'userAgent', v_event.user_agent,
    'metadata', v_event.metadata
  );
end;
$$;

-- =============================================================================
-- 5. Grants
-- =============================================================================
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'platform'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end
$$;
