-- =============================================================================
-- PegaNaFrota — 20260731000100 — Tenancy de profiles e piso de administradores
-- =============================================================================
-- Corrige:
--   DB-AUD-002  proteção do último admin contornável por profiles.active
--   DB-AUD-003  membership histórica dá acesso ao profile global de outra empresa
--   DB-AUD-010  condição de corrida na proteção do último admin
--   DB-AUD-015  contrato de erro da última conta administrativa
--
-- Decisões:
--   1. A empresa NÃO administra mais o estado global de public.profiles. O
--      estado de acesso empresarial vive exclusivamente em
--      company_memberships.active (DB-AUD-003, correção recomendada).
--   2. O usuário autenticado só altera full_name e phone do próprio perfil.
--      Isso é imposto por GRANT DE COLUNA — nenhum bug de policy reabre o
--      caminho, porque o verbo não existe para as demais colunas.
--   3. profiles.active passa a ser operação privilegiada (service_role, via
--      Edge Function admin-users) e continua sujeita ao piso de administradores.
--   4. O piso de administradores é serializado por advisory lock determinístico
--      por empresa e recontado DEPOIS do lock.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Distinção entre papel de CLIENTE e papel privilegiado
-- ---------------------------------------------------------------------------
-- private.is_api_role() considera service_role um papel de API, o que é correto
-- para bloquear escrita direta vinda do PostgREST. Mas a Edge Function precisa
-- de um canal administrativo legítimo. is_client_role() é esse recorte: apenas
-- anon e authenticated, ou seja, exatamente o que chega do aplicativo desktop.
create or replace function private.is_client_role()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user::text in ('anon', 'authenticated');
$$;
comment on function private.is_client_role() is
  'True quando a instrução veio do aplicativo (anon/authenticated). service_role NÃO entra aqui.';

grant execute on function private.is_client_role() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Vínculo histórico deixa de conceder acesso ao profile global (DB-AUD-003)
-- ---------------------------------------------------------------------------
-- Regra: a empresa enxerga o profile de quem está vinculado a ela E que não
-- possui vínculo ATIVO em outra empresa.
--
--   - membership inativa em A, sem vínculo ativo em lugar nenhum  -> A enxerga
--     (é o ex-funcionário que ainda aparece na lista de membros de A);
--   - membership inativa em A e ATIVA em B                        -> A não enxerga
--     (cenário do achado: admin de A interferindo em usuário de B).
--
-- ADR-004 garante no máximo uma membership ativa por usuário (índice único
-- parcial), então o predicado é determinístico.
create or replace function private.user_belongs_to_current_company(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships m
    where m.user_id = p_user_id
      and m.company_id = private.current_user_company_id()
  )
  and not exists (
    select 1
    from public.company_memberships other
    where other.user_id = p_user_id
      and other.active
      and other.company_id is distinct from private.current_user_company_id()
  );
$$;
comment on function private.user_belongs_to_current_company(uuid) is
  'Vínculo com a empresa do chamador SEM vínculo ativo em outra empresa. '
  'Impede que membership histórica em A alcance usuário hoje ativo em B (DB-AUD-003).';

-- ---------------------------------------------------------------------------
-- 3. Empresa não administra mais o profile global (DB-AUD-002 / DB-AUD-003)
-- ---------------------------------------------------------------------------
drop policy if exists profiles_update_managed on public.profiles;

-- Leitura empresarial continua existindo, agora com o helper corrigido.
-- (profiles_select_company não muda de definição: só o helper mudou.)

-- ---------------------------------------------------------------------------
-- 4. GRANT DE COLUNA: o usuário só edita os próprios campos pessoais
-- ---------------------------------------------------------------------------
revoke update on public.profiles from authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Guarda defensiva do profile
-- ---------------------------------------------------------------------------
-- Segunda camada, independente do grant: mesmo que alguém reconceda UPDATE
-- amplo por engano, o cliente não muda estado global nem carimbos.
-- SECURITY INVOKER obrigatório: a função consulta private.is_api_role() /
-- is_client_role(), que leem current_user. Sob SECURITY DEFINER o current_user
-- seria o DONO da função (postgres) e a guarda nunca dispararia para o cliente.
create or replace function private.tg_profile_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_client_role() then
    return new;
  end if;

  if new.active is distinct from old.active then
    raise exception
      'PROFILE_ACTIVE_PRIVILEGED: profiles.active só muda por operação administrativa'
      using errcode = '42501', hint = 'USE_ADMIN_CHANNEL';
  end if;

  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.last_seen_at is distinct from old.last_seen_at then
    raise exception 'PROFILE_FIELD_IMMUTABLE: campo de controle não pode ser alterado pelo cliente'
      using errcode = '42501', hint = 'IMMUTABLE_FIELDS';
  end if;

  return new;
end;
$$;

create trigger a_guard_profiles_state before update on public.profiles
  for each row execute function private.tg_profile_guard();

-- ---------------------------------------------------------------------------
-- 6. Piso de administradores efetivos (DB-AUD-002 / DB-AUD-010)
-- ---------------------------------------------------------------------------
-- "Administrador efetivo" exige os QUATRO estados simultaneamente:
--   membership ativa + papel company_admin + profile ativo + empresa ativa.
create or replace function private.count_effective_admins(
  p_company_id   uuid,
  p_exclude_user uuid default null
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.company_memberships m
  join public.profiles  p on p.id = m.user_id
  join public.companies c on c.id = m.company_id
  where m.company_id = p_company_id
    and m.role = 'company_admin'
    and m.active
    and p.active
    and c.status = 'active'
    and (p_exclude_user is null or m.user_id <> p_exclude_user);
$$;
comment on function private.count_effective_admins(uuid, uuid) is
  'Administradores EFETIVOS: membership ativa + company_admin + profile ativo + empresa ativa.';

create or replace function private.is_effective_admin(p_company_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_memberships m
    join public.profiles  p on p.id = m.user_id
    join public.companies c on c.id = m.company_id
    where m.company_id = p_company_id
      and m.user_id = p_user_id
      and m.role = 'company_admin'
      and m.active
      and p.active
      and c.status = 'active'
  );
$$;

-- Serialização por empresa. Advisory lock de transação: determinístico, não
-- bloqueia UPDATEs legítimos da linha de companies e é liberado no commit.
create or replace function private.lock_company_admin_gate(p_company_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_company_id is null then
    return;
  end if;
  -- Namespace fixo (8675309) evita colisão com qualquer outro uso de advisory
  -- lock no mesmo banco.
  perform pg_catalog.pg_advisory_xact_lock(
    8675309,
    (pg_catalog.hashtextextended(p_company_id::text, 0) % 2147483647)::integer
  );
end;
$$;
comment on function private.lock_company_admin_gate(uuid) is
  'Serializa a gestão de administradores de uma empresa (DB-AUD-010).';

create or replace function private.assert_admin_floor(
  p_company_id   uuid,
  p_exclude_user uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- Lock ANTES da contagem. Em READ COMMITTED, a contagem executada depois do
  -- lock enxerga o commit da transação concorrente que chegou primeiro, então
  -- duas desativações simultâneas nunca deixam a empresa sem administrador.
  perform private.lock_company_admin_gate(p_company_id);

  if private.count_effective_admins(p_company_id, p_exclude_user) = 0 then
    raise exception
      'LAST_ADMIN_PROTECTED: a empresa % precisa manter ao menos um company_admin ativo',
      p_company_id
      using errcode = '23514', hint = 'LAST_ADMIN_PROTECTED';
  end if;
end;
$$;

-- Substitui a versão de 000900: agora considera profile + empresa e serializa.
create or replace function private.tg_protect_last_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid := old.company_id;
  v_still_admin boolean;
begin
  -- Só protege quem ERA administrador efetivo. Remover um admin que já não era
  -- efetivo (profile inativo, por exemplo) nunca pode travar a empresa.
  if not private.is_effective_admin(v_company, old.user_id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE' then
    v_still_admin := new.active and new.role = 'company_admin' and new.user_id = old.user_id;
    if v_still_admin then
      return new;
    end if;
  end if;

  perform private.assert_admin_floor(v_company, old.user_id);

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Mesma proteção pelo lado do profile: desativar o perfil de um administrador
-- é exatamente o caminho que o achado DB-AUD-002 explorava.
create or replace function private.tg_protect_last_admin_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid;
begin
  if new.active or not old.active then
    return new;
  end if;

  for v_company in
    select m.company_id
    from public.company_memberships m
    where m.user_id = old.id and m.active and m.role = 'company_admin'
  loop
    if private.is_effective_admin(v_company, old.id) then
      perform private.assert_admin_floor(v_company, old.id);
    end if;
  end loop;

  return new;
end;
$$;

create trigger b_profiles_protect_last_admin before update on public.profiles
  for each row execute function private.tg_protect_last_admin_profile();

-- ---------------------------------------------------------------------------
-- 7. Lista segura de membros da empresa (DB-AUD-003)
-- ---------------------------------------------------------------------------
-- A UI precisa da lista de membros, inclusive dos desativados. Fazer isso por
-- SELECT direto em profiles obrigaria a policy a ser permissiva demais. A RPC
-- devolve exatamente o necessário, sempre limitada à empresa do chamador.
create or replace function public.company_members()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company uuid;
  v_items   jsonb;
begin
  perform private.assert_permission('users.read');
  v_company := private.current_user_company_id();

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.full_name), '[]'::jsonb)
    into v_items
  from (
    select m.user_id,
           p.full_name,
           p.phone,
           m.role,
           m.active            as membership_active,
           p.active            as profile_active,
           (m.active and p.active) as effective_active,
           m.created_at,
           p.last_seen_at
    from public.company_memberships m
    join public.profiles p on p.id = m.user_id
    where m.company_id = v_company
    order by p.full_name
  ) t;

  return jsonb_build_object('companyId', v_company, 'members', v_items);
end;
$$;

comment on function public.company_members() is
  'Lista de membros da empresa do chamador. Substitui o SELECT amplo em profiles (DB-AUD-003).';

revoke all on function public.company_members() from public;
grant execute on function public.company_members() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Operação privilegiada de status global do profile
-- ---------------------------------------------------------------------------
-- Exclusiva de service_role (Edge Function admin-users). O piso de
-- administradores continua sendo aplicado pelos triggers acima.
create or replace function public.admin_set_profile_active(
  p_user_id    uuid,
  p_active     boolean,
  p_company_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_exists boolean;
begin
  if p_user_id is null or p_active is null or p_company_id is null then
    raise exception 'INVALID_INPUT: usuário, empresa e estado são obrigatórios'
      using errcode = '22023', hint = 'INVALID_INPUT';
  end if;

  -- O canal administrativo só age sobre usuário da empresa informada.
  select exists (
    select 1 from public.company_memberships m
    where m.user_id = p_user_id and m.company_id = p_company_id
  ) into v_exists;

  if not v_exists then
    raise exception 'NOT_FOUND: usuário % não pertence à empresa %', p_user_id, p_company_id
      using errcode = 'P0002', hint = 'NOT_FOUND';
  end if;

  update public.profiles set active = p_active where id = p_user_id;

  return jsonb_build_object('userId', p_user_id, 'active', p_active);
end;
$$;

revoke all on function public.admin_set_profile_active(uuid, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_set_profile_active(uuid, boolean, uuid) to service_role;
