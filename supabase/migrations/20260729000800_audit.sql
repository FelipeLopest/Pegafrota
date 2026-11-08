-- =============================================================================
-- PegaNaFrota — 000800 — Auditoria append-only
-- =============================================================================
-- Referência: ARCHITECTURE.md §12, DATABASE_BLUEPRINT.md §3.14
-- =============================================================================

create table audit.events (
  id             bigint generated always as identity primary key,
  company_id     uuid references public.companies (id) on delete restrict,
  actor_user_id  uuid,
  action         audit.event_action not null,
  entity         text not null,
  entity_id      uuid,
  changed_fields jsonb,
  request_id     text,
  metadata       jsonb not null default '{}'::jsonb,
  occurred_at    timestamptz not null default now(),

  constraint audit_events_entity_len check (char_length(entity) between 3 and 120),
  constraint audit_events_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint audit_events_changed_object check (
    changed_fields is null or jsonb_typeof(changed_fields) = 'object'
  )
);

comment on table audit.events is
  'Trilha de negócio append-only. Nenhum papel de aplicação recebe UPDATE ou DELETE.';
comment on column audit.events.changed_fields is
  'Somente campos alterados, no formato {"campo": {"old": ..., "new": ...}}. Nunca contém segredos.';

create index audit_events_company_time_idx on audit.events (company_id, occurred_at desc);
create index audit_events_entity_idx on audit.events (entity, entity_id, occurred_at desc);
create index audit_events_actor_idx on audit.events (actor_user_id, occurred_at desc);
create index audit_events_request_idx on audit.events (request_id) where request_id is not null;

-- -----------------------------------------------------------------------------
-- Colunas nunca copiadas para a auditoria
-- -----------------------------------------------------------------------------
create or replace function private.audit_ignored_columns()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['updated_at', 'created_at', 'last_seen_at']::text[];
$$;

-- -----------------------------------------------------------------------------
-- Escrita da auditoria (única porta de entrada)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Trigger genérico de auditoria
-- -----------------------------------------------------------------------------
create or replace function private.tg_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old      jsonb;
  v_new      jsonb;
  v_changed  jsonb := '{}'::jsonb;
  v_key      text;
  v_company  uuid;
  v_entity_id uuid;
  v_action   audit.event_action;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_action := 'insert';
    v_changed := null;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_action := 'update';

    for v_key in select jsonb_object_keys(v_new) loop
      if v_key = any (private.audit_ignored_columns()) then
        continue;
      end if;
      if (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changed := v_changed || jsonb_build_object(
          v_key,
          jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key)
        );
      end if;
    end loop;

    -- Nada relevante mudou: não polui a trilha.
    if v_changed = '{}'::jsonb then
      return null;
    end if;

    -- Arquivamento e desarquivamento recebem ação própria.
    if v_changed ? 'archived_at' then
      if (v_new ->> 'archived_at') is not null then
        v_action := 'archive';
      else
        v_action := 'unarchive';
      end if;
    end if;
  else
    v_old := to_jsonb(old);
    v_action := 'delete';
    v_changed := jsonb_build_object('deleted_row', v_old);
  end if;

  v_company := coalesce((v_new ->> 'company_id')::uuid, (v_old ->> 'company_id')::uuid);
  v_entity_id := coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid);

  -- companies não possui company_id: a própria linha é o tenant.
  if v_company is null and tg_table_name = 'companies' then
    v_company := v_entity_id;
  end if;

  perform private.log_audit_event(
    v_company,
    v_action,
    tg_table_schema || '.' || tg_table_name,
    v_entity_id,
    v_changed,
    jsonb_build_object('op', tg_op)
  );

  return null;
end;
$$;

comment on function private.tg_audit() is
  'Trigger AFTER genérico. Registra apenas campos alterados e ignora ruído de timestamps.';

-- -----------------------------------------------------------------------------
-- Append-only: bloqueia UPDATE/DELETE para qualquer papel, inclusive o dono
-- -----------------------------------------------------------------------------
create or replace function private.tg_forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'IMMUTABLE_RECORD: % em %.% não é permitido',
    tg_op, tg_table_schema, tg_table_name
    using errcode = '23514', hint = 'APPEND_ONLY_TABLE';
end;
$$;

create trigger audit_events_no_update
  before update on audit.events
  for each row execute function private.tg_forbid_mutation();

create trigger audit_events_no_delete
  before delete on audit.events
  for each row execute function private.tg_forbid_mutation();
