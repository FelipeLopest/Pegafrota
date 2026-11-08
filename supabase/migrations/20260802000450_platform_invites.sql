-- =============================================================================
-- PegaNaFrota — 20260802000450 — Convites do primeiro company_admin
-- =============================================================================
-- O convite é de uso único e o reenvio INVALIDA o link anterior
-- (ADMIN_BUSINESS_FLOWS.md §"Primeiro administrador").
--
-- Prazo é do backend, nunca da UI. Esta tabela é a fonte de:
--   expires_at            validade do link
--   resend_available_at   quando o botão Reenviar volta a funcionar
-- A interface apenas exibe o que vier daqui; ela não fixa minutos nem tentativas.
--
-- O token nunca é gravado em claro — só o SHA-256, como no bootstrap.
-- =============================================================================

create table platform.company_invites (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies (id) on delete restrict,
  user_id             uuid not null references public.profiles (id) on delete cascade,
  email               text not null,
  role                public.membership_role not null default 'company_admin',
  token_sha256        text not null,
  expires_at          timestamptz not null,
  resend_available_at timestamptz not null,
  accepted_at         timestamptz,
  revoked_at          timestamptz,
  revoked_reason      text,
  created_by          uuid references public.profiles (id) on delete set null,
  operation_id        uuid references platform.operations (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint invite_token_format check (token_sha256 ~ '^[a-f0-9]{64}$'),
  constraint invite_email_format check (email ~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$'),
  constraint invite_terminal_exclusive check (
    not (accepted_at is not null and revoked_at is not null)
  )
);

comment on table platform.company_invites is
  'Convite de uso único. Reenviar cria um novo e revoga o anterior — nunca coexistem dois válidos.';
comment on column platform.company_invites.resend_available_at is
  'Consumido pela UI como resend_available_at. A interface não inventa intervalo de reenvio.';

create unique index platform_invites_token_idx on platform.company_invites (token_sha256);

-- No máximo um convite pendente por (empresa, usuário).
create unique index platform_invites_one_pending_idx
  on platform.company_invites (company_id, user_id)
  where accepted_at is null and revoked_at is null;

create index platform_invites_company_idx on platform.company_invites (company_id, created_at desc);
create index platform_invites_pending_idx on platform.company_invites (expires_at)
  where accepted_at is null and revoked_at is null;

create trigger platform_invites_set_updated_at
  before update on platform.company_invites
  for each row execute function private.tg_set_updated_at();

-- -----------------------------------------------------------------------------
-- Emissão / reenvio
-- -----------------------------------------------------------------------------
create or replace function platform.issue_invite(
  p_company_id      uuid,
  p_user_id         uuid,
  p_email           text,
  p_token_plain     text,
  p_actor_user_id   uuid,
  p_ttl_hours       integer default 72,
  p_resend_cooldown_seconds integer default 300,
  p_operation_id    uuid default null,
  p_role            public.membership_role default 'company_admin'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_prior platform.company_invites;
  v_hash  text;
  v_new   platform.company_invites;
begin
  if char_length(coalesce(p_token_plain, '')) < 32 then
    raise exception 'INVALID_INPUT: token de convite muito curto'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  select * into v_prior
  from platform.company_invites
  where company_id = p_company_id and user_id = p_user_id
    and accepted_at is null and revoked_at is null
  for update;

  if found then
    if v_prior.accepted_at is not null then
      raise exception 'INVITE_ALREADY_ACCEPTED: convite já aceito'
        using errcode = '55000', hint = 'INVITE_ALREADY_ACCEPTED';
    end if;

    -- Janela de reenvio: quem chegou cedo demais recebe 429 + retry_after.
    if now() < v_prior.resend_available_at then
      raise exception 'RESEND_TOO_SOON: reenvio disponível em %', v_prior.resend_available_at
        using errcode = '55000',
              hint = 'RESEND_TOO_SOON',
              detail = extract(epoch from (v_prior.resend_available_at - now()))::integer::text;
    end if;

    update platform.company_invites
       set revoked_at = now(), revoked_reason = 'superseded_by_resend'
     where id = v_prior.id;
  end if;

  v_hash := encode(extensions.digest(convert_to(p_token_plain, 'UTF8'), 'sha256'), 'hex');

  insert into platform.company_invites (
    company_id, user_id, email, role, token_sha256,
    expires_at, resend_available_at, created_by, operation_id
  )
  values (
    p_company_id, p_user_id, lower(btrim(p_email)), p_role, v_hash,
    now() + make_interval(hours => greatest(coalesce(p_ttl_hours, 72), 1)),
    now() + make_interval(secs  => greatest(coalesce(p_resend_cooldown_seconds, 300), 0)),
    p_actor_user_id, p_operation_id
  )
  returning * into v_new;

  perform platform.log_event(
    p_actor_user_id => p_actor_user_id,
    p_action        => case when v_prior.id is null then 'invite.sent' else 'invite.resent' end,
    p_result        => 'success',
    p_target_type   => 'platform.company_invites',
    p_target_id     => p_user_id,
    p_company_id    => p_company_id,
    p_operation_id  => p_operation_id,
    p_metadata      => jsonb_build_object('email', v_new.email, 'supersededInviteId', v_prior.id)
  );

  return jsonb_build_object(
    'inviteId', v_new.id,
    'expiresAt', v_new.expires_at,
    'resendAvailableAt', v_new.resend_available_at,
    'inviteSent', true,
    'superseded', (v_prior.id is not null)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Aceite
-- -----------------------------------------------------------------------------
create or replace function platform.accept_invite(
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
  v_invite platform.company_invites;
  v_hash   text;
begin
  v_hash := encode(extensions.digest(convert_to(coalesce(p_token_plain, ''), 'UTF8'), 'sha256'), 'hex');

  select * into v_invite from platform.company_invites where token_sha256 = v_hash for update;

  if not found then
    raise exception 'INVITE_INVALID: convite inválido'
      using errcode = '42501', hint = 'INVITE_INVALID';
  end if;

  if v_invite.user_id <> p_user_id then
    raise exception 'INVITE_INVALID: convite não pertence a este usuário'
      using errcode = '42501', hint = 'INVITE_INVALID';
  end if;

  if v_invite.accepted_at is not null then
    raise exception 'INVITE_ALREADY_ACCEPTED: convite já aceito'
      using errcode = '55000', hint = 'INVITE_ALREADY_ACCEPTED';
  end if;

  if v_invite.revoked_at is not null then
    raise exception 'INVITE_REVOKED: convite revogado'
      using errcode = '55000', hint = 'INVITE_REVOKED';
  end if;

  if v_invite.expires_at <= now() then
    raise exception 'INVITE_EXPIRED: convite expirado em %', v_invite.expires_at
      using errcode = '55000', hint = 'INVITE_EXPIRED';
  end if;

  update platform.company_invites set accepted_at = now() where id = v_invite.id;

  -- Aceitar o convite ativa o vínculo. É aqui que a substituição de
  -- administrador finalmente encerra o vínculo antigo — nunca antes, para que a
  -- empresa jamais fique sem administrador.
  update public.company_memberships
     set active = true
   where company_id = v_invite.company_id and user_id = v_invite.user_id;

  perform platform.log_event(
    p_actor_user_id => p_user_id,
    p_action        => 'invite.accepted',
    p_result        => 'success',
    p_target_type   => 'platform.company_invites',
    p_target_id     => p_user_id,
    p_company_id    => v_invite.company_id,
    p_metadata      => jsonb_build_object('inviteId', v_invite.id)
  );

  return jsonb_build_object('companyId', v_invite.company_id, 'userId', p_user_id,
                            'role', v_invite.role, 'accepted', true);
end;
$$;

alter table platform.company_invites enable row level security;
alter table platform.company_invites force row level security;
revoke all on platform.company_invites from public, anon, authenticated;
