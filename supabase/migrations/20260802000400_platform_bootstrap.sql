-- =============================================================================
-- PegaNaFrota — 20260802000400 — Bootstrap do primeiro platform_admin
-- =============================================================================
-- O problema do ovo e da galinha: conceder platform_admin exige ser
-- platform_admin, mas no banco recém-criado não existe nenhum.
--
-- O que NÃO foi feito, e por quê:
--   - Semear um e-mail/senha fixos na migration. Migration vai para o Git; a
--     credencial do dono da plataforma iria junto.
--   - Aceitar "o primeiro que chamar vira admin". Qualquer um que alcançasse a
--     função antes do dono tomaria a plataforma.
--   - Deixar a Edge Function decidir sozinha. A regra ficaria fora do banco,
--     onde não pode ser testada por pgTAP.
--
-- O que foi feito:
--   Um token de uso único, gravado apenas como SHA-256, com validade. O segredo
--   em claro existe fora do banco (variável de ambiente do operador) e é
--   apresentado uma vez. O token só funciona enquanto NÃO houver nenhum
--   platform_admin ativo — depois disso vira inerte mesmo se vazar.
--
-- Referência: 03_ORDEM_DE_IMPLEMENTACAO.md Fase 2 item 3
-- =============================================================================

create table platform.bootstrap_tokens (
  id           uuid primary key default gen_random_uuid(),
  token_sha256 text not null,
  label        text,
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  consumed_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),

  constraint bootstrap_token_hash_format check (token_sha256 ~ '^[a-f0-9]{64}$'),
  constraint bootstrap_token_consumed_consistent check (
    (consumed_at is null and consumed_by is null)
    or (consumed_at is not null and consumed_by is not null)
  )
);

comment on table platform.bootstrap_tokens is
  'Token de uso único para criar o PRIMEIRO platform_admin. Só o hash é armazenado.';

create unique index platform_bootstrap_token_hash_idx
  on platform.bootstrap_tokens (token_sha256);

-- Um único token pendente por vez: evita uma pilha de convites esquecidos.
create unique index platform_bootstrap_single_pending_idx
  on platform.bootstrap_tokens ((true))
  where consumed_at is null;

-- -----------------------------------------------------------------------------
-- Emissão (operador, via script com service_role)
-- -----------------------------------------------------------------------------
create or replace function platform.issue_bootstrap_token(
  p_token_plain text,
  p_label       text default null,
  p_ttl_minutes integer default 60
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_id   uuid;
begin
  if char_length(coalesce(p_token_plain, '')) < 32 then
    raise exception 'INVALID_INPUT: token precisa de ao menos 32 caracteres'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  if exists (select 1 from platform.admins where status = 'active') then
    raise exception 'BOOTSTRAP_NOT_AVAILABLE: já existe platform_admin ativo'
      using errcode = '55000', hint = 'BOOTSTRAP_NOT_AVAILABLE';
  end if;

  v_hash := encode(extensions.digest(convert_to(p_token_plain, 'UTF8'), 'sha256'), 'hex');

  -- Reemitir invalida o pendente anterior. Não dá para "consumir" o antigo:
  -- consumed_at sem consumed_by viola platform_bootstrap_token_consumed_consistent,
  -- e inventar um consumidor falsearia a trilha. Um token nunca usado é apagado.
  delete from platform.bootstrap_tokens where consumed_at is null;

  insert into platform.bootstrap_tokens (token_sha256, label, expires_at)
  values (v_hash, private.normalize_label(p_label),
          now() + make_interval(mins => greatest(coalesce(p_ttl_minutes, 60), 1)))
  returning id into v_id;

  return jsonb_build_object('tokenId', v_id, 'expiresAt', now() + make_interval(mins => p_ttl_minutes));
end;
$$;

-- -----------------------------------------------------------------------------
-- Consumo: cria o primeiro platform_admin
-- -----------------------------------------------------------------------------
-- O usuário já precisa existir em auth.users (criado pela Edge Function via
-- GoTrue) e ter profile. Esta função só concede o papel global.
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

  -- Barreira principal: com um admin ativo, o token não vale mais nada.
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
    perform platform.log_event(
      p_actor_user_id => null, p_action => 'platform.bootstrap', p_result => 'denied',
      p_target_id => p_user_id, p_metadata => jsonb_build_object('reason', 'invalid_token')
    );
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

alter table platform.bootstrap_tokens enable row level security;
alter table platform.bootstrap_tokens force row level security;

revoke all on platform.bootstrap_tokens from public, anon, authenticated;
revoke all on function platform.issue_bootstrap_token(text, text, integer)
  from public, anon, authenticated;
revoke all on function platform.consume_bootstrap_token(text, uuid)
  from public, anon, authenticated;
grant execute on function platform.issue_bootstrap_token(text, text, integer) to service_role;
grant execute on function platform.consume_bootstrap_token(text, uuid) to service_role;
