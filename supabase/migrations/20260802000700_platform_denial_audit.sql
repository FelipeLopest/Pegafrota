-- =============================================================================
-- PegaNaFrota — 20260802000700 — Auditoria de negações (correção PNF-PLAT-001)
-- =============================================================================
-- DEFEITO ENCONTRADO E CORRIGIDO AQUI
--
-- As migrations 000400 e 000500 chamavam platform.log_event(..., 'denied')
-- imediatamente ANTES de um `raise exception`, na mesma transação. Isso não
-- funciona e o teste 11_platform_identity provou empiricamente:
--
--     do $$ begin
--       perform platform.log_event(null, 'prova.denied', 'denied');
--       raise exception 'falha';
--     exception when others then null; end $$;
--     select count(*) ... where action = 'prova.denied';   -->  0
--
-- O `raise` desfaz a transação (ou a subtransação do bloco EXCEPTION) e leva o
-- INSERT da auditoria junto. O resultado era pior do que não ter auditoria
-- nenhuma: o código APARENTAVA registrar negações e não registrava — a pior
-- categoria de falha de segurança, a que passa despercebida na revisão.
--
-- Não existe truque para escrever e abortar na mesma transação sem transação
-- autônoma (dblink/pg_background), e adicionar essa dependência a um caminho de
-- segurança traria mais risco do que resolve.
--
-- DECISÃO (ADR-012): a negação é auditada pelo CHAMADOR, em uma transação
-- separada, depois de capturar o erro. A Edge Function faz:
--
--     try   { await rpc('platform_...') }
--     catch { await rpc('platform_log_denial', {...}); throw }
--
-- Esta migration:
--   1. remove as chamadas mortas de log_event que precediam `raise`;
--   2. cria platform.log_denial(), com nome que deixa a intenção explícita;
--   3. deixa comentário no ponto de cada recusa, para que ninguém reintroduza
--      o padrão achando que está "faltando auditoria".
-- =============================================================================

-- =============================================================================
-- 1. Porta de entrada explícita para auditar recusas
-- =============================================================================
create or replace function platform.log_denial(
  p_actor_user_id uuid,
  p_action        text,
  p_reason        text,
  p_target_type   text default null,
  p_target_id     uuid default null,
  p_company_id    uuid default null,
  p_operation_id  uuid default null,
  p_request_id    text default null,
  p_ip            inet default null,
  p_user_agent    text default null,
  p_metadata      jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- Precisa ser chamada em uma transação PRÓPRIA, depois que a operação
  -- recusada já abortou. Chamar antes de um `raise` na mesma transação não
  -- persiste nada (PNF-PLAT-001).
  return platform.log_event(
    p_actor_user_id => p_actor_user_id,
    p_action        => p_action,
    p_result        => 'denied',
    p_target_type   => p_target_type,
    p_target_id     => p_target_id,
    p_company_id    => p_company_id,
    p_operation_id  => p_operation_id,
    p_metadata      => coalesce(p_metadata, '{}'::jsonb)
                       || jsonb_build_object('reason', p_reason),
    p_request_id    => p_request_id,
    p_ip            => p_ip,
    p_user_agent    => p_user_agent
  );
end;
$$;

comment on function platform.log_denial is
  'Registra uma tentativa RECUSADA. Deve ser chamada pelo cliente em transação separada, '
  'após capturar o erro — auditar antes de um raise não persiste (PNF-PLAT-001).';

-- =============================================================================
-- 2. Remoção do código morto — consume_bootstrap_token
-- =============================================================================
create or replace function platform.consume_bootstrap_token(
  p_token_plain text,
  p_user_id     uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hash  text;
  v_token platform.bootstrap_tokens;
begin
  if p_user_id is null then
    raise exception 'INVALID_INPUT: usuário é obrigatório'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  if exists (select 1 from platform.admins where status = 'active') then
    raise exception 'BOOTSTRAP_NOT_AVAILABLE: já existe platform_admin ativo'
      using errcode = '55000', hint = 'BOOTSTRAP_NOT_AVAILABLE';
  end if;

  v_hash := encode(extensions.digest(convert_to(coalesce(p_token_plain, ''), 'UTF8'), 'sha256'), 'hex');

  select * into v_token
  from platform.bootstrap_tokens
  where token_sha256 = v_hash
  for update;

  if not found then
    -- SEM log_event aqui: a auditoria da recusa é do chamador, via
    -- platform.log_denial() em transação separada (PNF-PLAT-001).
    raise exception 'BOOTSTRAP_INVALID_TOKEN: token inválido'
      using errcode = '42501', hint = 'BOOTSTRAP_INVALID_TOKEN';
  end if;

  if v_token.consumed_at is not null then
    raise exception 'BOOTSTRAP_TOKEN_CONSUMED: token já utilizado'
      using errcode = '55000', hint = 'BOOTSTRAP_TOKEN_CONSUMED';
  end if;

  if v_token.expires_at <= now() then
    raise exception 'BOOTSTRAP_TOKEN_EXPIRED: token expirado em %', v_token.expires_at
      using errcode = '55000', hint = 'BOOTSTRAP_TOKEN_EXPIRED';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id and active) then
    raise exception 'NOT_FOUND: profile ativo % não existe', p_user_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  insert into platform.admins (user_id, status, granted_by)
  values (p_user_id, 'active', null);

  update platform.bootstrap_tokens
     set consumed_at = now(), consumed_by = p_user_id
   where id = v_token.id;

  -- Este SIM persiste: o caminho de sucesso commita.
  perform platform.log_event(
    p_actor_user_id => p_user_id,
    p_action        => 'platform.bootstrap',
    p_result        => 'success',
    p_target_type   => 'platform.admins',
    p_target_id     => p_user_id,
    p_metadata      => jsonb_build_object('tokenId', v_token.id, 'label', v_token.label)
  );

  return jsonb_build_object('userId', p_user_id, 'status', 'active', 'bootstrapped', true);
end;
$$;

-- =============================================================================
-- 3. Remoção do código morto — suspend_company_access
-- =============================================================================
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

  if v_membership.role = 'company_admin' then
    select count(*) into v_remaining
    from public.company_memberships m
    where m.company_id = p_company_id
      and m.role = 'company_admin'
      and m.active
      and m.user_id <> p_admin_user_id;

    if v_remaining = 0 then
      -- SEM log_event aqui (PNF-PLAT-001). A Edge Function captura o hint
      -- LAST_ADMIN_PROTECTED e chama platform.log_denial() em seguida.
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

-- =============================================================================
-- 3b. block_admin_account: o piso do tenant precisa aparecer como conflito
-- =============================================================================
-- O banco V2 já protege o profile: `b_profiles_protect_last_admin` recusa
-- desativar o perfil de quem é o último company_admin efetivo de alguma
-- empresa. Isso está certo — bloquear a conta global de plataforma não pode
-- deixar uma empresa órfã.
--
-- O problema era de CONTRATO, não de regra: o erro chegava à interface como um
-- 23514 vindo de um trigger, sem dizer QUAIS empresas travaram a ação. O Admin
-- Web precisa abrir o ConflictModal `last_admin_protected` nomeando-as.
--
-- A verificação prévia abaixo produz esse contrato. O trigger continua como
-- rede de segurança: se um caminho novo escapar da pré-checagem, ele barra.
create or replace function platform.block_admin_account(
  p_actor_user_id  uuid,
  p_target_user_id uuid,
  p_reason         text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profile  public.profiles;
  v_blocking jsonb;
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

  -- Empresas que ficariam sem administrador ativo se esta conta caísse.
  select coalesce(jsonb_agg(jsonb_build_object(
           'companyId', c.id, 'tradeName', c.trade_name) order by c.trade_name), '[]'::jsonb)
    into v_blocking
  from public.company_memberships m
  join public.companies c on c.id = m.company_id
  where m.user_id = p_target_user_id
    and m.active
    and m.role = 'company_admin'
    and not exists (
      select 1 from public.company_memberships o
      join public.profiles op on op.id = o.user_id
      where o.company_id = m.company_id
        and o.role = 'company_admin'
        and o.active
        and op.active
        and o.user_id <> p_target_user_id
    );

  if jsonb_array_length(v_blocking) > 0 then
    -- Sem auditoria aqui (PNF-PLAT-001): a Edge Function chama log_denial.
    raise exception
      'LAST_ADMIN_PROTECTED: a conta é o único administrador ativo de % empresa(s)',
      jsonb_array_length(v_blocking)
      using errcode = '23514',
            hint   = 'LAST_ADMIN_PROTECTED',
            detail = v_blocking::text;
  end if;

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

comment on function platform.block_admin_account(uuid, uuid, text) is
  'Bloqueia a CONTA GLOBAL (profiles.active). Recusa com LAST_ADMIN_PROTECTED e a lista '
  'de empresas em DETAIL quando o bloqueio deixaria alguma empresa sem administrador.';

-- =============================================================================
-- 4. Remoção do código morto — compensate_provisioning
-- =============================================================================
-- O caminho de "compensação bloqueada" NÃO levanta exceção: ele muda a operação
-- para needs_manual e retorna normalmente. Portanto o log_event ali persiste e
-- está correto — é o único dos três que já funcionava. Mantido como está, com
-- comentário para não ser "corrigido" por engano.
comment on function platform.compensate_provisioning(uuid, uuid, text) is
  'Reverte provisionamento de empresa virgem. O caminho needs_manual retorna '
  'normalmente (sem raise), por isso a auditoria dele persiste — diferente das '
  'recusas que levantam exceção (PNF-PLAT-001).';

-- =============================================================================
-- 5. Grants
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
