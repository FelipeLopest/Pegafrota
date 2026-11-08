-- =============================================================================
-- PegaNaFrota — 20260808000100 — Correções para instalação limpa
-- =============================================================================
-- Consolida quatro ajustes descobertos ao ensaiar o provisionamento em um projeto
-- Supabase hospedado do zero:
--
--   1. histórico administrativo não pode impedir para sempre a exclusão de uma
--      identidade antiga. `platform.operations.actor_user_id` passa a aceitar
--      NULL e usa ON DELETE SET NULL, preservando a operação sem falsificar o
--      autor;
--   2. a auditoria global é append-only. Por isso o UUID histórico do ator não
--      pode depender de uma FK com ON DELETE SET NULL (que tentaria UPDATE na
--      trilha imutável). O vínculo físico é removido e o UUID é preservado;
--   3. `platform.admins` acompanha o ciclo de vida de `auth.users` via
--      `public.profiles`. A FK do papel global passa a ON DELETE CASCADE. O
--      trigger `platform_admins_protect_last` continua protegendo o último
--      administrador ATIVO inclusive em deletes em cascata;
--   4. a ação crítica `admin.replace`, já reservada no contrato da Edge
--      Function, ganha uma RPC transacional. O novo administrador é ativado
--      ANTES de o papel do anterior ser removido, eliminando a janela em que a
--      plataforma ficaria sem administrador.
-- =============================================================================

comment on schema platform is
  'Camada global administrativa. Endereçável pelo PostgREST somente para RPCs/grants de service_role; sem acesso direto para anon/authenticated.';

-- -----------------------------------------------------------------------------
-- 1. Histórico de operações: preservar o fato, não prender a identidade
-- -----------------------------------------------------------------------------
alter table platform.operations
  alter column actor_user_id drop not null;

alter table platform.operations
  drop constraint if exists operations_actor_user_id_fkey;

alter table platform.operations
  add constraint operations_actor_user_id_fkey
  foreign key (actor_user_id)
  references public.profiles (id)
  on delete set null;

comment on column platform.operations.actor_user_id is
  'Autor humano da operação. Pode ficar NULL após exclusão da identidade; o histórico e os payloads permanecem preservados.';

-- -----------------------------------------------------------------------------
-- 2. Auditoria append-only: manter o UUID histórico sem FK mutável
-- -----------------------------------------------------------------------------
-- `platform.audit_events` proíbe UPDATE por trigger. Uma FK ON DELETE SET NULL
-- conflita com essa regra: ao apagar o profile, o PostgreSQL tentaria atualizar
-- actor_user_id e o próprio trigger append-only impediria a exclusão. Para uma
-- trilha de auditoria, preservar o UUID original (mesmo órfão) é mais fiel do
-- que reescrevê-lo para NULL. A coluna continua sem privilégios de UPDATE.
alter table platform.audit_events
  drop constraint if exists audit_events_actor_user_id_fkey;

comment on column platform.audit_events.actor_user_id is
  'UUID histórico do ator. Intencionalmente sem FK para que a trilha append-only sobreviva à exclusão da identidade sem ser reescrita.';

-- -----------------------------------------------------------------------------
-- 3. Papel global acompanha a identidade, mantendo o piso de segurança
-- -----------------------------------------------------------------------------
alter table platform.admins
  drop constraint if exists admins_user_id_fkey;

alter table platform.admins
  add constraint admins_user_id_fkey
  foreign key (user_id)
  references public.profiles (id)
  on delete cascade;

comment on column platform.admins.user_id is
  'Perfil que possui o papel global. A linha é removida com o profile; o trigger de piso impede apagar o último platform_admin ativo.';

-- -----------------------------------------------------------------------------
-- 4. Substituição transacional do platform_admin que está executando a ação
-- -----------------------------------------------------------------------------
create or replace function platform.replace_platform_admin(
  p_actor_user_id uuid,
  p_new_user_id   uuid,
  p_reason        text default 'Substituição do administrador da plataforma'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_new_profile public.profiles;
  v_new_was_admin boolean;
begin
  perform private.assert_platform_admin(p_actor_user_id);

  if p_new_user_id is null then
    raise exception 'INVALID_INPUT: novo administrador é obrigatório'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  if p_new_user_id = p_actor_user_id then
    raise exception 'INVALID_INPUT: o novo administrador precisa ser outra conta'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  select * into v_new_profile
  from public.profiles
  where id = p_new_user_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: profile % não existe', p_new_user_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  if not v_new_profile.active then
    raise exception 'PROFILE_GLOBALLY_INACTIVE: a nova conta está bloqueada'
      using errcode = '42501', hint = 'PROFILE_GLOBALLY_INACTIVE';
  end if;

  select exists (
    select 1 from platform.admins
    where user_id = p_new_user_id and status = 'active'
  ) into v_new_was_admin;

  -- Primeiro sobe o substituto. Se ele já existia bloqueado, reativa e limpa o
  -- estado de bloqueio; se já era ativo, a operação continua idempotente.
  insert into platform.admins (
    user_id, status, granted_at, granted_by,
    blocked_at, blocked_by, block_reason, updated_at
  )
  values (
    p_new_user_id, 'active', now(), p_actor_user_id,
    null, null, null, now()
  )
  on conflict (user_id) do update
     set status       = 'active',
         granted_at   = case
                          when platform.admins.status = 'active'
                            then platform.admins.granted_at
                          else now()
                        end,
         granted_by   = p_actor_user_id,
         blocked_at   = null,
         blocked_by   = null,
         block_reason = null,
         updated_at   = now();

  -- Só depois remove o papel global do ator anterior. Nesse momento já existe
  -- outro admin ativo, então `platform_admins_protect_last` permite o DELETE.
  delete from platform.admins
  where user_id = p_actor_user_id;

  perform platform.log_event(
    p_actor_user_id => p_actor_user_id,
    p_action        => 'platform_admin.replaced',
    p_result        => 'success',
    p_target_type   => 'platform.admins',
    p_target_id     => p_new_user_id,
    p_metadata      => jsonb_build_object(
      'previousUserId', p_actor_user_id,
      'newUserId', p_new_user_id,
      'newUserAlreadyAdmin', v_new_was_admin,
      'reason', private.normalize_label(p_reason)
    )
  );

  return jsonb_build_object(
    'previousUserId', p_actor_user_id,
    'newUserId', p_new_user_id,
    'newStatus', 'active',
    'previousRoleRemoved', true,
    'changed', true
  );
end;
$$;

comment on function platform.replace_platform_admin(uuid, uuid, text) is
  'Transfere o papel global do ator para outro profile ativo. O novo admin é ativado antes da remoção do anterior.';

revoke all on function platform.replace_platform_admin(uuid, uuid, text)
  from public, anon, authenticated, authenticator;
grant execute on function platform.replace_platform_admin(uuid, uuid, text)
  to service_role;
