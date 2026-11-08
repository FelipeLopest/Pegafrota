-- =============================================================================
-- PegaNaFrota — 20260802000200 — Operações administrativas e idempotência
-- =============================================================================
-- Modela o provisionamento como uma OPERAÇÃO DURÁVEL com sub-operações, e não
-- como uma chamada de função que ou dá certo ou some.
--
-- Por que operação durável:
--   Provisionar uma empresa toca três sistemas — tabela companies, auth.users e
--   o vínculo. Não existe transação que cubra os três: auth.users é escrito por
--   HTTP na GoTrue, fora do PostgreSQL. Logo, falha parcial é possível por
--   construção, e a única resposta honesta é registrar o progresso e permitir
--   compensar ou retentar. É o que o handoff chama de `partial_failure`.
--
-- Idempotência em duas camadas:
--   1. `idempotency_key` UNIQUE  — a mesma chave nunca cria duas empresas.
--   2. `fingerprint`             — hash do payload. Mesma chave com payload
--                                  DIFERENTE é erro (23505/IDEMPOTENCY_REUSE),
--                                  não "devolve o resultado antigo". Sem isso,
--                                  um cliente que reaproveitasse a chave por
--                                  engano receberia silenciosamente a empresa
--                                  errada.
--
-- Referências: ADMIN_BUSINESS_FLOWS.md, BACKEND_CONTRACT_EXPECTATIONS.md
-- =============================================================================

-- =============================================================================
-- 1. Operação
-- =============================================================================
create table platform.operations (
  id                uuid primary key default gen_random_uuid(),
  kind              platform.operation_kind not null,
  status            platform.operation_status not null default 'pending',
  idempotency_key   text not null,
  fingerprint       text not null,
  actor_user_id     uuid not null references public.profiles (id) on delete restrict,

  -- Alvos. company_id só é preenchido quando a empresa chega a existir.
  company_id        uuid references public.companies (id) on delete restrict,
  target_user_id    uuid references public.profiles (id) on delete set null,

  request_payload   jsonb not null,
  result_payload    jsonb,
  error_code        text,
  error_detail      text,
  retryable         boolean not null default false,
  attempt_count     integer not null default 0,

  started_at        timestamptz,
  finished_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint platform_operations_key_len
    check (char_length(btrim(idempotency_key)) between 8 and 200),
  constraint platform_operations_fingerprint_len
    check (char_length(fingerprint) = 64),
  constraint platform_operations_payload_object
    check (jsonb_typeof(request_payload) = 'object'),
  constraint platform_operations_attempts
    check (attempt_count >= 0 and attempt_count <= 50),
  -- Um estado terminal precisa de carimbo de término; um não-terminal não pode
  -- fingir que terminou.
  constraint platform_operations_terminal_consistent check (
    (status in ('succeeded', 'compensated', 'needs_manual') and finished_at is not null)
    or (status in ('pending', 'running', 'failed', 'compensating'))
  ),
  -- Só os estados de falha carregam código de erro. `compensating` entra na
  -- lista porque é a compensação DE uma falha: ela herda o código que a
  -- motivou, e zerá-lo na transição perderia a causa raiz justamente no
  -- momento em que o operador precisa dela.
  constraint platform_operations_error_consistent check (
    (status in ('failed', 'needs_manual', 'compensating', 'compensated')
     or error_code is null)
  ),
  -- Retentativa nunca é oferecida em estado terminal de sucesso.
  constraint platform_operations_retryable_consistent check (
    (retryable = false) or (status in ('failed', 'compensated'))
  )
);

comment on table platform.operations is
  'Operação administrativa durável. A UI acompanha o progresso por aqui '
  '(ProvisioningProgress) e a retentativa só existe quando retryable = true.';
comment on column platform.operations.fingerprint is
  'SHA-256 do payload normalizado. Mesma idempotency_key com fingerprint diferente é recusada.';
comment on column platform.operations.retryable is
  'Autoridade do BACKEND. A UI apenas habilita/desabilita o botão Retentar a partir daqui.';

create unique index platform_operations_idempotency_idx
  on platform.operations (idempotency_key);

create index platform_operations_status_idx  on platform.operations (status, created_at desc);
create index platform_operations_company_idx on platform.operations (company_id, created_at desc);
create index platform_operations_actor_idx   on platform.operations (actor_user_id, created_at desc);

create trigger platform_operations_set_updated_at
  before update on platform.operations
  for each row execute function private.tg_set_updated_at();

-- =============================================================================
-- 2. Sub-operações (as 4 etapas que a barra de progresso mostra)
-- =============================================================================
create table platform.operation_steps (
  id            uuid primary key default gen_random_uuid(),
  operation_id  uuid not null references platform.operations (id) on delete cascade,
  step_index    integer not null,
  step_code     text not null,
  status        platform.step_status not null default 'pending',
  detail        text,
  error_code    text,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint platform_steps_index_positive check (step_index >= 1 and step_index <= 20),
  constraint platform_steps_code_len check (char_length(btrim(step_code)) between 3 and 60),
  constraint platform_steps_unique_index unique (operation_id, step_index)
);

comment on table platform.operation_steps is
  'Sub-operações de uma operação. É o que permite dizer "falhou na etapa exata" '
  'em vez de "falhou em algum lugar".';

create index platform_steps_operation_idx on platform.operation_steps (operation_id, step_index);

create trigger platform_steps_set_updated_at
  before update on platform.operation_steps
  for each row execute function private.tg_set_updated_at();

-- =============================================================================
-- 3. Fingerprint determinístico
-- =============================================================================
-- jsonb já normaliza ordem de chaves e espaços, então o texto canônico de um
-- jsonb é estável para o mesmo conteúdo lógico. É o que torna o fingerprint
-- comparável entre duas requisições idênticas enviadas em ordens diferentes.
create or replace function platform.payload_fingerprint(p_payload jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(
    extensions.digest(convert_to(coalesce(p_payload, '{}'::jsonb)::text, 'UTF8'), 'sha256'),
    'hex'
  );
$$;

comment on function platform.payload_fingerprint(jsonb) is
  'SHA-256 do jsonb canônico. Detecta reuso de idempotency_key com payload diferente.';

-- =============================================================================
-- 4. Abertura idempotente de operação
-- =============================================================================
-- Devolve a operação existente quando a chave se repete com o MESMO payload, e
-- recusa quando o payload difere. O INSERT ... ON CONFLICT resolve a corrida de
-- dois cliques simultâneos sem depender de LOCK explícito.
create or replace function platform.open_operation(
  p_kind            platform.operation_kind,
  p_actor_user_id   uuid,
  p_idempotency_key text,
  p_payload         jsonb,
  p_steps           text[]
)
returns table (operation_id uuid, is_replay boolean, current_status platform.operation_status)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fingerprint text;
  v_existing    platform.operations;
  v_new_id      uuid;
  v_step        text;
  v_i           integer := 0;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  if private.normalize_label(p_idempotency_key) is null then
    raise exception 'INVALID_INPUT: idempotency_key é obrigatória'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  v_fingerprint := platform.payload_fingerprint(p_payload);

  select * into v_existing
  from platform.operations
  where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.fingerprint <> v_fingerprint then
      raise exception
        'IDEMPOTENCY_REUSE: a chave % já foi usada com um conteúdo diferente', p_idempotency_key
        using errcode = '23505', hint = 'IDEMPOTENCY_REUSE';
    end if;
    return query select v_existing.id, true, v_existing.status;
    return;
  end if;

  insert into platform.operations (
    kind, status, idempotency_key, fingerprint, actor_user_id, request_payload
  )
  values (p_kind, 'pending', p_idempotency_key, v_fingerprint, p_actor_user_id, p_payload)
  on conflict (idempotency_key) do nothing
  returning id into v_new_id;

  -- Corrida perdida: outra transação inseriu a mesma chave entre o SELECT e o
  -- INSERT. O comportamento correto é o mesmo de um replay.
  if v_new_id is null then
    select * into v_existing
    from platform.operations
    where idempotency_key = p_idempotency_key;

    if v_existing.fingerprint <> v_fingerprint then
      raise exception
        'IDEMPOTENCY_REUSE: a chave % já foi usada com um conteúdo diferente', p_idempotency_key
        using errcode = '23505', hint = 'IDEMPOTENCY_REUSE';
    end if;
    return query select v_existing.id, true, v_existing.status;
    return;
  end if;

  foreach v_step in array coalesce(p_steps, array[]::text[]) loop
    v_i := v_i + 1;
    insert into platform.operation_steps (operation_id, step_index, step_code)
    values (v_new_id, v_i, v_step);
  end loop;

  return query select v_new_id, false, 'pending'::platform.operation_status;
end;
$$;

-- =============================================================================
-- 5. Transições de etapa e de operação
-- =============================================================================
create or replace function platform.mark_step(
  p_operation_id uuid,
  p_step_code    text,
  p_status       platform.step_status,
  p_detail       text default null,
  p_error_code   text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update platform.operation_steps
     set status      = p_status,
         detail      = coalesce(p_detail, detail),
         error_code  = coalesce(p_error_code, error_code),
         started_at  = case when p_status = 'running' then coalesce(started_at, now()) else started_at end,
         finished_at = case
                         when p_status in ('succeeded', 'failed', 'skipped', 'compensated') then now()
                         else finished_at
                       end
   where operation_id = p_operation_id
     and step_code    = p_step_code;

  if not found then
    raise exception 'NOT_FOUND: etapa % não existe na operação %', p_step_code, p_operation_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;
end;
$$;

create or replace function platform.mark_operation(
  p_operation_id  uuid,
  p_status        platform.operation_status,
  p_result        jsonb default null,
  p_error_code    text default null,
  p_error_detail  text default null,
  p_retryable     boolean default null,
  p_company_id    uuid default null,
  p_target_user_id uuid default null
)
returns platform.operations
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_op platform.operations;
begin
  update platform.operations
     set status         = p_status,
         result_payload = coalesce(p_result, result_payload),
         error_code     = case when p_status in ('succeeded', 'running', 'pending')
                               then null else coalesce(p_error_code, error_code) end,
         error_detail   = case when p_status in ('succeeded', 'running', 'pending')
                               then null else coalesce(p_error_detail, error_detail) end,
         retryable      = case when p_status in ('failed', 'compensated')
                               then coalesce(p_retryable, retryable) else false end,
         company_id     = coalesce(p_company_id, company_id),
         target_user_id = coalesce(p_target_user_id, target_user_id),
         attempt_count  = case when p_status = 'running' then attempt_count + 1 else attempt_count end,
         started_at     = case when p_status = 'running' then coalesce(started_at, now()) else started_at end,
         finished_at    = case
                            when p_status in ('succeeded', 'compensated', 'needs_manual') then now()
                            when p_status in ('pending', 'running') then null
                            else finished_at
                          end
   where id = p_operation_id
  returning * into v_op;

  if not found then
    raise exception 'NOT_FOUND: operação % não existe', p_operation_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  return v_op;
end;
$$;

-- =============================================================================
-- 6. Grants — service_role e mais ninguém
-- =============================================================================
alter table platform.operations      enable row level security;
alter table platform.operations      force row level security;
alter table platform.operation_steps enable row level security;
alter table platform.operation_steps force row level security;

revoke all on platform.operations, platform.operation_steps from public, anon, authenticated;

revoke all on function platform.open_operation(platform.operation_kind, uuid, text, jsonb, text[])
  from public, anon, authenticated;
revoke all on function platform.mark_step(uuid, text, platform.step_status, text, text)
  from public, anon, authenticated;
revoke all on function platform.mark_operation(
  uuid, platform.operation_status, jsonb, text, text, boolean, uuid, uuid)
  from public, anon, authenticated;
revoke all on function platform.payload_fingerprint(jsonb) from public, anon, authenticated;

grant execute on function platform.open_operation(platform.operation_kind, uuid, text, jsonb, text[])
  to service_role;
grant execute on function platform.mark_step(uuid, text, platform.step_status, text, text)
  to service_role;
grant execute on function platform.mark_operation(
  uuid, platform.operation_status, jsonb, text, text, boolean, uuid, uuid)
  to service_role;
