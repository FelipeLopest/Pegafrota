-- =============================================================================
-- PegaNaFrota — 20260731000800 — Canal administrativo idempotente
-- =============================================================================
-- Apoia a correção de DB-AUD-011 (compensação, auditoria obrigatória e
-- idempotência da Edge Function admin-users).
--
-- A auditoria administrativa deixa de ser "melhor esforço": ela passa a ser o
-- registro de idempotência da própria operação. Se a mesma requisição chegar
-- duas vezes (retry do cliente, timeout de rede), o segundo envio devolve o
-- resultado do primeiro em vez de provisionar um usuário duplicado.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Chave de idempotência única por empresa
-- ---------------------------------------------------------------------------
create unique index audit_events_idempotency_idx
  on audit.events (company_id, (metadata ->> 'idempotencyKey'))
  where metadata ? 'idempotencyKey';

comment on index audit.audit_events_idempotency_idx is
  'Uma chave de idempotência por empresa. É o que impede provisionamento duplicado.';

-- ---------------------------------------------------------------------------
-- 2. Consulta de ação já executada
-- ---------------------------------------------------------------------------
create or replace function public.admin_find_action(
  p_company_id      uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event audit.events;
begin
  if p_company_id is null or private.normalize_label(p_idempotency_key) is null then
    return null;
  end if;

  select * into v_event
  from audit.events e
  where e.company_id = p_company_id
    and e.metadata ->> 'idempotencyKey' = p_idempotency_key
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'eventId', v_event.id,
    'action', v_event.metadata ->> 'adminAction',
    'entityId', v_event.entity_id,
    'result', coalesce(v_event.metadata -> 'result', 'null'::jsonb),
    'occurredAt', v_event.occurred_at
  );
end;
$$;

comment on function public.admin_find_action(uuid, text) is
  'Devolve o resultado de uma ação administrativa já registrada com a mesma chave de idempotência.';

revoke all on function public.admin_find_action(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_find_action(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. log_admin_action com chave de idempotência
-- ---------------------------------------------------------------------------
-- A assinatura antiga é removida: um parâmetro novo com DEFAULT tornaria
-- ambígua qualquer chamada com cinco argumentos.
drop function if exists public.log_admin_action(uuid, uuid, text, uuid, jsonb);

create or replace function public.log_admin_action(
  p_company_id      uuid,
  p_actor_user_id   uuid,
  p_action          text,
  p_entity_id       uuid default null,
  p_metadata        jsonb default '{}'::jsonb,
  p_idempotency_key text default null,
  p_result          jsonb default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event_id bigint;
  v_metadata jsonb;
  v_key      text := private.normalize_label(p_idempotency_key);
begin
  if p_company_id is null then
    raise exception 'INVALID_INPUT: empresa obrigatória'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  if p_action is null or btrim(p_action) = '' then
    raise exception 'INVALID_INPUT: ação obrigatória'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  -- O ator precisa existir e ter vínculo com a empresa informada.
  if p_actor_user_id is not null and not exists (
    select 1 from public.company_memberships m
    where m.user_id = p_actor_user_id and m.company_id = p_company_id
  ) then
    raise exception 'FORBIDDEN: autor não pertence à empresa informada'
      using errcode = '42501', hint = 'PERMISSION_DENIED';
  end if;

  v_metadata := coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'channel', 'edge-function',
    'function', 'admin-users',
    'adminAction', p_action
  );

  if v_key is not null then
    v_metadata := v_metadata || jsonb_build_object('idempotencyKey', v_key);
  end if;

  if p_result is not null then
    v_metadata := v_metadata || jsonb_build_object('result', p_result);
  end if;

  insert into audit.events (
    company_id, actor_user_id, action, entity, entity_id, changed_fields, metadata
  )
  values (
    p_company_id, p_actor_user_id, 'execute', 'admin.users', p_entity_id, null, v_metadata
  )
  returning id into v_event_id;

  return v_event_id;
exception
  when unique_violation then
    raise exception 'IDEMPOTENCY_CONFLICT: chave % já registrada para esta empresa', v_key
      using errcode = '23505', hint = 'CONFLICT_DUPLICATE';
end;
$$;

comment on function public.log_admin_action(uuid, uuid, text, uuid, jsonb, text, jsonb) is
  'Trilha das ações da Edge Function admin-users. Exclusiva de service_role. '
  'A chave de idempotência é única por empresa (DB-AUD-011).';

revoke all on function public.log_admin_action(uuid, uuid, text, uuid, jsonb, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.log_admin_action(uuid, uuid, text, uuid, jsonb, text, jsonb)
  to service_role;
