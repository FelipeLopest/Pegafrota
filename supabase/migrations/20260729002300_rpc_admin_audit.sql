-- =============================================================================
-- PegaNaFrota — 002300 — Auditoria de ações administrativas
-- =============================================================================
-- A Edge Function admin-users age com service role, o que faz a RLS ser
-- ignorada. Justamente por isso ela precisa deixar rastro explícito: os
-- triggers de auditoria registram a linha alterada, mas não a INTENÇÃO nem o
-- fato de a ação ter vindo do canal administrativo.
--
-- Esta função é o ponto de entrada dessa trilha. Ela NÃO é concedida a
-- authenticated: o cliente Electron não pode escrever na auditoria.
-- =============================================================================

create or replace function public.log_admin_action(
  p_company_id    uuid,
  p_actor_user_id uuid,
  p_action        text,
  p_entity_id     uuid default null,
  p_metadata      jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_event_id bigint;   -- audit.events.id é identity bigint, não uuid
begin
  if p_company_id is null then
    raise exception 'INVALID_INPUT: empresa obrigatória'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  if p_action is null or btrim(p_action) = '' then
    raise exception 'INVALID_INPUT: ação obrigatória'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  -- O ator precisa existir e ter vínculo com a empresa informada. Sem isso, a
  -- própria trilha administrativa poderia ser usada para forjar registros.
  if p_actor_user_id is not null and not exists (
    select 1 from public.company_memberships m
    where m.user_id = p_actor_user_id and m.company_id = p_company_id
  ) then
    raise exception 'FORBIDDEN: autor não pertence à empresa informada'
      using errcode = '42501', hint = 'PERMISSION_DENIED';
  end if;

  insert into audit.events (
    company_id, actor_user_id, action, entity, entity_id, changed_fields, metadata
  )
  values (
    p_company_id, p_actor_user_id, 'execute', 'admin.users', p_entity_id, null,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'channel', 'edge-function',
      'function', 'admin-users',
      'adminAction', p_action
    )
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

comment on function public.log_admin_action(uuid, uuid, text, uuid, jsonb) is
  'Trilha das ações da Edge Function admin-users. Exclusiva de service_role.';

revoke all on function public.log_admin_action(uuid, uuid, text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.log_admin_action(uuid, uuid, text, uuid, jsonb)
  to service_role;
