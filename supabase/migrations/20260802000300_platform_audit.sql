-- =============================================================================
-- PegaNaFrota — 20260802000300 — Auditoria global
-- =============================================================================
-- Critério de aceite: "auditoria global e tenant separadas logicamente".
--
-- Separação real, não cosmética:
--   audit.events            trilha do TENANT. Legível pelo Desktop via a view
--                           public.audit_events sob a permissão audit.read.
--   platform.audit_events   trilha da PLATAFORMA. Nenhum papel de aplicação
--                           alcança: schema administrativo exposto ao PostgREST apenas para
--                           RPCs/grants de service_role; RLS permanece forçada.
--
-- Um company_admin nunca vê as ações do platform_admin; um platform_admin nunca
-- vê a operação da frota do cliente. As duas afirmações são impostas por grants
-- e schemas distintos, não por filtro de consulta.
--
-- Referências: 04_CRITERIOS_DE_ACEITE.md, SECURITY_BOUNDARIES.md
-- =============================================================================

create table platform.audit_events (
  id             bigint generated always as identity primary key,
  actor_user_id  uuid references public.profiles (id) on delete set null,
  action         text not null,
  result         text not null default 'success',
  target_type    text,
  target_id      uuid,
  company_id     uuid references public.companies (id) on delete restrict,
  operation_id   uuid references platform.operations (id) on delete set null,
  request_id     text,
  ip_address     inet,
  user_agent     text,
  metadata       jsonb not null default '{}'::jsonb,
  occurred_at    timestamptz not null default now(),

  constraint platform_audit_action_len check (char_length(btrim(action)) between 3 and 120),
  constraint platform_audit_result_valid
    check (result in ('success', 'failure', 'denied', 'compensated')),
  constraint platform_audit_metadata_object check (jsonb_typeof(metadata) = 'object')
);

comment on table platform.audit_events is
  'Trilha global append-only do platform_admin. Fisicamente separada de audit.events.';
comment on column platform.audit_events.result is
  'success | failure | denied | compensated — mapeia direto o StatusPill de auditoria do Admin Web.';

create index platform_audit_time_idx      on platform.audit_events (occurred_at desc);
create index platform_audit_actor_idx     on platform.audit_events (actor_user_id, occurred_at desc);
create index platform_audit_action_idx    on platform.audit_events (action, occurred_at desc);
create index platform_audit_company_idx   on platform.audit_events (company_id, occurred_at desc);
create index platform_audit_operation_idx on platform.audit_events (operation_id)
  where operation_id is not null;
create index platform_audit_result_idx    on platform.audit_events (result, occurred_at desc);

-- -----------------------------------------------------------------------------
-- Append-only de verdade: nem o dono altera
-- -----------------------------------------------------------------------------
create trigger platform_audit_no_update
  before update on platform.audit_events
  for each row execute function private.tg_forbid_mutation();

create trigger platform_audit_no_delete
  before delete on platform.audit_events
  for each row execute function private.tg_forbid_mutation();

-- -----------------------------------------------------------------------------
-- Única porta de escrita
-- -----------------------------------------------------------------------------
create or replace function platform.log_event(
  p_actor_user_id uuid,
  p_action        text,
  p_result        text default 'success',
  p_target_type   text default null,
  p_target_id     uuid default null,
  p_company_id    uuid default null,
  p_operation_id  uuid default null,
  p_metadata      jsonb default '{}'::jsonb,
  p_request_id    text default null,
  p_ip            inet default null,
  p_user_agent    text default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into platform.audit_events (
    actor_user_id, action, result, target_type, target_id,
    company_id, operation_id, request_id, ip_address, user_agent, metadata
  )
  values (
    p_actor_user_id, p_action, p_result, p_target_type, p_target_id,
    p_company_id, p_operation_id, p_request_id, p_ip, p_user_agent,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function platform.log_event is
  'Único caminho de escrita da auditoria global. Inclusive as negações (access.denied) '
  'são gravadas: uma tentativa recusada é justamente o que se quer enxergar.';

alter table platform.audit_events enable row level security;
alter table platform.audit_events force row level security;

revoke all on platform.audit_events from public, anon, authenticated;
revoke all on function platform.log_event(uuid, text, text, text, uuid, uuid, uuid, jsonb, text, inet, text)
  from public, anon, authenticated;
grant execute on function platform.log_event(uuid, text, text, text, uuid, uuid, uuid, jsonb, text, inet, text)
  to service_role;
